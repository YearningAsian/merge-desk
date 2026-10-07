import { describe, expect, it } from "vitest";
import type { RunRecord } from "@/core/run";
import { landMessage } from "@/server/github/land";

// The merge commit says which tests passed, so the history shows what was checked.
const record = {
  option: "combine",
  description: null,
  proposeModel: "gemini-3.5-flash-lite",
  checks: [
    {
      step: "tests",
      state: "passed",
      detail: "vitest run (the app's unit tests): passed (exit 0, 15586 ms)",
    },
  ],
} as unknown as RunRecord;
const refs = { head: "feat/x", base: "main" };

describe("landMessage names the tests that passed", () => {
  it("names the suite from the run's tests step", () => {
    expect(landMessage(record, refs, "YearningAsian")).toContain(
      "and vitest run (the app's unit tests) passes.",
    );
  });

  it("falls back to the tests when the step has no detail", () => {
    expect(landMessage({ ...record, checks: [] }, refs, "YearningAsian")).toContain(
      "and the tests pass.",
    );
  });

  it("stays five lines", () => {
    expect(landMessage(record, refs, "YearningAsian").split("\n")).toHaveLength(5);
  });
});
