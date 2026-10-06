import { describe, expect, it } from "vitest";
import type { RunRecord } from "@/core/run";
import { checkLand, chooseTestSuite, type LandInput } from "@/server/guard";

describe("chooseTestSuite", () => {
  it("runs the dependency-free playground suite when every changed file is under playground/", () => {
    expect(chooseTestSuite(["playground/src/api.js", "playground/test/retry.test.js"])).toEqual({
      id: "playground",
      cwd: "playground",
      command: ["node", "--test"],
      label: "node --test (playground)",
    });
  });

  it("runs the app's unit tests when anything outside playground/ changed", () => {
    expect(chooseTestSuite(["playground/src/api.js", "src/core/honor.ts"]).id).toBe("app");
  });

  it("does not treat a look-alike path as the playground", () => {
    expect(chooseTestSuite(["playground-old/src/api.js"]).id).toBe("app");
    expect(chooseTestSuite(["playground/../src/core/honor.ts"]).id).toBe("app");
  });

  it("refuses to choose when nothing changed", () => {
    expect(chooseTestSuite([]).id).toBe("none");
  });
});

describe("checkLand", () => {
  const head = "a".repeat(40);
  const base = "b".repeat(40);
  const record: RunRecord = {
    v: 1,
    repo: "YearningAsian/merge-desk",
    pr: 1,
    verdict: "VERIFIED",
    option: "combine",
    drops: null,
    revisions: { head, base },
    tree: "c".repeat(40),
    changes: [{ path: "playground/src/api.js", mode: "100644", content: "x" }],
    changesNote: null,
    description: null,
    reason: null,
    summary: [],
    checks: [],
    analysisModel: "m",
    proposeModel: "m",
    steer: null,
    finishedAt: "2026-10-05T12:00:00.000Z",
  };
  const input: LandInput = {
    login: "YearningAsian",
    repo: "YearningAsian/merge-desk",
    defaultBranch: "main",
    pull: {
      state: "open",
      head: { ref: "demo/clean/rename", sha: head, repo: "YearningAsian/merge-desk" },
      base: { ref: "demo/base", sha: base },
    },
    record,
  };
  const reason = (overrides: Partial<LandInput>) => {
    const result = checkLand({ ...input, ...overrides });
    return result.ok ? "ok" : result.reason;
  };
  const pull = (patch: Partial<LandInput["pull"]>) => ({ pull: { ...input.pull, ...patch } });
  const withRecord = (patch: Partial<RunRecord>) => ({ record: { ...record, ...patch } });

  it("lets a verified merge land on a demo pull request's own branch", () => {
    expect(reason({})).toBe("ok");
  });

  it("refuses another account or repository", () => {
    expect(reason({ login: "someone-else" })).toMatch(/can't use live mode/);
    expect(reason({ repo: "someone/else" })).toMatch(/repository isn't allowed/);
  });

  it("refuses a held run", () => {
    expect(reason(withRecord({ verdict: "HELD" }))).toMatch(/was held/);
  });

  it("refuses a closed pull request and a fork branch", () => {
    expect(reason(pull({ state: "closed" }))).toMatch(/closed/);
    expect(reason(pull({ head: { ...input.pull.head, repo: "fork/merge-desk" } }))).toBe(
      "Can't land: this branch lives in a fork.",
    );
  });

  it("refuses main, the default branch and the base branch", () => {
    const branch = (ref: string) => pull({ head: { ...input.pull.head, ref } });
    expect(reason(branch("main"))).toMatch(/^Can't land on main/);
    expect(reason({ ...branch("trunk"), defaultBranch: "trunk" })).toMatch(/^Can't land on trunk/);
    expect(
      reason({
        ...branch("demo/x"),
        pull: {
          ...input.pull,
          head: { ...input.pull.head, ref: "demo/x" },
          base: { ...input.pull.base, ref: "demo/x" },
        },
      }),
    ).toMatch(/also the pull request's base/);
  });

  it("refuses branches outside demo/* while the write scope is demo-only", () => {
    expect(reason(pull({ head: { ...input.pull.head, ref: "feat/land" } }))).toMatch(
      /writes only demo\/\* branches/,
    );
  });

  it("refuses a moved head or a moved base", () => {
    expect(reason(pull({ head: { ...input.pull.head, sha: "d".repeat(40) } }))).toMatch(/changed/);
    expect(reason(pull({ base: { ...input.pull.base, sha: "d".repeat(40) } }))).toMatch(/changed/);
  });

  it("refuses CI workflow files, odd paths and a merge it couldn't capture", () => {
    const change = (path: string) =>
      withRecord({ changes: [{ path, mode: "100644", content: "x" }] });
    expect(reason(change(".github/workflows/ci.yml"))).toBe(
      "This merge changes CI workflow files; resolve it locally or on GitHub.",
    );
    expect(reason(change("../outside.js"))).toMatch(/isn't a valid path/);
    expect(reason(withRecord({ changes: null, changesNote: "binary file: logo.png" }))).toMatch(
      /binary file: logo.png/,
    );
    expect(reason(withRecord({ changes: [] }))).toMatch(/changes nothing/);
  });
});
