import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { DemoConfig } from "@/core/demo";
import { checkWritableBranch } from "@/core/scope";

export const ROOT = join(import.meta.dirname, "..", "..");

export function git(...args: string[]): string {
  return execFileSync("git", ["-c", "core.autocrlf=false", "-C", ROOT, ...args], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

export function tryGit(...args: string[]): string | null {
  try {
    return git(...args);
  } catch {
    return null;
  }
}

export function loadDemoConfig(): DemoConfig {
  return DemoConfig.parse(
    JSON.parse(readFileSync(join(ROOT, "demo/scenarios/scenarios.json"), "utf8")),
  );
}

// Local branch first, then the remote-tracking copy.
export function resolveBranch(branch: string): string | null {
  return (
    tryGit("rev-parse", "--verify", "--quiet", `refs/heads/${branch}^{commit}`) ??
    tryGit("rev-parse", "--verify", "--quiet", `refs/remotes/origin/${branch}^{commit}`)
  );
}

export function remoteRefs(pattern: string): Map<string, string> {
  const refs = new Map<string, string>();
  for (const line of git("ls-remote", "origin", pattern).split("\n").filter(Boolean)) {
    const [sha, ref] = line.split("\t");
    if (sha && ref && !ref.endsWith("^{}")) refs.set(ref, sha);
  }
  return refs;
}

// The only way these scripts push a branch. The demo-only scope is checked
// again immediately before every push, whatever the caller already checked.
export function pushBranch(
  branch: string,
  sha: string,
  options: { expectCurrent?: string | null } = {},
) {
  const check = checkWritableBranch(branch);
  if (!check.ok) throw new Error(check.reason);
  const args = ["push", "--quiet"];
  if (options.expectCurrent !== undefined) {
    args.push(`--force-with-lease=refs/heads/${check.branch}:${options.expectCurrent ?? ""}`);
  }
  args.push("origin", `${sha}:refs/heads/${check.branch}`);
  git(...args);
}
