import { randomUUID } from "node:crypto";
import type { Octokit } from "@octokit/rest";
import { z } from "zod";
import { OPTION_LABELS } from "@/core/options";
import type { RunRecord } from "@/core/run";
import { splitRepo } from "./app";

// Land: write the checked merge to the pull request's own branch. The tree
// is rebuilt on GitHub from the signed changes and must have exactly the id
// of the tree that was checked, or nothing moves. The merge commit's parents
// are [head, base]. GitHub atomically requires that the branch still points
// to the signed head, then moves it as a fast-forward (force:false). Never
// the base branch, never a force push. Call only after server/guard checkLand.

export class LandError extends Error {
  constructor(
    message: string,
    // REFUSED: nothing moved. UNKNOWN: GitHub didn't confirm either way.
    readonly outcome: "REFUSED" | "UNKNOWN",
  ) {
    super(message);
  }
}

const statusOf = (error: unknown) =>
  error && typeof error === "object" ? (error as { status?: number }).status : undefined;

const UpdateRefsResponse = z
  .object({ updateRefs: z.object({ clientMutationId: z.string() }).strict() })
  .strict();

const UPDATE_REFS = `mutation Land($input: UpdateRefsInput!) {
  updateRefs(input: $input) { clientMutationId }
}`;

const unconfirmed = () =>
  new LandError(
    "GitHub didn't confirm the branch update. Check the pull request before trying again.",
    "UNKNOWN",
  );

function beforeUpdate(signal?: AbortSignal) {
  try {
    signal?.throwIfAborted();
  } catch {
    throw new LandError("Land stopped before the branch update. Nothing was pushed.", "REFUSED");
  }
}

// The suite that passed, as the run's tests step named it.
function testsThatPassed(record: RunRecord) {
  const tests = record.checks.find((check) => check.step === "tests" && check.state === "passed");
  const suite = tests?.detail?.split(": ")[0]?.replace(/\s+/g, " ").trim().slice(0, 80);
  return suite ? `${suite} passes` : "the tests pass";
}

export function landMessage(
  record: RunRecord,
  refs: { head: string; base: string },
  login: string,
) {
  // The model's description stays on one line, so it can't add trailers.
  const description = (record.description ?? "").replace(/\s+/g, " ").trim().slice(0, 200);
  return [
    `Merge ${refs.base} into ${refs.head} (Merge Desk)`,
    "",
    `${OPTION_LABELS[record.option]}${description ? `: ${description}` : ""}`,
    `Checked on a scratch copy: it parses, the choice is honored, and ${testsThatPassed(record)}.`,
    `Landed by @${login} with Merge Desk.`,
  ].join("\n");
}

export async function landMerge(
  octokit: Octokit,
  input: {
    repo: string;
    repositoryId: string;
    record: RunRecord;
    refs: { head: string; base: string };
    author: { name: string; email: string };
    committer: { name: string; email: string };
    login: string;
    signal?: AbortSignal;
    onRefUpdate?: () => void;
  },
): Promise<{ commit: string }> {
  const { owner, name } = splitRepo(input.repo);
  const { record } = input;
  if (!record.changes || !record.tree)
    throw new LandError("This run has no merge that can land. Nothing was pushed.", "REFUSED");

  const request = { signal: input.signal };
  beforeUpdate(input.signal);
  const head = await octokit.git.getCommit({
    owner,
    repo: name,
    commit_sha: record.revisions.head,
    request,
  });
  beforeUpdate(input.signal);
  const tree = await octokit.git.createTree({
    owner,
    repo: name,
    base_tree: head.data.tree.sha,
    tree: record.changes.map((change) =>
      change.content === null
        ? { path: change.path, mode: "100644" as const, type: "blob" as const, sha: null }
        : {
            path: change.path,
            mode: change.mode ?? ("100644" as const),
            type: "blob" as const,
            content: change.content,
          },
    ),
    request,
  });
  if (tree.data.sha !== record.tree)
    throw new LandError(
      "The merge rebuilt on GitHub isn't the one that was checked. Nothing was pushed.",
      "REFUSED",
    );

  const date = new Date().toISOString();
  beforeUpdate(input.signal);
  const commit = await octokit.git.createCommit({
    owner,
    repo: name,
    message: landMessage(record, input.refs, input.login),
    tree: tree.data.sha,
    parents: [record.revisions.head, record.revisions.base],
    author: { ...input.author, date },
    committer: { ...input.committer, date },
    request,
  });

  const clientMutationId = randomUUID();
  beforeUpdate(input.signal);
  try {
    input.onRefUpdate?.();
    const result = await octokit.graphql(UPDATE_REFS, {
      input: {
        repositoryId: input.repositoryId,
        clientMutationId,
        refUpdates: [
          {
            name: `refs/heads/${input.refs.head}`,
            beforeOid: record.revisions.head,
            afterOid: commit.data.sha,
            force: false,
          },
        ],
      },
      request,
    });
    const response = UpdateRefsResponse.safeParse(result);
    if (!response.success || response.data.updateRefs.clientMutationId !== clientMutationId)
      throw unconfirmed();
  } catch (error) {
    if (statusOf(error) === 422 || statusOf(error) === 403 || statusOf(error) === 404)
      throw new LandError("GitHub refused the branch update. Nothing was pushed.", "REFUSED");
    // GraphQL errors can carry partial data. Without an unambiguous matching
    // result, neither their wording nor a network error confirms the outcome.
    throw unconfirmed();
  }
  return { commit: commit.data.sha };
}
