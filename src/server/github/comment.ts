import type { Octokit } from "@octokit/rest";
import {
  addEntry,
  MARKER,
  parseRecord,
  renderRecord,
  type RecordEntry,
  type RecordSeal,
} from "@/core/record";
import { splitRepo } from "./app";
import { withRefLock } from "./lock";

// The one Merge Desk record on a pull request: a comment this App wrote (the
// marker alone proves nothing; anyone can paste it), carrying the marker and
// a seal that checks out. Writers coordinate through the shared lock ref
// (./lock.ts), wherever they run, then read back: success is reported only
// once the entry is actually stored. The octokit needs contents: write for
// the lock as well as pull_requests: write for the comment.
// Preexisting duplicate records are folded into the oldest; an outside edit is
// left exactly as it is, and a new one is started below it. Nothing is ever
// deleted.

type Comment = {
  id: number;
  body?: string;
  performed_via_github_app?: { id: number } | null;
};

type Own = { id: number; entries: RecordEntry[] | null };

const EDITED_NOTE =
  "An earlier Merge Desk record on this pull request was changed outside Merge Desk, so it is no longer read or updated. It is left as it was.";
const FOLDED_BODY =
  "This Merge Desk record was written at the same moment as another one, and its entries were moved into the first Merge Desk record on this pull request.";
const ATTEMPTS = 3;
const MAX_RECORD_BYTES = 60_000;

async function listOwn(
  octokit: Octokit,
  repo: string,
  pr: number,
  appId: number,
  seal: RecordSeal,
  signal?: AbortSignal,
): Promise<Own[]> {
  signal?.throwIfAborted();
  const { owner, name } = splitRepo(repo);
  const comments = (await octokit.paginate(octokit.issues.listComments, {
    owner,
    repo: name,
    issue_number: pr,
    per_page: 100,
    request: { signal },
  })) as Comment[];
  return comments
    .filter(
      (comment) => comment.performed_via_github_app?.id === appId && comment.body?.includes(MARKER),
    )
    .sort((a, b) => a.id - b.id)
    .map((comment) => {
      const parsed = parseRecord(comment.body ?? "", seal, `${repo}#${pr}`);
      return { id: comment.id, entries: parsed.ok ? parsed.entries : null };
    });
}

// Entries from every valid record, oldest record first, each id once.
const union = (records: Own[]) =>
  records.reduce<RecordEntry[]>(
    (all, record) => (record.entries ?? []).reduce((acc, entry) => addEntry(acc, entry), all),
    [],
  );

export async function readRecord(
  octokit: Octokit,
  input: { repo: string; pr: number; appId: number; seal: RecordSeal },
): Promise<{ ok: true; entries: RecordEntry[]; note: string | null }> {
  const own = await listOwn(octokit, input.repo, input.pr, input.appId, input.seal);
  const valid = own.filter((record) => record.entries);
  return {
    ok: true,
    entries: union(valid),
    note: valid.length < own.length ? EDITED_NOTE : null,
  };
}

export function upsertRecord(
  octokit: Octokit,
  input: {
    repo: string;
    pr: number;
    appId: number;
    entry: RecordEntry;
    deskUrl: string | null;
    seal: RecordSeal;
    signal?: AbortSignal;
  },
): Promise<{ ok: true; entries: RecordEntry[] } | { ok: false; reason: string }> {
  const { owner, name } = splitRepo(input.repo);
  const lock = {
    repo: input.repo,
    name: `pr-${input.pr}`,
    scope: `${input.repo}#${input.pr}`,
    holder: `${input.entry.who} (${input.entry.action})`,
    signal: input.signal,
  };
  return withRefLock(octokit, lock, async (lease) => {
    for (let attempt = 0; attempt < ATTEMPTS; attempt += 1) {
      const own = await listOwn(
        octokit,
        input.repo,
        input.pr,
        input.appId,
        input.seal,
        input.signal,
      );
      const valid = own.filter((record) => record.entries);
      const entries = addEntry(union(valid), input.entry);
      const body = renderRecord(entries, {
        deskUrl: input.deskUrl,
        seal: input.seal,
        scope: `${input.repo}#${input.pr}`,
        note: valid.length < own.length ? EDITED_NOTE : null,
      });
      if (Buffer.byteLength(body, "utf8") > MAX_RECORD_BYTES)
        return {
          ok: false as const,
          reason:
            "The decision record is full. Existing history was preserved; this decision was not recorded.",
        };
      input.signal?.throwIfAborted();
      if (valid[0]) {
        lease.dispatched();
        await octokit.issues.updateComment({
          owner,
          repo: name,
          comment_id: valid[0].id,
          body,
          request: { signal: input.signal },
        });
        for (const extra of valid.slice(1)) {
          input.signal?.throwIfAborted();
          lease.dispatched();
          await octokit.issues.updateComment({
            owner,
            repo: name,
            comment_id: extra.id,
            body: FOLDED_BODY,
            request: { signal: input.signal },
          });
        }
      } else {
        lease.dispatched();
        await octokit.issues.createComment({
          owner,
          repo: name,
          issue_number: input.pr,
          body,
          request: { signal: input.signal },
        });
      }

      // Read back: exactly one valid record, holding this entry.
      const after = (
        await listOwn(octokit, input.repo, input.pr, input.appId, input.seal, input.signal)
      ).filter((record) => record.entries);
      if (after.length === 1 && after[0]!.entries!.some((entry) => entry.id === input.entry.id)) {
        lease.confirmed();
        return { ok: true as const, entries: after[0]!.entries! };
      }
    }
    return {
      ok: false as const,
      reason: "Couldn't confirm the record update: another update was happening at the same time.",
    };
  });
}
