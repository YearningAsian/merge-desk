import { describe, expect, it, vi } from "vitest";
import { snapshotReady } from "@/server/deps-snapshot";

// Review 8.1 M1: health says the snapshot is there only when the Sandbox API
// confirms the configured id exists and hasn't expired, not from the id alone.
describe("snapshotReady", () => {
  const now = new Date("2026-10-07T12:00:00Z");
  const env = { DEPS_SNAPSHOT_ID: "snap_trusted" };
  let minute = 0;
  const at = () => new Date(now.getTime() + (minute += 2) * 60_000); // past the cache

  it("is false without a well-formed id, and never asks", async () => {
    const get = vi.fn();
    expect(await snapshotReady({ env: {}, now: at(), get })).toBe(false);
    expect(await snapshotReady({ env: { DEPS_SNAPSHOT_ID: "x y" }, now: at(), get })).toBe(false);
    expect(get).not.toHaveBeenCalled();
  });

  it("is true for a created snapshot that hasn't expired", async () => {
    const when = at();
    const get = vi.fn(async () => ({
      status: "created",
      expiresAt: new Date(when.getTime() + 86_400_000),
    }));
    expect(await snapshotReady({ env, now: when, get })).toBe(true);
    expect(get).toHaveBeenCalledWith("snap_trusted", expect.any(AbortSignal));
  });

  it.each([
    ["expired", async () => ({ status: "created", expiresAt: new Date(0) })],
    ["deleted", async () => ({ status: "deleted" })],
    ["unreadable", async () => Promise.reject(new Error("not found"))],
  ])("is false when the snapshot is %s", async (_name, get) => {
    expect(await snapshotReady({ env, now: at(), get })).toBe(false);
  });

  it("asks at most once a minute for the same id", async () => {
    const when = at();
    const get = vi.fn(async () => ({ status: "created" }));
    await snapshotReady({ env, now: when, get });
    await snapshotReady({ env, now: new Date(when.getTime() + 30_000), get });
    expect(get).toHaveBeenCalledTimes(1);
  });

  // Review 8.2 L4: concurrent health checks share one request.
  it("asks once for concurrent checks", async () => {
    const when = at();
    let release: (value: { status: string }) => void = () => undefined;
    const get = vi.fn(() => new Promise<{ status: string }>((resolve) => (release = resolve)));
    const first = snapshotReady({ env, now: when, get });
    const second = snapshotReady({ env, now: when, get });
    release({ status: "created" });
    expect(await Promise.all([first, second])).toEqual([true, true]);
    expect(get).toHaveBeenCalledTimes(1);
  });
});
