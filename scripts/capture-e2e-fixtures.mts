// Records real data for the end-to-end tests, so they run offline and free:
// the open demo pull requests (GitHub CLI) and one real analysis stream per
// demo scenario (Gemini + the runner). Tokens are never written.
//
//   npm run e2e:capture            (sandbox runner; RUNNER=local for the laptop)

import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { AnalyzeEvent } from "@/core/events";
import { PullList, type PullSummary } from "@/core/pulls";
import { CODE_ALLOWED_REPOS } from "@/server/env";
import { geminiAnalyst } from "@/server/gemini/analyze";
import { GeminiClient } from "@/server/gemini/client";
import { analyzePipeline } from "@/server/pipeline/analyze";
import { liveRunner } from "@/server/runner";
import { loadLocalEnv } from "./lib/env.mts";
import { ROOT, git, loadDemoConfig } from "./lib/git.mts";

loadLocalEnv();
const REPO = CODE_ALLOWED_REPOS[0];
const OUT = join(ROOT, "tests/e2e/fixtures");
mkdirSync(OUT, { recursive: true });

type GhPull = {
  number: number;
  title: string;
  author: { login: string };
  url: string;
  isDraft: boolean;
  headRefName: string;
  headRefOid: string;
  baseRefName: string;
  baseRefOid: string;
  labels: Array<{ name: string }>;
  mergeable: "CONFLICTING" | "MERGEABLE" | "UNKNOWN";
  updatedAt: string;
  headRepositoryOwner: { login: string } | null;
  headRepository: { name: string } | null;
};

const gh: GhPull[] = JSON.parse(
  execFileSync(
    "gh",
    [
      "pr",
      "list",
      "--state",
      "open",
      "--json",
      "number,title,author,url,isDraft,headRefName,headRefOid,baseRefName,baseRefOid,labels,mergeable,updatedAt,headRepositoryOwner,headRepository",
    ],
    { cwd: ROOT, encoding: "utf8" },
  ),
);

git("fetch", "--quiet", "origin", "refs/heads/demo/*:refs/remotes/origin/demo/*");
const changed = (from: string, to: string) =>
  new Set(git("diff", "--name-only", `${from}..${to}`).split("\n").filter(Boolean));

const pulls: PullSummary[] = gh.map((pull) => {
  const base = git("merge-base", pull.headRefOid, pull.baseRefOid);
  const theirs = changed(base, pull.baseRefOid);
  const mergeable =
    pull.mergeable === "CONFLICTING"
      ? "conflicting"
      : pull.mergeable === "MERGEABLE"
        ? "mergeable"
        : "checking";
  const headRepo = `${pull.headRepositoryOwner?.login ?? ""}/${pull.headRepository?.name ?? ""}`;
  return {
    number: pull.number,
    title: pull.title,
    author: pull.author.login,
    url: pull.url,
    draft: pull.isDraft,
    head: { ref: pull.headRefName, sha: pull.headRefOid, repo: headRepo },
    base: { ref: pull.baseRefName, sha: pull.baseRefOid },
    demo: pull.labels.some((label) => label.name === "demo"),
    mergeable,
    fork: headRepo !== REPO,
    filesBothSides:
      mergeable === "mergeable"
        ? null
        : [...changed(base, pull.headRefOid)].filter((file) => theirs.has(file)).sort(),
    updatedAt: pull.updatedAt,
  };
});
const list = PullList.parse({ repo: REPO, pulls });
writeFileSync(join(OUT, "prs.json"), `${JSON.stringify(list, null, 2)}\n`);
console.log(`prs.json: ${pulls.length} open pull requests`);

const config = loadDemoConfig();
const client = GeminiClient.fromEnv();
for (const scenario of config.scenarios) {
  const pull = pulls.find((item) => item.head.ref === scenario.ours.branch);
  if (!pull) throw new Error(`No open pull request for ${scenario.ours.branch}`);
  const lines: string[] = [];
  for await (const event of analyzePipeline({
    runner: liveRunner(REPO),
    analyst: geminiAnalyst(client),
    model: client.model,
    repo: REPO,
    pr: pull.number,
    revisions: { head: pull.head.sha, base: pull.base.sha },
    branches: { ours: pull.head.ref, theirs: pull.base.ref },
  })) {
    lines.push(JSON.stringify(AnalyzeEvent.parse(event)));
    if ("type" in event && !event.ok) throw new Error(`${scenario.id}: ${event.reason}`);
  }
  writeFileSync(join(OUT, `analyze-${scenario.id}.ndjson`), `${lines.join("\n")}\n`);
  console.log(`analyze-${scenario.id}.ndjson: ${lines.length} events (#${pull.number})`);
}
