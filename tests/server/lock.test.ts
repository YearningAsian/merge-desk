import type { Octokit } from "@octokit/rest";
import { describe, expect, it, vi } from "vitest";
import { heldReason, lockRef, readLock, releaseLock, withRefLock } from "@/server/github/lock";
import { fakeRefs } from "../helpers/fake-refs";

const REPO = "YearningAsian/merge-desk";

function github() {
  const store = fakeRefs();
  const octokit = {
    git: store.git,
    repos: store.repos,
    graphql: store.graphql,
  } as unknown as Octokit;
  return { octokit, store };
}

const lock = (name: string, extra: { waitMs?: number; signal?: AbortSignal } = {}) => ({
  repo: REPO,
  name,
  scope: `${REPO}#2`,
  holder: "YearningAsian",
  ...extra,
});

describe("shared decision-record lock", () => {
  it("names only refs under refs/merge-desk/locks/ with a plain name", () => {
    expect(lockRef("pr-2")).toBe("refs/merge-desk/locks/pr-2");
    for (const bad of ["", "../heads/main", "PR-2", "pr/2", "-pr", "a".repeat(81)])
      expect(() => lockRef(bad)).toThrow();
  });

  it("holds the lock while the work runs, on its own root commit, and frees it after", async () => {
    const { octokit, store } = github();
    const ref = lockRef("pr-2");
    const result = await withRefLock(octokit, lock("pr-2"), async () => {
      const held = store.refs.get(ref)!;
      expect(store.messages.get(held)).toMatch(
        /^Merge Desk decision-record lock\n\nscope: YearningAsian\/merge-desk#2\nholder: YearningAsian\n/,
      );
      return { ok: true as const, value: 1 };
    });
    expect(result).toEqual({ ok: true, value: 1 });
    expect(store.refs.has(ref)).toBe(false);
  });

  it("refuses while another instance holds it, without running the work", async () => {
    const { octokit, store } = github();
    const ref = lockRef("pr-2");
    store.refs.set(ref, "f".repeat(40)); // another server instance's lock
    const work = vi.fn(async () => ({ ok: true as const }));
    const result = await withRefLock(octokit, lock("pr-2", { waitMs: 0 }), work);
    expect(result).toEqual({ ok: false, reason: heldReason(ref) });
    expect(heldReason(ref)).toMatch(/docs\/record-reconciliation\.md/);
    expect(work).not.toHaveBeenCalled();
    expect(store.refs.get(ref)).toBe("f".repeat(40));
  });

  it("waits for another instance to finish, then takes the lock", async () => {
    const { octokit, store } = github();
    const ref = lockRef("pr-2");
    store.refs.set(ref, "f".repeat(40));
    setTimeout(() => store.refs.delete(ref), 100);
    const work = vi.fn(async () => ({ ok: true as const }));
    expect(await withRefLock(octokit, lock("pr-2", { waitMs: 3_000 }), work)).toEqual({
      ok: true,
    });
    expect(work).toHaveBeenCalledTimes(1);
    expect(store.refs.has(ref)).toBe(false);
  });

  it("keeps the lock after a dispatched write that was never confirmed", async () => {
    const { octokit, store } = github();
    const ref = lockRef("pr-2");
    await expect(
      withRefLock(octokit, lock("pr-2"), async (lease) => {
        lease.dispatched();
        throw new Error("Connection closed after the PATCH was sent");
      }),
    ).rejects.toThrow();
    expect(store.refs.has(ref)).toBe(true);
    const later = vi.fn(async () => ({ ok: true as const }));
    expect(await withRefLock(octokit, lock("pr-2", { waitMs: 0 }), later)).toMatchObject({
      ok: false,
    });
    expect(later).not.toHaveBeenCalled();
  });

  it("frees the lock when a dispatched write was confirmed and the work then failed", async () => {
    const { octokit, store } = github();
    await expect(
      withRefLock(octokit, lock("pr-2"), async (lease) => {
        lease.dispatched();
        lease.confirmed();
        throw new Error("a later read failed");
      }),
    ).rejects.toThrow();
    expect(store.refs.has(lockRef("pr-2"))).toBe(false);
  });

  it("treats an unreadable lock as taken, never as free", async () => {
    const { octokit, store } = github();
    store.refs.set(lockRef("pr-2"), "f".repeat(40));
    vi.spyOn(store.git, "getRef").mockRejectedValue(Object.assign(new Error(), { status: 502 }));
    const work = vi.fn(async () => ({ ok: true as const }));
    const result = await withRefLock(octokit, lock("pr-2", { waitMs: 3_000 }), work);
    expect(result).toMatchObject({
      ok: false,
      reason: expect.stringMatching(/nothing was written/),
    });
    expect(work).not.toHaveBeenCalled();
  });

  it("counts a create whose answer was lost as taken once GitHub shows it is ours", async () => {
    const { octokit, store } = github();
    const create = store.git.createRef;
    vi.spyOn(store.git, "createRef").mockImplementationOnce(async (input) => {
      await create(input);
      throw new Error("socket hang up after the create applied");
    });
    const work = vi.fn(async () => ({ ok: true as const }));
    expect(await withRefLock(octokit, lock("pr-2", { waitMs: 0 }), work)).toEqual({ ok: true });
    expect(work).toHaveBeenCalledTimes(1);
    expect(store.refs.has(lockRef("pr-2"))).toBe(false);
  });

  // Review 6.1 M1: the create applied but its answer was lost, and the read
  // that would have shown it failed too. The refusal must not leave it behind.
  it("releases a lock whose create applied when the read-back then fails", async () => {
    const { octokit, store } = github();
    const create = store.git.createRef;
    vi.spyOn(store.git, "createRef").mockImplementationOnce(async (input) => {
      await create(input);
      throw new Error("socket hang up after the create applied");
    });
    vi.spyOn(store.git, "getRef").mockRejectedValueOnce(
      Object.assign(new Error("Bad Gateway"), { status: 502 }),
    );
    const work = vi.fn(async () => ({ ok: true as const }));
    const result = await withRefLock(octokit, lock("pr-2", { waitMs: 0 }), work);
    expect(result).toMatchObject({ ok: false });
    expect(work).not.toHaveBeenCalled();
    expect(store.refs.has(lockRef("pr-2"))).toBe(false);
  });

  it("refuses without touching GitHub's refs when its lock commit can't be made", async () => {
    const { octokit, store } = github();
    vi.spyOn(store.git, "createTree").mockRejectedValue(new Error("503"));
    const create = vi.spyOn(store.git, "createRef");
    const work = vi.fn(async () => ({ ok: true as const }));
    expect(await withRefLock(octokit, lock("pr-2"), work)).toMatchObject({ ok: false });
    expect(create).not.toHaveBeenCalled();
    expect(work).not.toHaveBeenCalled();
  });

  it("frees its own lock when the caller aborts before any write", async () => {
    const { octokit, store } = github();
    const controller = new AbortController();
    await expect(
      withRefLock(octokit, lock("pr-2", { signal: controller.signal }), async () => {
        controller.abort();
        controller.signal.throwIfAborted();
      }),
    ).rejects.toThrow();
    expect(store.refs.has(lockRef("pr-2"))).toBe(false);
  });

  it("does not start queued work after its caller aborts", async () => {
    const { octokit } = github();
    let release!: () => void;
    const held = new Promise<void>((resolve) => (release = resolve));
    const first = withRefLock(octokit, lock("pr-2"), async () => {
      await held;
      return { ok: true as const };
    });
    const controller = new AbortController();
    const work = vi.fn(async () => ({ ok: true as const }));
    const second = withRefLock(octokit, lock("pr-2", { signal: controller.signal }), work);
    const refused = expect(second).rejects.toThrow();
    controller.abort();
    release();
    expect(await first).toEqual({ ok: true });
    await refused;
    expect(work).not.toHaveBeenCalled();
  });

  it("queues writers in one process instead of refusing them", async () => {
    const { octokit, store } = github();
    const order: string[] = [];
    const run = (id: string) =>
      withRefLock(octokit, lock("pr-2", { waitMs: 0 }), async () => {
        order.push(`${id}:start`);
        await new Promise((resolve) => setTimeout(resolve, 5));
        order.push(`${id}:end`);
        return { ok: true as const };
      });
    expect(await Promise.all([run("a"), run("b")])).toEqual([{ ok: true }, { ok: true }]);
    expect(order).toEqual(["a:start", "a:end", "b:start", "b:end"]);
    expect(store.refs.size).toBe(0);
  });

  it("never deletes a lock that points at another writer's commit", async () => {
    const { octokit, store } = github();
    const ref = lockRef("pr-2");
    store.refs.set(ref, "f".repeat(40));
    expect(await releaseLock(octokit, REPO, ref, "e".repeat(40))).toBe(true);
    expect(store.refs.get(ref)).toBe("f".repeat(40));
    expect(await readLock(octokit, REPO, ref)).toBe("f".repeat(40));
  });

  it("reports an unconfirmed release so the lock is left for reconciliation", async () => {
    const { octokit, store } = github();
    const ref = lockRef("pr-2");
    store.refs.set(ref, "a".repeat(40));
    vi.spyOn(store, "graphql").mockRejectedValue(new Error("timeout"));
    const failing = { ...octokit, graphql: store.graphql } as unknown as Octokit;
    vi.spyOn(store.git, "getRef").mockRejectedValue(Object.assign(new Error(), { status: 502 }));
    expect(await releaseLock(failing, REPO, ref, "a".repeat(40))).toBe(false);
    expect(store.refs.get(ref)).toBe("a".repeat(40));
  });
});
