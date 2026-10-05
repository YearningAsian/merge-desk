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

export type AppliedProposal = {
  conflicted: ConflictedFile[];
  changedFiles: string[]; // the local merge commit compared with the head
  patch: string; // `git apply`-able diff of the merge against the head
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
