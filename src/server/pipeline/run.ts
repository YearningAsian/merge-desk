import { truncateLog, type RunEvent, type StepId, type StepState } from "@/core/events";
import { checkChoiceHonored, type Option } from "@/core/honor";
import { RunRecord } from "@/core/run";
import { MalformedOutputError } from "@/server/errors";
import type { AppliedProposal, ProposedFile, Revisions, Runner } from "@/server/runner/types";
import { sign, verify, type SignedScope } from "@/server/sign";

// The run pipeline: propose, write on a scratch copy, then three checks that
// the model can't influence. VERIFIED only when every step passed; anything
// else is HELD and nothing is pushed. The runner is always disposed.
// Automatic retries: at most two, and only when the model's answer is
// malformed or the proposal doesn't parse. Anything else waits for the user.

export type Proposal = { files: ProposedFile[]; description: string; source: string };
export type Proposer = (input: {
  conflictedPaths: string[];
  option: Option;
  steer?: string;
  retry?: { attempt: number; reason: string };
  // Aborted by a cancel or the route's deadline; stops the model call.
  signal?: AbortSignal;
}) => Promise<Proposal>;

export type RunInput = {
  runner: Runner;
  proposer: Proposer;
  revisions: Revisions;
  option: Option;
  intents: { ours: string; theirs: string };
  conflictedPaths: string[]; // from the signed analysis (or the demo scenario config)
  checkRevisions?: () => Promise<{ ok: boolean; detail: string }>;
  steer?: string;
  maxRetries?: number;
  now?: () => number;
  // Sees the scratch copy's merge once written, so the caller can sign
  // exactly what was checked (tree id and changed files) for Land.
  onApplied?: (applied: AppliedProposal) => void;
  // Aborted by a cancel or the route's deadline; passed to every model call.
  signal?: AbortSignal;
};

const ORDER: StepId[] = ["revisions", "propose", "write", "parse", "honor", "tests"];

export async function* runPipeline(input: RunInput): AsyncGenerator<RunEvent> {
  // Steps run in an inner generator so that any early stop still falls
  // through to the verdict below.
  const now = input.now ?? (() => Date.now());
  const started = now();
  const t = () => Math.max(0, Math.round(now() - started));
  const states = new Map<StepId, StepState>();
  const step = (id: StepId, state: StepState, detail?: string, log?: string): RunEvent => {
    states.set(id, state);
    return {
      t: t(),
      step: id,
      state,
      ...(detail ? { detail } : {}),
      ...(log ? { log: truncateLog(log) } : {}),
    };
  };
  const skipRest = function* (from: StepId) {
    for (const id of ORDER.slice(ORDER.indexOf(from)))
      if (!states.has(id) || states.get(id) === "queued") yield step(id, "not_run");
  };

  let summary: string[] = [];
  let description: string | undefined;
  let changedFiles: string[] | undefined;
  let patch: string | undefined;

  async function* steps(): AsyncGenerator<RunEvent> {
    for (const id of ORDER) yield step(id, "queued");

    yield step("revisions", "running");
    const revisionCheck = input.checkRevisions
      ? await input.checkRevisions()
      : {
          ok: true,
          detail: `head ${input.revisions.head.slice(0, 7)} · base ${input.revisions.base.slice(0, 7)}`,
        };
    yield step("revisions", revisionCheck.ok ? "passed" : "failed", revisionCheck.detail);
    if (!revisionCheck.ok) return yield* skipRest("propose");

    const attempts = 1 + (input.maxRetries ?? 2);
    let retry: { attempt: number; reason: string } | undefined;
    let proposal: Proposal | undefined;
    let applied: AppliedProposal | undefined;
    let parseState: StepState = "not_run";
    yield step("propose", "running");
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      const retryAs = (reason: string) => {
        retry = { attempt: attempt + 1, reason };
        return step(
          "propose",
          "running",
          `Retrying (attempt ${attempt + 1} of ${attempts}): ${reason}`.slice(0, 2_000),
        );
      };
      try {
        proposal = await input.proposer({
          conflictedPaths: input.conflictedPaths,
          option: input.option,
          steer: input.steer,
          retry,
          signal: input.signal,
        });
        const outside = proposal.files.filter((file) => !input.conflictedPaths.includes(file.path));
        if (outside.length)
          throw new Error(
            `Proposal edits files outside the conflict: ${outside.map((file) => file.path).join(", ")}`,
          );
      } catch (error) {
        const reason = error instanceof Error ? error.message : "Proposal failed";
        if (error instanceof MalformedOutputError && attempt < attempts) {
          yield retryAs(reason);
          continue;
        }
        yield step("propose", "failed", reason.slice(0, 2_000));
        return yield* skipRest("write");
      }
      description = proposal.description;
      yield step(
        "propose",
        "passed",
        `${proposal.source}: ${proposal.description}`.slice(0, 2_000),
      );

      yield step("write", "running");
      try {
        applied = await input.runner.applyProposal(input.revisions, proposal.files);
        const expected = applied.conflicted.map((file) => file.path).sort();
        const written = proposal.files.map((file) => file.path).sort();
        if (expected.join("\n") !== written.join("\n")) {
          throw new Error(
            `Proposal must cover exactly the conflicted files (${expected.join(", ")})`,
          );
        }
      } catch (error) {
        yield step(
          "write",
          "failed",
          error instanceof Error ? error.message : "Could not write the merge",
        );
        return yield* skipRest("parse");
      }
      changedFiles = applied.changedFiles;
      patch = applied.patch;
      input.onApplied?.(applied);
      yield step(
        "write",
        "passed",
        `${applied.changedFiles.length} ${applied.changedFiles.length === 1 ? "file differs" : "files differ"} from the head: ${applied.changedFiles.join(", ")}`.slice(
          0,
          2_000,
        ),
      );

      yield step("parse", "running");
      const parsed = await input.runner.parseCheck(proposal.files.map((file) => file.path));
      parseState = parsed.some((result) => result.state === "failed")
        ? "failed"
        : parsed.every((result) => result.state === "passed") && parsed.length > 0
          ? "passed"
          : "not_run";
      const parseDetail = parsed.map((result) => `${result.path}: ${result.detail}`).join("; ");
      yield step("parse", parseState, parseDetail);
      if (parseState === "failed" && attempt < attempts) {
        yield step("write", "queued");
        yield step("parse", "queued");
        yield retryAs(`it did not parse (${parseDetail})`);
        continue;
      }
      break;
    }
    if (!proposal || !applied) return yield* skipRest("write");

    yield step("honor", "running");
    const results = new Map(proposal.files.map((file) => [file.path, file.content]));
    const honor = checkChoiceHonored({
      option: input.option,
      intents: input.intents,
      files: applied.conflicted.map((file) => ({ ...file, result: results.get(file.path) ?? "" })),
    });
    summary = honor.summary;
    yield step(
      "honor",
      honor.ok ? "passed" : "failed",
      honor.summary.join("\n"),
      `${honor.rule}\n\n${JSON.stringify(honor.sides, null, 2)}`,
    );

    if (parseState === "failed") return yield* skipRest("tests");
    yield step("tests", "running");
    const tests = await input.runner.runTests(applied.changedFiles);
    const exit = tests.exitCode === null ? "no exit code" : `exit ${tests.exitCode}`;
    yield step(
      "tests",
      tests.state,
      `${tests.suite}: ${tests.state.replace("_", " ")} (${exit}, ${tests.durationMs} ms)`,
      tests.output,
    );
  }

  try {
    yield* steps();
  } finally {
    await input.runner.dispose();
  }

  const failedSteps = ORDER.filter((id) => states.get(id) === "failed");
  const notRun = ORDER.filter((id) => states.get(id) === "not_run");
  yield {
    t: t(),
    type: "result",
    verdict: ORDER.every((id) => states.get(id) === "passed") ? "VERIFIED" : "HELD",
    failed: failedSteps.length ? failedSteps : notRun,
    summary,
    ...(description ? { description } : {}),
    ...(changedFiles ? { changedFiles } : {}),
    ...(patch ? { patch } : {}),
  };
}

// A finished run, signed for this user, repository, pull request and the
// exact head and base it ran on. Land and the decision record accept only a
// record this server signed, unexpired (15 minutes), for the same user.
export type RunSigner = { user: string; secret: string; now?: number };

const runScope = (record: RunRecord, user: string): SignedScope => ({
  kind: "result",
  user,
  repo: record.repo,
  pr: record.pr,
  head: record.revisions.head,
  base: record.revisions.base,
});

export function signRun(record: RunRecord, signer: RunSigner): string {
  return sign(runScope(RunRecord.parse(record), signer.user), record, signer);
}

// Land accepts signed runs up to 4,000,000 characters. A run whose signed
// form would be larger is signed as not landable, with that reason, so its
// refusal later says why instead of failing on size.
export const MAX_LANDABLE_TOKEN = 3_800_000;
export function signLandableRun(
  record: RunRecord,
  signer: RunSigner,
  max = MAX_LANDABLE_TOKEN,
): string {
  const token = signRun(record, signer);
  if (token.length <= max) return token;
  return signRun(
    {
      ...record,
      tree: null,
      changes: null,
      changesNote: "the change is too large to land from Merge Desk",
    },
    signer,
  );
}

export function verifyRun(
  token: string,
  expected: { user: string; repo: string; pr: number },
  options: { secret: string; now?: number },
): RunRecord {
  const { scope, body } = verify(token, { kind: "result", ...expected }, RunRecord, options);
  if (scope.head !== body.revisions.head || scope.base !== body.revisions.base)
    throw new Error("Signed revisions do not match the run");
  return body;
}
