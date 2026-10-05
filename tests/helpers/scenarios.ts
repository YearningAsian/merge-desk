import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseMergeMarkers } from "@/core/conflicts";
import type { FileVersions } from "@/core/honor";

const ROOT = join(import.meta.dirname, "..", "..");

export const readRepo = (relative: string) => readFileSync(join(ROOT, relative), "utf8");

// git's own three-way merge, diff3 style, exactly as the runners produce it.
export function gitMergeFile(ours: string, base: string, theirs: string): string {
  const dir = mkdtempSync(join(tmpdir(), "merge-desk-test-"));
  try {
    const [o, b, t] = ["ours", "base", "theirs"].map((name, i) => {
      const path = join(dir, name);
      writeFileSync(path, [ours, base, theirs][i]!);
      return path;
    });
    const run = spawnSync(
      "git",
      ["merge-file", "-p", "--diff3", "-L", "ours", "-L", "base", "-L", "theirs", o!, b!, t!],
      {
        encoding: "utf8",
      },
    );
    if (run.status === null || run.status < 0)
      throw new Error(`git merge-file failed: ${run.stderr}`);
    return run.stdout;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

export function scenarioFile(scenario: string, path: string, result: string): FileVersions {
  const base = readRepo(path);
  const ours = readRepo(`demo/scenarios/${scenario}/ours/${path}`);
  const theirs = readRepo(`demo/scenarios/${scenario}/theirs/${path}`);
  return { path, base, ours, theirs, merged: gitMergeFile(ours, base, theirs), result };
}

export const candidate = (scenario: string, name: string, path: string) =>
  readRepo(`tests/fixtures/candidates/${scenario}/${name}/${path}`);

// What `git checkout --ours/--theirs` gives inside the conflicts, keeping git's
// clean merge everywhere else.
export function resolveWith(merged: string, side: "ours" | "theirs"): string {
  return (
    parseMergeMarkers(merged)
      .flatMap((segment) => (segment.kind === "clean" ? segment.lines : segment[side]))
      .join("\n") + "\n"
  );
}
