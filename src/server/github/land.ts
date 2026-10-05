import type { Octokit } from "@octokit/rest";
import { OPTION_LABELS } from "@/core/options";
import type { RunRecord } from "@/core/run";
import { splitRepo } from "./app";

// Land: write the checked merge to the pull request's own branch. The tree
// is rebuilt on GitHub from the signed changes and must have exactly the id
// of the tree that was checked, or nothing moves. The merge commit's parents
// are [head, base], and the branch moves only as a fast-forward (force:
// false), so a push after the run is refused by GitHub itself. Never the
// base branch, never a force push. Call only after server/guard checkLand.

export class LandError extends Error {
  constructor(
    message: string,
    // REFUSED: nothing moved. UNKNOWN: GitHub didn't confirm either way.
    readonly outcome: "REFUSED" | "UNKNOWN",
  ) {
    super(message);
  }
}

const statusOf = (error: unknown) => (error as { status?: number }).status;

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
    "Checked on a scratch copy: it parses, the choice is honored, and the tests pass.",
    `Landed by @${login} with Merge Desk.`,
  ].join("\n");
}

export async function landMerge(
  octokit: Octokit,
  input: {
    repo: string;
    record: RunRecord;
    refs: { head: string; base: string };
    author: { name: string; email: string };
    committer: { name: string; email: string };
    login: string;
  },
): Promise<{ commit: string }> {
  const { owner, name } = splitRepo(input.repo);
  const { record } = input;
  if (!record.changes || !record.tree)
    throw new LandError("This run has no merge that can land. Nothing was pushed.", "REFUSED");

  const head = await octokit.git.getCommit({
    owner,
    repo: name,
    commit_sha: record.revisions.head,
  });
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
  });
  if (tree.data.sha !== record.tree)
    throw new LandError(
      "The merge rebuilt on GitHub isn't the one that was checked. Nothing was pushed.",
      "REFUSED",
    );

  const date = new Date().toISOString();
  const commit = await octokit.git.createCommit({
    owner,
    repo: name,
    message: landMessage(record, input.refs, input.login),
    tree: tree.data.sha,
    parents: [record.revisions.head, record.revisions.base],
    author: { ...input.author, date },
    committer: { ...input.committer, date },
  });

  try {
    await octokit.git.updateRef({
      owner,
      repo: name,
      ref: `heads/${input.refs.head}`,
      sha: commit.data.sha,
      force: false,
    });
  } catch (error) {
    const message = String((error as { message?: string }).message ?? "");
    if (statusOf(error) === 422 && /fast.?forward/i.test(message))
      throw new LandError(
        "Someone pushed to the branch after the run. Nothing was pushed; run it again.",
        "REFUSED",
      );
    if (statusOf(error) === 422 || statusOf(error) === 403 || statusOf(error) === 404)
      throw new LandError(`GitHub refused the update: ${message.slice(0, 200)}`, "REFUSED");
    throw new LandError(
      "GitHub didn't confirm the branch update. Check the pull request before trying again.",
      "UNKNOWN",
    );
  }
  return { commit: commit.data.sha };
}
