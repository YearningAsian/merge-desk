import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { AnalyzeEvent } from "@/core/events";
import { analysisKey, deskReducer, initialDesk, runKey, type DeskState } from "@/ui/state";

// Replays a real recorded analysis stream through the desk's reducer.
const events = readFileSync(
  join(import.meta.dirname, "../e2e/fixtures/analyze-clean.ndjson"),
  "utf8",
)
  .split("\n")
  .filter(Boolean)
  .map((line) => AnalyzeEvent.parse(JSON.parse(line)));
const key = analysisKey(1, "a".repeat(40), "b".repeat(40));

function run(state: DeskState = initialDesk) {
  let next = deskReducer(state, { type: "analysis/start", key });
  for (const event of events) next = deskReducer(next, { type: "analysis/event", key, event });
  return next;
}

describe("desk reducer", () => {
  it("ends a recorded analysis done, with the recommended option chosen and step timings", () => {
    const state = run().analyses[key]!;
    if (state.status !== "done") throw new Error(state.status);
    const recommended = state.analysis.options.find((option) => option.recommended)!;
    expect(state.option).toBe(recommended.kind);
    const prepare = state.steps.prepare!;
    expect(prepare.state).toBe("passed");
    expect(prepare.from).toBeTypeOf("number");
    expect(prepare.t).toBeGreaterThanOrEqual(prepare.from!);
  });

  it("only accepts an option the analysis offered", () => {
    const done = run();
    const offered = (
      done.analyses[key] as { analysis: { options: Array<{ kind: string }> } }
    ).analysis.options.map((o) => o.kind);
    const other = (["combine", "keep_ours", "keep_theirs"] as const).find(
      (kind) => !offered.includes(kind),
    );
    const pick = offered.find(
      (kind) => kind !== (done.analyses[key] as { option: string }).option,
    )!;
    const chosen = deskReducer(done, { type: "option", key, option: pick as "combine" });
    expect((chosen.analyses[key] as { option: string }).option).toBe(pick);
    if (other) expect(deskReducer(chosen, { type: "option", key, option: other })).toBe(chosen);
  });

  it("records a failure with its reason, and ignores events after the end", () => {
    let state = deskReducer(initialDesk, { type: "analysis/start", key });
    state = deskReducer(state, {
      type: "analysis/event",
      key,
      event: { t: 5, type: "analysis", ok: false, reason: "No conflicts" },
    });
    expect(state.analyses[key]).toMatchObject({ status: "failed", reason: "No conflicts" });
    const after = deskReducer(state, { type: "analysis/error", key, reason: "late" });
    expect(after).toBe(state);
    expect(deskReducer(state, { type: "analysis/event", key, event: events[0]! })).toBe(state);
  });

  it("keeps selection separate from analyses", () => {
    const state = deskReducer(initialDesk, { type: "select", pr: 3 });
    expect(state).toEqual({ selected: 3, analyses: {}, runs: {} });
  });
});

describe("runs", () => {
  const analysis = analysisKey(2, "a".repeat(40), "b".repeat(40));
  const combine = runKey(analysis, "combine");
  const keepOurs = runKey(analysis, "keep_ours");

  it("ticks steps, then ends with the verdict; a late error can't overwrite it", () => {
    let state = deskReducer(initialDesk, { type: "run/start", key: combine, steer: null });
    state = deskReducer(state, {
      type: "run/event",
      key: combine,
      event: { t: 0, step: "tests", state: "running" },
    });
    state = deskReducer(state, {
      type: "run/event",
      key: combine,
      event: { t: 900, step: "tests", state: "failed", detail: "exit 1" },
    });
    expect(state.runs[combine]!.steps.tests).toMatchObject({ state: "failed", from: 0, t: 900 });
    state = deskReducer(state, {
      type: "run/event",
      key: combine,
      event: { t: 901, type: "result", verdict: "HELD", failed: ["tests"], summary: [] },
    });
    state = deskReducer(state, { type: "run/error", key: combine, reason: "late" });
    const run = state.runs[combine]!;
    expect(run.status).toBe("done");
    if (run.status === "done") expect(run.result.verdict).toBe("HELD");
    expect(run.events).toHaveLength(3);
  });

  it("keeps each option's run apart, and discards one without touching the other", () => {
    let state = deskReducer(initialDesk, { type: "run/start", key: combine, steer: null });
    state = deskReducer(state, { type: "run/start", key: keepOurs, steer: "keep the alias" });
    state = deskReducer(state, { type: "run/discard", key: combine });
    expect(Object.keys(state.runs)).toEqual([keepOurs]);
    expect(state.runs[keepOurs]!.steer).toBe("keep the alias");
  });
});
