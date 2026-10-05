import { z } from "zod";
import { StepId, StepState, Verdict } from "./events";
import { OptionKind, SideWork } from "./options";

// A finished run as the server signs it. Land and the decision record trust
// only this signed copy, never the browser's word: which option ran on which
// exact commits, every check's outcome, and (for Land) every file the merge
// changes with the git tree id they must produce.

const FULL_SHA = z.string().regex(/^[0-9a-f]{40}$/);

export const LandableChange = z.object({
  path: z.string().min(1).max(500),
  mode: z.enum(["100644", "100755"]).nullable(),
  content: z.string().nullable(),
});
export type LandableChange = z.infer<typeof LandableChange>;

export const RunCheck = z.object({
  step: StepId,
  state: StepState,
  detail: z.string().max(2_000).optional(),
});
export type RunCheck = z.infer<typeof RunCheck>;

export const RunRecord = z.object({
  v: z.literal(1),
  repo: z.string().min(1).max(200),
  pr: z.number().int().positive(),
  verdict: Verdict,
  option: OptionKind,
  drops: SideWork.nullable(),
  revisions: z.object({ head: FULL_SHA, base: FULL_SHA }),
  tree: FULL_SHA.nullable(),
  changes: z.array(LandableChange).max(500).nullable(),
  changesNote: z.string().max(300).nullable(),
  description: z.string().max(2_000).nullable(),
  reason: z.string().max(300).nullable(), // the option's reason as shown when it ran
  summary: z.array(z.string().max(2_000)).max(50),
  checks: z.array(RunCheck).max(20),
  analysisModel: z.string().max(100),
  proposeModel: z.string().max(100),
  steer: z.string().max(200).nullable(),
  finishedAt: z.string().max(40),
});
export type RunRecord = z.infer<typeof RunRecord>;
