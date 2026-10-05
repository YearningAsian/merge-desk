import { execFile, spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { extname, join, resolve, sep } from "node:path";
import { promisify } from "node:util";
import { truncateLog } from "@/core/events";
import { chooseTestSuite } from "@/server/guard";
import type {
  AppliedProposal,
  CommitInfo,
  ConflictedFile,
  ParseResult,
  PreparedMerge,
  ProposedFile,
  Revisions,
  Runner,
  TestResult,
} from "./types";

// Runs merges in a temporary folder on this machine with local git and node.
// Trusted manual use only (development, recordings): it has none of the
// sandbox's network isolation, so it must never run on the public deployment.

const run = promisify(execFile);

const RUN_LIMIT_MS = 120_000;
const TEST_LIMIT_MS = 30_000;
const SHA = /^[0-9a-f]{40}$/;
const GIT_CONFIG = [
  "-c",
  "core.autocrlf=false",
  "-c",
  "merge.conflictStyle=diff3",
  "-c",
  "user.name=Merge Desk",
  "-c",
  "user.email=merge-desk@users.noreply.github.com",
  "-c",
  "commit.gpgsign=false",
];

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

export class LocalRunner implements Runner {
  workdir: string | null = null;
  private readonly source: string;

  constructor(options: { source: string }) {
    this.source = options.source;
  }

  private async git(
    args: string[],
    allowExit: number[] = [0],
  ): Promise<{ stdout: string; code: number }> {
    if (!this.workdir) throw new Error("Runner has no working copy");
    try {
      const { stdout } = await run("git", [...GIT_CONFIG, "-C", this.workdir, ...args], {
        maxBuffer: 32 * 1024 * 1024,
        timeout: RUN_LIMIT_MS,
        env: minimalEnv(),
      });
      return { stdout, code: 0 };
    } catch (error) {
      const failure = error as { code?: number; stdout?: string; stderr?: string };
      if (typeof failure.code === "number" && allowExit.includes(failure.code)) {
        return { stdout: failure.stdout ?? "", code: failure.code };
      }
      throw new Error(`git ${args[0]} failed: ${(failure.stderr ?? "").trim().slice(0, 500)}`);
    }
  }

  // A fresh clone with the head checked out and the base merged in, stopped
  // at the conflicts. Returns the conflicted files as git saw them.
  private async checkoutAndMerge(revisions: Revisions) {
    if (!SHA.test(revisions.head) || !SHA.test(revisions.base))
      throw new Error("Revisions must be full commit ids");
    await this.dispose();
    this.workdir = await mkdtemp(join(tmpdir(), "merge-desk-run-"));
    await run("git", ["clone", "--quiet", "--no-checkout", this.source, this.workdir], {
      timeout: RUN_LIMIT_MS,
      env: minimalEnv(),
    });
    await this.git(["checkout", "--quiet", "--detach", revisions.head]);
    const merge = await this.git(
      ["merge", "--no-ff", "--no-commit", "--quiet", revisions.base],
      [0, 1],
    );
    const unmerged = (await this.git(["diff", "--name-only", "--diff-filter=U", "-z"])).stdout
      .split("\0")
      .filter(Boolean)
      .sort();

    const conflicted: ConflictedFile[] = [];
    const unsupported: Array<{ path: string; reason: string }> = [];
    for (const path of unmerged) {
      const stage = async (n: 1 | 2 | 3) => {
        const result = await this.git(["show", `:${n}:${path}`], [0, 128]);
        return result.code === 0 ? result.stdout : null;
      };
      const [base, ours, theirs] = [await stage(1), await stage(2), await stage(3)];
      if (ours === null || theirs === null) {
        unsupported.push({ path, reason: "deleted on one side" });
        continue;
      }
      const merged = await readFile(this.within(path), "utf8");
      if ([base ?? "", ours, theirs, merged].some((text) => text.includes("\0"))) {
        unsupported.push({ path, reason: "binary file" });
        continue;
      }
      conflicted.push({ path, base: base ?? "", ours, theirs, merged });
    }
    return { conflicted, unsupported, mergedCleanly: merge.code === 0 };
  }

  private within(path: string): string {
    const root = resolve(this.workdir!);
    const full = resolve(root, path);
    if (!full.startsWith(root + sep)) throw new Error(`Path is outside the repository: ${path}`);
    return full;
  }

  private async commits(from: string, to: string): Promise<CommitInfo[]> {
    const { stdout } = await this.git([
      "log",
      "--max-count=50",
      "--name-only",
      "--format=%x1e%H%x1f%an%x1f%aI%x1f%s",
      `${from}..${to}`,
    ]);
    return stdout
      .split("\x1e")
      .filter((record) => record.trim())
      .map((record) => {
        const [header, ...files] = record.split("\n");
        const [sha, author, date, subject] = header!.split("\x1f");
        return {
          sha: sha!,
          author: author!,
          date: date!,
          subject: subject!,
          files: files.filter(Boolean),
        };
      });
  }

  async prepareMerge(revisions: Revisions): Promise<PreparedMerge> {
    const { conflicted, unsupported } = await this.checkoutAndMerge(revisions);
    const mergeBase = (
      await this.git(["merge-base", revisions.head, revisions.base])
    ).stdout.trim();
    return {
      revisions,
      mergeBase,
      conflicted,
      unsupported,
      commits: {
        ours: await this.commits(mergeBase, revisions.head),
        theirs: await this.commits(mergeBase, revisions.base),
      },
    };
  }

  async applyProposal(revisions: Revisions, files: ProposedFile[]): Promise<AppliedProposal> {
    const { conflicted, unsupported } = await this.checkoutAndMerge(revisions);
    if (unsupported.length)
      throw new Error(
        `Unsupported conflicts: ${unsupported.map((u) => `${u.path} (${u.reason})`).join(", ")}`,
      );
    const expected = conflicted.map((file) => file.path);
    for (const file of files) this.within(file.path);
    const written = files.map((file) => file.path).sort();
    if (written.join("\n") !== [...expected].sort().join("\n")) {
      throw new Error(
        `The proposal must cover exactly the conflicted files: ${expected.join(", ")}`,
      );
    }
    for (const file of files) await writeFile(this.within(file.path), file.content, "utf8");
    await this.git(["add", "--", ...written]);
    const left = (await this.git(["diff", "--name-only", "--diff-filter=U"])).stdout.trim();
    if (left) throw new Error(`Still conflicted after writing: ${left}`);
    await this.git([
      "commit",
      "--no-verify",
      "--quiet",
      "-m",
      `Merge ${revisions.base.slice(0, 7)} (Merge Desk scratch copy)`,
    ]);
    const changedFiles = (await this.git(["diff", "--name-only", "HEAD^1", "HEAD"])).stdout
      .split("\n")
      .filter(Boolean);
    const patch = (await this.git(["diff", "--binary", "HEAD^1", "HEAD"])).stdout;
    return { conflicted, changedFiles, patch };
  }

  async parseCheck(paths: string[]): Promise<ParseResult[]> {
    const results: ParseResult[] = [];
    for (const path of paths) {
      const extension = extname(path);
      if ([".js", ".mjs", ".cjs"].includes(extension)) {
        const exit = await this.spawnLimited(
          process.execPath,
          ["--check", this.within(path)],
          this.workdir!,
          10_000,
        );
        results.push(
          exit.code === 0
            ? { path, state: "passed", detail: "node --check" }
            : {
                path,
                state: "failed",
                detail:
                  `node --check: ${exit.output.trim().split("\n").slice(0, 4).join(" ")}`.slice(
                    0,
                    500,
                  ),
              },
        );
      } else if ([".ts", ".tsx", ".mts", ".cts"].includes(extension)) {
        const ts = await import("typescript");
        const source = await readFile(this.within(path), "utf8");
        const output = ts.transpileModule(source, {
          fileName: path,
          reportDiagnostics: true,
          compilerOptions: { jsx: ts.JsxEmit.Preserve },
        });
        const errors = (output.diagnostics ?? []).map((d) =>
          ts.flattenDiagnosticMessageText(d.messageText, " "),
        );
        results.push(
          errors.length
            ? {
                path,
                state: "failed",
                detail: `TypeScript ${ts.version}: ${errors.slice(0, 3).join("; ")}`.slice(0, 500),
              }
            : { path, state: "passed", detail: `TypeScript ${ts.version} syntax` },
        );
      } else {
        results.push({
          path,
          state: "not_run",
          detail: `no parser for ${extension || "this file type"}`,
        });
      }
    }
    return results;
  }

  async runTests(changedFiles: string[]): Promise<TestResult> {
    const suite = chooseTestSuite(changedFiles);
    if (suite.id === "none")
      return { state: "not_run", suite: suite.label, exitCode: null, output: "", durationMs: 0 };
    if (suite.id === "app") {
      return {
        state: "not_run",
        suite: suite.label,
        exitCode: null,
        output:
          "The app's test suite needs the trusted dependency snapshot, which the local runner does not install.",
        durationMs: 0,
      };
    }
    const started = Date.now();
    const exit = await this.spawnLimited(
      process.execPath,
      ["--test"],
      join(this.workdir!, suite.cwd),
      TEST_LIMIT_MS,
    );
    const durationMs = Date.now() - started;
    if (exit.timedOut) {
      return {
        state: "failed",
        suite: suite.label,
        exitCode: null,
        output: truncateLog(`${exit.output}\nTimed out after ${TEST_LIMIT_MS / 1000} s.`),
        durationMs,
      };
    }
    if (exit.code === null)
      return {
        state: "not_run",
        suite: suite.label,
        exitCode: null,
        output: truncateLog(exit.output),
        durationMs,
      };
    return {
      state: exit.code === 0 ? "passed" : "failed",
      suite: suite.label,
      exitCode: exit.code,
      output: truncateLog(exit.output),
      durationMs,
    };
  }

  private spawnLimited(command: string, args: string[], cwd: string, limitMs: number) {
    return new Promise<{ code: number | null; output: string; timedOut: boolean }>((done) => {
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
      child.stdout.on("data", (chunk) => (output += chunk));
      child.stderr.on("data", (chunk) => (output += chunk));
      child.on("error", (error) => {
        clearTimeout(timer);
        done({ code: null, output: error.message, timedOut });
      });
      child.on("close", (code) => {
        clearTimeout(timer);
        done({ code, output, timedOut });
      });
    });
  }

  async dispose(): Promise<void> {
    if (!this.workdir) return;
    const dir = this.workdir;
    this.workdir = null;
    await rm(dir, { recursive: true, force: true, maxRetries: 3 });
  }
}
