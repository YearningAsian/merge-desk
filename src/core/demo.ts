import { z } from "zod";
import { checkWritableBranch } from "./scope";

// The seeded demo conflicts and the only branch writes the seed and reset
// scripts may make. Every write in a plan is checked before any is made.

const DemoBranch = z.string().refine((branch) => checkWritableBranch(branch, "demo-only").ok, {
  message: "Demo branches must be demo/* branches",
});

const Side = z.object({
  branch: DemoBranch,
  intent: z.string().min(1),
  commit: z.string().min(1),
});

export const DemoConfig = z.object({
  label: z.literal("demo"),
  base: DemoBranch,
  scenarios: z
    .array(
      z.object({
        id: z.enum(["clean", "held", "drop"]),
        title: z.string().startsWith("[Demo] "),
        conflicted: z.array(z.string().min(1)).min(1),
        defaultOption: z.enum(["combine", "keep_ours", "keep_theirs"]),
        theirs: Side,
        ours: Side,
      }),
    )
    .length(3),
});
export type DemoConfig = z.infer<typeof DemoConfig>;

export type BranchWrite = { branch: string; sha: string };

const SHA = /^[0-9a-f]{40}$/;

export function planBranchWrites(writes: BranchWrite[]): BranchWrite[] {
  return writes.map(({ branch, sha }) => {
    const check = checkWritableBranch(branch);
    if (!check.ok) throw new Error(check.reason);
    if (!SHA.test(sha)) throw new Error(`Not a full commit id for ${check.branch}: ${sha}`);
    return { branch: check.branch, sha };
  });
}

export const seedTagName = (scenario: string, side?: "ours" | "theirs") =>
  side ? `demo-seed/${scenario}/${side}` : `demo-seed/${scenario}`;

export function resetPlan(config: DemoConfig, tags: Map<string, string>): BranchWrite[] {
  const need = (tag: string) => {
    const sha = tags.get(tag);
    if (!sha) throw new Error(`Missing seed tag ${tag}; refusing to guess`);
    return sha;
  };
  return planBranchWrites([
    { branch: config.base, sha: need(seedTagName("base")) },
    ...config.scenarios.flatMap((scenario) => [
      { branch: scenario.theirs.branch, sha: need(seedTagName(scenario.id, "theirs")) },
      { branch: scenario.ours.branch, sha: need(seedTagName(scenario.id, "ours")) },
    ]),
  ]);
}
