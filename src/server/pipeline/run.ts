import { truncateLog, type RunEvent, type StepId, type StepState } from "@/core/events";
import { checkChoiceHonored, type Option } from "@/core/honor";
import type { ProposedFile, Revisions, Runner } from "@/server/runner/types";

// The run pipeline: propose, write on a scratch copy, then three checks that
// the model can't influence. VERIFIED only when every step passed; anything
// else is HELD and nothing is pushed. The runner is always disposed.

export type Proposal = { files: ProposedFile[]; description: string; source: string };
export type Proposer = (input: {
  conflictedPaths: string[];
  option: Option;
  steer?: string;
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
  now?: () => number;
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

    yield step("propose", "running");
    let proposal: Proposal;
    try {
      proposal = await input.proposer({
        conflictedPaths: input.conflictedPaths,
        option: input.option,
        steer: input.steer,
      });
      const outside = proposal.files.filter((file) => !input.conflictedPaths.includes(file.path));
      if (outside.length)
        throw new Error(
          `Proposal edits files outside the conflict: ${outside.map((file) => file.path).join(", ")}`,
        );
    } catch (error) {
      yield step("propose", "failed", error instanceof Error ? error.message : "Proposal failed");
      return yield* skipRest("write");
    }
    description = proposal.description;
    yield step("propose", "passed", `${proposal.source}: ${proposal.description}`.slice(0, 2_000));

    yield step("write", "running");
    let applied;
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
    const parseState: StepState = parsed.some((result) => result.state === "failed")
      ? "failed"
      : parsed.every((result) => result.state === "passed") && parsed.length > 0
        ? "passed"
        : "not_run";
    yield step(
      "parse",
      parseState,
      parsed.map((result) => `${result.path}: ${result.detail}`).join("; "),
    );

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
