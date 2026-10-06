import { randomUUID } from "node:crypto";
import type { Octokit } from "@octokit/rest";
import { z } from "zod";
import { splitRepo } from "./app";

// The lock every writer of a decision record shares, wherever it runs (the
// laptop's dev server and every production instance): a Git ref in the
// repository itself, refs/merge-desk/locks/<name>. Creating a ref that
// already exists fails, so one writer holds it at a time. Each lock points
// at its own new root commit (who, what and when in its message), so a
// holder can tell its lock from any other, and releasing asks GitHub to
// delete the ref only if it still points at that commit.
//
// A write that was sent to GitHub but not confirmed keeps its lock: there is
// no expiry, takeover or automatic unlock, because a late write could still
// land. docs/record-reconciliation.md is the human procedure.

export const LOCK_PREFIX = "refs/merge-desk/locks/";
const ZERO = "0".repeat(40);
const NAME = /^[a-z0-9][a-z0-9-]{0,79}$/;
const POLL_MS = 750;
const RELEASE_MS = 5_000;

export type Lease = { dispatched: () => void; confirmed: () => void };
export type Refusal = { ok: false; reason: string };

const statusOf = (error: unknown) =>
  error && typeof error === "object" ? (error as { status?: number }).status : undefined;

const pause = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(signal.reason);
      },
      { once: true },
    );
  });

export function lockRef(name: string): string {
  if (!NAME.test(name)) throw new Error("Invalid lock name");
  return `${LOCK_PREFIX}${name}`;
}

export const heldReason = (ref: string) =>
  `Another decision for this pull request is being recorded, or an earlier one was never confirmed. Its lock is ${ref} in the repository. If it doesn't clear within a minute, an operator must reconcile GitHub comments and branch state using docs/record-reconciliation.md before retrying.`;
const UNAVAILABLE =
  "Couldn't take the decision-record lock on GitHub, so nothing was written. Try again in a moment.";

// What the lock ref points at now: a commit id, or null when there is none.
// Any other answer throws (an unreadable lock is never treated as free).
export async function readLock(
  octokit: Octokit,
  repo: string,
  ref: string,
  signal?: AbortSignal,
): Promise<string | null> {
  const { owner, name } = splitRepo(repo);
  try {
    const { data } = await octokit.git.getRef({
      owner,
      repo: name,
      ref: ref.slice("refs/".length),
      request: { signal },
    });
    if (data.ref !== ref || !/^[0-9a-f]{40}$/.test(data.object.sha))
      throw new Error("GitHub answered with a different ref");
    return data.object.sha;
  } catch (error) {
    if (statusOf(error) === 404) return null;
    throw error;
  }
}

// A fresh root commit that says who holds the lock and why. Unreachable from
// any branch; it only keeps the lock ref unique to this writer.
async function lockCommit(
  octokit: Octokit,
  repo: string,
  about: { scope: string; holder: string },
  signal?: AbortSignal,
): Promise<string> {
  const { owner, name } = splitRepo(repo);
  const text = [
    "Merge Desk decision-record lock",
    "",
    `scope: ${about.scope}`,
    `holder: ${about.holder}`,
    `taken: ${new Date().toISOString()}`,
    `lock: ${randomUUID()}`,
  ].join("\n");
  const tree = await octokit.git.createTree({
    owner,
    repo: name,
    tree: [{ path: "LOCK", mode: "100644", type: "blob", content: `${text}\n` }],
    request: { signal },
  });
  const commit = await octokit.git.createCommit({
    owner,
    repo: name,
    message: text,
    tree: tree.data.sha,
    parents: [],
    request: { signal },
  });
  return commit.data.sha;
}

// Takes the lock, waiting up to waitMs for another writer to finish. Every
// decision comes from what GitHub then reports the ref points at, never from
// an error's wording: ours means held, absent means try again, anything else
// belongs to another writer. A refusal says whether our own create may have
// applied unseen (a lost answer, then an unreadable or lagging ref), so the
// caller can delete it if it is ours.
async function acquire(
  octokit: Octokit,
  repo: string,
  ref: string,
  mine: string,
  waitMs: number,
  signal?: AbortSignal,
): Promise<{ ok: true } | (Refusal & { maybeOurs: boolean })> {
  const { owner, name } = splitRepo(repo);
  const until = Date.now() + waitMs;
  let held = false;
  for (;;) {
    signal?.throwIfAborted();
    try {
      await octokit.git.createRef({ owner, repo: name, ref, sha: mine, request: { signal } });
      return { ok: true };
    } catch {
      signal?.throwIfAborted();
    }
    let current: string | null;
    try {
      current = await readLock(octokit, repo, ref, signal);
    } catch {
      signal?.throwIfAborted();
      return { ok: false, reason: UNAVAILABLE, maybeOurs: true };
    }
    if (current === mine) return { ok: true };
    held = current !== null;
    if (Date.now() + POLL_MS > until)
      return held
        ? { ok: false, reason: heldReason(ref), maybeOurs: false }
        : { ok: false, reason: UNAVAILABLE, maybeOurs: true };
    await pause(POLL_MS, signal);
  }
}

const UpdateRefsResponse = z
  .object({ updateRefs: z.object({ clientMutationId: z.string() }).strict() })
  .strict();
const UPDATE_REFS = `mutation ReleaseLock($input: UpdateRefsInput!) {
  updateRefs(input: $input) { clientMutationId }
}`;

const repositoryIds = new Map<string, string>();
async function repositoryId(octokit: Octokit, repo: string, signal?: AbortSignal) {
  const known = repositoryIds.get(repo);
  if (known) return known;
  const { owner, name } = splitRepo(repo);
  const { data } = await octokit.repos.get({ owner, repo: name, request: { signal } });
  repositoryIds.set(repo, data.node_id);
  return data.node_id;
}

// Deletes the lock ref only if it still points at this writer's commit
// (GitHub checks beforeOid atomically). Returns whether the ref is now gone
// or someone else's; an unconfirmed release is retried once, then left for
// reconciliation.
export async function releaseLock(
  octokit: Octokit,
  repo: string,
  ref: string,
  mine: string,
  signal: AbortSignal = AbortSignal.timeout(RELEASE_MS),
): Promise<boolean> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const clientMutationId = randomUUID();
      const result = await octokit.graphql(UPDATE_REFS, {
        input: {
          repositoryId: await repositoryId(octokit, repo, signal),
          clientMutationId,
          refUpdates: [{ name: ref, beforeOid: mine, afterOid: ZERO, force: true }],
        },
        request: { signal },
      });
      const response = UpdateRefsResponse.safeParse(result);
      if (response.success && response.data.updateRefs.clientMutationId === clientMutationId)
        return true;
    } catch {
      // Decide from the ref's state below, not from the error.
    }
    try {
      if ((await readLock(octokit, repo, ref, signal)) !== mine) return true;
    } catch {
      return false;
    }
  }
  return false;
}

const shared = globalThis as typeof globalThis & {
  mergeDeskLockQueues?: Map<string, Promise<unknown>>;
};
const queues = (shared.mergeDeskLockQueues ??= new Map<string, Promise<unknown>>());

// Runs work while holding the named lock. Callers in this process queue
// behind each other first, so they don't contend on GitHub. The work calls
// lease.dispatched() before each GitHub mutation and lease.confirmed() once
// GitHub has answered it (so no late copy can still land); a mutation
// without an answer keeps the lock.
export function withRefLock<T>(
  octokit: Octokit,
  input: {
    repo: string;
    name: string;
    scope: string;
    holder: string;
    signal?: AbortSignal;
    waitMs?: number;
  },
  work: (lease: Lease) => Promise<T>,
): Promise<T | Refusal> {
  const ref = lockRef(input.name);
  const key = `${input.repo}:${ref}`;
  const previous = queues.get(key) ?? Promise.resolve();
  const next = previous.then(async (): Promise<T | Refusal> => {
    const { signal } = input;
    signal?.throwIfAborted();
    let mine: string;
    try {
      mine = await lockCommit(octokit, input.repo, input, signal);
    } catch {
      signal?.throwIfAborted();
      return { ok: false, reason: UNAVAILABLE };
    }
    let taken: Awaited<ReturnType<typeof acquire>>;
    try {
      taken = await acquire(octokit, input.repo, ref, mine, input.waitMs ?? 8_000, signal);
    } catch (error) {
      // Aborted while the create may have been sent: free it if it is ours.
      await releaseLock(octokit, input.repo, ref, mine);
      throw error;
    }
    if (!taken.ok) {
      // Only ever deletes this writer's own commit, so it is safe to try.
      if (taken.maybeOurs) await releaseLock(octokit, input.repo, ref, mine);
      return { ok: false, reason: taken.reason };
    }
    let unresolved = false;
    try {
      return await work({
        dispatched: () => {
          unresolved = true;
        },
        confirmed: () => {
          unresolved = false;
        },
      });
    } finally {
      // Its own short time limit, not the caller's signal: it may run after
      // an abort, and it can only ever delete this writer's own lock.
      if (!unresolved) await releaseLock(octokit, input.repo, ref, mine);
    }
  });
  const settled = next.catch(() => undefined);
  queues.set(key, settled);
  void settled.then(() => {
    if (queues.get(key) === settled) queues.delete(key);
  });
  return next;
}
