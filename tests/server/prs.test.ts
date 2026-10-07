import type { Octokit } from "@octokit/rest";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  listPulls,
  mergeableOf,
  readPull,
  sortPulls,
  summarize,
  type PullSummary,
} from "@/server/github/prs";

const REPO = "YearningAsian/merge-desk";
afterEach(() => vi.restoreAllMocks());
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

  it("keeps a conflict-free but blocked pull request separate from merge readiness", () => {
    expect(
      summarize(REPO, pull({ mergeable: true, mergeable_state: "blocked" }), null),
    ).toMatchObject({
      mergeable: "mergeable",
      readiness: { state: "blocked", githubState: "blocked" },
    });
  });

  it("does not claim merge readiness from absent check or permission evidence", () => {
    expect(
      summarize(REPO, pull({ mergeable: true, mergeable_state: "clean" }), null),
    ).toMatchObject({ readiness: { state: "unknown", checks: { state: "unknown" } } });
  });

  it("reads current checks against the exact pull head without borrowing the App credential", async () => {
    const listed = pull({ mergeable: true, mergeable_state: "blocked" });
    const app = {
      pulls: {
        list: vi.fn().mockResolvedValue({ data: [listed] }),
        get: vi.fn().mockResolvedValue({ data: listed }),
      },
    };
    const publicReads = {
      repos: {
        getCombinedStatusForRef: vi.fn().mockResolvedValue({
          data: {
            total_count: 1,
            statuses: [
              { context: "preview", state: "success", target_url: "https://vercel.com/example" },
            ],
          },
        }),
      },
      checks: {
        listForRef: vi.fn().mockResolvedValue({
          data: {
            total_count: 1,
            check_runs: [
              {
                name: "CI / web",
                status: "completed",
                conclusion: "success",
                html_url: "https://github.com/YearningAsian/merge-desk/actions/runs/1",
              },
            ],
          },
        }),
      },
    };
    const result = await listPulls(
      app as unknown as Octokit,
      REPO,
      publicReads as unknown as Octokit,
    );
    expect(result.pulls[0]).toMatchObject({
      readiness: {
        state: "blocked",
        checkedHead: listed.head.sha,
        checks: {
          state: "passing",
          items: [
            { name: "preview", state: "passing" },
            { name: "CI / web", state: "passing" },
          ],
        },
      },
    });
    expect(publicReads.checks.listForRef).toHaveBeenCalledWith(
      expect.objectContaining({ ref: listed.head.sha }),
    );
    expect(publicReads.repos.getCombinedStatusForRef).toHaveBeenCalledWith(
      expect.objectContaining({ ref: listed.head.sha }),
    );
  });

  it("keeps partial or unavailable checks unknown even when GitHub reports clean", async () => {
    const listed = pull({ mergeable: true, mergeable_state: "clean" });
    const app = {
      pulls: {
        list: vi.fn().mockResolvedValue({ data: [listed] }),
        get: vi.fn().mockResolvedValue({ data: listed }),
      },
    };
    const publicReads = {
      repos: {
        getCombinedStatusForRef: vi.fn().mockResolvedValue({
          data: { total_count: 2, statuses: [{ context: "preview", state: "success" }] },
        }),
      },
      checks: { listForRef: vi.fn().mockRejectedValue(new Error("permission denied")) },
    };
    const result = await listPulls(
      app as unknown as Octokit,
      REPO,
      publicReads as unknown as Octokit,
    );
    expect(result.pulls[0]).toMatchObject({
      readiness: { state: "unknown", checks: { state: "unknown" } },
    });
  });

  it("does not interpret no checks as passing CI, and caches the exact-head snapshot across list polls", async () => {
    const now = Date.now();
    const clock = vi.spyOn(Date, "now").mockReturnValue(now);
    let listed = pull({ mergeable: true, mergeable_state: "clean" });
    const app = {
      pulls: {
        list: vi.fn().mockImplementation(async () => ({ data: [listed] })),
        get: vi.fn().mockImplementation(async () => ({ data: listed })),
      },
    };
    const publicReads = {
      repos: {
        getCombinedStatusForRef: vi
          .fn()
          .mockResolvedValue({ data: { total_count: 0, statuses: [] } }),
      },
      checks: {
        listForRef: vi.fn().mockResolvedValue({ data: { total_count: 0, check_runs: [] } }),
      },
    };
    const read = () =>
      listPulls(app as unknown as Octokit, REPO, publicReads as unknown as Octokit);
    const first = await read();
    clock.mockReturnValue(now + 31_000);
    const second = await read();
    expect(first.pulls[0]).toMatchObject({
      readiness: { state: "unknown", checks: { state: "none" } },
    });
    expect(second.pulls[0]!.readiness!.checks.observedAt).toBe(
      first.pulls[0]!.readiness!.checks.observedAt,
    );
    expect(publicReads.checks.listForRef).toHaveBeenCalledTimes(1);
    listed = { ...listed, head: { ...listed.head, sha: "c".repeat(40) } };
    await read();
    expect(publicReads.checks.listForRef).toHaveBeenCalledTimes(2);
  });

  it.each(["unknown", "pending"] as const)(
    "refreshes a transient %s check snapshot on the same head after a minute",
    async (state) => {
      const now = Date.now();
      const clock = vi.spyOn(Date, "now").mockReturnValue(now);
      const listed = pull({ mergeable: true, mergeable_state: "clean" });
      const app = {
        pulls: {
          list: vi.fn().mockResolvedValue({ data: [listed] }),
          get: vi.fn().mockResolvedValue({ data: listed }),
        },
      };
      const checkRead = vi.fn().mockResolvedValue({
        data: {
          total_count: 1,
          check_runs: [{ name: "CI / web", status: "completed", conclusion: "success" }],
        },
      });
      if (state === "unknown") checkRead.mockRejectedValueOnce(new Error("transient outage"));
      else
        checkRead.mockResolvedValueOnce({
          data: { total_count: 1, check_runs: [{ name: "CI / web", status: "in_progress" }] },
        });
      const publicReads = {
        repos: {
          getCombinedStatusForRef: vi.fn().mockResolvedValue({
            data: { total_count: 0, statuses: [] },
          }),
        },
        checks: { listForRef: checkRead },
      };
      const read = () =>
        listPulls(app as unknown as Octokit, REPO, publicReads as unknown as Octokit);
      expect((await read()).pulls[0]!.readiness!.checks.state).toBe(state);
      clock.mockReturnValue(now + 30_000);
      expect((await read()).pulls[0]!.readiness!.checks.state).toBe(state);
      expect(checkRead).toHaveBeenCalledTimes(1);
      clock.mockReturnValue(now + 61_000);
      expect((await read()).pulls[0]!.readiness!.checks.state).toBe("passing");
      expect(checkRead).toHaveBeenCalledTimes(2);
    },
  );

  it("does not retry a rate-limited public read on another head before reset", async () => {
    let listed = pull({ mergeable: true, mergeable_state: "clean" });
    const app = {
      pulls: {
        list: vi.fn().mockImplementation(async () => ({ data: [listed] })),
        get: vi.fn().mockImplementation(async () => ({ data: listed })),
      },
    };
    const publicReads = {
      repos: {
        getCombinedStatusForRef: vi.fn().mockRejectedValue({
          status: 403,
          response: {
            headers: {
              "x-ratelimit-remaining": "0",
              "x-ratelimit-reset": String(Math.floor(Date.now() / 1000) + 3600),
            },
          },
        }),
      },
      checks: {
        listForRef: vi.fn().mockResolvedValue({ data: { total_count: 0, check_runs: [] } }),
      },
    };
    await listPulls(app as unknown as Octokit, REPO, publicReads as unknown as Octokit);
    listed = { ...listed, head: { ...listed.head, sha: "c".repeat(40) } };
    const next = await listPulls(
      app as unknown as Octokit,
      REPO,
      publicReads as unknown as Octokit,
    );
    expect(next.pulls[0]).toMatchObject({
      readiness: {
        state: "unknown",
        checks: { state: "unknown", reason: expect.stringContaining("paused") },
      },
    });
    expect(publicReads.repos.getCombinedStatusForRef).toHaveBeenCalledTimes(1);
    expect(publicReads.checks.listForRef).toHaveBeenCalledTimes(1);
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

// Found by the dogfood run (PLAN 2.13): GitHub's pull.base.sha is the base
// when the pull request was opened, not where the base branch is now. A
// merge against it can miss a conflict, and the "base moved" guard can't
// see the branch move.
describe("the base commit is the base branch's current tip", () => {
  const stale = "b".repeat(40);
  const tip = "e".repeat(40);
  const octokit = (getRef: ReturnType<typeof vi.fn>) => ({
    pulls: { get: vi.fn().mockResolvedValue({ data: { ...pull(), state: "open" } }) },
    git: { getRef },
  });

  it("reads it for analysis, runs, Land and the record", async () => {
    const getRef = vi.fn().mockResolvedValue({ data: { object: { sha: tip } } });
    const result = await readPull(octokit(getRef) as unknown as Octokit, REPO, 1);
    expect(result.summary.base).toEqual({ ref: "demo/base", sha: tip });
    expect(getRef).toHaveBeenCalledWith(
      expect.objectContaining({
        owner: "YearningAsian",
        repo: "merge-desk",
        ref: "heads/demo/base",
      }),
    );
  });

  it("refuses to guess when the base branch can't be read", async () => {
    const getRef = vi.fn().mockRejectedValue(new Error("Not Found"));
    await expect(readPull(octokit(getRef) as unknown as Octokit, REPO, 1)).rejects.toThrow();
  });

  it("refuses an answer that isn't a full commit id", async () => {
    const getRef = vi.fn().mockResolvedValue({ data: { object: { sha: "main" } } });
    await expect(readPull(octokit(getRef) as unknown as Octokit, REPO, 1)).rejects.toThrow();
  });

  it("lists pull requests against the tip, and GitHub's value only if the tip can't be read", async () => {
    const listed = pull();
    const getRef = vi.fn().mockResolvedValue({ data: { object: { sha: tip } } });
    const compare = vi.fn().mockResolvedValue({ data: { files: [] } });
    const app = {
      pulls: {
        list: vi.fn().mockResolvedValue({ data: [listed] }),
        get: vi.fn().mockResolvedValue({ data: listed }),
      },
      git: { getRef },
      repos: { compareCommitsWithBasehead: compare },
    };
    const publicReads = {
      repos: { getCombinedStatusForRef: vi.fn().mockRejectedValue(new Error("x")) },
      checks: { listForRef: vi.fn().mockRejectedValue(new Error("x")) },
    };
    const read = () =>
      listPulls(app as unknown as Octokit, REPO, publicReads as unknown as Octokit);
    expect((await read()).pulls[0]!.base.sha).toBe(tip);
    expect(compare).toHaveBeenCalledWith(
      expect.objectContaining({ basehead: `${tip}...${listed.head.sha}` }),
    );
    getRef.mockRejectedValue(new Error("Not Found"));
    expect((await read()).pulls[0]!.base.sha).toBe(stale);
  });
});
