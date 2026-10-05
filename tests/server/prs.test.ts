import { describe, expect, it } from "vitest";
import { mergeableOf, sortPulls, summarize, type PullSummary } from "@/server/github/prs";

const REPO = "YearningAsian/merge-desk";
const pull = (overrides: Record<string, unknown> = {}) => ({
  number: 1,
  title: "[Demo] Rename fetchUser to getUser",
  html_url: "https://github.com/YearningAsian/merge-desk/pull/1",
  updated_at: "2026-10-05T10:00:00Z",
  user: { login: "YearningAsian" },
  labels: [{ name: "demo" }],
  head: { ref: "demo/clean/rename", sha: "a".repeat(40), repo: { full_name: REPO } },
  base: { ref: "demo/base", sha: "b".repeat(40) },
  mergeable: false,
  mergeable_state: "dirty",
  ...overrides,
});

describe("pull request list", () => {
  it("reads GitHub's mergeability, including still computing", () => {
    expect(mergeableOf({ mergeable: false, mergeable_state: "dirty" })).toBe("conflicting");
    expect(mergeableOf({ mergeable: true, mergeable_state: "clean" })).toBe("mergeable");
    expect(mergeableOf({ mergeable: true, mergeable_state: "blocked" })).toBe("mergeable");
    expect(mergeableOf({ mergeable: null, mergeable_state: "unknown" })).toBe("checking");
  });

  it("marks demo pull requests and forks", () => {
    expect(summarize(REPO, pull(), ["playground/src/api.js"])).toMatchObject({
      demo: true,
      fork: false,
      mergeable: "conflicting",
      filesBothSides: ["playground/src/api.js"],
    });
    const fork = summarize(
      REPO,
      pull({
        labels: [],
        head: { ref: "x", sha: "c".repeat(40), repo: { full_name: "someone/fork" } },
      }),
      null,
    );
    expect(fork).toMatchObject({ demo: false, fork: true });
  });

  it("lists conflicting first, then checking, then mergeable, newest first in each", () => {
    const at = (number: number, mergeable: PullSummary["mergeable"], updatedAt: string) =>
      ({ ...summarize(REPO, pull({ number }), null), mergeable, updatedAt }) as PullSummary;
    const sorted = sortPulls([
      at(1, "mergeable", "2026-10-05T12:00:00Z"),
      at(2, "conflicting", "2026-10-05T09:00:00Z"),
      at(3, "checking", "2026-10-05T11:00:00Z"),
      at(4, "conflicting", "2026-10-05T10:00:00Z"),
    ]);
    expect(sorted.map((p) => p.number)).toEqual([4, 2, 3, 1]);
  });
});
