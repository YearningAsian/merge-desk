import { createHmac, randomUUID } from "node:crypto";
import type { Octokit } from "@octokit/rest";
import { describe, expect, it, vi } from "vitest";
import { MARKER, renderRecord, type RecordEntry, type RecordSeal } from "@/core/record";
import { readRecord, upsertRecord } from "@/server/github/comment";
import { lockRef } from "@/server/github/lock";
import { fakeRefs } from "../helpers/fake-refs";

const APP_ID = 7;
const seal: RecordSeal = {
  seal: (text) => createHmac("sha256", "k").update(text).digest("base64url"),
  check: (text, mac) => createHmac("sha256", "k").update(text).digest("base64url") === mac,
};

const entry = (id: string): RecordEntry => ({
  id,
  action: "held",
  who: "YearningAsian",
  at: "2026-10-05T12:00:00.000Z",
  option: "combine",
  reason: null,
  checks: [],
  head: "a".repeat(40),
  base: "b".repeat(40),
  commit: null,
  dropped: null,
});

type Stored = { id: number; body: string; performed_via_github_app: { id: number } | null };

// An in-memory pull request thread with GitHub's comment calls, plus the
// ref calls the record lock uses. Every call yields to the event loop first,
// so concurrent requests really interleave.
function thread(initial: Stored[] = [], hooks: { afterUpdate?: (c: Stored) => void } = {}) {
  const comments = [...initial];
  let next = 100;
  const tick = () => new Promise((resolve) => setTimeout(resolve, 1));
  const issues = {
    listComments: async () => {
      await tick();
      return { data: comments.map((comment) => ({ ...comment })) };
    },
    createComment: async ({ body }: { body: string }) => {
      await tick();
      comments.push({ id: next++, body, performed_via_github_app: { id: APP_ID } });
      return { data: {} };
    },
    updateComment: async ({ comment_id, body }: { comment_id: number; body: string }) => {
      await tick();
      const comment = comments.find((item) => item.id === comment_id)!;
      comment.body = body;
      hooks.afterUpdate?.(comment);
      return { data: {} };
    },
  };
  const refs = fakeRefs();
  const octokit = {
    issues,
    git: refs.git,
    repos: refs.repos,
    graphql: refs.graphql,
    paginate: async (method: () => Promise<{ data: unknown[] }>) => (await method()).data,
  } as unknown as Octokit;
  const records = () =>
    comments.filter((c) => c.performed_via_github_app?.id === APP_ID && c.body.includes(MARKER));
  return { octokit, comments, records, refs: refs.refs };
}

const input = (id: string) => ({
  repo: "YearningAsian/merge-desk",
  pr: 2,
  appId: APP_ID,
  entry: entry(id),
  deskUrl: null,
  seal,
});

describe("upsertRecord", () => {
  it("blocks later writers after an ambiguous dispatched PATCH can still apply remotely", async () => {
    const repo = `YearningAsian/review-${randomUUID()}`;
    const scope = `${repo}#2`;
    const original = renderRecord([entry("original")], { deskUrl: null, seal, scope });
    const { octokit, comments, refs } = thread([
      { id: 1, body: original, performed_via_github_app: { id: APP_ID } },
    ]);
    let lateBody: string | undefined;
    vi.spyOn(octokit.issues, "updateComment").mockImplementationOnce(async (value) => {
      lateBody = value!.body!;
      throw new Error("Connection closed after dispatch; remote write still pending");
    });
    await expect(upsertRecord(octokit, { ...input("A"), repo })).rejects.toThrow();
    // The lock stays on GitHub, naming who held it, for an operator to reconcile.
    expect(refs.has(lockRef("pr-2"))).toBe(true);
    vi.useFakeTimers();
    let next;
    try {
      const pending = upsertRecord(octokit, { ...input("B"), repo });
      await vi.advanceTimersByTimeAsync(10_000); // past the lock's wait
      next = await pending;
    } finally {
      vi.useRealTimers();
    }
    expect(next).toMatchObject({ ok: false, reason: expect.stringContaining(lockRef("pr-2")) });
    comments[0]!.body = lateBody!; // The first PATCH finally completes remotely.
    const saved = await readRecord(octokit, { repo, pr: 2, appId: APP_ID, seal });
    expect(saved.entries.map((value) => value.id)).toEqual(["original", "A"]);
  });
  it("does not allow separate module instances to build stale replacement bodies", async () => {
    vi.resetModules();
    const first = await import("@/server/github/comment");
    vi.resetModules();
    const second = await import("@/server/github/comment");
    const { octokit, records } = thread();
    const list = octokit.paginate.bind(octokit);
    let release!: () => void;
    let began!: () => void;
    const started = new Promise<void>((resolve) => (began = resolve));
    const held = new Promise<void>((resolve) => (release = resolve));
    let reads = 0;
    octokit.paginate = (async (...args: Parameters<Octokit["paginate"]>) => {
      reads += 1;
      if (reads === 1) {
        began();
        await held;
      }
      return list(...args);
    }) as Octokit["paginate"];
    const a = first.upsertRecord(octokit, { ...input("instance-A"), pr: 40004 });
    await started;
    const b = second.upsertRecord(octokit, { ...input("instance-B"), pr: 40004 });
    try {
      await new Promise((resolve) => setTimeout(resolve, 30));
      expect(reads).toBe(1);
    } finally {
      release();
      await Promise.all([a, b]);
    }
    expect(records()).toHaveLength(1);
    expect((await a).ok && (await b).ok).toBe(true);
    const saved = await readRecord(octokit, {
      repo: input("x").repo,
      pr: 40004,
      appId: APP_ID,
      seal,
    });
    expect(saved.entries.map((entry) => entry.id).sort()).toEqual(["instance-A", "instance-B"]);
  });

  it("does not initiate a queued comment mutation after its caller aborts", async () => {
    const { octokit } = thread();
    const list = octokit.paginate.bind(octokit);
    let release!: () => void;
    let began!: () => void;
    const started = new Promise<void>((resolve) => {
      began = resolve;
    });
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    let reads = 0;
    octokit.paginate = (async (...args: Parameters<Octokit["paginate"]>) => {
      if (++reads === 1) {
        began();
        await held;
      }
      return list(...args);
    }) as Octokit["paginate"];
    const create = vi.spyOn(octokit.issues, "createComment");
    const a = upsertRecord(octokit, { ...input("first"), pr: 40005 });
    await started;
    const controller = new AbortController();
    const b = upsertRecord(octokit, {
      ...input("cancelled"),
      pr: 40005,
      signal: controller.signal,
    });
    const refused = expect(b).rejects.toThrow();
    controller.abort();
    release();
    expect((await a).ok).toBe(true);
    await refused;
    expect(create).toHaveBeenCalledTimes(1);
    const saved = await readRecord(octokit, {
      repo: input("x").repo,
      pr: 40005,
      appId: APP_ID,
      seal,
    });
    expect(saved.entries.map((entry) => entry.id)).toEqual(["first"]);
  });

  it("writes from a hosted production server through the shared lock, then frees it", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("VERCEL", "1");
    const { octokit, records, refs } = thread();
    try {
      expect(await upsertRecord(octokit, input("production"))).toMatchObject({ ok: true });
      expect(records()).toHaveLength(1);
      expect(refs.size).toBe(0);
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("refuses while another server instance holds the lock, writing nothing", async () => {
    const { octokit, comments, refs } = thread();
    refs.set(lockRef("pr-2"), "f".repeat(40));
    const reads = vi.spyOn(octokit, "paginate");
    vi.useFakeTimers();
    try {
      const pending = upsertRecord(octokit, input("blocked"));
      await vi.advanceTimersByTimeAsync(10_000); // past the lock's wait
      expect(await pending).toMatchObject({ ok: false });
    } finally {
      vi.useRealTimers();
    }
    expect(reads).not.toHaveBeenCalled();
    expect(comments).toHaveLength(0);
  });

  // Review 6.1 M4: the route stops waiting (its answer is sent) while a
  // comment update is already on its way. That update must finish and be
  // read back under its own time budget, so ordinary slowness never strands
  // the lock; only a write still unconfirmed when the budget ends keeps it.
  it("finishes and confirms a dispatched write after its caller stops waiting", async () => {
    const { octokit, records, refs } = thread();
    const stop = new AbortController();
    const create = octokit.issues.createComment.bind(octokit.issues);
    vi.spyOn(octokit.issues, "createComment").mockImplementationOnce(async (value) => {
      stop.abort(); // the response deadline passes mid-request
      await new Promise((resolve) => setTimeout(resolve, 20));
      return create(value!);
    });
    const result = await upsertRecord(octokit, { ...input("slow"), signal: stop.signal });
    expect(result).toMatchObject({ ok: true });
    expect(records()).toHaveLength(1);
    expect(refs.size).toBe(0);
  });

  it("keeps the lock when a dispatched write is still unconfirmed at the end of its budget", async () => {
    const { octokit, refs } = thread();
    vi.spyOn(octokit.issues, "createComment").mockImplementationOnce(
      () => new Promise(() => undefined), // GitHub never answers
    );
    await expect(upsertRecord(octokit, { ...input("hung"), budgetMs: 50 })).rejects.toThrow();
    expect(refs.has(lockRef("pr-2"))).toBe(true);
  });

  it("frees the lock when GitHub refuses a write outright", async () => {
    const { octokit, refs } = thread();
    vi.spyOn(octokit.issues, "createComment").mockRejectedValueOnce(
      Object.assign(new Error("Resource not accessible by integration"), { status: 403 }),
    );
    await expect(upsertRecord(octokit, input("refused"))).rejects.toThrow();
    expect(refs.size).toBe(0);
  });

  it("never starts a write once its caller has stopped waiting", async () => {
    const { octokit, comments, refs } = thread();
    const stop = new AbortController();
    const list = octokit.paginate.bind(octokit);
    octokit.paginate = (async (...args: Parameters<Octokit["paginate"]>) => {
      const result = await list(...args);
      stop.abort(); // stops after the read, before any write
      return result;
    }) as Octokit["paginate"];
    await expect(
      upsertRecord(octokit, { ...input("late"), signal: stop.signal }),
    ).rejects.toThrow();
    expect(comments).toHaveLength(0);
    expect(refs.size).toBe(0);
  });

  it("refuses an oversized record without discarding history or sending a write", async () => {
    const history = Array.from({ length: 200 }, (_, i) => ({
      ...entry(`history-${i}`),
      reason: "a".repeat(300),
    }));
    const body = renderRecord(history, {
      deskUrl: null,
      seal,
      scope: "YearningAsian/merge-desk#2",
    });
    const { octokit, comments } = thread([
      { id: 1, body, performed_via_github_app: { id: APP_ID } },
    ]);
    const update = vi.spyOn(octokit.issues, "updateComment");
    const result = await upsertRecord(octokit, input("next"));
    expect(result).toMatchObject({ ok: false });
    expect(update).not.toHaveBeenCalled();
    expect(comments[0]!.body).toBe(body);
  });
  // Review round 1, H1: two writers at once (a hold recorded automatically
  // and a quick discard, or two tabs).
  it("two concurrent updates on an empty thread leave one comment holding both", async () => {
    const { octokit, records } = thread();
    const [a, b] = await Promise.all([
      upsertRecord(octokit, input("run-1:held")),
      upsertRecord(octokit, input("run-1:discarded")),
    ]);
    expect(a.ok && b.ok).toBe(true);
    expect(records()).toHaveLength(1);
    const read = await readRecord(octokit, { repo: input("x").repo, pr: 2, appId: APP_ID, seal });
    expect(read.ok && read.entries.map((e) => e.id).sort()).toEqual([
      "run-1:discarded",
      "run-1:held",
    ]);
  });

  it("folds a duplicate record (another instance) into the oldest, deleting nothing", async () => {
    const own = (id: number, entries: RecordEntry[]): Stored => ({
      id,
      body: renderRecord(entries, { deskUrl: null, seal, scope: "YearningAsian/merge-desk#2" }),
      performed_via_github_app: { id: APP_ID },
    });
    const { octokit, comments, records } = thread([
      own(1, [entry("first")]),
      own(2, [entry("second")]),
    ]);
    const result = await upsertRecord(octokit, input("third"));
    expect(result.ok && result.entries.map((e) => e.id)).toEqual(["first", "second", "third"]);
    expect(comments).toHaveLength(2);
    expect(records().map((c) => c.id)).toEqual([1]);
  });

  it("notices an update lost to a concurrent writer and applies it again", async () => {
    let clobbered = false;
    const original = renderRecord([entry("first")], {
      deskUrl: null,
      seal,
      scope: "YearningAsian/merge-desk#2",
    });
    const { octokit } = thread(
      [{ id: 1, body: original, performed_via_github_app: { id: APP_ID } }],
      {
        afterUpdate: (comment) => {
          if (clobbered) return;
          clobbered = true;
          comment.body = original; // someone else's write lands last
        },
      },
    );
    const result = await upsertRecord(octokit, input("second"));
    expect(result.ok && result.entries.map((e) => e.id)).toEqual(["first", "second"]);
    // What is stored, not just what the function says.
    const read = await readRecord(octokit, { repo: input("x").repo, pr: 2, appId: APP_ID, seal });
    expect(read.ok && read.entries.map((e) => e.id)).toEqual(["first", "second"]);
  });

  it("ignores a record edited outside Merge Desk and starts a new one, without overwriting it", async () => {
    const edited = renderRecord([entry("first")], {
      deskUrl: null,
      seal,
      scope: "YearningAsian/merge-desk#2",
    }).replace('"who":"YearningAsian"', '"who":"someone-else"');
    const { octokit, comments } = thread([
      { id: 1, body: edited, performed_via_github_app: { id: APP_ID } },
    ]);
    const result = await upsertRecord(octokit, input("second"));
    expect(result.ok && result.entries.map((e) => e.id)).toEqual(["second"]);
    expect(comments[0]!.body).toBe(edited);
    expect(comments[1]!.body).toContain("changed outside Merge Desk");
  });

  it("never treats someone else's comment with the marker as the record", async () => {
    const forged = renderRecord([entry("forged")], {
      deskUrl: null,
      seal,
      scope: "YearningAsian/merge-desk#2",
    });
    const { octokit } = thread([{ id: 1, body: forged, performed_via_github_app: null }]);
    const read = await readRecord(octokit, { repo: input("x").repo, pr: 2, appId: APP_ID, seal });
    expect(read).toEqual({ ok: true, entries: [], note: null });
  });
});
