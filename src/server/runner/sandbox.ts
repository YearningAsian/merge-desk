import { Writable } from "node:stream";
import { posix } from "node:path";
import { Sandbox, type SandboxUser } from "@vercel/sandbox";
import { z } from "zod";
import { truncateLog } from "@/core/events";
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

// Runs merges in a Vercel Sandbox: a fresh microVM per boot that fetches the
// exact head and base, then switches its network to deny-all before any
// candidate file is written or any test runs. A private repository is
// fetched with a read-only token for that repository alone, passed only on
// the fetch's command line and never written to disk; the sandbox holds no
// other credential, model key or session secret. It stops in dispose(), pass
// or fail, and times out on its own (two minutes, five when it installs a
// repository's dependencies), so a retry reuses it only while a write, parse
// and test run still fit.
//
// Another repository's own tests (installDependencies): before deny-all and
// before any candidate file, its head's package.json and package-lock.json
// are copied outside the checkout and installed there with
// `npm ci --ignore-scripts`, owned by root, beside a marker of their hashes
// and the head's test script. The tests run only if the merge left both
// files unchanged, as the test user, from that script.
//
// With a trusted dependency snapshot (`npm run snapshot`), a boot restores
// it instead: main's dependencies installed with `npm ci --ignore-scripts`
// into <cwd>/node_modules, outside the checkout and owned by root, next to a
// marker naming the package.json and package-lock.json they came from. The
// app's own suite is that snapshot's Vitest, started by absolute path (never
// npm, which reads checkout config), and only when the merge's two files hash
// to the marker's, the checkout has no node_modules of its own, and the
// dependencies are unwritable by the test user. A snapshot that can't be
// restored falls back to the git boot, without the app's suite.

export const SANDBOX_IMAGE = "vercel/sandbox/node:24";
export const SANDBOX_TIMEOUT_MS = 120_000;
export const INSTALL_SANDBOX_TIMEOUT_MS = 300_000;
export const INSTALL_LIMIT_MS = 120_000;
export const REUSE_MIN_LEFT_MS = 60_000;
export const OWN_SUITE_LABEL = "npm test (the repository's own tests)";
export const SANDBOX_TAGS = { app: "merge-desk" };
export const DEPS_MARKER = ".merge-desk-deps.json";
export const DEPS_FILES = ["package.json", "package-lock.json"] as const;

// Trusted: run before any candidate code, in the checkout, with the marker's
// absolute path. A node_modules anywhere in the checkout would shadow the
// trusted one for the files below it. Prints "match", "node_modules:<path>"
// or "differs:<files>".
const DEPS_MATCH = String.raw`
const fs = require("node:fs");
const path = require("node:path");
const { createHash } = require("node:crypto");
let entries = 0;
function own(relative) {
  for (const name of fs.readdirSync(relative || ".")) {
    if (!relative && name === ".git") continue;
    if (++entries > 50000) throw new Error("The checkout is too large to check");
    const child = relative ? path.join(relative, name) : name;
    if (name === "node_modules") return child;
    const stat = fs.lstatSync(child);
    if (stat.isDirectory() && !stat.isSymbolicLink()) {
      const found = own(child);
      if (found) return found;
    }
  }
  return null;
}
const found = own("");
if (found) {
  process.stdout.write("node_modules:" + found);
} else {
  const marker = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
  const differs = ${JSON.stringify(DEPS_FILES)}.filter((name) => {
    const expected = marker && marker.files ? marker.files[name] : undefined;
    return typeof expected !== "string" || createHash("sha256").update(fs.readFileSync(name)).digest("hex") !== expected;
  });
  process.stdout.write(differs.length ? "differs:" + differs.join(",") : "match");
}
`;

// Trusted, as root: the snapshot's node_modules, its Vitest and the marker
// must be owned by root and unwritable by group or others, so the test user
// can't change them. A symbolic link must land inside node_modules (npm's
// .bin links do); the folder and the marker themselves must not be links.
// Prints "trusted" or "writable:<path>".
const DEPS_TRUSTED = String.raw`
const fs = require("node:fs");
const path = require("node:path");
const [modules, marker, vitest] = process.argv.slice(1);
let entries = 0;
function unsafe(full) {
  if (++entries > 500000) throw new Error("Too many dependency entries to check");
  const stat = fs.lstatSync(full);
  if (stat.isSymbolicLink()) {
    const target = path.resolve(path.dirname(full), fs.readlinkSync(full));
    return target === modules || target.startsWith(modules + "/") ? null : full;
  }
  if (stat.uid !== 0 || stat.gid !== 0 || (stat.mode & 0o022)) return full;
  if (stat.isDirectory())
    for (const name of fs.readdirSync(full)) {
      const found = unsafe(path.join(full, name));
      if (found) return found;
    }
  return null;
}
if (!fs.lstatSync(vitest).isFile()) throw new Error("The snapshot has no Vitest");
const linked = [modules, marker].find((entry) => fs.lstatSync(entry).isSymbolicLink());
const found = linked || unsafe(modules) || unsafe(marker);
process.stdout.write(found ? "writable:" + found : "trusted");
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

// Trusted, with no candidate code present: copy the head's dependency files
// to the folder above the checkout and report their hashes and test script.
// Prints the marker JSON, or "missing:<file>".
const OWN_DEPS = String.raw`
const fs = require("node:fs");
const path = require("node:path");
const { createHash } = require("node:crypto");
const home = process.argv[1];
const files = {};
for (const name of ${JSON.stringify(DEPS_FILES)}) {
  let stat;
  try { stat = fs.lstatSync(name); } catch { process.stdout.write("missing:" + name); process.exit(0); }
  if (!stat.isFile()) { process.stdout.write("missing:" + name); process.exit(0); }
  const data = fs.readFileSync(name);
  files[name] = createHash("sha256").update(data).digest("hex");
  fs.writeFileSync(path.join(home, name), data);
}
const scripts = JSON.parse(fs.readFileSync("package.json", "utf8")).scripts;
const test = scripts && typeof scripts.test === "string" ? scripts.test : null;
process.stdout.write(JSON.stringify({ files, test }));
`;

// The candidate's tests from the marker's script, with the installed
// dependencies' binaries on the PATH, as npm test would.
const RUN_SCRIPT = 'PATH="$1:$PATH"; CI=true; export PATH CI; exec sh -c "$2"';
const OWN_MARKER = z.object({
  files: z.record(z.string(), z.string().regex(/^[0-9a-f]{64}$/)),
  test: z.string().nullable(),
});

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
  private bootedAt = 0;
  private networkDenied = false;
  private candidateRan = false;
  private integrity: WorkspaceIntegrity | null = null;
  private protectedSource = false;
  private restored = false; // booted from the dependency snapshot
  private snapshotFailure: string | null = null;
  private installTried = false;
  private installed: z.infer<typeof OWN_MARKER> | null = null;
  private installFailure: string | null = null;

  constructor(
    private readonly options: {
      repoUrl: string;
      signal?: AbortSignal;
      dependencies?: { snapshotId: string };
      // Tags the sandbox for the per-person daily count.
      login?: string;
      // A read-only token for this repository alone, for private ones.
      cloneToken?: () => Promise<string>;
      // Run the repository's own tests (any repository but the demo's).
      installDependencies?: boolean;
    },
  ) {}

  private lifetime() {
    return this.options.installDependencies ? INSTALL_SANDBOX_TIMEOUT_MS : SANDBOX_TIMEOUT_MS;
  }

  // Git options that authenticate one fetch to GitHub; never stored.
  private async fetchAuth(): Promise<string[]> {
    if (!this.options.cloneToken) return [];
    const token = await this.options.cloneToken();
    const basic = Buffer.from(`x-access-token:${token}`).toString("base64");
    return ["-c", `http.https://github.com/.extraHeader=Authorization: Basic ${basic}`];
  }

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
  // Reused for a retry only if no candidate code has run in it. `install`:
  // this boot will run tests, so a repository's own dependencies go in first.
  private async boot(revisions: Revisions, install = false) {
    assertRevisions(revisions);
    const key = `${revisions.head}..${revisions.base}`;
    const fresh = Date.now() - this.bootedAt <= this.lifetime() - REUSE_MIN_LEFT_MS;
    const installs = install && Boolean(this.options.installDependencies);
    if (
      this.sandbox &&
      this.booted === key &&
      this.networkDenied &&
      !this.candidateRan &&
      fresh &&
      (!installs || this.installTried)
    ) {
      await this.timed("reset working copy", async () => {
        await git(this.shell, ["reset", "--quiet", "--hard", revisions.head]);
        await git(this.shell, ["clean", "-fdxq"]);
      });
      return;
    }
    await this.dispose();
    const common = {
      persistent: false,
      timeout: this.lifetime(),
      resources: { vcpus: 2 },
      tags: {
        ...SANDBOX_TAGS,
        ...(this.options.login ? { user: this.options.login.toLowerCase() } : {}),
      },
      signal: this.options.signal,
    };
    this.bootedAt = Date.now();
    const snapshot = this.options.dependencies?.snapshotId;
    // A snapshot boot inherits its image and holds main's checkout, so it
    // fetches the exact head as well as the base. If it can't be restored
    // (missing or expired), the run still boots from git, without the app's suite.
    if (snapshot) {
      try {
        this.sandbox = await this.timed("create sandbox from the dependency snapshot", () =>
          Sandbox.create({ source: { type: "snapshot", snapshotId: snapshot }, ...common }),
        );
        this.restored = true;
      } catch (error) {
        this.options.signal?.throwIfAborted();
        // Only a missing or expired snapshot falls back; anything else (a
        // limit, an outage) would fail the git boot too, so it stops here.
        const status = (error as { response?: { status?: unknown } } | null)?.response?.status;
        if (status !== 404 && status !== 410) throw error;
        this.snapshotFailure =
          "The trusted dependency snapshot is missing or expired, so the app's tests didn't run.";
      }
    }
    if (!this.sandbox) {
      this.sandbox = await this.timed("create sandbox", () =>
        Sandbox.create({ image: SANDBOX_IMAGE, ...common }),
      );
      await this.current().mkDir(this.at(), { signal: this.options.signal });
      await git(this.shell, ["init", "--quiet"]);
      await git(this.shell, ["remote", "add", "origin", this.options.repoUrl]);
    }
    this.nodeVersion = (await this.shell.exec("node", ["--version"])).stdout.trim() || null;
    const auth = await this.fetchAuth();
    await this.timed("fetch exact head and base", async () => {
      const shallow = await git(this.shell, ["rev-parse", "--is-shallow-repository"]);
      if (shallow.stdout.trim() === "true")
        await git(this.shell, [...auth, "fetch", "--quiet", "--unshallow", "--no-tags", "origin"]);
      await git(this.shell, [
        ...auth,
        "fetch",
        "--quiet",
        "--no-tags",
        "origin",
        revisions.head,
        revisions.base,
      ]);
      await git(this.shell, ["checkout", "--quiet", "--detach", revisions.head]);
    });
    if (installs) await this.timed("install dependencies", () => this.installDependencies());
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
    await this.boot(revisions, true);
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
    if (this.options.installDependencies) return this.runOwnTests(changedFiles);
    const suite = chooseTestSuite(changedFiles);
    let vitest: string | undefined;
    if (suite.id === "app") {
      const trusted = await this.timed("check dependencies", () => this.trustedDependencies());
      if (!trusted.ok)
        return {
          state: "not_run",
          suite: suite.label,
          exitCode: null,
          output: trusted.reason,
          durationMs: 0,
        };
      vitest = trusted.vitest;
    }
    this.candidateRan = true;
    try {
      const candidate = await this.timed("protect test source", () => this.protectSource());
      return this.timed("tests", () =>
        runCheckedSuite(this.shell, candidate, changedFiles, this.integrity, { vitest }),
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

  // Trusted, with the network still open and no candidate file written: the
  // head's dependencies, installed outside the checkout with no install
  // scripts, then made root-owned and read-only for the test user.
  private async installDependencies() {
    this.installTried = true;
    const home = this.current().cwd.replace(/\/+$/, "");
    const copied = await this.execute("node", ["-e", OWN_DEPS, home], { timeoutMs: 15_000 });
    const answer = copied.stdout.trim();
    if (copied.code !== 0) {
      this.installFailure = "Couldn't read this repository's package.json, so no tests ran.";
      return;
    }
    if (answer.startsWith("missing:")) {
      this.installFailure = `This repository has no ${answer.slice("missing:".length)} at its root, so Merge Desk can't install its dependencies and no tests ran.`;
      return;
    }
    let parsed: unknown = null;
    try {
      parsed = JSON.parse(answer);
    } catch {}
    const marker = OWN_MARKER.safeParse(parsed);
    if (!marker.success) {
      this.installFailure = "Couldn't read this repository's package.json, so no tests ran.";
      return;
    }
    const npm = await this.execute(
      "npm",
      ["ci", "--ignore-scripts", "--no-audit", "--no-fund", "--prefix", home],
      { timeoutMs: INSTALL_LIMIT_MS },
    );
    if (npm.code !== 0) {
      this.installFailure = truncateLog(
        `Installing this repository's dependencies (npm ci --ignore-scripts) ${npm.timedOut ? `took longer than ${INSTALL_LIMIT_MS / 1000} s` : "failed"}, so no tests ran.\n${npm.output}`,
      );
      return;
    }
    await this.current().writeFiles([
      { path: `${home}/${DEPS_MARKER}`, content: JSON.stringify(marker.data) },
    ]);
    const owned = [`${home}/node_modules`, `${home}/${DEPS_MARKER}`];
    for (const [command, args] of [
      ["chown", ["--recursive", "--no-dereference", "root:root", "--", ...owned]],
      ["chmod", ["--recursive", "go-w", "--", ...owned]],
    ] as const) {
      const done = await this.execute(
        command,
        [...args],
        { timeoutMs: 60_000 },
        this.current(),
        true,
      );
      if (done.code !== 0) {
        this.installFailure = "Couldn't protect the installed dependencies, so no tests ran.";
        return;
      }
    }
    this.installed = marker.data;
  }

  // The repository's own suite: the installed dependencies must still be the
  // ones this merge uses and unwritable by the test user, and the head must
  // name a test script. Otherwise nothing runs and the reason says why.
  private async runOwnTests(changedFiles: string[]): Promise<TestResult> {
    const notRun = (output: string): TestResult => ({
      state: "not_run",
      suite: OWN_SUITE_LABEL,
      exitCode: null,
      output,
      durationMs: 0,
    });
    if (!this.installed)
      return notRun(this.installFailure ?? "This repository's dependencies weren't installed.");
    const script = this.installed.test?.trim();
    if (!script || /no test specified/.test(script))
      return notRun("This repository's package.json has no test script, so no tests ran.");
    const home = this.current().cwd.replace(/\/+$/, "");
    const marker = `${home}/${DEPS_MARKER}`;
    const modules = `${home}/node_modules`;
    const match = await this.execute("node", ["-e", DEPS_MATCH, marker], { timeoutMs: 15_000 });
    const answer = match.stdout.trim();
    if (match.code !== 0 || !answer)
      return notRun("Couldn't check this merge's dependencies, so no tests ran.");
    if (answer.startsWith("node_modules:"))
      return notRun(
        `This merge carries its own ${answer.slice("node_modules:".length)}, which would replace the installed dependencies, so no tests ran.`,
      );
    if (answer.startsWith("differs:"))
      return notRun(
        `This merge changes ${answer.slice("differs:".length).split(",").join(" and ")}, so the dependencies installed from the pull request's head aren't the ones it uses. Resolve the dependency change first; no tests ran.`,
      );
    if (answer !== "match")
      return notRun("Couldn't check this merge's dependencies, so no tests ran.");
    const trust = await this.execute(
      "node",
      ["-e", DEPS_TRUSTED, modules, marker, marker],
      { timeoutMs: 30_000 },
      this.current(),
      true,
    );
    if (trust.code !== 0 || trust.stdout.trim() !== "trusted")
      return notRun(
        "The installed dependencies aren't protected from the test user, so no tests ran.",
      );
    this.candidateRan = true;
    try {
      const candidate = await this.timed("protect test source", () => this.protectSource());
      return this.timed("tests", () =>
        runCheckedSuite(this.shell, candidate, changedFiles, this.integrity, {
          own: {
            label: OWN_SUITE_LABEL,
            command: ["sh", ["-c", RUN_SCRIPT, "sh", `${modules}/.bin`, script]],
          },
        }),
      );
    } catch (error) {
      return notRun(
        `Refusing to run candidate code: source protection failed. ${error instanceof Error ? error.message : "Unknown setup result"}`,
      );
    }
  }

  // The snapshot's Vitest, when this checkout may run the app's suite from
  // it; otherwise why not. Both checks run before any candidate code.
  private async trustedDependencies(): Promise<
    { ok: true; vitest: string } | { ok: false; reason: string }
  > {
    if (!this.options.dependencies) return { ok: false, reason: NO_DEPENDENCIES };
    if (!this.restored) return { ok: false, reason: this.snapshotFailure ?? NO_DEPENDENCIES };
    const home = this.current().cwd.replace(/\/+$/, "");
    const marker = `${home}/${DEPS_MARKER}`;
    const modules = `${home}/node_modules`;
    const vitest = `${modules}/vitest/vitest.mjs`;
    const unsure =
      "Couldn't check this merge against the trusted dependency snapshot, so the app's tests didn't run.";

    const match = await this.execute("node", ["-e", DEPS_MATCH, marker], { timeoutMs: 15_000 });
    const answer = match.stdout.trim();
    if (match.code !== 0) return { ok: false, reason: unsure };
    if (answer.startsWith("node_modules:"))
      return {
        ok: false,
        reason: `This merge carries its own ${answer.slice("node_modules:".length)}, which would replace the trusted dependencies, so the app's tests didn't run.`,
      };
    if (answer.startsWith("differs:"))
      return {
        ok: false,
        reason: `This merge changes ${answer.slice("differs:".length).split(",").join(" and ")}, so its dependencies aren't the ones the trusted snapshot installed. Dependency changes are held until a new snapshot is built from main.`,
      };
    if (answer !== "match") return { ok: false, reason: unsure };

    const trust = await this.execute(
      "node",
      ["-e", DEPS_TRUSTED, modules, marker, vitest],
      { timeoutMs: 30_000 },
      this.current(),
      true,
    );
    if (trust.code !== 0 || trust.stdout.trim() !== "trusted")
      return {
        ok: false,
        reason:
          "The trusted dependency snapshot isn't protected from the test user, so the app's tests didn't run.",
      };
    return { ok: true, vitest };
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
    this.restored = false;
    this.snapshotFailure = null;
    this.installTried = false;
    this.installed = null;
    this.installFailure = null;
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
