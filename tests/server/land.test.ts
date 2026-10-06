import type { Octokit } from "@octokit/rest";
import { describe, expect, it, vi } from "vitest";
import type { RunRecord } from "@/core/run";
import { LandError, landMerge, landMessage } from "@/server/github/land";

const head = "a".repeat(40);
const base = "b".repeat(40);
const checkedTree = "c".repeat(40);
const mergeCommit = "d".repeat(40);
const repositoryId = "R_merge_desk";
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

type MutationVariables = {
  input: {
    repositoryId: string;
    clientMutationId: string;
    refUpdates: {
      name: string;
      beforeOid: string;
      afterOid: string;
      force: boolean;
    }[];
  };
  request?: { signal?: AbortSignal };
};

// Model GitHub's documented expected-old-ref check as well as the old REST
// fast-forward behavior. An ancestor reset is still a valid fast-forward to
// the new merge, so force:false alone cannot protect the original head.
function fakeGitHub(
  options: {
    tree?: string;
    currentHead?: string;
    afterCommit?: () => void;
    graphql?: (query: string, variables: MutationVariables) => Promise<unknown>;
  } = {},
) {
  let currentHead = options.currentHead ?? head;
  const git = {
    getCommit: vi.fn(async () => ({ data: { tree: { sha: "head-tree" } } })),
    createTree: vi.fn(async () => ({ data: { sha: options.tree ?? checkedTree } })),
    createCommit: vi.fn(async () => {
      options.afterCommit?.();
      return { data: { sha: mergeCommit } };
    }),
    updateRef: vi.fn(async () => {
      currentHead = mergeCommit;
      return { data: {} };
    }),
  };
  const graphql = vi.fn(
    options.graphql ??
      (async (_query: string, variables: MutationVariables) => {
        const update = variables.input.refUpdates[0]!;
        if (update.beforeOid !== currentHead)
          throw Object.assign(new Error("The expected old value is no longer current."), {
            name: "GraphqlResponseError",
            data: { updateRefs: null },
            errors: [{ message: "The ref update was rejected.", path: ["updateRefs"] }],
          });
        currentHead = update.afterOid;
        return { updateRefs: { clientMutationId: variables.input.clientMutationId } };
      }),
  );
  return {
    octokit: { git, graphql } as unknown as Octokit,
    git,
    graphql,
    currentHead: () => currentHead,
  };
}

const input = () => ({
  repo: record.repo,
  repositoryId,
  record,
  refs: { head: "demo/clean/rename", base: "demo/base" },
  author: { name: "YearningAsian", email: "1+YearningAsian@users.noreply.github.com" },
  committer: { name: "merge-desk[bot]", email: "2+merge-desk[bot]@users.noreply.github.com" },
  login: "YearningAsian",
});

describe("landMerge", () => {
  it("rebuilds the checked tree, commits [head, base] and atomically updates only the expected head", async () => {
    const { octokit, git, graphql, currentHead } = fakeGitHub();
    expect(await landMerge(octokit, input())).toEqual({ commit: mergeCommit });
    expect(currentHead()).toBe(mergeCommit);
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
    expect(graphql).toHaveBeenCalledWith(
      expect.stringMatching(/updateRefs\(input:\s*\$input\)/),
      expect.objectContaining({
        input: {
          repositoryId,
          clientMutationId: expect.any(String),
          refUpdates: [
            {
              name: "refs/heads/demo/clean/rename",
              beforeOid: head,
              afterOid: mergeCommit,
              force: false,
            },
          ],
        },
      }),
    );
    expect(graphql).toHaveBeenCalledOnce();
    expect(git.updateRef).not.toHaveBeenCalled();
  });

  it("moves nothing when GitHub's tree isn't the one that was checked", async () => {
    const { octokit, git, graphql, currentHead } = fakeGitHub({ tree: "e".repeat(40) });
    await expect(landMerge(octokit, input())).rejects.toMatchObject({
      outcome: "REFUSED",
    });
    expect(git.createCommit).not.toHaveBeenCalled();
    expect(git.updateRef).not.toHaveBeenCalled();
    expect(graphql).not.toHaveBeenCalled();
    expect(currentHead()).toBe(head);
  });

  it("does not move an ancestor-reset head even though REST force:false would allow that fast-forward", async () => {
    const ancestor = "f".repeat(40);
    const { octokit, git, graphql, currentHead } = fakeGitHub({ currentHead: ancestor });
    await expect(landMerge(octokit, input())).rejects.toMatchObject({ outcome: "UNKNOWN" });
    expect(currentHead()).toBe(ancestor);
    expect(graphql).toHaveBeenCalledOnce();
    expect(git.updateRef).not.toHaveBeenCalled();
  });

  it("is UNKNOWN, never landed, when GitHub doesn't confirm the update", async () => {
    const { octokit, graphql } = fakeGitHub({
      graphql: async () => {
        throw Object.assign(new Error("socket hang up"), { status: undefined });
      },
    });
    await expect(landMerge(octokit, input())).rejects.toMatchObject({
      outcome: "UNKNOWN",
    });
    expect(graphql).toHaveBeenCalledOnce();
  });

  it.each([
    ["missing result", undefined],
    ["null result", null],
    ["missing update", {}],
    ["null update", { updateRefs: null }],
    ["missing correlation", { updateRefs: {} }],
    ["wrong correlation", { updateRefs: { clientMutationId: "another-attempt" } }],
    ["wrong payload type", { updateRefs: "confirmed" }],
  ])("is UNKNOWN for %s and never retries the mutation", async (_name, response) => {
    const { octokit, graphql, git } = fakeGitHub({ graphql: async () => response });
    await expect(landMerge(octokit, input())).rejects.toMatchObject({ outcome: "UNKNOWN" });
    expect(graphql).toHaveBeenCalledOnce();
    expect(git.updateRef).not.toHaveBeenCalled();
  });

  it("keeps a GraphQL error with partial confirmation UNKNOWN without revealing provider messages", async () => {
    const { octokit, graphql } = fakeGitHub({
      graphql: async (_query, variables) => {
        throw Object.assign(new Error("sensitive provider details"), {
          name: "GraphqlResponseError",
          errors: [{ message: "sensitive provider details" }],
          data: { updateRefs: { clientMutationId: variables.input.clientMutationId } },
        });
      },
    });
    const error = await landMerge(octokit, input()).catch((caught: LandError) => caught);
    expect(error).toBeInstanceOf(LandError);
    expect(error).toMatchObject({ outcome: "UNKNOWN" });
    expect((error as LandError).message).not.toContain("sensitive provider details");
    expect(graphql).toHaveBeenCalledOnce();
  });

  it("reports an explicit HTTP rejection as REFUSED without revealing provider messages", async () => {
    const { octokit, graphql } = fakeGitHub({
      graphql: async () => {
        throw Object.assign(new Error("sensitive provider details"), { status: 403 });
      },
    });
    const error = await landMerge(octokit, input()).catch((caught: LandError) => caught);
    expect(error).toMatchObject({ outcome: "REFUSED" });
    expect((error as LandError).message).not.toContain("sensitive provider details");
    expect(graphql).toHaveBeenCalledOnce();
  });

  it("uses a distinct mutation correlation for each Land attempt", async () => {
    const first = fakeGitHub();
    const second = fakeGitHub();
    await landMerge(first.octokit, input());
    await landMerge(second.octokit, input());
    expect(first.graphql).toHaveBeenCalledOnce();
    expect(second.graphql).toHaveBeenCalledOnce();
    expect(first.graphql.mock.calls[0]![1].input.clientMutationId).toEqual(expect.any(String));
    expect(first.graphql.mock.calls[0]![1].input.clientMutationId).not.toBe(
      second.graphql.mock.calls[0]![1].input.clientMutationId,
    );
  });

  it("keeps a resolved error envelope UNKNOWN even with this attempt's correlation", async () => {
    const { octokit, graphql } = fakeGitHub({
      graphql: async (_query, variables) => ({
        updateRefs: { clientMutationId: variables.input.clientMutationId },
        errors: [{ message: "provider details" }],
      }),
    });
    await expect(landMerge(octokit, input())).rejects.toMatchObject({ outcome: "UNKNOWN" });
    expect(graphql).toHaveBeenCalledOnce();
  });

  it("refuses an already aborted attempt before GitHub work starts", async () => {
    const controller = new AbortController();
    controller.abort();
    const onRefUpdate = vi.fn();
    const { octokit, git, graphql } = fakeGitHub();
    await expect(
      landMerge(octokit, { ...input(), signal: controller.signal, onRefUpdate }),
    ).rejects.toMatchObject({ outcome: "REFUSED" });
    expect(git.getCommit).not.toHaveBeenCalled();
    expect(git.createTree).not.toHaveBeenCalled();
    expect(git.createCommit).not.toHaveBeenCalled();
    expect(graphql).not.toHaveBeenCalled();
    expect(onRefUpdate).not.toHaveBeenCalled();
  });

  it("does not begin the ref update if the deadline expires during commit creation", async () => {
    const controller = new AbortController();
    const onRefUpdate = vi.fn();
    const { octokit, graphql, currentHead } = fakeGitHub({
      afterCommit: () => controller.abort(),
    });
    await expect(
      landMerge(octokit, { ...input(), signal: controller.signal, onRefUpdate }),
    ).rejects.toMatchObject({ outcome: "REFUSED" });
    expect(graphql).not.toHaveBeenCalled();
    expect(currentHead()).toBe(head);
    expect(onRefUpdate).not.toHaveBeenCalled();
  });

  it("passes the request signal to GitHub and marks the ref attempt immediately before sending it", async () => {
    const controller = new AbortController();
    const onRefUpdate = vi.fn();
    const { octokit, git, graphql } = fakeGitHub({
      graphql: async (_query, variables) => {
        expect(onRefUpdate).toHaveBeenCalledOnce();
        return { updateRefs: { clientMutationId: variables.input.clientMutationId } };
      },
    });
    await landMerge(octokit, { ...input(), signal: controller.signal, onRefUpdate });
    for (const call of [git.getCommit, git.createTree, git.createCommit])
      expect(call).toHaveBeenCalledWith(
        expect.objectContaining({ request: { signal: controller.signal } }),
      );
    expect(graphql).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ request: { signal: controller.signal } }),
    );
  });

  it("keeps an abort after the ref attempt UNKNOWN and never retries", async () => {
    const controller = new AbortController();
    const onRefUpdate = vi.fn();
    const { octokit, graphql } = fakeGitHub({
      graphql: async () => {
        controller.abort();
        controller.signal.throwIfAborted();
      },
    });
    await expect(
      landMerge(octokit, { ...input(), signal: controller.signal, onRefUpdate }),
    ).rejects.toMatchObject({ outcome: "UNKNOWN" });
    expect(onRefUpdate).toHaveBeenCalledOnce();
    expect(graphql).toHaveBeenCalledOnce();
  });
});

// Review round 1, L1: model text stays on one line of the commit message.
describe("landMessage", () => {
  it("keeps the description on one line, so it can't add trailers", () => {
    const message = landMessage(
      { ...record, description: "x\n\nCo-authored-by: Someone <someone@example.com>" },
      { head: "demo/clean/rename", base: "demo/base" },
      "YearningAsian",
    );
    expect(message.split("\n")).toHaveLength(5);
    expect(message).not.toMatch(/^Co-authored-by/m);
  });
});
