import { z } from "zod";

// An open pull request as the desk lists it. Shared by the live route, the
// browser and (later) demo recordings, so it lives in core with no I/O.

export const Mergeable = z.enum(["conflicting", "mergeable", "checking"]);
export type Mergeable = z.infer<typeof Mergeable>;

export const PullChecks = z.object({
  state: z.enum(["passing", "failing", "pending", "none", "unknown"]),
  items: z.array(
    z.object({
      name: z.string(),
      state: z.enum(["passing", "failing", "pending", "unknown"]),
      url: z
        .string()
        .url()
        .refine((url) => url.startsWith("https://"))
        .optional(),
    }),
  ),
  reason: z.string().optional(),
  observedAt: z.string(),
});
export type PullChecks = z.infer<typeof PullChecks>;

export const PullReadiness = z.object({
  state: z.enum(["ready", "blocked", "checking", "unknown"]),
  githubState: z.string(),
  checkedHead: z.string(),
  reasons: z.array(z.string()),
  checks: PullChecks,
});
export type PullReadiness = z.infer<typeof PullReadiness>;

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
  // Old recordings have no readiness evidence. Their UI must show UNKNOWN.
  readiness: PullReadiness.optional(),
  fork: z.boolean(),
  filesBothSides: z.array(z.string()).nullable(),
  updatedAt: z.string(),
});
export type PullSummary = z.infer<typeof PullSummary>;

export const PullList = z.object({ repo: z.string(), pulls: z.array(PullSummary) });
export type PullList = z.infer<typeof PullList>;
