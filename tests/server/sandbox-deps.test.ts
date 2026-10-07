import { createHash } from "node:crypto";
import { posix } from "node:path";
import { runInNewContext } from "node:vm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEPS_MARKER, SandboxRunner } from "@/server/runner/sandbox";

// The app's own unit tests run only from the trusted dependency snapshot:
// node_modules installed outside the checkout from main's lockfile, plus a
// marker with the hashes of the package.json and package-lock.json it was
// installed from. A merge whose dependency files differ is never tested.

const state = vi.hoisted(() => ({ sandbox: null as unknown, created: [] as unknown[] }));
vi.mock("@vercel/sandbox", () => ({
  Sandbox: {
    create: async (params: unknown) => {
      state.created.push(params);
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
  env?: Record<string, string>;
  stdout?: { write(text: string): void };
};
const ROOT = "/vercel/merge-desk";
const PACKAGE = '{ "name": "merge-desk" }\n';
const LOCK = '{ "lockfileVersion": 3 }\n';
const sha = (text: string) => createHash("sha256").update(text).digest("hex");
const HEAD = "a".repeat(40);
const BASE = "b".repeat(40);

class FakeSandbox {
  readonly cwd = "/vercel";
  readonly commands: Array<{ cmd: string; args: string[]; uid: number; cwd?: string }> = [];
  readonly entries = new Map<string, Entry>([
    ["/", { directory: true, mode: 0o755, uid: 0, gid: 0 }],
    ["/vercel", { directory: true, mode: 0o755, uid: 1000, gid: 1000 }],
    [ROOT, { directory: true, mode: 0o755, uid: 1000, gid: 1000 }],
    [`${ROOT}/.git`, { directory: true, mode: 0o755, uid: 1000, gid: 1000 }],
    [`${ROOT}/.git/HEAD`, { content: "c".repeat(40), mode: 0o644, uid: 1000, gid: 1000 }],
    [`${ROOT}/.git/config`, { content: "[core]\n", mode: 0o644, uid: 1000, gid: 1000 }],
    [`${ROOT}/.git/index`, { content: "index", mode: 0o644, uid: 1000, gid: 1000 }],
    [`${ROOT}/package.json`, { content: PACKAGE, mode: 0o644, uid: 1000, gid: 1000 }],
    [`${ROOT}/package-lock.json`, { content: LOCK, mode: 0o644, uid: 1000, gid: 1000 }],
    [
      `/vercel/${DEPS_MARKER}`,
      {
        content: JSON.stringify({
          v: 1,
          revision: "e".repeat(40),
          files: { "package.json": sha(PACKAGE), "package-lock.json": sha(LOCK) },
        }),
        mode: 0o644,
        uid: 1000,
        gid: 1000,
      },
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
                  readdirSync: (path: string) =>
                    [...this.entries.keys()]
                      .filter((entry) => posix.dirname(entry) === path)
                      .map((entry) => posix.basename(entry)),
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
      } else if (command.cmd === "npm" && args.join(" ") === "run test:core") {
        code = this.testExit;
        output = code === 0 ? "Tests 369 passed\n" : "Tests 1 failed\n";
      } else throw new Error(`Unexpected command ${command.cmd}`);
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
});

async function applied(dependencies?: { snapshotId: string }) {
  const runner = new SandboxRunner({
    repoUrl: "https://github.com/YearningAsian/merge-desk.git",
    dependencies,
  });
  await runner.applyProposal({ head: HEAD, base: BASE }, [
    { path: "src/server/github/land.ts", content: "x" },
  ]);
  return runner;
}
const npmRuns = () => sandbox.commands.filter((command) => command.cmd === "npm");

describe("SandboxRunner with the trusted dependency snapshot", () => {
  it("boots from the snapshot and fetches the exact head and base before the network closes", async () => {
    const runner = await applied({ snapshotId: "snap_trusted" });
    try {
      const [params] = state.created as Array<Record<string, unknown>>;
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

  it("runs npm run test:core as the separate test user when the dependency files match", async () => {
    const runner = await applied({ snapshotId: "snap_trusted" });
    try {
      const result = await runner.runTests(["src/server/github/land.ts"]);
      expect(result).toMatchObject({ state: "passed", suite: "npm run test:core", exitCode: 0 });
      expect(npmRuns()).toEqual([
        expect.objectContaining({ args: ["run", "test:core"], uid: 1001, cwd: ROOT }),
      ]);
    } finally {
      await runner.dispose();
    }
  });

  it("reports the app's failing tests as failed", async () => {
    const runner = await applied({ snapshotId: "snap_trusted" });
    sandbox.testExit = 1;
    try {
      const result = await runner.runTests(["src/server/github/land.ts"]);
      expect(result).toMatchObject({ state: "failed", exitCode: 1 });
    } finally {
      await runner.dispose();
    }
  });

  it.each([
    ["package.json", `${ROOT}/package.json`],
    ["package-lock.json", `${ROOT}/package-lock.json`],
  ])("never runs the tests when the merge changed %s", async (name, path) => {
    const runner = await applied({ snapshotId: "snap_trusted" });
    sandbox.entries.get(path)!.content += " ";
    try {
      const result = await runner.runTests(["src/server/github/land.ts", name]);
      expect(result.state).toBe("not_run");
      expect(result.output).toMatch(new RegExp(`${name.replace(".", "\\.")}.*trusted`));
      expect(npmRuns()).toEqual([]);
    } finally {
      await runner.dispose();
    }
  });

  it("never runs the tests without the snapshot's marker", async () => {
    const runner = await applied({ snapshotId: "snap_trusted" });
    sandbox.entries.delete(`/vercel/${DEPS_MARKER}`);
    try {
      const result = await runner.runTests(["src/server/github/land.ts"]);
      expect(result.state).toBe("not_run");
      expect(npmRuns()).toEqual([]);
    } finally {
      await runner.dispose();
    }
  });

  it("without a snapshot, the app's tests are not run and the git boot is unchanged", async () => {
    const runner = await applied();
    try {
      const [params] = state.created as Array<Record<string, unknown>>;
      expect(params!.source).toMatchObject({ type: "git", revision: HEAD });
      expect(params!.image).toBe("vercel/sandbox/node:24");
      const result = await runner.runTests(["src/server/github/land.ts"]);
      expect(result.state).toBe("not_run");
      expect(result.output).toMatch(/trusted dependency snapshot/);
      expect(npmRuns()).toEqual([]);
    } finally {
      await runner.dispose();
    }
  });
});
