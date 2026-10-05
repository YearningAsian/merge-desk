import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { AnalyzeEvent } from "@/core/events";
import { analysisKey, deskReducer, initialDesk, type DeskState } from "@/ui/state";

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
    expect(state).toEqual({ selected: 3, analyses: {} });
  });
});
