import { z } from "zod";

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
});
export type ResultEvent = z.infer<typeof ResultEvent>;

export const RunEvent = z.union([StepEvent, ResultEvent]);
export type RunEvent = z.infer<typeof RunEvent>;

export const truncateLog = (text: string) =>
  text.length <= MAX_LOG ? text : `${text.slice(0, MAX_LOG - 40)}\n... (log truncated)`;
