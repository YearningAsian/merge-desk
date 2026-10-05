import { diffArrays } from "diff";

// A three-way merge over token (or line) arrays. Edits from the two sides may
// combine only when they don't overlap or touch; identical edits count once.
// Anything else is a conflict, and the caller fails closed.

type Edit<T> = { start: number; end: number; items: T[] };

function editsAgainst<T>(base: T[], side: T[]): Edit<T>[] {
  const edits: Edit<T>[] = [];
  let index = 0;
  let current: Edit<T> | null = null;
  for (const change of diffArrays(base, side)) {
    if (!change.added && !change.removed) {
      if (current) edits.push(current);
      current = null;
      index += change.count;
      continue;
    }
    current ??= { start: index, end: index, items: [] };
    if (change.removed) {
      index += change.count;
      current.end = index;
    } else {
      current.items.push(...change.value);
    }
  }
  if (current) edits.push(current);
  return edits;
}

const sameEdit = <T>(a: Edit<T>, b: Edit<T>) =>
  a.start === b.start &&
  a.end === b.end &&
  a.items.length === b.items.length &&
  a.items.every((item, i) => item === b.items[i]);

export function merge3<T>(
  base: T[],
  ours: T[],
  theirs: T[],
): { ok: true; merged: T[] } | { ok: false } {
  const fromOurs = editsAgainst(base, ours);
  const fromTheirs = editsAgainst(base, theirs);

  for (const a of fromOurs) {
    for (const b of fromTheirs) {
      if (sameEdit(a, b)) continue;
      if (a.start <= b.end && b.start <= a.end) return { ok: false };
    }
  }

  const edits = [
    ...fromOurs,
    ...fromTheirs.filter((b) => !fromOurs.some((a) => sameEdit(a, b))),
  ].sort((a, b) => a.start - b.start || a.end - b.end);

  const merged: T[] = [];
  let position = 0;
  for (const edit of edits) {
    merged.push(...base.slice(position, edit.start), ...edit.items);
    position = edit.end;
  }
  merged.push(...base.slice(position));
  return { ok: true, merged };
}
