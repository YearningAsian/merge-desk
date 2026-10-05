import {
  Analysis,
  MAX_FILE_CHARS,
  truncateLog,
  type AnalysisFile,
  type AnalyzeEvent,
  type AnalyzeStepId,
  type StepState,
} from "@/core/events";
import {
  olderSide,
  resolveOptions,
  type Commit,
  type ModelAnalysis,
  type OlderSide,
} from "@/core/options";
import { MalformedOutputError } from "@/server/errors";
import type { Revisions, Runner } from "@/server/runner/types";
import { sign, verify, SignatureError, type SignedScope } from "@/server/sign";

// Analysis: a fresh copy merges the base into the head and stops at the
// conflicts (the runner is disposed straight after), then the model reads
// both sides and proposes options. What each option keeps and drops comes
// from git. Retries: at most two, and only when the model's answer is
// malformed.

export type AnalystInput = {
  files: AnalysisFile[];
  commits: { ours: Commit[]; theirs: Commit[] };
  older: OlderSide;
  branches?: { ours: string; theirs: string };
  retry?: { attempt: number; reason: string };
};
export type Analyst = (input: AnalystInput) => Promise<ModelAnalysis>;

export type AnalyzeInput = {
  runner: Runner;
  analyst: Analyst;
  model: string;
  repo: string;
  pr: number | null;
  revisions: Revisions;
  branches?: { ours: string; theirs: string };
  maxRetries?: number;
  now?: () => number;
};

const ORDER: AnalyzeStepId[] = ["prepare", "analyze"];

export async function* analyzePipeline(input: AnalyzeInput): AsyncGenerator<AnalyzeEvent> {
  const now = input.now ?? (() => Date.now());
  const started = now();
  const t = () => Math.max(0, Math.round(now() - started));
  const step = (
    id: AnalyzeStepId,
    state: StepState,
    detail?: string,
    log?: string,
  ): AnalyzeEvent => ({
    t: t(),
    step: id,
    state,
    ...(detail ? { detail: detail.slice(0, 2_000) } : {}),
    ...(log ? { log: truncateLog(log) } : {}),
  });
  const fail = (reason: string): AnalyzeEvent => ({
    t: t(),
    type: "analysis",
    ok: false,
    reason: reason.slice(0, 2_000),
  });

  for (const id of ORDER) yield step(id, "queued");

  yield step("prepare", "running");
  let prepared;
  try {
    prepared = await input.runner.prepareMerge(input.revisions);
  } catch (error) {
    const reason = error instanceof Error ? error.message : "Could not read both sides";
    yield step("prepare", "failed", reason);
    yield step("analyze", "not_run");
    return yield fail(reason);
  } finally {
    await input.runner.dispose();
  }

  if (prepared.unsupported.length) {
    const reason = `Merge Desk can't resolve these here: ${prepared.unsupported.map((u) => `${u.path} (${u.reason})`).join(", ")}`;
    yield step("prepare", "failed", reason);
    yield step("analyze", "not_run");
    return yield fail(reason);
  }
  if (!prepared.conflicted.length) {
    const reason = "No conflicts: the base merges into this pull request cleanly.";
    yield step("prepare", "passed", reason);
    yield step("analyze", "not_run");
    return yield fail(reason);
  }
  const tooLarge = prepared.conflicted.filter((file) =>
    [file.base, file.ours, file.theirs, file.merged].some((text) => text.length > MAX_FILE_CHARS),
  );
  if (tooLarge.length || prepared.conflicted.length > 20) {
    const reason = tooLarge.length
      ? `Too large to analyze: ${tooLarge.map((file) => file.path).join(", ")}`
      : `Too many conflicted files (${prepared.conflicted.length})`;
    yield step("prepare", "failed", reason);
    yield step("analyze", "not_run");
    return yield fail(reason);
  }

  const files: AnalysisFile[] = prepared.conflicted.map(({ path, base, ours, theirs, merged }) => ({
    path,
    base,
    ours,
    theirs,
    merged,
  }));
  const conflictedPaths = files.map((file) => file.path);
  const older = olderSide(prepared.commits);
  yield step(
    "prepare",
    "passed",
    `${files.length} conflicted ${files.length === 1 ? "file" : "files"}: ${conflictedPaths.join(", ")} · ours ${prepared.commits.ours.length} commits · theirs ${prepared.commits.theirs.length} commits`,
  );

  yield step("analyze", "running");
  const attempts = 1 + (input.maxRetries ?? 2);
  let retry: AnalystInput["retry"];
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const answer = await input.analyst({
        files,
        commits: prepared.commits,
        older,
        branches: input.branches,
        retry,
      });
      const options = resolveOptions(answer.options, {
        commits: prepared.commits,
        conflictedPaths,
      });
      if (!options.ok) throw new MalformedOutputError(options.reason);
      const analysis = Analysis.parse({
        v: 1,
        repo: input.repo,
        pr: input.pr,
        revisions: input.revisions,
        mergeBase: prepared.mergeBase,
        files,
        intents: { ours: answer.intents.ours.trim(), theirs: answer.intents.theirs.trim() },
        options: options.options,
        older,
        commits: prepared.commits,
        model: input.model,
      });
      yield step(
        "analyze",
        "passed",
        `ours: ${analysis.intents.ours}\ntheirs: ${analysis.intents.theirs}`,
      );
      return yield { t: t(), type: "analysis", ok: true, analysis };
    } catch (error) {
      const reason = error instanceof Error ? error.message : "Analysis failed";
      if (error instanceof MalformedOutputError && attempt < attempts) {
        retry = { attempt: attempt + 1, reason };
        yield step(
          "analyze",
          "running",
          `Retrying (attempt ${attempt + 1} of ${attempts}): ${reason}`,
        );
        continue;
      }
      yield step("analyze", "failed", reason);
      return yield fail(reason);
    }
  }
}

export type AnalysisSigner = { user: string; secret: string; now?: number };

const scopeOf = (analysis: Analysis, user: string): SignedScope => ({
  kind: "analysis",
  user,
  repo: analysis.repo,
  pr: analysis.pr,
  head: analysis.revisions.head,
  base: analysis.revisions.base,
});

export function signAnalysis(analysis: Analysis, signer: AnalysisSigner): string {
  return sign(scopeOf(analysis, signer.user), analysis, signer);
}

// The analysis a run may trust: signed by this server, for this user,
// repository and pull request, not expired, with matching revisions.
export function verifyAnalysis(
  token: string,
  expected: { user: string; repo: string; pr: number | null },
  options: { secret: string; now?: number },
): Analysis {
  const { scope, body } = verify(token, { kind: "analysis", ...expected }, Analysis, options);
  if (scope.head !== body.revisions.head || scope.base !== body.revisions.base)
    throw new SignatureError("Signed revisions do not match the analysis");
  return body;
}
