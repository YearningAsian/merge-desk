import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AnalyzeEvent } from "@/core/events";
import { loadAnalyses, saveAnalyses } from "@/ui/cache";
import type { AnalysisState } from "@/ui/state";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function memoryWindow() {
  const store = new Map<string, string>();
  vi.stubGlobal("window", {
    sessionStorage: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => void store.set(key, value),
      removeItem: (key: string) => void store.delete(key),
    },
  });
}

const finished = readFileSync(
  join(import.meta.dirname, "../e2e/fixtures/analyze-clean.ndjson"),
  "utf8",
)
  .split("\n")
  .filter(Boolean)
  .map((line) => AnalyzeEvent.parse(JSON.parse(line)))
  .at(-1)!;

describe("analysis cache", () => {
  it("drops an analysis 55 minutes after its signature, even when the tab saved again since", () => {
    if (!("type" in finished) || !finished.ok) throw new Error("fixture has no finished analysis");
    memoryWindow();
    vi.useFakeTimers();
    const t0 = new Date("2026-10-08T12:00:00Z").getTime();
    const key = `1:${"a".repeat(40)}:${"b".repeat(40)}`;
    const done = (token: string): AnalysisState => ({
      status: "done",
      steps: {},
      analysis: finished.analysis,
      token,
      option: finished.analysis.options[0]!.kind,
    });

    vi.setSystemTime(t0);
    saveAnalyses({ [key]: done("signed-at-t0") });
    vi.setSystemTime(t0 + 56 * 60_000);
    saveAnalyses({ [key]: done("signed-at-t0") });
    vi.setSystemTime(t0 + 57 * 60_000);
    expect(Object.keys(loadAnalyses())).not.toContain(key);

    saveAnalyses({ [key]: done("signed-at-t57") });
    expect(Object.keys(loadAnalyses())).toContain(key);
  });
});
