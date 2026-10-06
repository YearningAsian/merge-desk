import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { CODE_ALLOWED_REPOS } from "@/server/env";
import { installationOctokit, splitRepo } from "@/server/github/app";
import { lockRef, readLock, releaseLock, withRefLock } from "@/server/github/lock";
import { loadLocalEnv } from "../scripts/lib/env.mts";

loadLocalEnv();

const REPO = CODE_ALLOWED_REPOS[0];

// The shared decision-record lock against the real repository: GitHub must
// accept a ref under refs/merge-desk/locks/, refuse a second create while it
// exists, refuse a release that names another writer's commit, and delete it
// when its own writer releases it. Uses a throwaway selftest-* name.
describe("GitHub record lock (live)", () => {
  it("takes, contends, refuses a foreign release and frees a refs/merge-desk/locks/ ref", async () => {
    const octokit = await installationOctokit(REPO, { contents: "write" });
    const { owner, name: repoName } = splitRepo(REPO);
    const name = `selftest-${randomUUID().slice(0, 8)}`;
    const ref = lockRef(name);
    const main = (await octokit.git.getRef({ owner, repo: repoName, ref: "heads/main" })).data
      .object.sha;
    let inside: string | null = null;
    const started = Date.now();
    try {
      const result = await withRefLock(
        octokit,
        { repo: REPO, name, scope: "live lock test", holder: "live-test", waitMs: 0 },
        async () => {
          inside = await readLock(octokit, REPO, ref);
          expect(inside).toMatch(/^[0-9a-f]{40}$/);
          const commit = await octokit.git.getCommit({
            owner,
            repo: repoName,
            commit_sha: inside!,
          });
          expect(commit.data.message).toMatch(/^Merge Desk decision-record lock\n/);
          expect(commit.data.parents).toEqual([]);

          // A second writer can't create the same ref.
          const second = await octokit.git
            .createRef({ owner, repo: repoName, ref, sha: main })
            .then(
              () => null,
              (error: { status?: number }) => error.status,
            );
          expect(second).toBe(422);
          expect(await readLock(octokit, REPO, ref)).toBe(inside);

          // A release naming another commit leaves the lock in place.
          await releaseLock(octokit, REPO, ref, main);
          expect(await readLock(octokit, REPO, ref)).toBe(inside);
          return { ok: true as const };
        },
      );
      expect(result).toEqual({ ok: true });
      expect(await readLock(octokit, REPO, ref)).toBeNull();
      console.log(`lock ${ref}: taken, contended and released in ${Date.now() - started} ms`);
    } finally {
      // Test-only cleanup if an assertion failed while the lock was held.
      if ((await readLock(octokit, REPO, ref).catch(() => null)) !== null)
        await octokit.git.deleteRef({ owner, repo: repoName, ref: ref.slice("refs/".length) });
    }
  });
});
