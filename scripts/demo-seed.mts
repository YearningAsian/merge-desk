// Builds the three seeded demo conflicts from the committed playground and
// demo/scenarios, on demo/* branches only, with demo-seed/* tags marking each
// original commit so `npm run demo:reset` can always rebuild them.
//
//   npm run demo:seed                  show the plan, write nothing
//   npm run demo:seed -- --yes         create the local branches and tags
//   npm run demo:seed -- --yes --push  also push them and open the [Demo] pull requests
//
// Order per scenario: "theirs" is committed on demo/base and fast-forwarded
// into it (the teammate merged first); "ours" branches from the same point
// and stays open as the conflicting pull request into demo/base, never main.

import { execFileSync } from "node:child_process";
import { cpSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { planBranchWrites, resetPlan, seedTagName, type BranchWrite } from "@/core/demo";
import { ROOT, git, loadDemoConfig, pushBranch, remoteRefs, tryGit } from "./lib/git.mts";

const { values } = parseArgs({
  options: { yes: { type: "boolean", default: false }, push: { type: "boolean", default: false } },
});
const config = loadDemoConfig();

if (git("status", "--porcelain", "--", "playground", "demo/scenarios")) {
  console.error("Commit playground/ and demo/scenarios/ first; the seed is built from HEAD.");
  process.exit(2);
}
const start = git("rev-parse", "HEAD");

const localSha = (ref: string) => tryGit("rev-parse", "--verify", "--quiet", `${ref}^{commit}`);
const remote = values.push ? remoteRefs("refs/heads/demo/*") : new Map<string, string>();
if (remote.size) {
  console.error(
    `Demo branches already exist on GitHub (${[...remote.keys()].join(", ")}). Use npm run demo:reset.`,
  );
  process.exit(2);
}

let writes: BranchWrite[];
const tags = new Map<string, string>();
const seeded = localSha(`refs/tags/${seedTagName("base")}`) !== null;

if (seeded) {
  // Reuse an earlier local seed, but only if every branch still sits on its tag.
  const names = [seedTagName("base-start"), seedTagName("base")];
  for (const scenario of config.scenarios)
    names.push(seedTagName(scenario.id, "theirs"), seedTagName(scenario.id, "ours"));
  for (const name of names) {
    const sha = localSha(`refs/tags/${name}`);
    if (!sha) {
      console.error(
        `Local seed tag ${name} is missing; delete the local demo branches and tags and seed again.`,
      );
      process.exit(2);
    }
    tags.set(name, sha);
  }
  writes = resetPlan(config, tags);
  const moved = writes.filter((write) => localSha(`refs/heads/${write.branch}`) !== write.sha);
  if (moved.length) {
    console.error(
      `Local demo branches moved since seeding: ${moved.map((write) => write.branch).join(", ")}`,
    );
    process.exit(2);
  }
} else {
  const branches = [
    config.base,
    ...config.scenarios.flatMap((s) => [s.theirs.branch, s.ours.branch]),
  ];
  const existing = branches.filter((branch) => localSha(`refs/heads/${branch}`));
  if (existing.length) {
    console.error(
      `Demo branches already exist locally (${existing.join(", ")}) without seed tags.`,
    );
    process.exit(2);
  }
  writes = [];
  tags.set(seedTagName("base-start"), start);
  // Build the commits in a temporary worktree so the working tree is untouched.
  const tree = mkdtempSync(join(tmpdir(), "merge-desk-seed-"));
  try {
    git("worktree", "add", "--quiet", "--detach", tree, start);
    const wt = (...args: string[]) =>
      execFileSync("git", ["-c", "core.autocrlf=false", "-C", tree, ...args], {
        encoding: "utf8",
      }).trim();
    const commitOverlay = (
      from: string,
      scenario: string,
      side: "ours" | "theirs",
      message: string,
    ) => {
      wt("checkout", "--quiet", "--detach", from);
      cpSync(join(ROOT, "demo/scenarios", scenario, side), tree, { recursive: true });
      wt("add", "--all", "--", "playground");
      wt("commit", "--quiet", "--no-verify", "-m", message);
      return wt("rev-parse", "HEAD");
    };

    let baseTip = start;
    for (const scenario of config.scenarios) {
      const theirs = commitOverlay(baseTip, scenario.id, "theirs", scenario.theirs.commit);
      const ours = commitOverlay(baseTip, scenario.id, "ours", scenario.ours.commit);
      writes.push(
        { branch: scenario.theirs.branch, sha: theirs },
        { branch: scenario.ours.branch, sha: ours },
      );
      tags
        .set(seedTagName(scenario.id, "theirs"), theirs)
        .set(seedTagName(scenario.id, "ours"), ours);
      baseTip = theirs; // the teammate's change is merged into demo/base (fast-forward)
    }
    writes.unshift({ branch: config.base, sha: baseTip });
    tags.set(seedTagName("base"), baseTip);
  } finally {
    tryGit("worktree", "remove", "--force", tree);
    rmSync(tree, { recursive: true, force: true });
  }
}

const plan = planBranchWrites(writes); // refuses the whole plan if any branch is outside demo/*
console.log(seeded ? "Existing local seed:" : `Seed from ${start.slice(0, 7)}:`);
for (const write of plan)
  console.log(`  branch ${write.branch.padEnd(22)} ${write.sha.slice(0, 7)}`);
for (const [tag, sha] of tags) console.log(`  tag    ${tag.padEnd(22)} ${sha.slice(0, 7)}`);
if (!values.yes) {
  console.log("\nNothing written. Re-run with --yes (and --push to publish).");
  process.exit(0);
}

if (!seeded) {
  for (const write of plan) git("branch", write.branch, write.sha);
  for (const [tag, sha] of tags) git("tag", tag, sha);
  console.log("\nLocal branches and tags created.");
}
if (!values.push) process.exit(0);

for (const write of plan) pushBranch(write.branch, write.sha, { expectCurrent: null });
git(
  "push",
  "--quiet",
  "origin",
  ...[...tags.keys()].map((tag) => `refs/tags/${tag}:refs/tags/${tag}`),
);
console.log("Pushed demo branches and seed tags.");

const gh = (...args: string[]) => execFileSync("gh", args, { cwd: ROOT, encoding: "utf8" }).trim();
const labels = gh("label", "list", "--json", "name", "--jq", ".[].name").split("\n");
if (!labels.includes(config.label)) {
  gh(
    "label",
    "create",
    config.label,
    "--color",
    "9a7d14",
    "--description",
    "Seeded Merge Desk demo conflict; targets demo/base, never main",
  );
}
for (const scenario of config.scenarios) {
  const body = [
    `Seeded demo conflict for Merge Desk. It targets \`${config.base}\`, never \`main\`.`,
    "",
    `- ours (\`${scenario.ours.branch}\`): ${scenario.ours.intent}`,
    `- theirs (already merged into \`${config.base}\` from \`${scenario.theirs.branch}\`): ${scenario.theirs.intent}`,
    "",
    "Rebuild every demo branch from its seed tag with `npm run demo:reset -- --yes`.",
  ].join("\n");
  const url = gh(
    "pr",
    "create",
    "--base",
    config.base,
    "--head",
    scenario.ours.branch,
    "--title",
    scenario.title,
    "--body",
    body,
    "--label",
    config.label,
  );
  console.log(`  opened ${url}`);
}
