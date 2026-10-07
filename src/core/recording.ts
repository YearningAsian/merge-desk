import { z } from "zod";
import { AnalyzeEvent, RunEvent, type Analysis, type ResultEvent } from "./events";
import { OptionKind } from "./options";
import { PullSummary } from "./pulls";

// A demo recording: one real analysis of a demo pull request and a real run
// of each option it offered, captured by `npm run record` through the same
// pipeline live mode uses. Demo mode replays these with their original
// timings and writes nothing. A recording never carries a signature, so it
// can't authorize a run, a Land or a record write anywhere.

export const SCENARIOS = ["clean", "held", "drop"] as const;
export const ScenarioId = z.enum(SCENARIOS);
export type ScenarioId = z.infer<typeof ScenarioId>;

const FULL_SHA = z.string().regex(/^[0-9a-f]{40}$/);

export const RecordedRun = z.object({
  option: OptionKind,
  events: z.array(RunEvent).min(1).max(200),
});
export type RecordedRun = z.infer<typeof RecordedRun>;

const inOrder = (events: Array<{ t: number }>) =>
  events.every((event, index) => index === 0 || event.t >= events[index - 1]!.t);

export const Recording = z
  .object({
    v: z.literal(1),
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
    runs: z.array(RecordedRun).min(1).max(3),
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

    const recorded = recording.runs.map((run) => run.option);
    if (new Set(recorded).size !== recorded.length) fail("Each option is recorded at most once.");
    for (const option of recorded)
      if (!analysis.options.some((offered) => offered.kind === option))
        fail(`${option} wasn't offered by the analysis.`);
    const recommended = analysis.options.find((option) => option.recommended);
    if (!recommended || !recorded.includes(recommended.kind))
      fail("The recommended option must be recorded.");

    for (const run of recording.runs) {
      const verdicts = run.events.filter((event) => "type" in event);
      if (verdicts.length !== 1 || !("type" in run.events.at(-1)!))
        fail("Each run must end with its verdict.");
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

// The public numbers measured from the recordings. `npm run facts` writes
// them to docs/FACTS.json; a unit test fails if the two ever disagree.
export function recordingFacts(recordings: Recording[]) {
  const results = recordings.flatMap((recording) => recording.runs.map(recordedResult));
  const seconds = results.map((result) => Math.round(result.t / 100) / 10);
  return {
    demoRecordedRuns: results.length,
    demoRecordedVerified: results.filter((result) => result.verdict === "VERIFIED").length,
    demoRecordedHeld: results.filter((result) => result.verdict === "HELD").length,
    demoRunSecondsMin: Math.min(...seconds),
    demoRunSecondsMax: Math.max(...seconds),
  };
}
