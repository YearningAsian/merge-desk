import { describe, expect, it } from "vitest";
import { RunEvent, STEP_LABELS } from "@/core/events";

describe("run events", () => {
  it("accepts a step event in the shared shape", () => {
    expect(
      RunEvent.parse({ t: 120, step: "tests", state: "passed", detail: "node --test: 10 passed" }),
    ).toMatchObject({
      step: "tests",
    });
  });

  it("accepts the final result event", () => {
    const event = {
      t: 900,
      type: "result",
      verdict: "HELD",
      failed: ["honor"],
      summary: ["theirs: retry on 429, MISSING (6 lines)"],
    };
    expect(RunEvent.parse(event)).toMatchObject({ verdict: "HELD" });
  });

  it("rejects unknown states and verdicts so a pass can't be invented", () => {
    expect(RunEvent.safeParse({ t: 1, step: "tests", state: "ok" }).success).toBe(false);
    expect(
      RunEvent.safeParse({ t: 1, type: "result", verdict: "SAFE", failed: [], summary: [] })
        .success,
    ).toBe(false);
  });

  it("bounds the size of a raw log", () => {
    expect(
      RunEvent.safeParse({ t: 1, step: "tests", state: "failed", log: "x".repeat(70_000) }).success,
    ).toBe(false);
  });

  it("labels every step in plain words", () => {
    expect(STEP_LABELS).toEqual({
      revisions: "Revisions unchanged",
      propose: "Propose merge",
      write: "Write on scratch copy",
      parse: "It parses",
      honor: "Choice honored",
      tests: "Tests",
    });
  });
});
