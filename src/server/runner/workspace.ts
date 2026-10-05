import { extname } from "node:path";
import { truncateLog } from "@/core/events";
import { chooseTestSuite } from "@/server/guard";
import type {
  LandableChange,
  AppliedProposal,
  CommitInfo,
  ConflictedFile,
  ParseResult,
  PreparedMerge,
  ProposedFile,
  Revisions,
  TestResult,
} from "./types";

// What both runners do inside a working copy, written once: merge the base
// into the head and read git's conflicts, write a proposal and commit it,
// parse the result and run the chosen tests. LocalRunner backs the Shell
// with a temp folder on this machine, SandboxRunner with a Vercel Sandbox VM,
// so a merge is held or verified by the same rules wherever it runs.

export type ExecResult = {
  code: number | null;
  stdout: string;
  output: string; // stdout and stderr together, for logs
  timedOut: boolean;
};

export interface Shell {
  // `cwd` is relative to the repository root.
  exec(
    command: string,
    args: string[],
    options?: { cwd?: string; timeoutMs?: number },
  ): Promise<ExecResult>;
  readText(path: string): Promise<string | null>;
  writeText(path: string, content: string): Promise<void>;
}

export const RUN_LIMIT_MS = 120_000;
export const MAX_LANDABLE_BYTES = 2_000_000;
export const TEST_LIMIT_MS = 30_000;
export const SHA = /^[0-9a-f]{40}$/;

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

export function assertRevisions(revisions: Revisions) {
  if (!SHA.test(revisions.head) || !SHA.test(revisions.base))
    throw new Error("Revisions must be full commit ids");
}

// A relative path inside the repository, never into .git or out of it.
export function isRepoPath(path: string): boolean {
  if (!path || path.includes("\0") || path.includes("\\") || path.startsWith("/")) return false;
  if (/^[A-Za-z]:/.test(path)) return false;
  return path
    .split("/")
    .every(
      (segment) =>
        segment !== "" && segment !== "." && segment !== ".." && segment.toLowerCase() !== ".git",
    );
}

export function assertRepoPath(path: string): string {
  if (!isRepoPath(path)) throw new Error(`Path is outside the repository: ${path}`);
  return path;
}

export async function git(
  shell: Shell,
  args: string[],
  allowExit: number[] = [0],
): Promise<{ stdout: string; code: number }> {
  const result = await shell.exec("git", [...GIT_CONFIG, ...args], { timeoutMs: RUN_LIMIT_MS });
  if (result.code !== null && allowExit.includes(result.code))
    return { stdout: result.stdout, code: result.code };
  throw new Error(`git ${args[0]} failed: ${result.output.trim().slice(0, 500)}`);
}

export type MergeState = {
  conflicted: ConflictedFile[];
  unsupported: Array<{ path: string; reason: string }>;
};

// With the head checked out and the base present, merge without committing
// and read each conflicted file as git saw it (stages 1, 2, 3 and the diff3
// working-tree text).
export async function mergeIntoHead(shell: Shell, revisions: Revisions): Promise<MergeState> {
  const at = (await git(shell, ["rev-parse", "HEAD"])).stdout.trim();
  if (at !== revisions.head) throw new Error(`Working copy is at ${at}, not the signed head`);
  await git(shell, ["merge", "--no-ff", "--no-commit", "--quiet", revisions.base], [0, 1]);
  const unmerged = (await git(shell, ["diff", "--name-only", "--diff-filter=U", "-z"])).stdout
    .split("\0")
    .filter(Boolean)
    .sort();

  const conflicted: ConflictedFile[] = [];
  const unsupported: Array<{ path: string; reason: string }> = [];
  for (const path of unmerged) {
    if (!isRepoPath(path)) {
      unsupported.push({ path, reason: "unexpected path" });
      continue;
    }
    const stage = async (n: 1 | 2 | 3) => {
      const result = await git(shell, ["show", `:${n}:${path}`], [0, 128]);
      return result.code === 0 ? result.stdout : null;
    };
    const [base, ours, theirs] = [await stage(1), await stage(2), await stage(3)];
    if (ours === null || theirs === null) {
      unsupported.push({ path, reason: "deleted on one side" });
      continue;
    }
    const merged = await shell.readText(path);
    if (merged === null) {
      unsupported.push({ path, reason: "missing from the working tree" });
      continue;
    }
    if ([base ?? "", ours, theirs, merged].some((text) => text.includes("\0"))) {
      unsupported.push({ path, reason: "binary file" });
      continue;
    }
    conflicted.push({ path, base: base ?? "", ours, theirs, merged });
  }
  return { conflicted, unsupported };
}

async function commitsBetween(shell: Shell, from: string, to: string): Promise<CommitInfo[]> {
  const { stdout } = await git(shell, [
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

export async function describeMerge(
  shell: Shell,
  revisions: Revisions,
  state: MergeState,
): Promise<PreparedMerge> {
  const base = (await git(shell, ["merge-base", revisions.head, revisions.base])).stdout.trim();
  return {
    revisions,
    mergeBase: base,
    conflicted: state.conflicted,
    unsupported: state.unsupported,
    commits: {
      ours: await commitsBetween(shell, base, revisions.head),
      theirs: await commitsBetween(shell, base, revisions.base),
    },
  };
}

// Write the proposal over exactly the conflicted files, then commit the merge
// locally. Nothing is pushed from a working copy.
export async function commitProposal(
  shell: Shell,
  revisions: Revisions,
  state: MergeState,
  files: ProposedFile[],
): Promise<AppliedProposal> {
  if (state.unsupported.length)
    throw new Error(
      `Unsupported conflicts: ${state.unsupported.map((u) => `${u.path} (${u.reason})`).join(", ")}`,
    );
  for (const file of files) assertRepoPath(file.path);
  const expected = state.conflicted.map((file) => file.path).sort();
  const written = files.map((file) => file.path).sort();
  if (written.join("\n") !== expected.join("\n")) {
    throw new Error(`The proposal must cover exactly the conflicted files: ${expected.join(", ")}`);
  }
  for (const file of files) await shell.writeText(file.path, file.content);
  await git(shell, ["add", "--", ...written]);
  const left = (await git(shell, ["diff", "--name-only", "--diff-filter=U"])).stdout.trim();
  if (left) throw new Error(`Still conflicted after writing: ${left}`);
  await git(shell, [
    "commit",
    "--no-verify",
    "--quiet",
    "-m",
    `Merge ${revisions.base.slice(0, 7)} (Merge Desk scratch copy)`,
  ]);
  const changedFiles = (await git(shell, ["diff", "--name-only", "HEAD^1", "HEAD"])).stdout
    .split("\n")
    .filter(Boolean);
  const patch = (await git(shell, ["diff", "--binary", "HEAD^1", "HEAD"])).stdout;
  const tree = (await git(shell, ["rev-parse", "HEAD^{tree}"])).stdout.trim();
  const landable = await landableChanges(shell);
  return { conflicted: state.conflicted, changedFiles, patch, tree, ...landable };
}

// Every file the merge commit changes against the head, with its new text and
// mode, so Land can rebuild exactly this tree on GitHub (and check the tree id
// matches). NUL-separated output, so unusual file names parse safely.
async function landableChanges(
  shell: Shell,
): Promise<{ changes: LandableChange[] | null; changesNote: string | null }> {
  const refuse = (changesNote: string) => ({ changes: null, changesNote });
  const fields = async (args: string[]) =>
    (await git(shell, args)).stdout.split("\0").filter((field) => field !== "");

  const numstat = await fields(["diff", "--numstat", "-z", "--no-renames", "HEAD^1", "HEAD"]);
  for (const entry of numstat)
    if (entry.startsWith("-\t-\t")) return refuse(`binary file: ${entry.slice(4)}`);

  const status = await fields(["diff", "--name-status", "-z", "--no-renames", "HEAD^1", "HEAD"]);
  const changed: Array<{ path: string; deleted: boolean }> = [];
  for (let i = 0; i + 1 < status.length; i += 2)
    changed.push({ path: assertRepoPath(status[i + 1]!), deleted: status[i] === "D" });

  const kept = changed.filter((file) => !file.deleted).map((file) => file.path);
  const modes = new Map<string, string>();
  if (kept.length)
    for (const entry of await fields(["ls-tree", "-z", "HEAD", "--", ...kept])) {
      const tab = entry.indexOf("\t");
      modes.set(entry.slice(tab + 1), entry.split(" ")[0]!);
    }

  const changes: LandableChange[] = [];
  let bytes = 0;
  for (const file of changed) {
    if (file.deleted) {
      changes.push({ path: file.path, mode: null, content: null });
      continue;
    }
    const mode = modes.get(file.path);
    if (mode !== "100644" && mode !== "100755")
      return refuse(`unsupported file type (${mode ?? "unknown"}): ${file.path}`);
    const content = await shell.readText(file.path);
    if (content === null) return refuse(`could not read ${file.path}`);
    bytes += Buffer.byteLength(content);
    if (bytes > MAX_LANDABLE_BYTES) return refuse("the change is larger than 2 MB");
    changes.push({ path: file.path, mode, content });
  }
  return { changes, changesNote: null };
}

// A syntax-only parse of TypeScript text. It never executes the candidate.
async function parseTypeScript(path: string, source: string): Promise<ParseResult> {
  const ts = await import("typescript");
  const output = ts.transpileModule(source, {
    fileName: path,
    reportDiagnostics: true,
    compilerOptions: { jsx: ts.JsxEmit.Preserve },
  });
  const errors = (output.diagnostics ?? []).map((d) =>
    ts.flattenDiagnosticMessageText(d.messageText, " "),
  );
  return errors.length
    ? {
        path,
        state: "failed",
        detail: `TypeScript ${ts.version}: ${errors.slice(0, 3).join("; ")}`.slice(0, 500),
      }
    : { path, state: "passed", detail: `TypeScript ${ts.version} syntax` };
}

export async function parseFiles(shell: Shell, paths: string[]): Promise<ParseResult[]> {
  const results: ParseResult[] = [];
  for (const path of paths) {
    assertRepoPath(path);
    const extension = extname(path);
    if ([".js", ".mjs", ".cjs"].includes(extension)) {
      const exit = await shell.exec("node", ["--check", path], { timeoutMs: 10_000 });
      results.push(
        exit.code === 0
          ? { path, state: "passed", detail: "node --check" }
          : {
              path,
              state: "failed",
              detail: `node --check: ${exit.output.trim().split("\n").slice(0, 4).join(" ")}`.slice(
                0,
                500,
              ),
            },
      );
    } else if ([".ts", ".tsx", ".mts", ".cts"].includes(extension)) {
      const source = await shell.readText(path);
      results.push(
        source === null
          ? { path, state: "not_run", detail: "file is missing" }
          : await parseTypeScript(path, source),
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

export async function runSuite(shell: Shell, changedFiles: string[]): Promise<TestResult> {
  const suite = chooseTestSuite(changedFiles);
  if (suite.id === "none")
    return { state: "not_run", suite: suite.label, exitCode: null, output: "", durationMs: 0 };
  if (suite.id === "app") {
    return {
      state: "not_run",
      suite: suite.label,
      exitCode: null,
      output:
        "The app's test suite runs only from the trusted dependency snapshot, which this runner does not have.",
      durationMs: 0,
    };
  }
  const started = Date.now();
  const exit = await shell.exec("node", ["--test"], { cwd: suite.cwd, timeoutMs: TEST_LIMIT_MS });
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
