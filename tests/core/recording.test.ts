import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { Recording, recordedAnalysis } from "@/core/recording";
import { PullList } from "@/core/pulls";

// Real captured data (tests/e2e/fixtures) shaped as a demo recording.
const FIXTURES = join(process.cwd(), "tests", "e2e", "fixtures");
const lines = (name: string) =>
  readFileSync(join(FIXTURES, name), "utf8")
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line) as Record<string, unknown>);
const prs = PullList.parse(JSON.parse(readFileSync(join(FIXTURES, "prs.json"), "utf8")));
const pull = prs.pulls.find((item) => item.head.ref === "demo/clean/rename")!;

function clean() {
  return {
    v: 1,
    scenario: "clean",
    capturedAt: "2026-10-06T22:00:00.000Z",
    runner: "sandbox",
    source: {
      repo: "YearningAsian/merge-desk",
      pr: pull.number,
      headSha: pull.head.sha,
      baseSha: pull.base.sha,
    },
    pull,
    analysis: lines("analyze-clean.ndjson"),
    runs: [{ option: "combine", events: lines("run-clean.ndjson") }],
  };
}

const issues = (value: unknown) => {
  const parsed = Recording.safeParse(value);
  return parsed.success ? [] : parsed.error.issues.map((issue) => issue.message);
};

describe("demo recordings", () => {
  it("accepts a recording of real runs", () => {
    const recording = Recording.parse(clean());
    expect(recordedAnalysis(recording).options.some((option) => option.recommended)).toBe(true);
  });

  it("never carries a signed token", () => {
    const withToken = clean();
    const last = withToken.analysis.at(-1)!;
    withToken.analysis[withToken.analysis.length - 1] = { ...last, token: "signed" };
    expect(issues(withToken)).toContain("A recording never carries a signed token.");

    const runToken = clean();
    const result = runToken.runs[0]!.events.at(-1)!;
    runToken.runs[0]!.events[runToken.runs[0]!.events.length - 1] = { ...result, token: "x" };
    expect(issues(runToken)).toContain("A recording never carries a signed token.");
  });

  it("needs an analysis that finished with options", () => {
    const failed = clean();
    failed.analysis = [
      ...failed.analysis.slice(0, -1),
      { t: 6000, type: "analysis", ok: false, reason: "Gemini answered 503" },
    ];
    expect(issues(failed)).toContain("The analysis must end with a finished analysis.");
  });

  it("only records options the analysis offered, once each", () => {
    const twice = clean();
    twice.runs.push(twice.runs[0]!);
    expect(issues(twice)).toContain("Each option is recorded at most once.");

    const drop = Recording.parse(clean());
    const offered = recordedAnalysis(drop).options.map((option) => option.kind);
    const missing = (["combine", "keep_ours", "keep_theirs"] as const).find(
      (kind) => !offered.includes(kind),
    );
    if (missing) {
      const notOffered = clean();
      notOffered.runs.push({ option: missing, events: notOffered.runs[0]!.events });
      expect(issues(notOffered)).toContain(`${missing} wasn't offered by the analysis.`);
    }
  });

  it("records the recommended option", () => {
    const recording = clean();
    const analysisEvent = recording.analysis.at(-1) as { analysis: { options: unknown[] } };
    const options = analysisEvent.analysis.options as Array<{ kind: string; recommended: boolean }>;
    const notRecommended = options.find((option) => !option.recommended)!;
    recording.runs = [{ option: notRecommended.kind, events: recording.runs[0]!.events }];
    expect(issues(recording)).toContain("The recommended option must be recorded.");
  });

  it("ends every run with exactly one verdict, last", () => {
    const open = clean();
    open.runs[0]!.events = open.runs[0]!.events.slice(0, -1);
    expect(issues(open)).toContain("Each run must end with its verdict.");

    const twice = clean();
    const events = twice.runs[0]!.events;
    twice.runs[0]!.events = [...events.slice(0, -1), events.at(-1)!, events.at(-1)!];
    expect(issues(twice)).toContain("Each run must end with its verdict.");
  });

  it("binds the analysis and the listed pull request to the recorded revisions", () => {
    const moved = clean();
    moved.source = { ...moved.source, headSha: "0".repeat(40) };
    expect(issues(moved)).toContain("The analysis and pull request must match the source.");
  });

  it("keeps event times in order so playback never runs backwards", () => {
    const backwards = clean();
    const events = backwards.runs[0]!.events;
    backwards.runs[0]!.events = [events[0]!, { ...events[1]!, t: 99_999 }, ...events.slice(2)];
    expect(issues(backwards)).toContain("Event times must not go backwards.");
  });
});
