import type { RunRecord } from "@/core/run";
import { isAllowedLogin, isAllowedRepo } from "@/server/env";
import { isRepoPath } from "@/core/paths";
import { checkWritableBranch } from "@/core/scope";

// Server-side guards: which real test suite a merge runs, and whether a
// checked merge may land. Every Land refusal says why in plain words, and
// the checks run before anything is written to GitHub.

export type TestSuite =
  | { id: "playground"; cwd: "playground"; command: ["node", "--test"]; label: string }
  | { id: "app"; cwd: "."; label: string }
  | { id: "none"; label: string };

const isUnderPlayground = (path: string) =>
  path.startsWith("playground/") &&
  !path.split("/").some((segment) => segment === ".." || segment === ".");

export function chooseTestSuite(changedFiles: string[]): TestSuite {
  if (!changedFiles.length) return { id: "none", label: "no changed files" };
  if (changedFiles.every(isUnderPlayground)) {
    return {
      id: "playground",
      cwd: "playground",
      command: ["node", "--test"],
      label: "node --test (playground)",
    };
  }
  return { id: "app", cwd: ".", label: "vitest run (the app's unit tests)" };
}

export type LandCheck = { ok: true } | { ok: false; reason: string };

export type LandInput = {
  login: string;
  repo: string;
  defaultBranch: string;
  // The pull request as GitHub reports it right now.
  pull: {
    state: string;
    head: { ref: string; sha: string; repo: string | null };
    base: { ref: string; sha: string };
  };
  record: RunRecord;
};

const WORKFLOWS = ".github/workflows/";

// The Land guards, in order. Pure: the route reads GitHub, this decides.
export function checkLand({ login, repo, defaultBranch, pull, record }: LandInput): LandCheck {
  const refuse = (reason: string): LandCheck => ({ ok: false, reason });
  if (!isAllowedLogin(login)) return refuse("Can't land: this account can't use live mode.");
  if (!isAllowedRepo(repo) || record.repo !== repo)
    return refuse("Can't land: this repository isn't allowed.");
  if (record.verdict !== "VERIFIED")
    return refuse("Can't land: this run was held. Only a verified merge can land.");
  if (pull.state !== "open") return refuse("Can't land: the pull request is closed.");
  if (pull.head.repo !== repo) return refuse("Can't land: this branch lives in a fork.");
  const branch = pull.head.ref;
  if (branch === "main" || branch === defaultBranch)
    return refuse(
      `Can't land on ${branch}: Merge Desk only writes to a pull request's own branch.`,
    );
  if (branch === pull.base.ref)
    return refuse("Can't land: the branch is also the pull request's base.");
  const scope = checkWritableBranch(branch);
  if (!scope.ok)
    return refuse(
      scope.reason.startsWith("Refused")
        ? `Can't land on ${branch}: for now Merge Desk writes only demo/* branches.`
        : `Can't land: ${scope.reason}.`,
    );
  if (pull.head.sha !== record.revisions.head || pull.base.sha !== record.revisions.base)
    return refuse("Pull request changed since the run; run it again.");
  if (!record.changes || !record.tree)
    return refuse(
      `Can't land from Merge Desk: ${record.changesNote ?? "the merge wasn't captured"}. Download the patch and apply it locally.`,
    );
  if (!record.changes.length) return refuse("Can't land: the merge changes nothing.");
  for (const change of record.changes) {
    if (!isRepoPath(change.path)) return refuse(`Can't land: ${change.path} isn't a valid path.`);
    if (change.path.startsWith(WORKFLOWS) || change.path === ".github/workflows")
      return refuse("This merge changes CI workflow files; resolve it locally or on GitHub.");
  }
  return { ok: true };
}
