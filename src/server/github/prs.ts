import type { Octokit } from "@octokit/rest";
import { Mergeable, PullList, PullSummary } from "@/core/pulls";
import { splitRepo } from "./app";

// Open pull requests as the desk lists them. GitHub doesn't report which
// files conflict, so the list shows files changed on both sides (from two
// compares against the merge base); the exact conflicts come from analysis.

export { Mergeable, PullList, PullSummary };

type PullData = {
  number: number;
  title: string;
  html_url: string;
  draft?: boolean;
  updated_at: string;
  user: { login: string } | null;
  labels: Array<{ name?: string } | string>;
  head: { ref: string; sha: string; repo: { full_name: string } | null };
  base: { ref: string; sha: string };
  mergeable?: boolean | null;
  mergeable_state?: string;
};

// GitHub computes mergeability lazily: null means it hasn't yet.
export function mergeableOf(pull: Pick<PullData, "mergeable" | "mergeable_state">): Mergeable {
  if (pull.mergeable_state === "dirty" || pull.mergeable === false) return "conflicting";
  if (pull.mergeable === true) return "mergeable";
  return "checking";
}

export function summarize(
  repo: string,
  pull: PullData,
  filesBothSides: string[] | null,
): PullSummary {
  const labels = pull.labels.map((label) =>
    typeof label === "string" ? label : (label.name ?? ""),
  );
  return {
    number: pull.number,
    title: pull.title,
    author: pull.user?.login ?? "unknown",
    url: pull.html_url,
    draft: Boolean(pull.draft),
    head: { ref: pull.head.ref, sha: pull.head.sha, repo: pull.head.repo?.full_name ?? null },
    base: { ref: pull.base.ref, sha: pull.base.sha },
    demo: labels.includes("demo"),
    mergeable: mergeableOf(pull),
    fork: pull.head.repo?.full_name !== repo,
    filesBothSides,
    updatedAt: pull.updated_at,
  };
}

// Conflicting first, then still checking, then the ones that can merge;
// newest first within each group.
export function sortPulls(pulls: PullSummary[]): PullSummary[] {
  const rank: Record<Mergeable, number> = { conflicting: 0, checking: 1, mergeable: 2 };
  return [...pulls].sort(
    (a, b) => rank[a.mergeable] - rank[b.mergeable] || b.updatedAt.localeCompare(a.updatedAt),
  );
}

async function filesOnBothSides(
  octokit: Octokit,
  repo: string,
  base: string,
  head: string,
): Promise<string[] | null> {
  const { owner, name } = splitRepo(repo);
  try {
    const [ours, theirs] = await Promise.all([
      octokit.repos.compareCommitsWithBasehead({
        owner,
        repo: name,
        basehead: `${base}...${head}`,
      }),
      octokit.repos.compareCommitsWithBasehead({
        owner,
        repo: name,
        basehead: `${head}...${base}`,
      }),
    ]);
    const changed = (files: Array<{ filename: string }> | undefined) =>
      new Set((files ?? []).map((file) => file.filename));
    const theirsFiles = changed(theirs.data.files);
    return [...changed(ours.data.files)].filter((file) => theirsFiles.has(file)).sort();
  } catch {
    return null;
  }
}

export async function readPull(octokit: Octokit, repo: string, number: number) {
  const { owner, name } = splitRepo(repo);
  const { data } = await octokit.pulls.get({ owner, repo: name, pull_number: number });
  return {
    data: data as PullData & { state: string },
    summary: summarize(repo, data as PullData, null),
  };
}

export async function listPulls(octokit: Octokit, repo: string): Promise<PullList> {
  const { owner, name } = splitRepo(repo);
  const { data } = await octokit.pulls.list({
    owner,
    repo: name,
    state: "open",
    per_page: 30,
    sort: "updated",
    direction: "desc",
  });
  const pulls = await Promise.all(
    data.map(async (listed) => {
      // The list endpoint omits mergeability; the single-pull read has it.
      const { data: pull } = await octokit.pulls.get({
        owner,
        repo: name,
        pull_number: listed.number,
      });
      const files =
        pull.mergeable === true
          ? null
          : await filesOnBothSides(octokit, repo, pull.base.sha, pull.head.sha);
      return summarize(repo, pull as PullData, files);
    }),
  );
  return { repo, pulls: sortPulls(pulls) };
}
