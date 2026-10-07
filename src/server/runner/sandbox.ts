import { Writable } from "node:stream";
import { posix } from "node:path";
import { Sandbox, type SandboxUser } from "@vercel/sandbox";
import { chooseTestSuite } from "@/server/guard";
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
  captureWorkspaceIntegrity,
  commitProposal,
  describeMerge,
  NO_DEPENDENCIES,
  git,
  mergeIntoHead,
  parseFiles,
  runCheckedSuite,
  type ExecResult,
  type Shell,
  type WorkspaceIntegrity,
} from "./workspace";

// Runs merges in a Vercel Sandbox: a fresh microVM per boot that clones the
// public repository at the exact head, fetches the exact base, then switches
// its network to deny-all before any candidate file is written or any test
// runs. It holds no GitHub token, model key or session secret. It stops in
// dispose(), pass or fail, and times out on its own after two minutes.
//
// With a trusted dependency snapshot (`npm run snapshot`), a boot restores
// it instead: main's dependencies installed with `npm ci --ignore-scripts`
// into <cwd>/node_modules, outside the checkout, next to a marker naming the
// package.json and package-lock.json they came from. The app's own suite
// runs only when the merge's two files hash to exactly those.

export const SANDBOX_IMAGE = "vercel/sandbox/node:24";
export const SANDBOX_TIMEOUT_MS = 120_000;
export const SANDBOX_TAGS = { app: "merge-desk" };
export const DEPS_MARKER = ".merge-desk-deps.json";
export const DEPS_FILES = ["package.json", "package-lock.json"] as const;

// Trusted: run before any candidate code, in the checkout, with the marker's
// absolute path. Prints "match" or the files that differ.
const DEPS_MATCH = String.raw`
const fs = require("node:fs");
const { createHash } = require("node:crypto");
const marker = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
const differs = ["package.json", "package-lock.json"].filter((name) => {
  const expected = marker && marker.files ? marker.files[name] : undefined;
  return typeof expected !== "string" || createHash("sha256").update(fs.readFileSync(name)).digest("hex") !== expected;
});
process.stdout.write(differs.length ? "differs:" + differs.join(",") : "match");
`;

// Trusted server code checks every source/Git entry and every ancestor. A
// read-only file owned by the test UID is insufficient: it could chmod it, or
// replace the checkout through a writable parent. No repository tool executes.
const VERIFY_READ_ONLY = String.raw`
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(process.argv[1]);
let entries = 0;
function check(full) {
  if (++entries > 50000) throw new Error("Protected source manifest is too large");
  const stat = fs.lstatSync(full);
  if (stat.isSymbolicLink() || (!stat.isFile() && !stat.isDirectory()) || stat.uid !== 0 || stat.gid !== 0 || (stat.mode & 0o222))
    throw new Error("Source protection could not be established");
  if (stat.isDirectory()) for (const name of fs.readdirSync(full)) check(path.join(full, name));
}
check(root);
let parent = path.dirname(root);
for (;;) {
  const stat = fs.lstatSync(parent);
  if (!stat.isDirectory() || stat.isSymbolicLink() || stat.uid !== 0 || stat.gid !== 0 || (stat.mode & 0o022))
    throw new Error("The source parent is replaceable by the test user");
  const next = path.dirname(parent);
  if (next === parent) break;
  parent = next;
}
process.stdout.write("protected");
`;

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
  private integrity: WorkspaceIntegrity | null = null;
  private protectedSource = false;

  constructor(
    private readonly options: {
      repoUrl: string;
      signal?: AbortSignal;
      dependencies?: { snapshotId: string };
    },
  ) {}

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

  private async execute(
    command: string,
    args: string[],
    options: { cwd?: string; timeoutMs?: number } = {},
    context: Sandbox | SandboxUser = this.current(),
    sudo = this.protectedSource,
  ): Promise<ExecResult> {
    const limit = options.timeoutMs ?? RUN_LIMIT_MS;
    let stdout = "";
    let output = "";
    const started = Date.now();
    try {
      const finished = await context.runCommand({
        cmd: command,
        args,
        cwd: this.at(options.cwd),
        timeoutMs: limit,
        signal: this.options.signal,
        sudo,
        // A fixed system PATH and cleared Node preload settings keep trusted
        // helpers and the test command independent of repository tooling.
        env: {
          PATH: "/usr/local/bin:/usr/bin:/bin",
          NODE_OPTIONS: "",
          NODE_PATH: "",
          npm_config_update_notifier: "false", // the network is denied
          ...("homeDir" in context ? { HOME: context.homeDir, TMPDIR: context.homeDir } : {}),
        },
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
  }

  private readonly shell: Shell = {
    exec: (command, args, options) => this.execute(command, args, options),
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
    const common = {
      persistent: false,
      timeout: SANDBOX_TIMEOUT_MS,
      resources: { vcpus: 2 },
      tags: SANDBOX_TAGS,
      signal: this.options.signal,
    };
    const snapshot = this.options.dependencies?.snapshotId;
    // A snapshot boot inherits its image and holds main's checkout, so it
    // fetches the exact head as well as the base.
    this.sandbox = await this.timed(
      snapshot ? "create sandbox from the dependency snapshot" : "create sandbox and clone head",
      () =>
        snapshot
          ? Sandbox.create({ source: { type: "snapshot", snapshotId: snapshot }, ...common })
          : Sandbox.create({
              source: { type: "git", url: this.options.repoUrl, revision: revisions.head },
              image: SANDBOX_IMAGE,
              ...common,
            }),
    );
    this.nodeVersion = (await this.shell.exec("node", ["--version"])).stdout.trim() || null;
    await this.timed(snapshot ? "fetch exact head and base" : "fetch exact base", async () => {
      const shallow = await git(this.shell, ["rev-parse", "--is-shallow-repository"]);
      if (shallow.stdout.trim() === "true")
        await git(this.shell, ["fetch", "--quiet", "--unshallow", "--no-tags", "origin"]);
      await git(this.shell, [
        "fetch",
        "--quiet",
        "--no-tags",
        "origin",
        ...(snapshot ? [revisions.head] : []),
        revisions.base,
      ]);
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
    return this.timed("merge and write proposal", async () => {
      const applied = await commitProposal(
        this.shell,
        revisions,
        await mergeIntoHead(this.shell, revisions),
        files,
      );
      this.integrity = await captureWorkspaceIntegrity(this.shell, applied.tree);
      return applied;
    });
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
    const suite = chooseTestSuite(changedFiles);
    if (suite.id === "app") {
      const reason = await this.timed("check dependencies", () => this.dependencyMismatch());
      if (reason)
        return {
          state: "not_run",
          suite: suite.label,
          exitCode: null,
          output: reason,
          durationMs: 0,
        };
    }
    this.candidateRan = true;
    try {
      const candidate = await this.timed("protect test source", () => this.protectSource());
      return this.timed("tests", () =>
        runCheckedSuite(this.shell, candidate, changedFiles, this.integrity, {
          dependencies: suite.id === "app",
        }),
      );
    } catch (error) {
      return {
        state: "not_run",
        suite: "tests",
        exitCode: null,
        output: `Refusing to run candidate code: source protection failed. ${error instanceof Error ? error.message : "Unknown setup result"}`,
        durationMs: 0,
      };
    }
  }

  // Null when this checkout's dependency files are exactly the ones the
  // trusted snapshot installed; otherwise why the app's suite can't run.
  // Runs as the trusted user before any candidate code.
  private async dependencyMismatch(): Promise<string | null> {
    if (!this.options.dependencies) return NO_DEPENDENCIES;
    const marker = `${this.current().cwd.replace(/\/+$/, "")}/${DEPS_MARKER}`;
    const result = await this.execute("node", ["-e", DEPS_MATCH, marker], { timeoutMs: 10_000 });
    const answer = result.stdout.trim();
    if (result.code === 0 && answer === "match") return null;
    if (result.code === 0 && answer.startsWith("differs:"))
      return `This merge changes ${answer.slice("differs:".length).split(",").join(" and ")}, so its dependencies aren't the ones the trusted snapshot installed. Dependency changes are held until a new snapshot is built from main.`;
    return "Couldn't compare this merge's dependency files with the trusted dependency snapshot, so the app's tests didn't run.";
  }

  private async protectSource(): Promise<Shell> {
    const requireZero = async (command: string, args: string[]) => {
      const result = await this.execute(command, args, {}, this.current(), true);
      if (result.code !== 0 || result.timedOut)
        throw new Error(`Trusted ${command} setup did not complete`);
      return result;
    };
    const owner = await this.execute("id", ["-u"], {}, this.current(), false);
    if (owner.code !== 0 || !/^\d+$/.test(owner.stdout.trim()))
      throw new Error("Default user identity is uncertain");
    const user = await this.current().createUser("merge-desk-tests", {
      signal: this.options.signal,
    });
    const identity = await this.execute("id", ["-u"], {}, user, false);
    const uid = identity.stdout.trim();
    if (identity.code !== 0 || !/^[1-9]\d*$/.test(uid) || uid === owner.stdout.trim())
      throw new Error("Tests require a separate non-root user");
    const sudo = await this.execute("sudo", ["-n", "-l"], {}, user, false);
    if (sudo.code !== 1 || sudo.timedOut)
      throw new Error("The test user's sudo denial is uncertain");

    const root = this.at();
    await requireZero("chown", ["--recursive", "root:root", "--", root]);
    await requireZero("chmod", ["--recursive", "a-w", "--", root]);
    await requireZero("chown", ["root:root", "--", posix.dirname(root)]);
    await requireZero("chmod", ["go-w", "--", posix.dirname(root)]);
    const verified = await requireZero("node", ["-e", VERIFY_READ_ONLY, root]);
    if (verified.stdout !== "protected") throw new Error("Source protection evidence is missing");
    this.protectedSource = true;
    return {
      ...this.shell,
      exec: (command, args, options) => this.execute(command, args, options, user, false),
    };
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
    this.integrity = null;
    this.protectedSource = false;
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
