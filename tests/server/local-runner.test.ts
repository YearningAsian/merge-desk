import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { LocalRunner } from "@/server/runner/local";
import { candidate, readRepo } from "../helpers/scenarios";

// A throwaway repository holding the real clean scenario: a base commit with
// the playground, "theirs" (retry) and "ours" (rename) on top of it.
const ROOT = join(import.meta.dirname, "..", "..");
const API = "playground/src/api.js";
let repo: string;
let base: string;
let ours: string;
let theirs: string;

const git = (...args: string[]) =>
  execFileSync("git", ["-c", "core.autocrlf=false", "-C", repo, ...args], {
    encoding: "utf8",
  }).trim();

function commitOverlay(from: string, overlay: string, message: string) {
  git("checkout", "--quiet", "--detach", from);
  cpSync(join(ROOT, overlay), repo, { recursive: true });
  git("add", "--all");
  git(
    "-c",
    "user.name=Test",
    "-c",
    "user.email=test@example.invalid",
    "commit",
    "--quiet",
    "-m",
    message,
  );
  return git("rev-parse", "HEAD");
}

beforeAll(() => {
  repo = mkdtempSync(join(tmpdir(), "merge-desk-runner-src-"));
  git("init", "--quiet", "--initial-branch=main");
  cpSync(join(ROOT, "playground"), join(repo, "playground"), { recursive: true });
  git("add", "--all");
  git(
    "-c",
    "user.name=Test",
    "-c",
    "user.email=test@example.invalid",
    "commit",
    "--quiet",
    "-m",
    "base",
  );
  base = git("rev-parse", "HEAD");
  theirs = commitOverlay(base, "demo/scenarios/clean/theirs", "Retry fetchUser on HTTP 429");
  ours = commitOverlay(base, "demo/scenarios/clean/ours", "Rename fetchUser to getUser");
}, 60_000);

afterAll(() => rmSync(repo, { recursive: true, force: true }));

describe("LocalRunner on a real git merge", () => {
  it("prepares the merge: conflicted file with all three versions, diff3 markers and each side's commits", async () => {
    const runner = new LocalRunner({ source: repo });
    try {
      const prepared = await runner.prepareMerge({ head: ours, base: theirs });
      expect(prepared.mergeBase).toBe(base);
      expect(prepared.unsupported).toEqual([]);
      expect(prepared.conflicted.map((file) => file.path)).toEqual([API]);
      const file = prepared.conflicted[0]!;
      expect(file.base).toBe(readRepo(API).replaceAll("\r\n", "\n"));
      expect(file.merged).toContain("||||||| ");
      expect(prepared.commits.ours.map((commit) => commit.subject)).toEqual([
        "Rename fetchUser to getUser",
      ]);
      expect(prepared.commits.theirs[0]!.files).toContain("playground/test/retry.test.js");
    } finally {
      await runner.dispose();
    }
  }, 60_000);

  it("writes a combined proposal, commits it locally, parses it and passes the real tests", async () => {
    const runner = new LocalRunner({ source: repo });
    try {
      const applied = await runner.applyProposal({ head: ours, base: theirs }, [
        { path: API, content: candidate("clean", "combined", API) },
      ]);
      expect(applied.changedFiles).toEqual([API, "playground/test/retry.test.js"]);
      expect(applied.patch).toContain("retries = 2");
      expect(await runner.parseCheck([API])).toEqual([
        { path: API, state: "passed", detail: "node --check" },
      ]);
      const tests = await runner.runTests(applied.changedFiles);
      expect(tests).toMatchObject({
        state: "passed",
        exitCode: 0,
        suite: "node --test (playground)",
      });
      expect(tests.output).toMatch(/pass 9\b/);
    } finally {
      await runner.dispose();
    }
  }, 60_000);

  it("reports every change with its text, enough to rebuild the exact merge tree", async () => {
    const runner = new LocalRunner({ source: repo });
    try {
      const applied = await runner.applyProposal({ head: ours, base: theirs }, [
        { path: API, content: candidate("clean", "combined", API) },
      ]);
      expect(applied.changesNote).toBeNull();
      expect(applied.changes!.map((change) => change.path)).toEqual([
        API,
        "playground/test/retry.test.js",
      ]);
      // What Land will do on GitHub, done here with git plumbing: start from
      // the head's tree, write each changed file, and compare the tree ids.
      const env = { ...process.env, GIT_INDEX_FILE: join(repo, ".git", "land-test-index") };
      const plumb = (args: string[], input?: string) =>
        execFileSync("git", ["-c", "core.autocrlf=false", "-C", repo, ...args], {
          encoding: "utf8",
          env,
          input,
        }).trim();
      plumb(["read-tree", ours]);
      for (const change of applied.changes!) {
        if (change.content === null) plumb(["update-index", "--force-remove", change.path]);
        else {
          const blob = plumb(["hash-object", "-w", "--stdin"], change.content);
          plumb(["update-index", "--add", "--cacheinfo", `${change.mode},${blob},${change.path}`]);
        }
      }
      expect(plumb(["write-tree"])).toBe(applied.tree);
    } finally {
      await runner.dispose();
    }
  }, 60_000);

  it("fails the real tests when the retry was dropped", async () => {
    const runner = new LocalRunner({ source: repo });
    try {
      const applied = await runner.applyProposal({ head: ours, base: theirs }, [
        { path: API, content: candidate("clean", "drop-theirs", API) },
      ]);
      const tests = await runner.runTests(applied.changedFiles);
      expect(tests.state).toBe("failed");
      expect(tests.exitCode).not.toBe(0);
    } finally {
      await runner.dispose();
    }
  }, 60_000);

  it("reports a syntax error as a failed parse", async () => {
    const runner = new LocalRunner({ source: repo });
    try {
      await runner.applyProposal({ head: ours, base: theirs }, [
        { path: API, content: "export function (" },
      ]);
      const [result] = await runner.parseCheck([API]);
      expect(result!.state).toBe("failed");
    } finally {
      await runner.dispose();
    }
  }, 60_000);

  it("refuses a proposal that leaves a conflicted file out", async () => {
    const runner = new LocalRunner({ source: repo });
    try {
      await expect(runner.applyProposal({ head: ours, base: theirs }, [])).rejects.toThrow(
        /conflicted/,
      );
    } finally {
      await runner.dispose();
    }
  }, 60_000);

  it("refuses a path that escapes the repository", async () => {
    const runner = new LocalRunner({ source: repo });
    try {
      await expect(
        runner.applyProposal({ head: ours, base: theirs }, [
          { path: API, content: candidate("clean", "combined", API) },
          { path: "../outside.js", content: "x" },
        ]),
      ).rejects.toThrow(/outside the repository|conflicted/);
    } finally {
      await runner.dispose();
    }
  }, 60_000);

  it("removes its working folder on dispose", async () => {
    const runner = new LocalRunner({ source: repo });
    await runner.prepareMerge({ head: ours, base: theirs });
    const dir = runner.workdir!;
    expect(existsSync(dir)).toBe(true);
    await runner.dispose();
    expect(existsSync(dir)).toBe(false);
  }, 60_000);
});
