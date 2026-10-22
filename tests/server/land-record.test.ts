import { afterEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/live/land/route";

// PRD "Decision record": every landed merge is recorded on the pull request,
// even when GitHub is slow to say whether it can merge or the browser leaves.

const mocks = vi.hoisted(() => ({
  guard: vi.fn(),
  verify: vi.fn(),
  client: vi.fn(),
  pull: vi.fn(),
  land: vi.fn(),
  record: vi.fn(),
}));
vi.mock("@/server/session", () => ({ guardLive: mocks.guard }));
vi.mock("@/server/pipeline/run", () => ({ verifyRun: mocks.verify }));
vi.mock("@/server/env", () => ({
  requireEnv: () => "test-only-secret-0123456789abcdef0123456789",
}));
vi.mock("@/server/guard", () => ({ checkLand: () => ({ ok: true }) }));
vi.mock("@/server/github/access", async () => {
  const app = await import("@/server/github/app");
  return {
    // As the real one: a GitHub failure is a 503 answer, never a throw.
    openRepo: async (_login: string, repo: string, permissions: object) => {
      try {
        return { ok: true, octokit: await app.installationOctokit(repo, permissions as never) };
      } catch {
        return { ok: false, status: 503, error: "GitHub isn't reachable right now. Try again." };
      }
    },
  };
});
vi.mock("@/server/github/app", () => ({
  installationOctokit: mocks.client,
  splitRepo: () => ({ owner: "YearningAsian", name: "merge-desk" }),
  appIdentity: async () => ({ id: 7, botName: "bot", botEmail: "bot@example.invalid" }),
}));
vi.mock("@/server/github/prs", () => ({ readPull: mocks.pull }));
vi.mock("@/server/github/land", () => ({
  landMerge: mocks.land,
  LandError: class extends Error {},
}));
vi.mock("@/server/github/comment", () => ({ upsertRecord: mocks.record }));

const HEAD = "a".repeat(40);
const LANDED = "c".repeat(40);
const pullAt = (sha: string) => ({
  data: { state: "open" },
  summary: {
    head: { ref: "demo/clean/rename", sha },
    base: { ref: "demo/base", sha: "b".repeat(40) },
    mergeable: "conflicting",
  },
});
const later = <T>(ms: number, value: T) =>
  new Promise<T>((resolve) => setTimeout(() => resolve(value), ms));

let sent = false;
function prepare(readMs: number, recordMs = 3_000) {
  vi.resetAllMocks();
  sent = false;
  mocks.guard.mockResolvedValue({ ok: true, login: "YearningAsian" });
  mocks.verify.mockReturnValue({
    finishedAt: "2026-10-05T12:00:00Z",
    option: "combine",
    drops: null,
    reason: null,
    checks: [],
    revisions: { head: HEAD, base: "b".repeat(40) },
  });
  mocks.client.mockResolvedValue({
    repos: { get: async () => ({ data: { default_branch: "main", node_id: "repository" } }) },
    users: { getByUsername: async () => ({ data: { id: 1 } }) },
  });
  // The Land's own read, then GitHub still answering for the old head (it
  // computes mergeability lazily after a push) at readMs per readPull.
  mocks.pull
    .mockResolvedValueOnce(pullAt(HEAD))
    .mockImplementation(() => later(readMs, pullAt(HEAD)));
  mocks.land.mockResolvedValue({ commit: LANDED });
  // upsertRecord's contract (comment.ts): lock commit, lock and first read
  // take time; once its signal aborts nothing new is sent.
  mocks.record.mockImplementation(async (_client: unknown, input: { signal: AbortSignal }) => {
    await later(recordMs, null);
    input.signal.throwIfAborted();
    sent = true;
    return { ok: true, entries: [] };
  });
}

const landRequest = (signal?: AbortSignal) =>
  new Request("https://merge-desk.example.invalid/api/live/land", {
    method: "POST",
    headers: { "content-type": "application/json", origin: "https://merge-desk.example.invalid" },
    body: JSON.stringify({ repo: "YearningAsian/merge-desk", pr: 1, token: "fixture" }),
    signal,
  });

afterEach(() => {
  vi.useRealTimers();
});

describe("Land's decision record", () => {
  it("is written when GitHub answers quickly", async () => {
    prepare(200);
    vi.useFakeTimers();
    const done = POST(landRequest());
    await vi.advanceTimersByTimeAsync(40_000);
    expect((await (await done).json()).record).toEqual({ ok: true });
    expect(mocks.record).toHaveBeenCalledTimes(1);
    expect(sent).toBe(true);
  });

  it("is written and confirmed even when GitHub's mergeability reads are slow", async () => {
    prepare(1_500);
    vi.useFakeTimers();
    const done = POST(landRequest());
    await vi.advanceTimersByTimeAsync(40_000);
    const body = await (await done).json();
    expect({ outcome: body.outcome, record: body.record, sent }).toEqual({
      outcome: "LANDED",
      record: { ok: true },
      sent: true,
    });
  });

  it("says it wasn't confirmed, never that it may still appear, when it outlasts the budget", async () => {
    prepare(200, 20_000);
    vi.useFakeTimers();
    const done = POST(landRequest());
    await vi.advanceTimersByTimeAsync(40_000);
    const body = await (await done).json();
    expect(body.outcome).toBe("LANDED");
    expect(body.record).toEqual({
      ok: false,
      reason: "The record update wasn't confirmed before this answer. Check the pull request.",
    });
  });

  it("is written when the browser disconnects after the branch moved", async () => {
    prepare(1_500);
    vi.useFakeTimers();
    const browser = new AbortController();
    const done = POST(landRequest(browser.signal));
    await vi.advanceTimersByTimeAsync(1_000);
    expect(mocks.land).toHaveBeenCalledTimes(1);
    browser.abort(); // tab closed or phone slept while "Landing" showed
    await vi.advanceTimersByTimeAsync(40_000);
    expect((await (await done).json()).outcome).toBe("LANDED");
    expect(sent).toBe(true);
  });
});
