import { Writable } from "node:stream";
import { Sandbox } from "@vercel/sandbox";
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

// Runs merges in a Vercel Sandbox: a fresh microVM per boot that clones the
// public repository at the exact head, fetches the exact base, then switches
// its network to deny-all before any candidate file is written or any test
// runs. It holds no GitHub token, model key or session secret. It stops in
// dispose(), pass or fail, and times out on its own after two minutes.

export const SANDBOX_IMAGE = "vercel/sandbox/node:24";
export const SANDBOX_TIMEOUT_MS = 120_000;
export const SANDBOX_TAGS = { app: "merge-desk" };

export type Timing = { label: string; ms: number };

const sink = (write: (text: string) => void) =>
  new Writable({
    write(chunk: Buffer | string, _encoding, done) {
      write(typeof chunk === "string" ? chunk : chunk.toString("utf8"));
      done();
    },
  });

export class SandboxRunner implements Runner {
  readonly timings: Timing[] = [];
  nodeVersion: string | null = null;
  private sandbox: Sandbox | null = null;
  private booted: string | null = null; // "head..base" of the current copy
  private networkDenied = false;
  private candidateRan = false;

  constructor(private readonly options: { repoUrl: string; signal?: AbortSignal }) {}

  private async timed<T>(label: string, work: () => Promise<T>): Promise<T> {
    const started = Date.now();
    try {
      return await work();
    } finally {
      this.timings.push({ label, ms: Date.now() - started });
    }
  }

  private current(): Sandbox {
    if (!this.sandbox) throw new Error("Runner has no sandbox");
    return this.sandbox;
  }

  // The git source is cloned into a folder named after the repository,
  // under the sandbox's working directory (/vercel/merge-desk on node:24).
  private at(path?: string): string {
    const name = new URL(this.options.repoUrl).pathname
      .split("/")
      .pop()!
      .replace(/\.git$/, "");
    const root = `${this.current().cwd.replace(/\/+$/, "")}/${assertRepoPath(name)}`;
    return path ? `${root}/${assertRepoPath(path)}` : root;
  }

  private readonly shell: Shell = {
    exec: async (command, args, options = {}): Promise<ExecResult> => {
      const limit = options.timeoutMs ?? RUN_LIMIT_MS;
      let stdout = "";
      let output = "";
      const started = Date.now();
      try {
        const finished = await this.current().runCommand({
          cmd: command,
          args,
          cwd: this.at(options.cwd),
          timeoutMs: limit,
          signal: this.options.signal,
          stdout: sink((text) => {
            stdout += text;
            output += text;
          }),
          stderr: sink((text) => (output += text)),
        });
        const timedOut = Date.now() - started >= limit;
        // The SDK reports a missing exit code as 0 on this path. Read the raw
        // value it received instead, so a killed command can never look like
        // a pass; if that shape ever changes, this fails closed (no exit code).
        const raw = (finished as unknown as { cmd?: { exitCode?: unknown } }).cmd?.exitCode;
        return {
          code: timedOut || typeof raw !== "number" ? null : raw,
          stdout,
          output,
          timedOut,
        };
      } catch (error) {
        return {
          code: null,
          stdout,
          output: `${output}\n${error instanceof Error ? error.message : String(error)}`,
          timedOut: Date.now() - started >= limit,
        };
      }
    },
    readText: async (path) => {
      const buffer = await this.current().readFileToBuffer({
        path: this.at(path),
      });
      return buffer === null ? null : buffer.toString("utf8");
    },
    writeText: (path, content) => this.current().writeFiles([{ path: this.at(path), content }]),
  };

  // A copy at the exact head with the exact base fetched, network denied.
  // Reused for a retry only if no candidate code has run in it.
  private async boot(revisions: Revisions) {
    assertRevisions(revisions);
    const key = `${revisions.head}..${revisions.base}`;
    if (this.sandbox && this.booted === key && this.networkDenied && !this.candidateRan) {
      await this.timed("reset working copy", async () => {
        await git(this.shell, ["reset", "--quiet", "--hard", revisions.head]);
        await git(this.shell, ["clean", "-fdxq"]);
      });
      return;
    }
    await this.dispose();
    this.sandbox = await this.timed("create sandbox and clone head", () =>
      Sandbox.create({
        source: { type: "git", url: this.options.repoUrl, revision: revisions.head },
        image: SANDBOX_IMAGE,
        persistent: false,
        timeout: SANDBOX_TIMEOUT_MS,
        resources: { vcpus: 2 },
        tags: SANDBOX_TAGS,
        signal: this.options.signal,
      }),
    );
    this.nodeVersion = (await this.shell.exec("node", ["--version"])).stdout.trim() || null;
    await this.timed("fetch exact base", async () => {
      const shallow = await git(this.shell, ["rev-parse", "--is-shallow-repository"]);
      if (shallow.stdout.trim() === "true")
        await git(this.shell, ["fetch", "--quiet", "--unshallow", "--no-tags", "origin"]);
      await git(this.shell, ["fetch", "--quiet", "--no-tags", "origin", revisions.base]);
      await git(this.shell, ["checkout", "--quiet", "--detach", revisions.head]);
    });
    await this.timed("network deny-all", () =>
      this.current().update({ networkPolicy: "deny-all" }, { signal: this.options.signal }),
    );
    this.networkDenied = true;
    this.booted = key;
  }

  async prepareMerge(revisions: Revisions): Promise<PreparedMerge> {
    await this.boot(revisions);
    return this.timed("merge and read conflicts", async () =>
      describeMerge(this.shell, revisions, await mergeIntoHead(this.shell, revisions)),
    );
  }

  async applyProposal(revisions: Revisions, files: ProposedFile[]): Promise<AppliedProposal> {
    await this.boot(revisions);
    return this.timed("merge and write proposal", async () =>
      commitProposal(this.shell, revisions, await mergeIntoHead(this.shell, revisions), files),
    );
  }

  parseCheck(paths: string[]): Promise<ParseResult[]> {
    return this.timed("parse", () => parseFiles(this.shell, paths));
  }

  async runTests(changedFiles: string[]): Promise<TestResult> {
    if (!this.networkDenied)
      return {
        state: "not_run",
        suite: "tests",
        exitCode: null,
        output: "Refusing to run candidate code: the sandbox network is not denied.",
        durationMs: 0,
      };
    this.candidateRan = true;
    return this.timed("tests", () => runSuite(this.shell, changedFiles));
  }

  // Evidence for the live smoke test: true when an outbound request from
  // inside the sandbox fails after deny-all.
  async checkNetworkDenied(): Promise<boolean> {
    const probe = await this.shell.exec(
      "node",
      [
        "-e",
        "fetch('https://example.com',{signal:AbortSignal.timeout(5000)}).then(()=>process.exit(0),()=>process.exit(3))",
      ],
      { timeoutMs: 15_000 },
    );
    return probe.code === 3;
  }

  async dispose(): Promise<void> {
    const sandbox = this.sandbox;
    this.sandbox = null;
    this.booted = null;
    this.networkDenied = false;
    this.candidateRan = false;
    if (!sandbox) return;
    try {
      await this.timed("stop sandbox", () => sandbox.stop());
    } catch (error) {
      // The sandbox's own two-minute timeout still stops it.
      this.timings.push({
        label: `stop failed (${error instanceof Error ? error.message.slice(0, 120) : "unknown"})`,
        ms: 0,
      });
    }
  }
}
