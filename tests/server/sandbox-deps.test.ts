import { createHash } from "node:crypto";
import { posix } from "node:path";
import { runInNewContext } from "node:vm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEPS_MARKER, SandboxRunner } from "@/server/runner/sandbox";

// The app's own unit tests run only from the trusted dependency snapshot:
// main's node_modules installed outside the checkout, root-owned, plus a
// marker with the hashes of the package.json and package-lock.json it was
// installed from. Trusted code runs that snapshot's Vitest by absolute path
// (never npm, which reads checkout config), and only when the merge's
// dependency files match and the checkout carries no node_modules of its own.

const state = vi.hoisted(() => ({
  sandbox: null as unknown,
  created: [] as Array<Record<string, unknown>>,
  failSnapshot: false,
}));
vi.mock("@vercel/sandbox", () => ({
  Sandbox: {
    create: async (params: Record<string, unknown>) => {
      state.created.push(params);
      if (state.failSnapshot && (params.source as { type?: string })?.type === "snapshot")
        throw new Error("Snapshot not found");
      return state.sandbox;
    },
  },
}));
vi.mock("@/server/runner/workspace", async (original) => {
  const real = await original<typeof import("@/server/runner/workspace")>();
  return {
    ...real,
    mergeIntoHead: async () => ({ conflicted: [], unsupported: [] }),
    commitProposal: async () => ({
      conflicted: [],
      changedFiles: ["src/server/github/land.ts"],
      patch: "patch",
      tree: "d".repeat(40),
      changes: [{ path: "src/server/github/land.ts", mode: "100644", content: "x" }],
      changesNote: null,
    }),
  };
});

type Entry = { directory?: boolean; content?: string; mode: number; uid: number; gid: number };
type Command = {
  cmd: string;
  args?: string[];
  cwd?: string;
  sudo?: boolean;
  stdout?: { write(text: string): void };
};
const ROOT = "/vercel/merge-desk";
const VITEST = "/vercel/node_modules/vitest/vitest.mjs";
const PACKAGE = '{ "name": "merge-desk" }\n';
const LOCK = '{ "lockfileVersion": 3 }\n';
const sha = (text: string) => createHash("sha256").update(text).digest("hex");
const HEAD = "a".repeat(40);
const BASE = "b".repeat(40);
const LAND = "src/server/github/land.ts";

const mine = (mode: number, extra: Partial<Entry> = {}): Entry => ({
  mode,
  uid: 1000,
  gid: 1000,
  ...extra,
});
const root = (mode: number, extra: Partial<Entry> = {}): Entry => ({
  mode,
  uid: 0,
  gid: 0,
  ...extra,
});

class FakeSandbox {
  readonly cwd = "/vercel";
  readonly commands: Array<{ cmd: string; args: string[]; uid: number; cwd?: string }> = [];
  readonly entries = new Map<string, Entry>([
    ["/", root(0o755, { directory: true })],
    ["/vercel", mine(0o755, { directory: true })],
    [ROOT, mine(0o755, { directory: true })],
    [`${ROOT}/.git`, mine(0o755, { directory: true })],
    [`${ROOT}/.git/HEAD`, mine(0o644, { content: "c".repeat(40) })],
    [`${ROOT}/.git/config`, mine(0o644, { content: "[core]\n" })],
    [`${ROOT}/.git/index`, mine(0o644, { content: "index" })],
    [`${ROOT}/package.json`, mine(0o644, { content: PACKAGE })],
    [`${ROOT}/package-lock.json`, mine(0o644, { content: LOCK })],
    [`${ROOT}/src`, mine(0o755, { directory: true })],
    [`${ROOT}/src/land.ts`, mine(0o644, { content: "export {};\n" })],
    ["/vercel/node_modules", root(0o755, { directory: true })],
    ["/vercel/node_modules/vitest", root(0o755, { directory: true })],
    [VITEST, root(0o644, { content: "// vitest" })],
    [
      `/vercel/${DEPS_MARKER}`,
      root(0o644, {
        content: JSON.stringify({
          v: 1,
          revision: "e".repeat(40),
          files: { "package.json": sha(PACKAGE), "package-lock.json": sha(LOCK) },
        }),
      }),
    ],
  ]);
  testExit = 0;

  async update() {}
  async stop() {}
  async writeFiles() {}
  async readFileToBuffer({ path }: { path: string }) {
    return Buffer.from(this.entries.get(path)!.content!);
  }
  async createUser() {
    return {
      homeDir: "/home/merge-desk-tests",
      runCommand: (command: Command) => this.run(command, command.sudo ? 0 : 1001),
    };
  }
  runCommand(command: Command) {
    return this.run(command, command.sudo ? 0 : 1000);
  }

  private async run(command: Command, uid: number) {
    const args = command.args ?? [];
    this.commands.push({ cmd: command.cmd, args, uid, cwd: command.cwd });
    let output = "";
    let code = 0;
    try {
      if (command.cmd === "git") {
        if (args.includes("--is-shallow-repository")) output = "false\n";
        else if (args.includes("HEAD^{tree}") || args.includes("write-tree"))
          output = "d".repeat(40) + "\n";
        else if (args.includes("HEAD")) output = "c".repeat(40) + "\n";
      } else if (command.cmd === "id") {
        output = `${uid}\n`;
      } else if (command.cmd === "sudo") {
        code = 1;
      } else if (command.cmd === "chown" || command.cmd === "chmod") {
        if (uid !== 0) throw new Error("permission denied");
        const recursive = args.includes("--recursive");
        const setting = args.find((arg) => !arg.startsWith("-") && !arg.startsWith("/"))!;
        for (const target of args.filter((arg) => arg.startsWith("/")))
          for (const [path, entry] of this.entries) {
            if (path !== target && !(recursive && path.startsWith(target + "/"))) continue;
            if (command.cmd === "chown") {
              entry.uid = 0;
              entry.gid = 0;
            } else if (setting === "a-w") entry.mode &= ~0o222;
            else if (setting === "go-w") entry.mode &= ~0o022;
          }
      } else if (command.cmd === "node" && args.includes("--version")) {
        output = "v24.19.0\n";
      } else if (command.cmd === "node" && args[0] === "-e") {
        const entryAt = (path: string) => {
          const entry = this.entries.get(posix.resolve(command.cwd ?? ROOT, path));
          if (!entry) throw new Error(`ENOENT: ${path}`);
          return entry;
        };
        const stat = (path: string) => {
          const entry = entryAt(path);
          return {
            ...entry,
            size: Buffer.byteLength(entry.content ?? ""),
            isFile: () => !entry.directory,
            isDirectory: () => !!entry.directory,
            isSymbolicLink: () => false,
          };
        };
        runInNewContext(args[1]!, {
          require: (name: string) =>
            name === "node:fs"
              ? {
                  lstatSync: stat,
                  statSync: stat,
                  readFileSync: (path: string, encoding?: string) => {
                    const content = entryAt(path).content!;
                    return encoding ? content : Buffer.from(content);
                  },
                  readdirSync: (path: string) => {
                    const full = posix.resolve(command.cwd ?? ROOT, path);
                    return [...this.entries.keys()]
                      .filter((entry) => entry !== "/" && posix.dirname(entry) === full)
                      .map((entry) => posix.basename(entry));
                  },
                }
              : name === "node:path"
                ? posix
                : name === "node:crypto"
                  ? { createHash }
                  : (() => {
                      throw new Error(`Unexpected module ${name}`);
                    })(),
          Buffer,
          JSON,
          String,
          process: {
            cwd: () => command.cwd ?? ROOT,
            argv: ["node", ...args.slice(2)],
            stdout: { write: (text: string) => (output += text) },
          },
        });
      } else if (command.cmd === "node" && args[0] === VITEST) {
        code = this.testExit;
        output = code === 0 ? "Tests 381 passed\n" : "Tests 1 failed\n";
      } else if (command.cmd === "node" && args[0] === "--test") {
        output = "playground tests passed\n";
      } else throw new Error(`Unexpected command ${command.cmd} ${args.join(" ")}`);
    } catch (error) {
      code = 1;
      output = error instanceof Error ? error.message : String(error);
    }
    command.stdout?.write(output);
    return { cmd: { exitCode: code }, exitCode: code };
  }
}

let sandbox: FakeSandbox;
beforeEach(() => {
  sandbox = new FakeSandbox();
  state.sandbox = sandbox;
  state.created = [];
  state.failSnapshot = false;
});

async function applied(dependencies?: { snapshotId: string }) {
  const runner = new SandboxRunner({
    repoUrl: "https://github.com/YearningAsian/merge-desk.git",
    dependencies,
  });
  await runner.applyProposal({ head: HEAD, base: BASE }, [{ path: LAND, content: "x" }]);
  return runner;
}
const trusted = () => applied({ snapshotId: "snap_trusted" });
const testRuns = () =>
  sandbox.commands.filter(
    (command) => command.cmd === "npm" || (command.cmd === "node" && command.args[0] === VITEST),
  );
// The setup shapes the checkout or the snapshot before the merge is captured.
async function tested(setup: () => void = () => undefined, files = [LAND]) {
  setup();
  const runner = await trusted();
  try {
    return await runner.runTests(files);
  } finally {
    await runner.dispose();
  }
}

describe("SandboxRunner with the trusted dependency snapshot", () => {
  it("boots from the snapshot and fetches the exact head and base before the network closes", async () => {
    const runner = await trusted();
    try {
      const [params] = state.created;
      expect(params!.source).toEqual({ type: "snapshot", snapshotId: "snap_trusted" });
      expect(params!.image).toBeUndefined();
      expect(params!.persistent).toBe(false);
      const fetch = sandbox.commands.find(
        (command) => command.cmd === "git" && command.args.includes("fetch"),
      )!;
      expect(fetch.args).toEqual(expect.arrayContaining([HEAD, BASE]));
    } finally {
      await runner.dispose();
    }
  });

  it("runs the snapshot's own Vitest by absolute path as the separate test user, never npm", async () => {
    const result = await tested();
    expect(result).toMatchObject({ state: "passed", exitCode: 0 });
    expect(result.suite).toMatch(/vitest/);
    expect(testRuns()).toEqual([
      {
        cmd: "node",
        args: [VITEST, "run", "--configLoader", "runner"],
        uid: 1001,
        cwd: ROOT,
      },
    ]);
  });

  // Review 8.1 H1: npm reads checkout config (.npmrc script-shell) and puts
  // the checkout's node_modules/.bin first on PATH.
  it("ignores a checkout .npmrc, because npm never runs", async () => {
    const result = await tested(() =>
      sandbox.entries.set(`${ROOT}/.npmrc`, mine(0o644, { content: "script-shell=/bin/true\n" })),
    );
    expect(result.state).toBe("passed");
    expect(sandbox.commands.some((command) => command.cmd === "npm")).toBe(false);
  });

  it.each([
    [`${ROOT}/node_modules`, `${ROOT}/node_modules/.bin`, `${ROOT}/node_modules/.bin/vitest`],
    [`${ROOT}/src/node_modules`, `${ROOT}/src/node_modules/vitest`, null],
  ])("never runs the tests when the checkout carries its own %s", async (top, child, file) => {
    const result = await tested(() => {
      sandbox.entries.set(top, mine(0o755, { directory: true }));
      sandbox.entries.set(child, mine(0o755, { directory: !file || child !== file }));
      if (file) sandbox.entries.set(file, mine(0o755, { content: "exit 0" }));
    });
    expect(result.state).toBe("not_run");
    expect(result.output).toMatch(/node_modules/);
    expect(testRuns()).toEqual([]);
  });

  it("reports the app's failing tests as failed", async () => {
    const result = await tested(() => (sandbox.testExit = 1));
    expect(result).toMatchObject({ state: "failed", exitCode: 1 });
  });

  it.each([
    ["package.json", `${ROOT}/package.json`],
    ["package-lock.json", `${ROOT}/package-lock.json`],
  ])("never runs the tests when the merge changed %s", async (name, path) => {
    const result = await tested(() => (sandbox.entries.get(path)!.content += " "));
    expect(result.state).toBe("not_run");
    expect(result.output).toMatch(new RegExp(`${name.replace(".", "\\.")}.*trusted`));
    expect(testRuns()).toEqual([]);
  });

  it("never runs the tests without the snapshot's marker", async () => {
    const result = await tested(() => sandbox.entries.delete(`/vercel/${DEPS_MARKER}`));
    expect(result.state).toBe("not_run");
    expect(testRuns()).toEqual([]);
  });

  // Review 8.1 L1: the trusted dependencies must be unwritable by the test user.
  it.each([
    ["a file the default user owns", () => (sandbox.entries.get(VITEST)!.uid = 1000)],
    [
      "a group-writable folder",
      () => (sandbox.entries.get("/vercel/node_modules/vitest")!.mode = 0o775),
    ],
    ["a writable marker", () => (sandbox.entries.get(`/vercel/${DEPS_MARKER}`)!.mode = 0o666)],
    ["no Vitest at all", () => sandbox.entries.delete(VITEST)],
  ])("never runs the tests when the trusted dependencies have %s", async (_name, setup) => {
    const result = await tested(setup);
    expect(result.state).toBe("not_run");
    expect(testRuns()).toEqual([]);
  });

  // Review 8.1 M1: an expired or deleted snapshot must not stop every run.
  it("falls back to a git boot when the snapshot can't be restored, without the app's tests", async () => {
    state.failSnapshot = true;
    const runner = await trusted();
    try {
      expect(state.created.map((params) => (params.source as { type: string }).type)).toEqual([
        "snapshot",
        "git",
      ]);
      expect(state.created[1]!.image).toBe("vercel/sandbox/node:24");
      const app = await runner.runTests([LAND]);
      expect(app.state).toBe("not_run");
      expect(app.output).toMatch(/couldn't be restored/);
      expect(testRuns()).toEqual([]);
    } finally {
      await runner.dispose();
    }
  });

  it("still runs the playground's tests after that fallback", async () => {
    state.failSnapshot = true;
    const runner = await trusted();
    try {
      const result = await runner.runTests(["playground/src/api.js"]);
      expect(result.state).toBe("passed");
    } finally {
      await runner.dispose();
    }
  });

  it("without a snapshot, the app's tests are not run and the git boot is unchanged", async () => {
    const runner = await applied();
    try {
      const [params] = state.created;
      expect(params!.source).toMatchObject({ type: "git", revision: HEAD });
      expect(params!.image).toBe("vercel/sandbox/node:24");
      const result = await runner.runTests([LAND]);
      expect(result.state).toBe("not_run");
      expect(result.output).toMatch(/trusted dependency snapshot/);
      expect(testRuns()).toEqual([]);
    } finally {
      await runner.dispose();
    }
  });
});
