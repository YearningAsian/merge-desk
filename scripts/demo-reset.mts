// Rebuilds every demo/* branch from its demo-seed/* tag on GitHub, and
// reopens the [Demo] pull requests. Run by a person, never by Merge Desk.
//
//   npm run demo:reset           show what would change
//   npm run demo:reset -- --yes  force-update only demo/* branches to their seeds
//
// The plan is refused as a whole if any branch falls outside demo/*, and each
// push re-checks the scope and uses a lease on the branch's current commit.

import { execFileSync } from "node:child_process";
import { parseArgs } from "node:util";
import { resetPlan } from "@/core/demo";
import { ROOT, git, loadDemoConfig, pushBranch, remoteRefs } from "./lib/git.mts";

const { values } = parseArgs({ options: { yes: { type: "boolean", default: false } } });
const config = loadDemoConfig();

git("fetch", "--quiet", "origin", "+refs/tags/demo-seed/*:refs/tags/demo-seed/*");
const tags = new Map(
  [...remoteRefs("refs/tags/demo-seed/*")].map(([ref, sha]) => [
    ref.replace("refs/tags/", ""),
    sha,
  ]),
);
const plan = resetPlan(config, tags);
const current = remoteRefs("refs/heads/demo/*");

const changes = plan.filter((write) => current.get(`refs/heads/${write.branch}`) !== write.sha);
for (const write of plan) {
  const now = current.get(`refs/heads/${write.branch}`);
  const note =
    now === write.sha
      ? "at seed"
      : `${now ? now.slice(0, 7) : "missing"} -> ${write.sha.slice(0, 7)}`;
  console.log(`  ${write.branch.padEnd(22)} ${note}`);
}
if (!changes.length) console.log("\nEvery demo branch is already at its seed.");
else if (!values.yes) {
  console.log(
    `\n${changes.length} demo branches would be reset. Nothing written; re-run with --yes.`,
  );
  process.exit(0);
}

for (const write of changes) {
  pushBranch(write.branch, write.sha, {
    expectCurrent: current.get(`refs/heads/${write.branch}`) ?? null,
  });
  console.log(`  reset ${write.branch}`);
}

const gh = (...args: string[]) => execFileSync("gh", args, { cwd: ROOT, encoding: "utf8" }).trim();
const prs = JSON.parse(
  gh(
    "pr",
    "list",
    "--label",
    config.label,
    "--state",
    "all",
    "--json",
    "number,state,headRefName,baseRefName",
  ),
) as Array<{ number: number; state: string; headRefName: string; baseRefName: string }>;
for (const scenario of config.scenarios) {
  const pr = prs.find(
    (item) => item.headRefName === scenario.ours.branch && item.baseRefName === config.base,
  );
  if (!pr)
    console.log(`  no pull request for ${scenario.ours.branch}; run demo:seed's PR step by hand`);
  else if (pr.state === "CLOSED" && values.yes) {
    gh("pr", "reopen", String(pr.number));
    console.log(`  reopened #${pr.number}`);
  } else if (pr.state === "MERGED")
    console.log(`  #${pr.number} was merged into ${config.base}; open a new one`);
}
