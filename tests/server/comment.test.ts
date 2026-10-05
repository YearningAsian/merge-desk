import { createHmac } from "node:crypto";
import type { Octokit } from "@octokit/rest";
import { describe, expect, it } from "vitest";
import { MARKER, renderRecord, type RecordEntry, type RecordSeal } from "@/core/record";
import { readRecord, upsertRecord } from "@/server/github/comment";

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

// An in-memory pull request thread with GitHub's comment calls. Every call
// yields to the event loop first, so concurrent requests really interleave.
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
  const octokit = {
    issues,
    paginate: async (method: () => Promise<{ data: unknown[] }>) => (await method()).data,
  } as unknown as Octokit;
  const records = () =>
    comments.filter((c) => c.performed_via_github_app?.id === APP_ID && c.body.includes(MARKER));
  return { octokit, comments, records };
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
      body: renderRecord(entries, { deskUrl: null, seal }),
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
    const original = renderRecord([entry("first")], { deskUrl: null, seal });
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
    const edited = renderRecord([entry("first")], { deskUrl: null, seal }).replace(
      '"who":"YearningAsian"',
      '"who":"someone-else"',
    );
    const { octokit, comments } = thread([
      { id: 1, body: edited, performed_via_github_app: { id: APP_ID } },
    ]);
    const result = await upsertRecord(octokit, input("second"));
    expect(result.ok && result.entries.map((e) => e.id)).toEqual(["second"]);
    expect(comments[0]!.body).toBe(edited);
    expect(comments[1]!.body).toContain("changed outside Merge Desk");
  });

  it("never treats someone else's comment with the marker as the record", async () => {
    const forged = renderRecord([entry("forged")], { deskUrl: null, seal });
    const { octokit } = thread([{ id: 1, body: forged, performed_via_github_app: null }]);
    const read = await readRecord(octokit, { repo: input("x").repo, pr: 2, appId: APP_ID, seal });
    expect(read).toEqual({ ok: true, entries: [], note: null });
  });
});
