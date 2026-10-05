import { diffArrays } from "diff";
import { tokensOf } from "./text";

// Aligns one side's normalized lines to the base: each base line is kept,
// modified (paired with its most similar replacement) or removed, and the
// remaining new lines are insertions after a base line (-1 means at the top).

export type LineState = { kind: "same" } | { kind: "modified"; to: string } | { kind: "removed" };
export type Alignment = { base: LineState[]; inserted: Map<number, string[]> };

const PAIR_THRESHOLD = 0.5;

function commonTokens(a: string[], b: string[]): number {
  let common = 0;
  for (const change of diffArrays(a, b))
    if (!change.added && !change.removed) common += change.count;
  return common;
}

export function similarity(a: string, b: string): number {
  const ta = tokensOf(a);
  const tb = tokensOf(b);
  if (ta.length + tb.length === 0) return 1;
  return (2 * commonTokens(ta, tb)) / (ta.length + tb.length);
}

export function alignSide(base: string[], side: string[]): Alignment {
  const states: LineState[] = base.map(() => ({ kind: "same" }));
  const inserted = new Map<number, string[]>();
  const insert = (after: number, lines: string[]) => {
    if (lines.length) inserted.set(after, [...(inserted.get(after) ?? []), ...lines]);
  };

  let baseIndex = 0;
  let removed: number[] = [];
  let added: string[] = [];

  const flush = () => {
    let next = 0;
    for (const j of removed) {
      let best = -1;
      let bestScore = PAIR_THRESHOLD;
      for (let m = next; m < added.length; m += 1) {
        const score = similarity(base[j]!, added[m]!);
        if (score >= bestScore && (best === -1 || score > bestScore)) {
          best = m;
          bestScore = score;
        }
      }
      if (best === -1) {
        states[j] = { kind: "removed" };
        continue;
      }
      insert(j - 1, added.slice(next, best));
      states[j] = { kind: "modified", to: added[best]! };
      next = best + 1;
    }
    insert(removed.length ? removed.at(-1)! : baseIndex - 1, added.slice(next));
    removed = [];
    added = [];
  };

  for (const change of diffArrays(base, side)) {
    if (change.removed) {
      for (let k = 0; k < change.count; k += 1) removed.push(baseIndex + k);
      baseIndex += change.count;
    } else if (change.added) {
      added.push(...change.value);
    } else {
      flush();
      baseIndex += change.count;
    }
  }
  flush();
  return { base: states, inserted };
}
