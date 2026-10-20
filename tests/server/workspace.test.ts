import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { isRepoPath } from "@/core/paths";
import { parseFiles, type Shell } from "@/server/runner/workspace";

describe("isRepoPath", () => {
  it("accepts relative paths inside the repository", () => {
    expect(isRepoPath("playground/src/api.js")).toBe(true);
    expect(isRepoPath("src/core/.hidden.ts")).toBe(true);
  });

  it("refuses absolute, parent, Windows, empty-segment and .git paths", () => {
    for (const path of [
      "",
      "/etc/passwd",
      "../outside.js",
      "playground/../../x",
      "C:/x.js",
      String.raw`playground\src\api.js`,
      "playground//api.js",
      "./api.js",
      ".git/hooks/pre-commit",
      "sub/.GIT/config",
      "a\0b",
    ])
      expect(isRepoPath(path), path).toBe(false);
  });
});

describe("parseFiles", () => {
  it("never reads a conflicted path shaped like a node option as one", async () => {
    const dir = mkdtempSync(join(tmpdir(), "merge-desk-parse-"));
    try {
      writeFileSync(join(dir, "evil.js"), 'require("node:fs").writeFileSync("ran.txt", "ran");\n');
      const shell: Shell = {
        exec: async (command, args) => {
          const run = spawnSync(command === "node" ? process.execPath : command, args, {
            cwd: dir,
            encoding: "utf8",
          });
          return {
            code: run.status,
            stdout: run.stdout,
            output: run.stdout + run.stderr,
            timedOut: false,
          };
        },
        readText: async () => null,
        writeText: async () => {},
      };
      const [result] = await parseFiles(shell, ["--require=./evil.js"]);
      expect({ ran: existsSync(join(dir, "ran.txt")), state: result!.state }).toEqual({
        ran: false,
        state: "failed",
      });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
