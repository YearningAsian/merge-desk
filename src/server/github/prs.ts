import { Octokit } from "@octokit/rest";
import {
  Mergeable,
  PullList,
  PullSummary,
  type PullChecks,
  type PullReadiness,
} from "@/core/pulls";
import { isAllowedRepo } from "@/server/env";
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
  checks: PullChecks = {
    state: "unknown",
    items: [],
    reason: "Current checks were not read.",
    observedAt: new Date().toISOString(),
  },
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
    readiness: readinessOf(pull, checks),
    fork: pull.head.repo?.full_name !== repo,
    filesBothSides,
    updatedAt: pull.updated_at,
  };
}

function readinessOf(pull: PullData, checks: PullChecks): PullReadiness {
  const githubState = pull.mergeable_state ?? "unknown";
  const reasons: string[] = [];
  let state: PullReadiness["state"] = "unknown";
  if (pull.draft) {
    state = "blocked";
    reasons.push("This pull request is a draft.");
  }
  if (mergeableOf(pull) === "conflicting") {
    state = "blocked";
    reasons.push("File conflicts need resolution.");
  }
  if (githubState === "blocked") {
    state = "blocked";
    reasons.push(
      "GitHub reports BLOCKED. Required reviews, checks or branch rules may apply; the exact rule and your merge permission were not verified here.",
    );
  } else if (githubState === "behind") {
    state = "blocked";
    reasons.push("GitHub requires the head branch to be brought up to date with the base.");
  } else if (githubState === "unstable") {
    state = "blocked";
    reasons.push("GitHub reports failing or pending commit checks.");
  }
  if (checks.state === "failing") {
    state = "blocked";
    reasons.push("One or more current head checks failed.");
  } else if (checks.state === "pending") {
    if (state !== "blocked") state = "checking";
    reasons.push("Current head checks are still pending.");
  }
  if (state === "unknown" && mergeableOf(pull) === "checking") state = "checking";
  if (
    state === "unknown" &&
    githubState === "clean" &&
    pull.mergeable === true &&
    checks.state === "passing"
  )
    state = "ready";
  if (checks.state === "none" || checks.state === "unknown") {
    reasons.push(checks.reason ?? "No current check requirements were verified.");
  }
  if (state === "unknown")
    reasons.push(
      "Complete merge readiness is unverified. Check GitHub for current rules and your merge permission.",
    );
  return { state, githubState, checkedHead: pull.head.sha, reasons, checks };
}

const publicReads = new Octokit();
const checkCaches = new WeakMap<
  Octokit,
  Map<string, { expires: number; value: Promise<PullChecks> }>
>();
const checkReadAfter = new WeakMap<Octokit, number>();

// Read public metadata with no App credential or permission expansion. Exact-
// head snapshots are cached for up to 10 min, bounded to 100 entries per client.
// Transient UNKNOWN/pending snapshots refresh after 1 min; rate-limit cooldown
// still wins. An empty set never proves required CI passed.
async function headChecks(client: Octokit, repo: string, head: string): Promise<PullChecks> {
  if (!isAllowedRepo(repo)) throw new Error("Repository is not allowed");
  let cache = checkCaches.get(client);
  if (!cache) {
    cache = new Map();
    checkCaches.set(client, cache);
  }
  const key = `${repo}#${head}`;
  const cached = cache.get(key);
  if (cached && cached.expires > Date.now()) return cached.value;
  if ((checkReadAfter.get(client) ?? 0) > Date.now())
    return {
      state: "unknown",
      items: [],
      observedAt: new Date().toISOString(),
      reason:
        "Public check reads are paused after GitHub rate limiting. See GitHub for the latest checks.",
    };
  const entry = { expires: Date.now() + 600_000, value: readHeadChecks(client, repo, head) };
  cache.set(key, entry);
  while (cache.size > 100) cache.delete(cache.keys().next().value!);
  const checks = await entry.value;
  if (checks.state === "unknown" || checks.state === "pending")
    entry.expires = Math.min(entry.expires, Date.now() + 60_000);
  return checks;
}

async function readHeadChecks(client: Octokit, repo: string, head: string): Promise<PullChecks> {
  const { owner, name } = splitRepo(repo);
  const observedAt = new Date().toISOString();
  const reads = await Promise.allSettled([
    client.repos.getCombinedStatusForRef({
      owner,
      repo: name,
      ref: head,
      per_page: 100,
      request: { timeout: 8_000 },
    }),
    client.checks.listForRef({
      owner,
      repo: name,
      ref: head,
      filter: "latest",
      per_page: 100,
      request: { timeout: 8_000 },
    }),
  ]);
  for (const read of reads)
    if (read.status === "rejected") {
      const error = read.reason as {
        status?: number;
        response?: { headers?: Record<string, string | undefined> };
      };
      if (error.status === 403 || error.status === 429) {
        const headers = error.response?.headers;
        const reset = Number(headers?.["x-ratelimit-reset"] ?? 0) * 1000;
        const retry = Number(headers?.["retry-after"] ?? 0) * 1000;
        checkReadAfter.set(
          client,
          Math.max(
            checkReadAfter.get(client) ?? 0,
            Date.now() + Math.max(60_000, Number.isFinite(retry) ? retry : 0),
            Number.isFinite(reset) && headers?.["x-ratelimit-remaining"] === "0" ? reset : 0,
          ),
        );
      }
    }
  const items: PullChecks["items"] = [];
  let incomplete = false;
  const link = (value: string | null | undefined) => {
    if (!value) return {};
    try {
      const url = new URL(value);
      return url.protocol === "https:" && !url.username && !url.password ? { url: url.href } : {};
    } catch {
      return {};
    }
  };
  const statuses = reads[0];
  if (statuses.status === "fulfilled") {
    const data = statuses.value.data;
    incomplete ||= data.total_count > data.statuses.length;
    for (const status of data.statuses)
      items.push({
        name: status.context,
        state:
          status.state === "success"
            ? "passing"
            : status.state === "pending"
              ? "pending"
              : ["failure", "error"].includes(status.state)
                ? "failing"
                : "unknown",
        ...link(status.target_url),
      });
  } else incomplete = true;
  const checks = reads[1];
  if (checks.status === "fulfilled") {
    const data = checks.value.data;
    incomplete ||= data.total_count > data.check_runs.length;
    for (const check of data.check_runs)
      items.push({
        name: check.name,
        state:
          check.status !== "completed"
            ? "pending"
            : ["success", "neutral", "skipped"].includes(check.conclusion ?? "")
              ? "passing"
              : ["failure", "cancelled", "timed_out", "action_required", "stale"].includes(
                    check.conclusion ?? "",
                  )
                ? "failing"
                : "unknown",
        ...link(check.html_url),
      });
  } else incomplete = true;
  const state = items.some((item) => item.state === "failing")
    ? "failing"
    : incomplete || items.some((item) => item.state === "unknown")
      ? "unknown"
      : items.some((item) => item.state === "pending")
        ? "pending"
        : items.length
          ? "passing"
          : "none";
  return {
    state,
    items,
    observedAt,
    ...(incomplete
      ? {
          reason:
            "Some current checks could not be read or the public results were truncated. Requirements remain unverified.",
        }
      : state === "none"
        ? { reason: "No checks were reported for this head. Required checks were not verified." }
        : {}),
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

export async function listPulls(
  octokit: Octokit,
  repo: string,
  checkReader: Octokit = publicReads,
): Promise<PullList> {
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
      const [files, checks] = await Promise.all([
        pull.mergeable === true
          ? Promise.resolve(null)
          : filesOnBothSides(octokit, repo, pull.base.sha, pull.head.sha),
        headChecks(checkReader, repo, pull.head.sha),
      ]);
      return summarize(repo, pull as PullData, files, checks);
    }),
  );
  return { repo, pulls: sortPulls(pulls) };
}
