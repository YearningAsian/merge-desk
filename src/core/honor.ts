import { alignSide } from "./align";
import { applyRenames, detectRenames, type Rename } from "./atoms";
import { ConflictParseError, matchOutside, parseMergeMarkers, type Segment } from "./conflicts";
import { merge3 } from "./merge3";
import { normalizedLines, splitLines, tokensOf } from "./text";

// The choice-honored check: pure code, no I/O, and the model never grades
// itself. It compares what a proposed merge put inside git's conflicts with
// what the chosen option requires there, and requires everything git merged
// outside the conflicts to be unchanged. This is bounded line and rename
// evidence, not a proof of semantic intent; real tests are a separate gate.

export type Option = "combine" | "keep_ours" | "keep_theirs";
export type Side = "ours" | "theirs";
export type SideStatus = "present" | "missing" | "dropped" | "leaked";

export type FileVersions = {
  path: string;
  base: string; // stage 1 (empty if the file was added on both sides)
  ours: string; // stage 2: the pull request's head
  theirs: string; // stage 3: the base branch being merged in
  merged: string; // git's working-tree output with diff3 conflict markers
  result: string; // the proposed resolution
};

export type HonorInput = { option: Option; intents: Record<Side, string>; files: FileVersions[] };

export type SideReport = { intent: string; status: SideStatus; lines: string[] };

export type FileReport = {
  path: string;
  ok: boolean;
  error: string | null;
  outside: { ok: boolean; missing: string[]; extra: string[] };
  renames: Record<Side, Rename[]>;
  ambiguous: string[];
  unexpected: string[];
  lostShared: string[];
  sides: Record<Side, SideReport>;
};

export type HonorResult = {
  ok: boolean;
  option: Option;
  rule: string;
  sides: Record<Side, SideReport>;
  files: FileReport[];
  summary: string[];
};

export const RULES: Record<Option, string> = {
  combine:
    "Combine both: inside the conflicts, every line either side changed must be in the result, with the other side's renames applied; outside them, nothing may change.",
  keep_ours:
    "Keep ours: inside the conflicts the result must match ours and none of theirs; outside them, nothing may change.",
  keep_theirs:
    "Keep theirs: inside the conflicts the result must match theirs and none of ours; outside them, nothing may change.",
};

type Source = Side | "base";
// variants: for a line both sides changed, each side's own version (raw and
// with the other side's renames). Finding one in the result means the other
// side's change to that line is what's missing.
type Expected = {
  line: string;
  sources: Source[];
  variants?: Record<Side, string[]>;
  allowExtra?: number;
};

const other = (side: Side): Side => (side === "ours" ? "theirs" : "ours");

class Bag {
  private counts = new Map<string, number>();
  constructor(lines: string[] = []) {
    for (const line of lines) this.add(line);
  }
  add(line: string) {
    this.counts.set(line, (this.counts.get(line) ?? 0) + 1);
  }
  take(line: string): boolean {
    const count = this.counts.get(line) ?? 0;
    if (!count) return false;
    this.counts.set(line, count - 1);
    return true;
  }
  has(line: string) {
    return (this.counts.get(line) ?? 0) > 0;
  }
  rest(): string[] {
    return [...this.counts].flatMap(([line, count]) => Array<string>(count).fill(line));
  }
}

type Hunk = Extract<Segment, { kind: "conflict" }>;

// What "combine both" requires inside one conflict.
function expectCombined(hunk: Hunk, renames: Record<Side, Rename[]>) {
  const base = normalizedLines(hunk.base);
  const sections = { ours: normalizedLines(hunk.ours), theirs: normalizedLines(hunk.theirs) };
  const aligned = {
    ours: alignSide(base, sections.ours),
    theirs: alignSide(base, sections.theirs),
  };
  const expected: Expected[] = [];
  const ambiguous: string[] = [];
  const reverted: Record<Side, Bag> = { ours: new Bag(), theirs: new Bag() };
  const original: Record<Side, Bag> = { ours: new Bag(), theirs: new Bag() };

  // A side's line, rewritten with the other side's renames.
  const adopt = (line: string, side: Side): Expected => {
    const renamed = applyRenames(line, renames[other(side)]);
    if (renamed !== line) original[other(side)].add(line);
    return { line: renamed, sources: renamed === line ? [side] : [side, other(side)] };
  };

  const insertAt = (position: number) => {
    const fromOurs = (aligned.ours.inserted.get(position) ?? []).map((line) => adopt(line, "ours"));
    const fromTheirs = (aligned.theirs.inserted.get(position) ?? []).map((line) =>
      adopt(line, "theirs"),
    );
    for (const entry of fromOurs) {
      const twin = fromTheirs.findIndex((candidate) => candidate.line === entry.line);
      if (twin === -1) expected.push(entry);
      else {
        fromTheirs.splice(twin, 1);
        expected.push({ line: entry.line, sources: ["ours", "theirs"], allowExtra: 1 });
      }
    }
    expected.push(...fromTheirs);
  };

  insertAt(-1);
  base.forEach((line, j) => {
    const o = aligned.ours.base[j]!;
    const t = aligned.theirs.base[j]!;
    if (o.kind === "removed" || t.kind === "removed") {
      if (o.kind === "modified" || t.kind === "modified") ambiguous.push(line);
      if (o.kind === "removed") reverted.ours.add(line);
      if (t.kind === "removed") reverted.theirs.add(line);
    } else if (o.kind === "same" && t.kind === "same") {
      const renamed = applyRenames(applyRenames(line, renames.ours), renames.theirs);
      const sources: Source[] =
        renamed === line
          ? ["base"]
          : (["ours", "theirs"] as Side[]).filter(
              (side) => applyRenames(line, renames[side]) !== line,
            );
      if (renamed !== line) for (const side of sources as Side[]) reverted[side].add(line);
      expected.push({ line: renamed, sources });
    } else if (o.kind === "modified" && t.kind === "same") {
      reverted.ours.add(line);
      expected.push(adopt(o.to, "ours"));
    } else if (o.kind === "same" && t.kind === "modified") {
      reverted.theirs.add(line);
      expected.push(adopt(t.to, "theirs"));
    } else if (o.kind === "modified" && t.kind === "modified") {
      reverted.ours.add(line);
      reverted.theirs.add(line);
      if (o.to === t.to) expected.push({ line: o.to, sources: ["ours", "theirs"] });
      else {
        const merged = merge3(tokensOf(line), tokensOf(o.to), tokensOf(t.to));
        if (!merged.ok) ambiguous.push(line);
        else
          expected.push({
            line: applyRenames(applyRenames(merged.merged.join(" "), renames.ours), renames.theirs),
            sources: ["ours", "theirs"],
            variants: {
              ours: [o.to, applyRenames(o.to, renames.theirs)],
              theirs: [t.to, applyRenames(t.to, renames.ours)],
            },
          });
      }
    }
    insertAt(j);
  });
  return { expected, ambiguous, reverted, original, leaks: null as Bag | null };
}

// What keeping one side requires inside one conflict.
function expectKept(hunk: Hunk, keep: Side, renames: Record<Side, Rename[]>) {
  const drop = other(keep);
  const base = new Bag(normalizedLines(hunk.base));
  const kept = normalizedLines(hunk[keep]);
  const expected: Expected[] = kept.map((line) => ({
    line,
    sources: base.take(line) ? ["base"] : [keep],
  }));
  const reverted: Record<Side, Bag> = { ours: new Bag(), theirs: new Bag() };
  for (const line of base.rest()) reverted[keep].add(line);

  const baseLines = new Set(normalizedLines(hunk.base));
  const keptLines = new Set(kept);
  const leaks = new Bag();
  for (const line of normalizedLines(hunk[drop])) {
    if (baseLines.has(line) || keptLines.has(line)) continue;
    leaks.add(line);
    const renamed = applyRenames(line, renames[keep]);
    if (renamed !== line) leaks.add(renamed);
  }
  return {
    expected,
    ambiguous: [] as string[],
    reverted,
    original: { ours: new Bag(), theirs: new Bag() },
    leaks,
  };
}

const emptySides = (intents: Record<Side, string>): Record<Side, SideReport> => ({
  ours: { intent: intents.ours, status: "present", lines: [] },
  theirs: { intent: intents.theirs, status: "present", lines: [] },
});

function failedFile(file: FileVersions, intents: Record<Side, string>, error: string): FileReport {
  return {
    path: file.path,
    ok: false,
    error,
    outside: { ok: false, missing: [], extra: [] },
    renames: { ours: [], theirs: [] },
    ambiguous: [],
    unexpected: [],
    lostShared: [],
    sides: emptySides(intents),
  };
}

function checkFile(file: FileVersions, option: Option, intents: Record<Side, string>): FileReport {
  let segments: Segment[];
  try {
    segments = parseMergeMarkers(file.merged);
  } catch (error) {
    if (error instanceof ConflictParseError)
      return failedFile(file, intents, `${file.path}: ${error.message}`);
    throw error;
  }
  const hunks = segments.filter((segment): segment is Hunk => segment.kind === "conflict");
  if (!hunks.length) return failedFile(file, intents, `${file.path}: no conflict markers to check`);

  const resultLines = splitLines(file.result);
  const outside = matchOutside(segments, resultLines);
  const gap = new Bag(
    outside.ok
      ? outside.gaps.flat()
      : (() => {
          const all = new Bag(normalizedLines(resultLines));
          for (const segment of segments)
            if (segment.kind === "clean")
              for (const line of normalizedLines(segment.lines)) all.take(line);
          return all.rest();
        })(),
  );

  const renames = {
    ours: detectRenames(file.base, file.ours),
    theirs: detectRenames(file.base, file.theirs),
  };
  const parts = hunks.map((hunk) =>
    option === "combine"
      ? expectCombined(hunk, renames)
      : expectKept(hunk, option === "keep_ours" ? "ours" : "theirs", renames),
  );
  const expected = parts.flatMap((part) => part.expected);
  const ambiguous = parts.flatMap((part) => part.ambiguous);

  const missing: Expected[] = expected.filter((entry) => !gap.take(entry.line));
  for (const entry of expected)
    for (let k = 0; k < (entry.allowExtra ?? 0); k += 1) gap.take(entry.line);
  const extras = new Bag(gap.rest());

  const sides = emptySides(intents);
  const lostShared: string[] = [];
  const blame = (sources: Source[], line: string) => {
    const blamed = sources.filter((source): source is Side => source !== "base");
    if (!blamed.length) lostShared.push(line);
    for (const side of blamed) sides[side].lines.push(line);
  };

  for (const entry of missing) {
    // A line both sides changed, where the result kept only one side's change.
    const kept = (side: Side) =>
      entry.variants?.[side].some((variant) => variant !== entry.line && extras.take(variant));
    if (kept("ours")) blame(["theirs"], entry.line);
    else if (kept("theirs")) blame(["ours"], entry.line);
    else blame(entry.sources, entry.line);
  }

  const unexpected: string[] = [];
  const leaked: string[] = [];
  for (const line of extras.rest()) {
    if (parts.some((part) => part.leaks?.has(line))) leaked.push(line);
    else if (parts.some((part) => part.reverted.ours.has(line) || part.original.ours.has(line))) {
      if (!sides.ours.lines.length) sides.ours.lines.push(line);
    } else if (
      parts.some((part) => part.reverted.theirs.has(line) || part.original.theirs.has(line))
    ) {
      if (!sides.theirs.lines.length) sides.theirs.lines.push(line);
    } else unexpected.push(line);
  }

  for (const side of ["ours", "theirs"] as Side[])
    if (sides[side].lines.length) sides[side].status = "missing";
  if (option !== "combine") {
    const dropped = option === "keep_ours" ? "theirs" : "ours";
    sides[dropped] = leaked.length
      ? { intent: intents[dropped], status: "leaked", lines: leaked }
      : { intent: intents[dropped], status: "dropped", lines: [] };
  } else unexpected.push(...leaked);

  const ok =
    outside.ok &&
    !ambiguous.length &&
    !unexpected.length &&
    !lostShared.length &&
    (["ours", "theirs"] as Side[]).every(
      (side) => sides[side].status === "present" || sides[side].status === "dropped",
    );

  return {
    path: file.path,
    ok,
    error: null,
    outside,
    renames,
    ambiguous,
    unexpected,
    lostShared,
    sides,
  };
}

const lines = (n: number) => `${n} line${n === 1 ? "" : "s"}`;

function describeSide(side: Side, report: SideReport): string {
  switch (report.status) {
    case "present":
      return `${side}: ${report.intent}, present`;
    case "dropped":
      return `${side}: ${report.intent}, dropped as chosen`;
    case "missing":
      return `${side}: ${report.intent}, MISSING (${lines(report.lines.length)})`;
    case "leaked":
      return `${side}: ${report.intent}, LEAKED into the result (${lines(report.lines.length)}) although it was dropped`;
  }
}

const RANK: Record<SideStatus, number> = { present: 0, dropped: 0, missing: 1, leaked: 2 };

export function checkChoiceHonored(input: HonorInput): HonorResult {
  const { option, intents } = input;
  const files = input.files.map((file) => checkFile(file, option, intents));
  const sides = emptySides(intents);
  if (option !== "combine") sides[option === "keep_ours" ? "theirs" : "ours"].status = "dropped";
  for (const file of files) {
    for (const side of ["ours", "theirs"] as Side[]) {
      const report = file.sides[side];
      if (RANK[report.status] > RANK[sides[side].status]) sides[side].status = report.status;
      if (report.status === "missing" || report.status === "leaked")
        sides[side].lines.push(...report.lines);
    }
  }

  const summary = [describeSide("ours", sides.ours), describeSide("theirs", sides.theirs)];
  for (const file of files) {
    if (file.error) summary.push(file.error);
    const changedOutside = file.outside.missing.length + file.outside.extra.length;
    if (!file.error && !file.outside.ok)
      summary.push(`outside the conflicts: ${lines(changedOutside)} changed in ${file.path}`);
    if (file.ambiguous.length)
      summary.push(`${file.path}: both sides changed the same line differently; held`);
    if (file.unexpected.length)
      summary.push(`${file.path}: ${lines(file.unexpected.length)} not from either side`);
    if (file.lostShared.length)
      summary.push(`${file.path}: ${lines(file.lostShared.length)} both sides kept are missing`);
  }
  if (!files.length) summary.push("no conflicted files to check");

  return {
    ok: files.length > 0 && files.every((file) => file.ok),
    option,
    rule: RULES[option],
    sides,
    files,
    summary,
  };
}
