import { z } from "zod";
import { AnalyzeEvent, RunEvent, type Analysis, type ResultEvent } from "./events";
import { OptionKind } from "./options";
import { PullSummary } from "./pulls";
import { RecordEntry } from "./record";

// A demo recording: one real analysis of a demo pull request, a real run of
// each option it offered, a steered retry of each held one, and the real
// writes each run led to: its hold and discard on the decision record, and
// for a verified run a real Land on the pull request's branch (which was
// then reset to its seed). `npm run record` captures all of it through live
// mode's own route handlers. Demo mode replays it with the original timings
// and writes nothing. A recording never carries a signature, so it can't
// authorize a run, a Land or a record write anywhere.

export const SCENARIOS = ["clean", "held", "drop"] as const;
export const ScenarioId = z.enum(SCENARIOS);
export type ScenarioId = z.infer<typeof ScenarioId>;

const FULL_SHA = z.string().regex(/^[0-9a-f]{40}$/);
const MS = z.number().int().min(0).max(240_000);

// A decision-record write as GitHub stored it, and how long it took.
export const RecordedWrite = z.object({ ms: MS, entry: RecordEntry });
export type RecordedWrite = z.infer<typeof RecordedWrite>;

// A real Land: what the Land route answered, the entry it recorded and the
// pull request as GitHub listed it afterwards.
export const RecordedLand = z.object({
  ms: MS,
  commit: FULL_SHA,
  branch: z.string().min(1).max(255),
  mergeable: z.enum(["mergeable", "conflicting", "checking"]),
  record: z.object({ ok: z.boolean(), reason: z.string().max(500).optional() }),
  entry: RecordEntry.nullable(),
  pull: PullSummary,
});
export type RecordedLand = z.infer<typeof RecordedLand>;

export const RecordedRun = z.object({
  option: OptionKind,
  // The one line a steered retry sent Gemini; null for the first run.
  steer: z.string().trim().min(1).max(200).nullable(),
  events: z.array(RunEvent).min(1).max(200),
  held: RecordedWrite.nullable(),
  discarded: RecordedWrite.nullable(),
  land: RecordedLand.nullable(),
});
export type RecordedRun = z.infer<typeof RecordedRun>;

const inOrder = (events: Array<{ t: number }>) =>
  events.every((event, index) => index === 0 || event.t >= events[index - 1]!.t);

export const Recording = z
  .object({
    v: z.literal(2),
    scenario: ScenarioId,
    capturedAt: z.iso.datetime(),
    runner: z.enum(["sandbox", "local"]),
    source: z.object({
      repo: z.string().min(1).max(200),
      pr: z.number().int().positive(),
      headSha: FULL_SHA,
      baseSha: FULL_SHA,
    }),
    pull: PullSummary,
    analysis: z.array(AnalyzeEvent).min(1).max(50),
    runs: z.array(RecordedRun).min(1).max(6),
  })
  .superRefine((recording, ctx) => {
    const fail = (message: string) => ctx.addIssue({ code: "custom", message });
    const events = [...recording.analysis, ...recording.runs.flatMap((run) => run.events)];
    if (events.some((event) => "token" in event && event.token !== undefined))
      fail("A recording never carries a signed token.");
    if (![recording.analysis, ...recording.runs.map((run) => run.events)].every(inOrder))
      fail("Event times must not go backwards.");

    const last = recording.analysis.at(-1);
    const results = recording.analysis.filter((event) => "type" in event);
    if (!last || !("type" in last) || !last.ok || results.length !== 1) {
      fail("The analysis must end with a finished analysis.");
      return;
    }
    const { analysis } = last;
    const { source, pull } = recording;
    if (
      analysis.repo !== source.repo ||
      analysis.pr !== source.pr ||
      analysis.revisions.head !== source.headSha ||
      analysis.revisions.base !== source.baseSha ||
      pull.number !== source.pr ||
      pull.head.sha !== source.headSha ||
      pull.base.sha !== source.baseSha
    )
      fail("The analysis and pull request must match the source.");

    const keys = recording.runs.map((run) => `${run.option}:${run.steer === null ? "" : "steer"}`);
    if (new Set(keys).size !== keys.length)
      fail("Each option is recorded at most once, plus at most one steered retry.");
    for (const run of recording.runs) {
      if (!analysis.options.some((offered) => offered.kind === run.option))
        fail(`${run.option} wasn't offered by the analysis.`);
      if (run.steer !== null && !recording.runs.some((r) => r.option === run.option && !r.steer))
        fail(`${run.option}: a steered retry needs the run it retries.`);
    }
    const recommended = analysis.options.find((option) => option.recommended);
    if (!recommended || !recording.runs.some((run) => run.option === recommended.kind))
      fail("The recommended option must be recorded.");

    for (const run of recording.runs) {
      const verdicts = run.events.filter((event) => "type" in event);
      const result = run.events.at(-1)!;
      if (verdicts.length !== 1 || !("type" in result)) {
        fail("Each run must end with its verdict.");
        continue;
      }
      const name = `${run.option}${run.steer ? " (steered)" : ""}`;
      if (run.held && (result.verdict !== "HELD" || run.held.entry.action !== "held"))
        fail(`${name}: only a held run records a hold.`);
      if (run.discarded && run.discarded.entry.action !== "discarded")
        fail(`${name}: the discard write must record a discard.`);
      for (const entry of [run.held?.entry, run.discarded?.entry, run.land?.entry])
        if (entry && entry.option !== run.option)
          fail(`${name}: a record entry names another option.`);
      if (run.land) {
        if (result.verdict !== "VERIFIED") fail(`${name}: only a verified run lands.`);
        if (run.land.entry && !["landed", "dropped"].includes(run.land.entry.action))
          fail(`${name}: a Land records a landing or a drop.`);
        if (run.land.pull.number !== source.pr || run.land.pull.head.sha !== run.land.commit)
          fail(`${name}: after a Land the pull request's head is the landed commit.`);
        if (run.land.branch !== pull.head.ref) fail(`${name}: a Land moves the PR's own branch.`);
      }
    }
  });
export type Recording = z.infer<typeof Recording>;

// The finished analysis of a recording that passed the schema.
export function recordedAnalysis(recording: Recording): Analysis {
  const last = recording.analysis.at(-1);
  if (!last || !("type" in last) || !last.ok) throw new Error("Not a finished recording");
  return last.analysis;
}

// The verdict a recorded run ended with.
export function recordedResult(run: RecordedRun): ResultEvent {
  const last = run.events.at(-1);
  if (!last || !("type" in last)) throw new Error("Not a finished run");
  return last;
}

// What a complete demo needs, beyond a valid recording: a run of every
// offered option, a steered retry of every held first run, a hold and a
// discard written for every run that can show them, and a real Land for
// every verified run. `npm run recordings:check` fails on any gap, so the
// demo never reaches a button it can't play back.
export function recordingGaps(recording: Recording): string[] {
  const gaps: string[] = [];
  const first = (kind: string) => recording.runs.find((run) => run.option === kind && !run.steer);
  for (const option of recordedAnalysis(recording).options)
    if (!first(option.kind)) gaps.push(`${option.kind} offered, not recorded`);
  for (const run of recording.runs) {
    const name = `${run.option}${run.steer ? " (steered)" : ""}`;
    const verdict = recordedResult(run).verdict;
    if (verdict === "HELD" && !run.held) gaps.push(`${name}: held, hold not recorded`);
    if (
      verdict === "HELD" &&
      !run.steer &&
      !recording.runs.some((r) => r.option === run.option && r.steer)
    )
      gaps.push(`${name}: held, no steered retry recorded`);
    if (!run.discarded) gaps.push(`${name}: discard not recorded`);
    if (verdict === "VERIFIED" && !run.land) gaps.push(`${name}: verified, Land not recorded`);
  }
  return gaps;
}

// The public numbers measured from the recordings. `npm run facts` writes
// them to docs/FACTS.json; a unit test fails if the two ever disagree.
export function recordingFacts(recordings: Recording[]) {
  const runs = recordings.flatMap((recording) => recording.runs);
  const results = runs.map(recordedResult);
  const seconds = results.map((result) => Math.round(result.t / 100) / 10);
  return {
    demoRecordedRuns: results.length,
    demoRecordedVerified: results.filter((result) => result.verdict === "VERIFIED").length,
    demoRecordedHeld: results.filter((result) => result.verdict === "HELD").length,
    demoRecordedSteered: runs.filter((run) => run.steer !== null).length,
    demoRecordedLands: runs.filter((run) => run.land !== null).length,
    demoRunSecondsMin: Math.min(...seconds),
    demoRunSecondsMax: Math.max(...seconds),
  };
}
