import type { Option } from "@/core/honor";
import type { OlderSide, ResolvedOption } from "@/core/options";

// Pure helpers behind the resolution slider and the developer details.

// The slider's fixed left-to-right scale: all ours, both, all theirs. A
// position keeps its meaning even when the analysis didn't offer that option.
export const SCALE: readonly Option[] = ["keep_ours", "combine", "keep_theirs"];

export const SHORT_LABELS: Record<Option, string> = {
  keep_ours: "Keep ours",
  combine: "Combine",
  keep_theirs: "Keep theirs",
};

// Where the slider lands when asked for `target` from `current`: the target
// if it was offered, else the next offered position in the same direction
// (so an arrow key skips a gap), else the offered position closest to it.
export function snap(target: number, current: number, offered: readonly Option[]): number {
  const isOffered = (i: number) => i >= 0 && i < SCALE.length && offered.includes(SCALE[i]!);
  if (isOffered(target)) return target;
  const direction = Math.sign(target - current);
  if (direction !== 0)
    for (let i = target + direction; i >= 0 && i < SCALE.length; i += direction)
      if (isOffered(i)) return i;
  let best = current;
  let distance = Infinity;
  SCALE.forEach((_, i) => {
    if (isOffered(i) && Math.abs(i - target) < distance) {
      best = i;
      distance = Math.abs(i - target);
    }
  });
  return best;
}

const FULL_SHA = /^[0-9a-f]{40}$/;

// Commands that recreate this exact conflict in a local clone. Built from
// commit IDs only: branch names may legally contain shell characters such as
// `$(...)` or `;`, so they never go into text meant to be pasted in a shell.
export function reproduceCommands(revisions: { head: string; base: string }): string | null {
  const { head, base } = revisions;
  if (!FULL_SHA.test(head) || !FULL_SHA.test(base)) return null;
  return [
    `git fetch origin ${head} ${base}`,
    `git switch --detach ${head}`,
    `git merge --no-ff ${base}`,
  ].join("\n");
}

// After a hold, the option to suggest instead: the analysis's recommendation
// if that wasn't the one held; otherwise the newer side's work (the same rule
// the analysis follows when both sides change one behavior), then combine,
// then whatever else was offered. Null when nothing else was offered.
export function suggestInstead(
  options: ResolvedOption[],
  held: Option,
  older: OlderSide,
): ResolvedOption | null {
  const others = options.filter((option) => option.kind !== held);
  if (!others.length) return null;
  const recommended = others.find((option) => option.recommended);
  if (recommended) return recommended;
  const newer = older ? (older.side === "ours" ? "keep_theirs" : "keep_ours") : null;
  return (
    others.find((option) => option.kind === newer) ??
    others.find((option) => option.kind === "combine") ??
    others[0]!
  );
}
