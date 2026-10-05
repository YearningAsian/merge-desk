import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import type {
  AppliedProposal,
  ParseResult,
  PreparedMerge,
  ProposedFile,
  Revisions,
  Runner,
  TestResult,
} from "./types";
import {
  RUN_LIMIT_MS,
  assertRepoPath,
  assertRevisions,
  commitProposal,
  describeMerge,
  git,
  mergeIntoHead,
  parseFiles,
  runSuite,
  type ExecResult,
  type Shell,
} from "./workspace";

// Runs merges in a temporary folder on this machine with local git and node.
// Trusted manual use only (development, recordings): it has none of the
// sandbox's network isolation, so it must never run on the public deployment.

// Child processes get only what they need; never the app's secrets.
function minimalEnv(): NodeJS.ProcessEnv {
  const keep = ["PATH", "Path", "SystemRoot", "TEMP", "TMP", "HOME", "USERPROFILE"];
  return {
    ...Object.fromEntries(
      keep.filter((key) => process.env[key]).map((key) => [key, process.env[key]]),
    ),
    NODE_ENV: "test",
  };
}

function spawnLimited(
  command: string,
  args: string[],
  cwd: string,
  limitMs: number,
): Promise<ExecResult> {
  return new Promise((done) => {
    let stdout = "";
    let output = "";
    let timedOut = false;
    const child = spawn(command, args, {
      cwd,
      env: minimalEnv(),
      stdio: ["ignore", "pipe", "pipe"],
    });
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, limitMs);
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
      output += chunk;
    });
    child.stderr.on("data", (chunk: string) => (output += chunk));
    child.on("error", (error) => {
      clearTimeout(timer);
      done({ code: null, stdout, output: error.message, timedOut });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      done({ code: timedOut ? null : code, stdout, output, timedOut });
    });
  });
}

export class LocalRunner implements Runner {
  workdir: string | null = null;
  private readonly source: string;

  constructor(options: { source: string }) {
    this.source = options.source;
  }

  private within(path: string): string {
    const root = resolve(this.workdir!);
    const full = resolve(root, assertRepoPath(path));
    if (!full.startsWith(root + sep)) throw new Error(`Path is outside the repository: ${path}`);
    return full;
  }

  private readonly shell: Shell = {
    exec: (command, args, options = {}) => {
      if (!this.workdir) throw new Error("Runner has no working copy");
      const cwd = options.cwd ? this.within(options.cwd) : this.workdir;
      return spawnLimited(
        command === "node" ? process.execPath : command,
        args,
        cwd,
        options.timeoutMs ?? RUN_LIMIT_MS,
      );
    },
    readText: async (path) => {
      try {
        return await readFile(this.within(path), "utf8");
      } catch {
        return null;
      }
    },
    writeText: (path, content) => writeFile(this.within(path), content, "utf8"),
  };

  // A fresh clone with the head checked out.
  private async checkout(revisions: Revisions) {
    assertRevisions(revisions);
    await this.dispose();
    this.workdir = await mkdtemp(join(tmpdir(), "merge-desk-run-"));
    const clone = await spawnLimited(
      "git",
      ["clone", "--quiet", "--no-checkout", this.source, this.workdir],
      tmpdir(),
      RUN_LIMIT_MS,
    );
    if (clone.code !== 0) throw new Error(`git clone failed: ${clone.output.trim().slice(0, 500)}`);
    await git(this.shell, ["checkout", "--quiet", "--detach", revisions.head]);
  }

  async prepareMerge(revisions: Revisions): Promise<PreparedMerge> {
    await this.checkout(revisions);
    return describeMerge(this.shell, revisions, await mergeIntoHead(this.shell, revisions));
  }

  async applyProposal(revisions: Revisions, files: ProposedFile[]): Promise<AppliedProposal> {
    await this.checkout(revisions);
    const state = await mergeIntoHead(this.shell, revisions);
    return commitProposal(this.shell, revisions, state, files);
  }

  parseCheck(paths: string[]): Promise<ParseResult[]> {
    return parseFiles(this.shell, paths);
  }

  runTests(changedFiles: string[]): Promise<TestResult> {
    return runSuite(this.shell, changedFiles);
  }

  async dispose(): Promise<void> {
    if (!this.workdir) return;
    const dir = this.workdir;
    this.workdir = null;
    await rm(dir, { recursive: true, force: true, maxRetries: 3 });
  }
}
