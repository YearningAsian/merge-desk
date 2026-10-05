import type { Octokit } from "@octokit/rest";
import { addEntry, MARKER, parseRecord, renderRecord, type RecordEntry } from "@/core/record";
import { splitRepo } from "./app";

// The one Merge Desk comment on a pull request: found by its marker, and only
// if this App wrote it (anyone could paste the marker into a comment of their
// own), then updated in place; created only when missing. Never deleted.

type Comment = {
  id: number;
  body?: string;
  performed_via_github_app?: { id: number } | null;
};

async function findOwn(octokit: Octokit, repo: string, pr: number, appId: number) {
  const { owner, name } = splitRepo(repo);
  const comments = (await octokit.paginate(octokit.issues.listComments, {
    owner,
    repo: name,
    issue_number: pr,
    per_page: 100,
  })) as Comment[];
  return (
    comments.find(
      (comment) => comment.performed_via_github_app?.id === appId && comment.body?.includes(MARKER),
    ) ?? null
  );
}

export async function readRecord(
  octokit: Octokit,
  repo: string,
  pr: number,
  appId: number,
): Promise<{ ok: true; entries: RecordEntry[] } | { ok: false; reason: string }> {
  const own = await findOwn(octokit, repo, pr, appId);
  return own ? parseRecord(own.body ?? "") : { ok: true, entries: [] };
}

export async function upsertRecord(
  octokit: Octokit,
  input: { repo: string; pr: number; appId: number; entry: RecordEntry; deskUrl: string | null },
): Promise<{ ok: true; entries: RecordEntry[] } | { ok: false; reason: string }> {
  const { owner, name } = splitRepo(input.repo);
  const own = await findOwn(octokit, input.repo, input.pr, input.appId);
  const current = own ? parseRecord(own.body ?? "") : { ok: true as const, entries: [] };
  if (!current.ok) return current;
  const entries = addEntry(current.entries, input.entry);
  const body = renderRecord(entries, input.deskUrl);
  if (own) await octokit.issues.updateComment({ owner, repo: name, comment_id: own.id, body });
  else await octokit.issues.createComment({ owner, repo: name, issue_number: input.pr, body });
  return { ok: true, entries };
}
