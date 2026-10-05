import type { RecordAction, RecordEntry } from "@/core/record";
import type { RunRecord } from "@/core/run";

// One decision-record entry from a signed run. Its id ties it to that run
// and action, so a retried request records once.
export function entryFor(
  run: RunRecord,
  input: {
    action: RecordAction;
    who: string;
    refs: { head: string; base: string };
    commit?: string | null;
  },
): RecordEntry {
  const dropped = run.drops;
  return {
    id: `${run.finishedAt}:${run.option}:${input.action}`,
    action: input.action,
    who: input.who,
    at: new Date().toISOString(),
    option: run.option,
    reason: run.reason,
    checks: run.checks.map(({ step, state }) => ({ step, state })),
    head: run.revisions.head,
    base: run.revisions.base,
    commit: input.commit ?? null,
    dropped:
      dropped && (input.action === "dropped" || input.action === "landed")
        ? {
            side: dropped.side,
            branch: dropped.side === "theirs" ? input.refs.base : input.refs.head,
            commits: dropped.commits.map(({ sha, subject }) => ({
              sha,
              subject: subject.slice(0, 300),
            })),
            files: dropped.files,
            authors: dropped.authors,
          }
        : null,
  };
}

// Where the record's "Open in Merge Desk" link points: this deployment's own
// origin, with the pull request in the address.
export const deskLink = (request: Request, pr: number) =>
  `${new URL(request.url).origin}/live?pr=${pr}`;
