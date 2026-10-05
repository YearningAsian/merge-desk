import { z } from "zod";
import type { Option, Side } from "./honor";

// Resolution options. The model names the kinds of option, a one-line
// summary and a reason each, and which one it recommends; what each option keeps and drops
// (commits, files, authors) is worked out here from git's data, never taken
// from the model. Anything that doesn't fit the rules is rejected, so a
// malformed answer can't reach the screen.

export const OPTION_KINDS = ["combine", "keep_ours", "keep_theirs"] as const;
export const OptionKind = z.enum(OPTION_KINDS);
export const SideName = z.enum(["ours", "theirs"]);

const FULL_SHA = /^[0-9a-f]{40}$/;
const DAY_MS = 24 * 60 * 60 * 1000;

export const OPTION_LABELS: Record<Option, string> = {
  combine: "Combine both",
  keep_ours: "Keep ours, drop theirs",
  keep_theirs: "Keep theirs, drop ours",
};

// What the model must return for an analysis. Descriptions go into the JSON
// schema the model sees.
export const ModelAnalysis = z.object({
  intents: z
    .object({
      ours: z
        .string()
        .min(3)
        .max(140)
        .describe("One plain line: what the pull request's branch (ours) meant to do."),
      theirs: z
        .string()
        .min(3)
        .max(140)
        .describe("One plain line: what the base branch's change (theirs) meant to do."),
    })
    .describe("What each side meant to do in the conflicted code."),
  options: z
    .array(
      z.object({
        kind: OptionKind.describe(
          "combine keeps both sides; keep_ours keeps the pull request's side inside the conflicts and drops the base branch's; keep_theirs is the reverse.",
        ),
        summary: z
          .string()
          .min(3)
          .max(240)
          .describe("One line: what the code will do after this option."),
        recommended: z.boolean().describe("True for exactly one option."),
        reason: z
          .string()
          .max(300)
          .describe(
            "One sentence a reviewer would accept: for the recommended option, why it is the best choice; for the others, when to pick it instead.",
          ),
      }),
    )
    .min(2)
    .max(3)
    .describe("Two or three different kinds of option."),
});
export type ModelAnalysis = z.infer<typeof ModelAnalysis>;

export const Commit = z.object({
  sha: z.string().regex(FULL_SHA),
  author: z.string().max(200),
  date: z.string().max(40),
  subject: z.string().max(500),
  files: z.array(z.string().max(500)).max(500),
});
export type Commit = z.infer<typeof Commit>;

export const SideWork = z.object({
  side: SideName,
  commits: z
    .array(z.object({ sha: z.string().regex(FULL_SHA), subject: z.string(), author: z.string() }))
    .max(50),
  files: z.array(z.string()).max(50),
  authors: z.array(z.string()).max(50),
});
export type SideWork = z.infer<typeof SideWork>;

export const ResolvedOption = z.object({
  kind: OptionKind,
  label: z.string(),
  summary: z.string().max(240),
  recommended: z.boolean(),
  reason: z.string().max(300).nullable(),
  keeps: z.array(SideWork).min(1).max(2),
  drops: SideWork.nullable(),
});
export type ResolvedOption = z.infer<typeof ResolvedOption>;

export const OlderSide = z.object({ side: SideName, byMs: z.number().int().positive() }).nullable();
export type OlderSide = z.infer<typeof OlderSide>;

// A side's work inside the conflicts: its commits that touched a conflicted
// file, those files, and who wrote them.
export function sideWork(side: Side, commits: Commit[], conflictedPaths: string[]): SideWork {
  const inConflict = commits.filter((commit) =>
    commit.files.some((file) => conflictedPaths.includes(file)),
  );
  const files = conflictedPaths.filter((path) =>
    inConflict.some((commit) => commit.files.includes(path)),
  );
  return {
    side,
    commits: inConflict.map(({ sha, subject, author }) => ({ sha, subject, author })),
    files,
    authors: [...new Set(inConflict.map((commit) => commit.author))],
  };
}

export type ResolveResult = { ok: true; options: ResolvedOption[] } | { ok: false; reason: string };

export function resolveOptions(
  model: ModelAnalysis["options"],
  context: { commits: Record<Side, Commit[]>; conflictedPaths: string[] },
): ResolveResult {
  const kinds = model.map((option) => option.kind);
  if (new Set(kinds).size !== kinds.length)
    return { ok: false, reason: "Options repeat the same kind" };
  const recommended = model.filter((option) => option.recommended);
  if (recommended.length !== 1)
    return {
      ok: false,
      reason: `Exactly one option must be recommended (got ${recommended.length})`,
    };
  if (!recommended[0]!.reason.trim())
    return { ok: false, reason: "The recommended option has no reason" };

  const work = {
    ours: sideWork("ours", context.commits.ours, context.conflictedPaths),
    theirs: sideWork("theirs", context.commits.theirs, context.conflictedPaths),
  };
  return {
    ok: true,
    options: model.map((option) => ({
      kind: option.kind,
      label: OPTION_LABELS[option.kind],
      summary: option.summary.trim(),
      recommended: option.recommended,
      // Required for the recommended option (checked above); the others show
      // theirs when the model gave one.
      reason: option.reason.trim() || null,
      keeps:
        option.kind === "combine"
          ? [work.ours, work.theirs]
          : [option.kind === "keep_ours" ? work.ours : work.theirs],
      drops:
        option.kind === "combine" ? null : option.kind === "keep_ours" ? work.theirs : work.ours,
    })),
  };
}

// The side whose latest commit is older, when it is older by more than a day.
export function olderSide(commits: Record<Side, Commit[]>, thresholdMs = DAY_MS): OlderSide {
  const latest = (list: Commit[]) =>
    list.reduce((max, commit) => Math.max(max, Date.parse(commit.date) || 0), 0);
  const ours = latest(commits.ours);
  const theirs = latest(commits.theirs);
  if (!ours || !theirs) return null;
  const gap = Math.abs(ours - theirs);
  if (gap <= thresholdMs) return null;
  return { side: ours < theirs ? "ours" : "theirs", byMs: gap };
}
