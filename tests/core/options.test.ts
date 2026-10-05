import { describe, expect, it } from "vitest";
import { olderSide, resolveOptions, type Commit, type ModelAnalysis } from "@/core/options";

const API = "playground/src/api.js";
const commit = (sha: string, author: string, date: string, files: string[]): Commit => ({
  sha: sha.repeat(40),
  author,
  date,
  subject: `commit ${sha}`,
  files,
});

const commits = {
  ours: [
    commit("a", "Ana", "2026-10-05T10:00:00Z", [API, "playground/test/api.test.js"]),
    commit("b", "Ana", "2026-10-05T11:00:00Z", ["README.md"]),
  ],
  theirs: [commit("c", "Teo", "2026-10-05T09:00:00Z", [API, "playground/test/retry.test.js"])],
};

const model = (overrides: Partial<ModelAnalysis["options"][number]>[] = []) =>
  [
    { kind: "combine", summary: "getUser with the retry", recommended: true, reason: "Both fit." },
    { kind: "keep_ours", summary: "getUser, no retry", recommended: false, reason: "" },
    {
      kind: "keep_theirs",
      summary: "fetchUser with retry",
      recommended: false,
      reason: "Pick it if callers still use fetchUser.",
    },
  ].map((option, i) => ({ ...option, ...overrides[i] })) as ModelAnalysis["options"];

describe("resolveOptions", () => {
  it("fills keeps and drops from git, not from the model", () => {
    const result = resolveOptions(model(), { commits, conflictedPaths: [API] });
    if (!result.ok) throw new Error(result.reason);
    const [combine, keepOurs, keepTheirs] = result.options;
    expect(combine!.drops).toBeNull();
    expect(combine!.keeps.map((side) => side.side)).toEqual(["ours", "theirs"]);
    expect(keepOurs!.label).toBe("Keep ours, drop theirs");
    expect(keepOurs!.drops).toEqual({
      side: "theirs",
      commits: [{ sha: "c".repeat(40), subject: "commit c", author: "Teo" }],
      files: [API],
      authors: ["Teo"],
    });
    // Only commits that touched a conflicted file count as dropped work.
    expect(keepTheirs!.drops!.commits.map((c) => c.sha[0])).toEqual(["a"]);
    // Every option keeps its own reason; an empty one shows nothing.
    expect(combine!.reason).toBe("Both fit.");
    expect(keepTheirs!.reason).toBe("Pick it if callers still use fetchUser.");
    expect(keepOurs!.reason).toBeNull();
  });

  it("rejects no recommendation, two recommendations, an empty reason or repeated kinds", () => {
    const context = { commits, conflictedPaths: [API] };
    expect(resolveOptions(model([{ recommended: false }]), context).ok).toBe(false);
    expect(
      resolveOptions(model([{}, { recommended: true, reason: "also" }]), context),
    ).toMatchObject({ ok: false, reason: expect.stringContaining("Exactly one") });
    expect(resolveOptions(model([{ reason: "  " }]), context)).toMatchObject({
      ok: false,
      reason: expect.stringContaining("no reason"),
    });
    expect(resolveOptions(model([{}, { kind: "combine" }]), context)).toMatchObject({
      ok: false,
      reason: expect.stringContaining("same kind"),
    });
  });
});

describe("olderSide", () => {
  it("names the side whose latest commit is older by more than a day", () => {
    const old = {
      ours: [commit("a", "Ana", "2026-10-01T10:00:00Z", [API])],
      theirs: [commit("c", "Teo", "2026-10-05T10:00:00Z", [API])],
    };
    expect(olderSide(old)).toEqual({ side: "ours", byMs: 4 * 24 * 60 * 60 * 1000 });
  });

  it("names nothing within a day or when a side has no commits", () => {
    expect(olderSide(commits)).toBeNull();
    expect(olderSide({ ours: [], theirs: commits.theirs })).toBeNull();
  });
});
