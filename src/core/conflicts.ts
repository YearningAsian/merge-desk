import { normalizedLines, splitLines } from "./text";

// Reads git's diff3-style conflict output (merge.conflictStyle=diff3) and
// checks that a proposed result kept everything git merged outside the
// conflicts. Anything unexpected throws, so the check fails closed.

export class ConflictParseError extends Error {}

export type Segment =
  | { kind: "clean"; lines: string[] }
  | { kind: "conflict"; ours: string[]; base: string[]; theirs: string[] };

const OURS = /^<{7}(?: |$)/;
const BASE = /^\|{7}(?: |$)/;
const SPLIT = /^={7}$/;
const THEIRS = /^>{7}(?: |$)/;

export function parseMergeMarkers(text: string): Segment[] {
  const segments: Segment[] = [];
  let clean: string[] = [];
  let state: "clean" | "ours" | "base" | "theirs" = "clean";
  let conflict = { ours: [] as string[], base: [] as string[], theirs: [] as string[] };

  for (const line of splitLines(text)) {
    if (OURS.test(line)) {
      if (state !== "clean") throw new ConflictParseError("Nested conflict marker");
      if (clean.length) segments.push({ kind: "clean", lines: clean });
      clean = [];
      conflict = { ours: [], base: [], theirs: [] };
      state = "ours";
    } else if (BASE.test(line)) {
      if (state !== "ours") throw new ConflictParseError("Unexpected base marker");
      state = "base";
    } else if (SPLIT.test(line) && state !== "clean") {
      if (state !== "base")
        throw new ConflictParseError("Conflict has no base section (needs diff3 style)");
      state = "theirs";
    } else if (THEIRS.test(line)) {
      if (state !== "theirs") throw new ConflictParseError("Unexpected end marker");
      segments.push({ kind: "conflict", ...conflict });
      state = "clean";
    } else if (state === "clean") {
      clean.push(line);
    } else {
      conflict[state].push(line);
    }
  }

  if (state !== "clean") throw new ConflictParseError("Unterminated conflict");
  if (clean.length) segments.push({ kind: "clean", lines: clean });
  return segments;
}

export type OutsideMatch = { ok: boolean; missing: string[]; extra: string[]; gaps: string[][] };

const matchesAt = (lines: string[], block: string[], at: number) =>
  at >= 0 && at + block.length <= lines.length && block.every((line, i) => lines[at + i] === line);

function findFrom(lines: string[], block: string[], from: number): number {
  for (let at = from; at + block.length <= lines.length; at += 1)
    if (matchesAt(lines, block, at)) return at;
  return -1;
}

function findLastFrom(lines: string[], block: string[], from: number): number {
  for (let at = lines.length - block.length; at >= from; at -= 1)
    if (matchesAt(lines, block, at)) return at;
  return -1;
}

// Every clean segment must appear in the result, in order, unchanged. The
// lines between them are what the result put in place of each conflict.
export function matchOutside(segments: Segment[], result: string[]): OutsideMatch {
  const lines = normalizedLines(result);
  const blocks = segments.map((segment) =>
    segment.kind === "clean"
      ? { kind: "clean" as const, lines: normalizedLines(segment.lines) }
      : { kind: "conflict" as const },
  );
  const lastClean = blocks.findLastIndex(
    (block) => block.kind === "clean" && block.lines.length > 0,
  );

  const gaps: string[][] = [];
  const missing: string[] = [];
  let ok = true;
  let position = 0;
  let pendingGap = false;

  blocks.forEach((block, index) => {
    if (block.kind === "conflict") {
      pendingGap = true;
      return;
    }
    if (!block.lines.length) return;
    let at: number;
    if (!pendingGap) at = matchesAt(lines, block.lines, position) ? position : -1;
    else if (index === lastClean) at = findLastFrom(lines, block.lines, position);
    else at = findFrom(lines, block.lines, position);

    if (at === -1) {
      ok = false;
      const notFound = block.lines.filter((line) => !lines.includes(line));
      missing.push(...(notFound.length ? notFound : [block.lines[0]!]));
      return;
    }
    if (pendingGap) gaps.push(lines.slice(position, at));
    pendingGap = false;
    position = at + block.lines.length;
  });

  let extra: string[] = [];
  if (pendingGap) gaps.push(lines.slice(position));
  else if (ok && position < lines.length) {
    ok = false;
    extra = lines.slice(position);
  }
  return { ok, missing, extra, gaps };
}
