import { describe, expect, it } from "vitest";
import type { RunRecord } from "@/core/run";
import { landMessage } from "@/server/github/land";

// The merge commit says which model proposed it, so the history shows who wrote it.
const record = {
  option: "combine",
  description: null,
  proposeModel: "gemini-3.5-flash-lite",
  checks: [],
} as unknown as RunRecord;
const refs = { head: "feat/x", base: "main" };

describe("landMessage names the model that proposed the merge", () => {
  it("names the proposing model", () => {
    expect(landMessage(record, refs, "YearningAsian")).toContain(
      "Checked on a scratch copy of gemini-3.5-flash-lite's proposal:",
    );
  });

  it("keeps a model name on one line", () => {
    const message = landMessage({ ...record, proposeModel: "a\nb" }, refs, "YearningAsian");
    expect(message).toContain("scratch copy of a b's proposal");
    expect(message.split("\n")).toHaveLength(5);
  });
});
