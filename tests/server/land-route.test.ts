import { afterEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/live/land/route";
import { POST as recordPOST } from "@/app/api/live/record/route";

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
  CODE_ALLOWED_REPOS: ["YearningAsian/merge-desk"],
  requireEnv: () => "test-only-secret-0123456789abcdef0123456789",
}));
vi.mock("@/server/guard", () => ({ checkLand: () => ({ ok: true }) }));
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

const request = () =>
  new Request("http://localhost:3000/api/live/land", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ pr: 1, token: "fixture" }),
  });
function prepare() {
  vi.resetAllMocks();
  mocks.guard.mockResolvedValue({ ok: true, login: "YearningAsian" });
  mocks.verify.mockReturnValue({
    finishedAt: "2026-10-05T12:00:00Z",
    option: "combine",
    drops: null,
    reason: null,
    checks: [],
    revisions: { head: "a".repeat(40), base: "b".repeat(40) },
  });
  mocks.client.mockResolvedValue({
    repos: { get: async () => ({ data: { default_branch: "main", node_id: "repository" } }) },
    users: { getByUsername: async () => ({ data: { id: 1 } }) },
  });
  mocks.pull.mockResolvedValue({
    data: { state: "open" },
    summary: {
      head: { ref: "demo/clean/rename", sha: "a".repeat(40) },
      base: { ref: "demo/base", sha: "b".repeat(40) },
      mergeable: "mergeable",
    },
  });
  mocks.land.mockResolvedValue({ commit: "c".repeat(40) });
  mocks.record.mockResolvedValue({ ok: true });
}
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});
describe("Land route total deadline and writer scope", () => {
  it("uses the remaining route budget after a slow confirmed Land", async () => {
    prepare();
    vi.useFakeTimers();
    mocks.land.mockImplementation(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50_000));
      return { commit: "c".repeat(40) };
    });
    mocks.pull
      .mockResolvedValueOnce({
        data: { state: "open" },
        summary: { head: { ref: "demo/clean/rename" }, base: { ref: "demo/base" } },
      })
      .mockImplementation(() => new Promise(() => undefined));
    let response: Response | undefined;
    const done = POST(request()).then((value) => {
      response = value;
    });
    await vi.advanceTimersByTimeAsync(56_000);
    expect(response).toBeDefined();
    await done;
    expect(await response!.json()).toMatchObject({
      outcome: "LANDED",
      commit: "c".repeat(40),
      record: { ok: false },
    });
  });

  it("lands and records from a hosted production deployment", async () => {
    prepare();
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("VERCEL", "1");
    const hosted = new Request("https://merge-desk.example.invalid/api/live/land", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ pr: 1, token: "fixture" }),
    });
    expect(await (await POST(hosted)).json()).toMatchObject({
      outcome: "LANDED",
      record: { ok: true },
    });
    expect(mocks.land).toHaveBeenCalledTimes(1);
    expect(mocks.record).toHaveBeenCalledTimes(1);
  });

  it("asks for a token that can write the lock ref when recording a decision", async () => {
    prepare();
    const input = new Request("https://merge-desk.example.invalid/api/live/record", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ pr: 1, token: "fixture", action: "discarded" }),
    });
    await recordPOST(input);
    expect(mocks.client).toHaveBeenCalledWith("YearningAsian/merge-desk", {
      contents: "write",
      pull_requests: "write",
    });
    expect(mocks.record).toHaveBeenCalledTimes(1);
  });

  it("stops slow preparation without initiating a later branch update", async () => {
    prepare();
    vi.useFakeTimers();
    let release!: (value: unknown) => void;
    mocks.client.mockReturnValue(
      new Promise((resolve) => {
        release = resolve;
      }),
    );
    const done = POST(request());
    await vi.advanceTimersByTimeAsync(56_000);
    expect(await (await done).json()).toMatchObject({ outcome: "REFUSED" });
    release({ repos: { get: vi.fn() } });
    await vi.advanceTimersByTimeAsync(1);
    expect(mocks.land).not.toHaveBeenCalled();
  });

  it("keeps an unconfirmed attempted update UNKNOWN at the deadline", async () => {
    prepare();
    vi.useFakeTimers();
    let signal!: AbortSignal;
    mocks.land.mockImplementation(async (_client, input) => {
      signal = input.signal;
      input.onRefUpdate();
      return new Promise(() => undefined);
    });
    const done = POST(request());
    await vi.advanceTimersByTimeAsync(56_000);
    expect(await (await done).json()).toMatchObject({ outcome: "UNKNOWN" });
    expect(signal.aborted).toBe(true);
    expect(mocks.record).not.toHaveBeenCalled();
  });

  it("never starts Land for an already aborted request", async () => {
    prepare();
    const controller = new AbortController();
    controller.abort();
    const aborted = new Request(request(), { signal: controller.signal });
    expect(await (await POST(aborted)).json()).toMatchObject({ outcome: "REFUSED" });
    expect(mocks.client).not.toHaveBeenCalled();
    expect(mocks.land).not.toHaveBeenCalled();
  });

  it("never starts a record write for an already aborted request", async () => {
    prepare();
    const controller = new AbortController();
    controller.abort();
    const aborted = new Request("http://localhost:3000/api/live/record", {
      method: "POST",
      signal: controller.signal,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ pr: 1, token: "fixture", action: "discarded" }),
    });
    await recordPOST(aborted);
    expect(mocks.client).not.toHaveBeenCalled();
    expect(mocks.record).not.toHaveBeenCalled();
  });

  it("forwards request cancellation into a queued record writer", async () => {
    prepare();
    const controller = new AbortController();
    const input = new Request("http://localhost:3000/api/live/record", {
      method: "POST",
      signal: controller.signal,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ pr: 1, token: "fixture", action: "discarded" }),
    });
    await recordPOST(input);
    const signal = mocks.record.mock.calls[0]![1].signal as AbortSignal;
    expect(signal).toBeDefined();
    controller.abort();
    expect(signal.aborted).toBe(true);
  });

  it("bounds queued record work before the function deadline and aborts it", async () => {
    prepare();
    vi.useFakeTimers();
    let signal!: AbortSignal;
    mocks.record.mockImplementation(async (_client, input) => {
      signal = input.signal;
      return new Promise(() => undefined);
    });
    const input = new Request("http://localhost:3000/api/live/record", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ pr: 1, token: "fixture", action: "discarded" }),
    });
    let response: Response | undefined;
    const done = recordPOST(input).then((value) => {
      response = value;
    });
    await vi.advanceTimersByTimeAsync(26_000);
    expect(response).toBeDefined();
    await done;
    expect(response!.status).toBe(503);
    expect(signal.aborted).toBe(true);
  });
});
