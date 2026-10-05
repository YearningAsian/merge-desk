import { z } from "zod";
import { Commit, OlderSide, ResolvedOption } from "./options";

// One event shape for live streams and demo recordings, so the desk renders
// both the same way. A verdict can only be VERIFIED or HELD; nothing else is
// representable, so a pass can't be invented downstream.

export const STEP_IDS = ["revisions", "propose", "write", "parse", "honor", "tests"] as const;
export const StepId = z.enum(STEP_IDS);
export type StepId = z.infer<typeof StepId>;

export const STEP_LABELS: Record<StepId, string> = {
  revisions: "Revisions unchanged",
  propose: "Propose merge",
  write: "Write on scratch copy",
  parse: "It parses",
  honor: "Choice honored",
  tests: "Tests",
};

export const StepState = z.enum(["queued", "running", "passed", "failed", "not_run"]);
export type StepState = z.infer<typeof StepState>;

export const MAX_LOG = 64_000;

export const StepEvent = z.object({
  t: z.number().int().nonnegative(),
  step: StepId,
  state: StepState,
  detail: z.string().max(2_000).optional(),
  log: z.string().max(MAX_LOG).optional(),
});
export type StepEvent = z.infer<typeof StepEvent>;

export const Verdict = z.enum(["VERIFIED", "HELD"]);
export type Verdict = z.infer<typeof Verdict>;

export const ResultEvent = z.object({
  t: z.number().int().nonnegative(),
  type: z.literal("result"),
  verdict: Verdict,
  failed: z.array(StepId),
  summary: z.array(z.string().max(2_000)).max(50),
  description: z.string().max(2_000).optional(),
  changedFiles: z.array(z.string()).max(500).optional(),
  patch: z.string().max(1_000_000).optional(),
  token: z.string().max(4_000_000).optional(), // the signed run record, added by the server
});
export type ResultEvent = z.infer<typeof ResultEvent>;

export const RunEvent = z.union([StepEvent, ResultEvent]);
export type RunEvent = z.infer<typeof RunEvent>;

export const truncateLog = (text: string) =>
  text.length <= MAX_LOG ? text : `${text.slice(0, MAX_LOG - 40)}\n... (log truncated)`;

// Analysis: read both sides (a fresh copy merges the base into the head and
// stops at the conflicts), then the model's intents and options. The
// analysis is what a run, and later Land, is bound to; the server signs it.

export const ANALYZE_STEP_IDS = ["prepare", "analyze"] as const;
export const AnalyzeStepId = z.enum(ANALYZE_STEP_IDS);
export type AnalyzeStepId = z.infer<typeof AnalyzeStepId>;

export const ANALYZE_STEP_LABELS: Record<AnalyzeStepId, string> = {
  prepare: "Read both sides",
  analyze: "Intents and options",
};

export const MAX_FILE_CHARS = 200_000;
const FULL_SHA = z.string().regex(/^[0-9a-f]{40}$/);
const FileText = z.string().max(MAX_FILE_CHARS);

export const AnalysisFile = z.object({
  path: z.string().min(1).max(500),
  base: FileText,
  ours: FileText,
  theirs: FileText,
  merged: FileText,
});
export type AnalysisFile = z.infer<typeof AnalysisFile>;

export const Analysis = z.object({
  v: z.literal(1),
  repo: z.string().min(1).max(200),
  pr: z.number().int().positive().nullable(),
  revisions: z.object({ head: FULL_SHA, base: FULL_SHA }),
  mergeBase: FULL_SHA,
  files: z.array(AnalysisFile).min(1).max(20),
  intents: z.object({ ours: z.string().max(140), theirs: z.string().max(140) }),
  options: z.array(ResolvedOption).min(2).max(3),
  older: OlderSide,
  commits: z.object({ ours: z.array(Commit).max(50), theirs: z.array(Commit).max(50) }),
  model: z.string().max(100),
});
export type Analysis = z.infer<typeof Analysis>;

export const AnalyzeStepEvent = z.object({
  t: z.number().int().nonnegative(),
  step: AnalyzeStepId,
  state: StepState,
  detail: z.string().max(2_000).optional(),
  log: z.string().max(MAX_LOG).optional(),
});
export type AnalyzeStepEvent = z.infer<typeof AnalyzeStepEvent>;

export const AnalysisEvent = z.union([
  z.object({
    t: z.number().int().nonnegative(),
    type: z.literal("analysis"),
    ok: z.literal(true),
    analysis: Analysis,
    token: z.string().max(2_000_000).optional(), // the signed analysis, added by the server
  }),
  z.object({
    t: z.number().int().nonnegative(),
    type: z.literal("analysis"),
    ok: z.literal(false),
    reason: z.string().max(2_000),
  }),
]);
export type AnalysisEvent = z.infer<typeof AnalysisEvent>;

export const AnalyzeEvent = z.union([AnalyzeStepEvent, AnalysisEvent]);
export type AnalyzeEvent = z.infer<typeof AnalyzeEvent>;
