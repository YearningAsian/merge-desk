import { describe, expect, it } from "vitest";
import { readRepo } from "../helpers/scenarios";
import { DemoConfig, planBranchWrites, resetPlan, seedTagName } from "@/core/demo";

const config = DemoConfig.parse(JSON.parse(readRepo("demo/scenarios/scenarios.json")));

describe("demo scenarios config", () => {
  it("keeps every demo branch under demo/ and every title prefixed [Demo]", () => {
    expect(config.base).toBe("demo/base");
    for (const scenario of config.scenarios) {
      expect(scenario.title.startsWith("[Demo] ")).toBe(true);
      expect(scenario.ours.branch.startsWith("demo/")).toBe(true);
      expect(scenario.theirs.branch.startsWith("demo/")).toBe(true);
    }
  });

  it("rejects a config that points a scenario at a non-demo branch", () => {
    const bad = structuredClone(config);
    bad.scenarios[0]!.ours.branch = "main";
    expect(DemoConfig.safeParse(bad).success).toBe(false);
  });

  it("rejects a title without the [Demo] prefix", () => {
    const bad = structuredClone(config);
    bad.scenarios[0]!.title = "Rename fetchUser";
    expect(DemoConfig.safeParse(bad).success).toBe(false);
  });
});

describe("planBranchWrites: every branch write is checked before any write happens", () => {
  it("accepts a plan of demo branches", () => {
    const plan = planBranchWrites([
      { branch: "demo/base", sha: "a".repeat(40) },
      { branch: "refs/heads/demo/clean/rename", sha: "b".repeat(40) },
    ]);
    expect(plan.map((write) => write.branch)).toEqual(["demo/base", "demo/clean/rename"]);
  });

  it("refuses the whole plan when any branch is not a demo branch", () => {
    expect(() =>
      planBranchWrites([
        { branch: "demo/base", sha: "a".repeat(40) },
        { branch: "main", sha: "b".repeat(40) },
      ]),
    ).toThrow(/only demo\/\* branches.*main/);
  });

  it("refuses a malformed commit id", () => {
    expect(() => planBranchWrites([{ branch: "demo/base", sha: "HEAD" }])).toThrow(/commit/);
  });
});

describe("resetPlan", () => {
  const tags = new Map<string, string>();
  tags.set(seedTagName("base"), "0".repeat(40));
  for (const [i, scenario] of config.scenarios.entries()) {
    tags.set(seedTagName(scenario.id, "ours"), `${i}1`.padEnd(40, "1"));
    tags.set(seedTagName(scenario.id, "theirs"), `${i}2`.padEnd(40, "2"));
  }

  it("restores demo/base and every scenario branch from its seed tag", () => {
    const plan = resetPlan(config, tags);
    expect(plan).toHaveLength(7);
    expect(plan[0]).toEqual({ branch: "demo/base", sha: "0".repeat(40) });
    expect(plan.find((write) => write.branch === "demo/clean/rename")?.sha).toBe(
      tags.get("demo-seed/clean/ours"),
    );
  });

  it("refuses when a seed tag is missing instead of guessing", () => {
    const partial = new Map(tags);
    partial.delete("demo-seed/held/theirs");
    expect(() => resetPlan(config, partial)).toThrow(/demo-seed\/held\/theirs/);
  });
});
