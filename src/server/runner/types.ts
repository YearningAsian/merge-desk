// A runner prepares merges and runs checks on a throwaway copy of the
// repository. LocalRunner uses a temp folder on this machine (trusted manual
// runs only); SandboxRunner (slice 2) uses an isolated cloud VM.

export type Revisions = { head: string; base: string };

export type ConflictedFile = {
  path: string;
  base: string;
  ours: string;
  theirs: string;
  merged: string; // diff3-style conflict output
};

export type CommitInfo = {
  sha: string;
  author: string;
  date: string;
  subject: string;
  files: string[];
};

export type PreparedMerge = {
  revisions: Revisions;
  mergeBase: string;
  conflicted: ConflictedFile[];
  unsupported: Array<{ path: string; reason: string }>;
  commits: { ours: CommitInfo[]; theirs: CommitInfo[] };
};

export type ProposedFile = { path: string; content: string };

// One file the merge changes against the head: its new text and mode, or
// null content for a deletion. Land rebuilds the same tree from these.
export type LandableChange = {
  path: string;
  mode: "100644" | "100755" | null;
  content: string | null;
};

export type AppliedProposal = {
  conflicted: ConflictedFile[];
  changedFiles: string[]; // the local merge commit compared with the head
  patch: string; // `git apply`-able diff of the merge against the head
  tree: string; // the merge commit's tree id (content-addressed)
  // Null when the change set can't be carried as text (binary, symlink,
  // submodule or too large); Land then refuses and the patch remains.
  changes: LandableChange[] | null;
  changesNote: string | null;
};

export type ParseResult = { path: string; state: "passed" | "failed" | "not_run"; detail: string };

export type TestResult = {
  state: "passed" | "failed" | "not_run";
  suite: string;
  exitCode: number | null;
  output: string;
  durationMs: number;
};

export interface Runner {
  prepareMerge(revisions: Revisions): Promise<PreparedMerge>;
  applyProposal(revisions: Revisions, files: ProposedFile[]): Promise<AppliedProposal>;
  parseCheck(paths: string[]): Promise<ParseResult[]>;
  runTests(changedFiles: string[]): Promise<TestResult>;
  dispose(): Promise<void>;
}
