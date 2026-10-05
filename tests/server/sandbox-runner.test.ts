import { createHash } from "node:crypto";
import { posix } from "node:path";
import { runInNewContext } from "node:vm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SandboxRunner } from "@/server/runner/sandbox";

const state = vi.hoisted(() => ({ sandbox: null as unknown }));
vi.mock("@vercel/sandbox", () => ({ Sandbox: { create: async () => state.sandbox } }));
vi.mock("@/server/runner/workspace", async (original) => {
  const real = await original<typeof import("@/server/runner/workspace")>();
  return {
    ...real,
    mergeIntoHead: async () => ({ conflicted: [], unsupported: [] }),
    commitProposal: async (
      shell: import("@/server/runner/workspace").Shell,
      _revisions: unknown,
      _merge: unknown,
      files: Array<{ path: string; content: string }>,
    ) => {
      for (const file of files) await shell.writeText(file.path, file.content);
      return {
        conflicted: [],
        changedFiles: ["playground/src/api.js"],
        patch: "patch",
        tree: "d".repeat(40),
        changes: [{ path: "playground/src/api.js", mode: "100644", content: files[0]!.content }],
        changesNote: null,
      };
    },
  };
});

type Entry = { directory?: boolean; content?: string; mode: number; uid: number; gid: number };
type Command = {
  cmd: string;
  args?: string[];
  cwd?: string;
  sudo?: boolean;
  stdout?: { write(text: string): void };
  stderr?: { write(text: string): void };
};
const ROOT = "/vercel/merge-desk";
const API = "playground/src/api.js";
const PROPOSAL = "export const reviewMustBe42 = 0;\n";

// A remote-operation double: source reads and trusted Node setup programs run
// against a tiny filesystem with Linux ownership/permission semantics. The
// candidate command attempts a write, import, and restoration. Losing either
// the separate UID or protected checkout/parent lets that command exit zero.
class FakeSandbox {
  readonly cwd = "/vercel";
  readonly entries = new Map<string, Entry>([
    ["/", { directory: true, mode: 0o755, uid: 0, gid: 0 }],
    ["/vercel", { directory: true, mode: 0o777, uid: 1000, gid: 1000 }],
    [ROOT, { directory: true, mode: 0o755, uid: 1000, gid: 1000 }],
    [`${ROOT}/.git`, { directory: true, mode: 0o755, uid: 1000, gid: 1000 }],
    [`${ROOT}/.git/HEAD`, { content: "c".repeat(40), mode: 0o644, uid: 1000, gid: 1000 }],
    [`${ROOT}/.git/config`, { content: "[core]\n", mode: 0o644, uid: 1000, gid: 1000 }],
    [`${ROOT}/.git/index`, { content: "index", mode: 0o644, uid: 1000, gid: 1000 }],
    [`${ROOT}/playground`, { directory: true, mode: 0o755, uid: 1000, gid: 1000 }],
    [`${ROOT}/playground/src`, { directory: true, mode: 0o755, uid: 1000, gid: 1000 }],
    [`${ROOT}/${API}`, { content: PROPOSAL, mode: 0o644, uid: 1000, gid: 1000 }],
  ]);
  attempted = false;
  wrote = false;
  stopped = false;
  rewrite = true;
  setupFailure: "chmod" | "missing-exit" | "root-user" | "sudo" | "bad-permissions" | null = null;

  async update() {}
  async stop() {
    this.stopped = true;
  }
  async writeFiles(files: Array<{ path: string; content: string | Uint8Array }>) {
    for (const file of files) this.entries.get(file.path)!.content = String(file.content);
  }
  async readFileToBuffer({ path }: { path: string }) {
    return Buffer.from(this.entries.get(path)!.content!);
  }
  async createUser() {
    return {
      homeDir: "/home/merge-desk-tests",
      runCommand: (command: Command) =>
        this.run(command, command.sudo || this.setupFailure === "root-user" ? 0 : 1001),
    };
  }
  runCommand(command: Command) {
    return this.run(command, command.sudo ? 0 : 1000);
  }

  private async run(command: Command, uid: number) {
    const args = command.args ?? [];
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
        code = this.setupFailure === "sudo" ? 0 : 1;
      } else if (command.cmd === "chown" || command.cmd === "chmod") {
        if (uid !== 0) throw new Error("permission denied");
        if (this.setupFailure === "chmod" && command.cmd === "chmod")
          throw new Error("chmod failed");
        const recursive = args.includes("-R") || args.includes("--recursive");
        const setting = args.find((arg) => !arg.startsWith("-") && !arg.startsWith("/"))!;
        for (const target of args.filter((arg) => arg.startsWith("/"))) {
          for (const [path, entry] of this.entries) {
            if (path !== target && !(recursive && path.startsWith(target + "/"))) continue;
            if (command.cmd === "chown") {
              entry.uid = 0;
              entry.gid = 0;
            } else if (this.setupFailure !== "bad-permissions") {
              if (setting === "a-w") entry.mode &= ~0o222;
              else if (setting === "go-w") entry.mode &= ~0o022;
              else if (/^[0-7]+$/.test(setting)) entry.mode = parseInt(setting, 8);
              else throw new Error(`Unsupported chmod ${setting}`);
            }
          }
        }
        if (this.setupFailure === "missing-exit") return { cmd: {}, exitCode: 0 };
      } else if (command.cmd === "node" && args.includes("--version")) {
        output = "v24.19.0\n";
      } else if (command.cmd === "node" && args[0] === "-p") {
        output = "/usr/bin/node\n";
      } else if ((command.cmd === "node" || command.cmd === "/usr/bin/node") && args[0] === "-e") {
        const entryAt = (path: string) => {
          const entry = this.entries.get(posix.resolve(command.cwd ?? ROOT, path));
          if (!entry) throw new Error(`missing ${path}`);
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
        const fs = {
          lstatSync: stat,
          statSync: stat,
          readFileSync: (path: string) => Buffer.from(entryAt(path).content!),
          readdirSync: (path: string) =>
            [...this.entries.keys()]
              .filter((entry) => posix.dirname(entry) === path)
              .map((entry) => posix.basename(entry)),
        };
        runInNewContext(args[1]!, {
          require: (name: string) =>
            name === "node:fs"
              ? fs
              : name === "node:path"
                ? posix
                : name === "node:crypto"
                  ? { createHash }
                  : (() => {
                      throw new Error(`Unexpected module ${name}`);
                    })(),
          Buffer,
          process: {
            cwd: () => command.cwd ?? ROOT,
            platform: "linux",
            argv: ["node", ...args.slice(2)],
            stdout: {
              write: (text: string) => {
                output += text;
              },
            },
          },
        });
      } else if (
        (command.cmd === "node" || command.cmd === "/usr/bin/node") &&
        args[0] === "--test"
      ) {
        this.attempted = true;
        if (!this.rewrite) {
          command.stdout?.write("Unchanged candidate tests passed\n");
          return { cmd: { exitCode: 0 }, exitCode: 0 };
        }
        const source = this.entries.get(`${ROOT}/${API}`)!;
        const directory = this.entries.get(posix.dirname(`${ROOT}/${API}`))!;
        const parent = this.entries.get("/vercel")!;
        const writable = (entry: Entry) =>
          uid === 0 || uid === 1000 || !!(entry.mode & (entry.uid === uid ? 0o200 : 0o002));
        if (writable(source) || writable(directory) || writable(parent)) {
          const original = source.content;
          source.content = "export const reviewMustBe42 = 42;\n";
          this.wrote = true;
          source.content = original;
          output = "Candidate was rewritten, imported, and restored; tests passed\n";
        } else {
          code = 1;
          output = "EACCES: candidate source is read-only\n";
        }
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
});
async function appliedRunner() {
  const runner = new SandboxRunner({ repoUrl: "https://github.com/YearningAsian/merge-desk.git" });
  await runner.applyProposal({ head: "a".repeat(40), base: "b".repeat(40) }, [
    { path: API, content: PROPOSAL },
  ]);
  return runner;
}

describe("SandboxRunner candidate source protection", () => {
  it("refuses tests without the integrity captured by applyProposal", async () => {
    const runner = new SandboxRunner({
      repoUrl: "https://github.com/YearningAsian/merge-desk.git",
    });
    try {
      await runner.prepareMerge({ head: "a".repeat(40), base: "b".repeat(40) });
      const result = await runner.runTests([API]);
      expect(result.state).not.toBe("passed");
      expect(result.output).toMatch(/no captured source integrity/i);
      expect(sandbox.attempted).toBe(false);
    } finally {
      await runner.dispose();
    }
  });

  it("allows an unchanged suite to pass in the protected checkout", async () => {
    const runner = await appliedRunner();
    sandbox.rewrite = false;
    try {
      const result = await runner.runTests([API]);
      expect(sandbox.attempted).toBe(true);
      expect(result.state).toBe("passed");
      expect(result.exitCode).toBe(0);
    } finally {
      await runner.dispose();
    }
  });

  it("prevents a transient candidate rewrite even when the test would restore the original bytes", async () => {
    const runner = await appliedRunner();
    try {
      const result = await runner.runTests([API]);
      expect(sandbox.attempted).toBe(true);
      expect(sandbox.wrote).toBe(false);
      expect(result.state).toBe("failed");
      expect(sandbox.entries.get(`${ROOT}/${API}`)!.content).toBe(PROPOSAL);
    } finally {
      await runner.dispose();
    }
    expect(sandbox.stopped).toBe(true);
  });

  it.each(["chmod", "missing-exit", "root-user", "sudo", "bad-permissions"] as const)(
    "refuses candidate execution when protection setup has %s uncertainty",
    async (failure) => {
      const runner = await appliedRunner();
      sandbox.setupFailure = failure;
      try {
        const result = await runner.runTests([API]);
        expect(result.state).not.toBe("passed");
        expect(sandbox.attempted).toBe(false);
      } finally {
        await runner.dispose();
      }
    },
  );
});
