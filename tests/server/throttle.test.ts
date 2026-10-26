import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_DAILY_CAP,
  admitLiveWork,
  confirmLiveWork,
  countToday,
  dailyCap,
  throttleReady,
  type ListSandboxes,
} from "@/server/throttle";

const NOW = new Date("2026-10-06T15:00:00.000Z");
const today = (minutesAgo: number) => ({ createdAt: NOW.getTime() - minutesAgo * 60_000 });
const yesterday = { createdAt: Date.UTC(2026, 9, 5, 23, 59) };

// A newest-first listing, as Sandbox.list is asked for, that records how far
// it was read.
function listing(items: { createdAt: number }[], fail?: Error) {
  const read = { count: 0 };
  const list: ListSandboxes = () => ({
    async *[Symbol.asyncIterator]() {
      if (fail) throw fail;
      for (const item of items) {
        read.count += 1;
        yield item;
      }
    },
  });
  return { list, read };
}

afterEach(() => vi.restoreAllMocks());

describe("daily live-run throttle", () => {
  it("reads the cap from DAILY_LIVE_RUN_CAP, with the default when unset", () => {
    expect(dailyCap({})).toBe(DEFAULT_DAILY_CAP);
    expect(dailyCap({ DAILY_LIVE_RUN_CAP: " 12 " })).toBe(12);
    for (const bad of ["0", "-1", "1e3", "ten", "1001", "3.5", "99999"])
      expect(dailyCap({ DAILY_LIVE_RUN_CAP: bad })).toBeNull();
  });

  it("counts only sandboxes created since 00:00 UTC and stops at the first older one", async () => {
    const { list, read } = listing([today(1), today(60), today(600), yesterday, yesterday]);
    expect(await countToday(list, NOW, new AbortController().signal)).toBe(3);
    expect(read.count).toBe(4);
  });

  it("refuses to count a listing that isn't newest first", async () => {
    const { list } = listing([today(60), today(1), yesterday]);
    await expect(countToday(list, NOW, new AbortController().signal)).rejects.toThrow();
  });

  it("refuses to count an entry without a creation time", async () => {
    const { list } = listing([today(1), { createdAt: Number.NaN }]);
    await expect(countToday(list, NOW, new AbortController().signal)).rejects.toThrow();
  });

  it("admits live work below the cap", async () => {
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    const { list } = listing([today(1), today(2), yesterday]);
    expect(await admitLiveWork({ env: { DAILY_LIVE_RUN_CAP: "3" }, now: NOW, list })).toEqual({
      ok: true,
      used: 2,
      cap: 3,
    });
  });

  it("refuses at the cap, saying when it opens again", async () => {
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    const { list } = listing([today(1), today(2), today(3), yesterday]);
    const result = await admitLiveWork({ env: { DAILY_LIVE_RUN_CAP: "3" }, now: NOW, list });
    expect(result).toMatchObject({ ok: false, status: 429 });
    if (result.ok) throw new Error("expected a refusal");
    expect(result.reason).toMatch(/3 of 3 .*00:00 UTC/);
  });

  it("counts a person's share from their own tag and refuses at it", async () => {
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    const filters: unknown[] = [];
    const everyone = [today(1), today(2), today(3)];
    const theirs = [today(1), today(2)];
    const list: ListSandboxes = (_signal, filter) => {
      filters.push(filter);
      return listing(filter ? theirs : everyone).list(_signal);
    };
    const env = { DAILY_LIVE_RUN_CAP: "30", DAILY_USER_RUN_CAP: "2" };
    const result = await admitLiveWork({ login: "Some-One", env, now: NOW, list });
    expect(filters).toEqual([undefined, { user: "some-one" }]);
    expect(result).toMatchObject({ ok: false, status: 429 });
    if (result.ok) throw new Error("expected a refusal");
    expect(result.reason).toMatch(/today's 2 live runs/);
    expect(
      await admitLiveWork({ login: "other", env: { DAILY_USER_RUN_CAP: "3" }, now: NOW, list }),
    ).toMatchObject({ ok: true });
  });

  it("confirms work whose own sandbox is already counted, and refuses past the cap", async () => {
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    const env = { DAILY_LIVE_RUN_CAP: "3", DAILY_USER_RUN_CAP: "2" };
    const fits = listing([today(1), today(2), today(3)]);
    expect(await confirmLiveWork({ env, now: NOW, list: fits.list })).toMatchObject({ ok: true });
    const over = listing([today(1), today(2), today(3), today(4)]);
    const result = await confirmLiveWork({ env, now: NOW, list: over.list });
    expect(result).toMatchObject({ ok: false, status: 429 });
    if (result.ok) throw new Error("expected a refusal");
    expect(result.reason).toMatch(/3 of 3 /);
    const theirs =
      (count: number): ListSandboxes =>
      (signal, filter) =>
        listing(filter ? Array.from({ length: count }, (_, i) => today(i)) : [today(1)]).list(
          signal,
        );
    const login = "some-one";
    expect(await confirmLiveWork({ login, env, now: NOW, list: theirs(2) })).toMatchObject({
      ok: true,
    });
    expect(await confirmLiveWork({ login, env, now: NOW, list: theirs(3) })).toMatchObject({
      ok: false,
      status: 429,
    });
  });

  it("refuses when a person's cap is misconfigured", async () => {
    const { list } = listing([]);
    expect(
      await admitLiveWork({ login: "x", env: { DAILY_USER_RUN_CAP: "0" }, now: NOW, list }),
    ).toMatchObject({ ok: false, status: 503 });
  });

  it("refuses when the sandbox list can't be read", async () => {
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    const { list } = listing([], new Error("401 OIDC token expired"));
    expect(await admitLiveWork({ env: {}, now: NOW, list })).toMatchObject({
      ok: false,
      status: 503,
    });
  });

  it("refuses when the cap is misconfigured, without listing", async () => {
    const { list, read } = listing([today(1)]);
    expect(
      await admitLiveWork({ env: { DAILY_LIVE_RUN_CAP: "unlimited" }, now: NOW, list }),
    ).toMatchObject({ ok: false, status: 503 });
    expect(read.count).toBe(0);
  });

  it("refuses when the listing hangs past its time limit", async () => {
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    const list: ListSandboxes = (signal) => ({
      async *[Symbol.asyncIterator]() {
        await new Promise((_, reject) =>
          signal.addEventListener("abort", () => reject(signal.reason), { once: true }),
        );
      },
    });
    const controller = new AbortController();
    const pending = admitLiveWork({ env: {}, now: NOW, list, signal: controller.signal });
    controller.abort();
    expect(await pending).toMatchObject({ ok: false, status: 503 });
  });

  it("logs counts only", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const { list } = listing([today(1)]);
    await admitLiveWork({ env: { DAILY_LIVE_RUN_CAP: "5" }, now: NOW, list });
    expect(JSON.parse(info.mock.calls[0]![0] as string)).toEqual({
      event: "throttle",
      admitted: true,
      cap: 5,
      used: 1,
    });
  });

  it("reports readiness for health from a real count, cached for a minute", async () => {
    const failing = listing([], new Error("unreachable"));
    expect(await throttleReady({ env: {}, now: NOW, list: failing.list })).toBe(false);
    const working = listing([today(1)]);
    const later = new Date(NOW.getTime() + 30_000);
    expect(await throttleReady({ env: {}, now: later, list: working.list })).toBe(false);
    expect(working.read.count).toBe(0);
    const afterMinute = new Date(NOW.getTime() + 61_000);
    expect(await throttleReady({ env: {}, now: afterMinute, list: working.list })).toBe(true);
  });
});
