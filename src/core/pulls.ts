import { z } from "zod";

// An open pull request as the desk lists it. Shared by the live route, the
// browser and (later) demo recordings, so it lives in core with no I/O.

export const Mergeable = z.enum(["conflicting", "mergeable", "checking"]);
export type Mergeable = z.infer<typeof Mergeable>;

export const PullSummary = z.object({
  number: z.number().int().positive(),
  title: z.string(),
  author: z.string(),
  url: z.string(),
  draft: z.boolean(),
  head: z.object({ ref: z.string(), sha: z.string(), repo: z.string().nullable() }),
  base: z.object({ ref: z.string(), sha: z.string() }),
  demo: z.boolean(),
  mergeable: Mergeable,
  fork: z.boolean(),
  filesBothSides: z.array(z.string()).nullable(),
  updatedAt: z.string(),
});
export type PullSummary = z.infer<typeof PullSummary>;

export const PullList = z.object({ repo: z.string(), pulls: z.array(PullSummary) });
export type PullList = z.infer<typeof PullList>;
