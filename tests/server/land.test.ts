import type { Octokit } from "@octokit/rest";
import { describe, expect, it, vi } from "vitest";
import type { RunRecord } from "@/core/run";
import { LandError, landMerge } from "@/server/github/land";

const head = "a".repeat(40);
const base = "b".repeat(40);
const checkedTree = "c".repeat(40);
const record: RunRecord = {
  v: 1,
  repo: "YearningAsian/merge-desk",
  pr: 1,
  verdict: "VERIFIED",
  option: "combine",
  drops: null,
  revisions: { head, base },
  tree: checkedTree,
  changes: [
    { path: "playground/src/api.js", mode: "100644", content: "export const x = 1;\n" },
    { path: "playground/old.js", mode: null, content: null },
  ],
  changesNote: null,
  description: "kept both",
  reason: null,
  summary: [],
  checks: [],
  analysisModel: "m",
  proposeModel: "m",
  steer: null,
  finishedAt: "2026-10-05T12:00:00.000Z",
};

// A stand-in for the few Git Data API calls Land makes.
function fakeGitHub(options: { tree?: string; updateRef?: () => Promise<unknown> } = {}) {
  const git = {
    getCommit: vi.fn(async () => ({ data: { tree: { sha: "head-tree" } } })),
    createTree: vi.fn(async () => ({ data: { sha: options.tree ?? checkedTree } })),
    createCommit: vi.fn(async () => ({ data: { sha: "d".repeat(40) } })),
    updateRef: vi.fn(options.updateRef ?? (async () => ({ data: {} }))),
  };
  return { octokit: { git } as unknown as Octokit, git };
}

const input = () => ({
  repo: record.repo,
  record,
  refs: { head: "demo/clean/rename", base: "demo/base" },
  author: { name: "YearningAsian", email: "1+YearningAsian@users.noreply.github.com" },
  committer: { name: "merge-desk[bot]", email: "2+merge-desk[bot]@users.noreply.github.com" },
  login: "YearningAsian",
});

describe("landMerge", () => {
  it("rebuilds the tree on the head, commits [head, base] and fast-forwards the branch", async () => {
    const { octokit, git } = fakeGitHub();
    expect(await landMerge(octokit, input())).toEqual({ commit: "d".repeat(40) });
    expect(git.createTree).toHaveBeenCalledWith(
      expect.objectContaining({
        base_tree: "head-tree",
        tree: [
          {
            path: "playground/src/api.js",
            mode: "100644",
            type: "blob",
            content: "export const x = 1;\n",
          },
          { path: "playground/old.js", mode: "100644", type: "blob", sha: null },
        ],
      }),
    );
    expect(git.createCommit).toHaveBeenCalledWith(
      expect.objectContaining({ tree: checkedTree, parents: [head, base] }),
    );
    expect(git.updateRef).toHaveBeenCalledWith(
      expect.objectContaining({ ref: "heads/demo/clean/rename", force: false }),
    );
  });

  it("moves nothing when GitHub's tree isn't the one that was checked", async () => {
    const { octokit, git } = fakeGitHub({ tree: "e".repeat(40) });
    await expect(landMerge(octokit, input())).rejects.toMatchObject({
      outcome: "REFUSED",
    });
    expect(git.createCommit).not.toHaveBeenCalled();
    expect(git.updateRef).not.toHaveBeenCalled();
  });

  it("is REFUSED when someone pushed after the run", async () => {
    const { octokit } = fakeGitHub({
      updateRef: async () => {
        throw Object.assign(new Error("Update is not a fast forward"), { status: 422 });
      },
    });
    const error = await landMerge(octokit, input()).catch((e: LandError) => e);
    expect(error).toBeInstanceOf(LandError);
    expect(error).toMatchObject({ outcome: "REFUSED" });
    expect((error as LandError).message).toMatch(/pushed to the branch/);
  });

  it("is UNKNOWN, never landed, when GitHub doesn't confirm the update", async () => {
    const { octokit } = fakeGitHub({
      updateRef: async () => {
        throw Object.assign(new Error("socket hang up"), { status: undefined });
      },
    });
    await expect(landMerge(octokit, input())).rejects.toMatchObject({
      outcome: "UNKNOWN",
    });
  });
});
