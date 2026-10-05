import { extname } from "node:path";
import { truncateLog } from "@/core/events";
import { isRepoPath } from "@/core/paths";
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

export type WorkspaceIntegrity = {
  head: string;
  tree: string;
  index: string;
  bytes: string;
};

// This program comes from the server, never from the candidate repository.
// Hash raw bytes (including untracked/ignored files), not Git's stat cache:
// assume-unchanged, skip-worktree and matching timestamps cannot hide a write.
// Only executable mode bits belong to this fingerprint, so making the sandbox
// root-owned and read-only does not change the captured source identity.
const WORKSPACE_BYTES = String.raw`
const fs = require("node:fs");
const path = require("node:path");
const { createHash } = require("node:crypto");
const root = process.cwd();
const hash = createHash("sha256");
let entries = 0;
let bytes = 0;
function visit(relative) {
  if (++entries > 50000) throw new Error("Source integrity manifest is too large");
  const full = path.join(root, relative);
  const stat = fs.lstatSync(full);
  if (stat.isSymbolicLink() || (!stat.isFile() && !stat.isDirectory()))
    throw new Error("Source integrity cannot check symbolic links or special files: " + relative);
  hash.update(JSON.stringify([relative, stat.isDirectory() ? "directory" : "file", stat.mode & 0o111]) + "\n");
  if (stat.isDirectory()) {
    for (const name of fs.readdirSync(full).sort()) visit(path.join(relative, name));
  } else {
    bytes += stat.size;
    if (bytes > 100000000) throw new Error("Source integrity manifest exceeds the byte limit");
    const contents = fs.readFileSync(full);
    hash.update(String(contents.length) + "\0");
    hash.update(contents);
  }
}
for (const name of fs.readdirSync(root).sort()) if (name !== ".git") visit(name);
for (const name of ["HEAD", "config", "index"]) visit(path.join(".git", name));
process.stdout.write(hash.digest("hex"));
`;

export async function captureWorkspaceIntegrity(
  shell: Shell,
  expectedTree?: string,
): Promise<WorkspaceIntegrity> {
  const head = (await git(shell, ["rev-parse", "HEAD"])).stdout.trim();
  const tree = (await git(shell, ["rev-parse", "HEAD^{tree}"])).stdout.trim();
  const index = (await git(shell, ["write-tree"])).stdout.trim();
  if (![head, tree, index].every((value) => SHA.test(value)) || tree !== index)
    throw new Error("The captured HEAD, tree or index is uncertain");
  if (expectedTree && tree !== expectedTree)
    throw new Error("The workspace no longer matches the captured merge tree");
  const result = await shell.exec("node", ["-e", WORKSPACE_BYTES], { timeoutMs: TEST_LIMIT_MS });
  const bytes = result.stdout.trim();
  if (result.code !== 0 || result.timedOut || !/^[0-9a-f]{64}$/.test(bytes))
    throw new Error(`Could not read source integrity: ${result.output.trim().slice(0, 500)}`);
  return { head, tree, index, bytes };
}

async function assertWorkspaceIntegrity(shell: Shell, expected: WorkspaceIntegrity | null) {
  if (!expected) throw new Error("No captured source integrity is available");
  const actual = await captureWorkspaceIntegrity(shell, expected.tree);
  if (
    actual.head !== expected.head ||
    actual.index !== expected.index ||
    actual.bytes !== expected.bytes
  )
    throw new Error("The source or Git state changed after the checks captured it");
}

// Endpoint comparison is useful evidence for the trusted local fallback.
// It cannot detect a write-and-restore during execution. The public sandbox
// additionally prevents the test UID from writing the captured checkout.
export async function runCheckedSuite(
  trusted: Shell,
  candidate: Shell,
  changedFiles: string[],
  expected: WorkspaceIntegrity | null,
): Promise<TestResult> {
  let result: TestResult | undefined;
  try {
    await assertWorkspaceIntegrity(trusted, expected);
    result = await runSuite(candidate, changedFiles);
    await assertWorkspaceIntegrity(trusted, expected);
    return result;
  } catch (error) {
    const note = `Source integrity check failed: ${error instanceof Error ? error.message : "unknown integrity result"}`;
    return {
      state: "failed",
      suite: result?.suite ?? chooseTestSuite(changedFiles).label,
      exitCode: result?.exitCode ?? null,
      output: truncateLog(`${result?.output ?? ""}\n${note}`),
      durationMs: result?.durationMs ?? 0,
    };
  }
}

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

export { isRepoPath };

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
