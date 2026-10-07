import { afterEach, describe, expect, it, vi } from "vitest";

const made = vi.hoisted(() => [] as unknown[]);
vi.mock("@/server/runner/sandbox", () => ({
  SandboxRunner: class {
    constructor(options: unknown) {
      made.push(options);
    }
  },
}));
vi.mock("@/server/runner/local", () => ({ LocalRunner: class {} }));

afterEach(() => {
  made.length = 0;
});

describe("liveRunner", () => {
  it("boots from the trusted dependency snapshot when one is configured", async () => {
    const { liveRunner } = await import("@/server/runner");
    liveRunner("YearningAsian/merge-desk", undefined, {
      VERCEL: "1",
      DEPS_SNAPSHOT_ID: " snap_abc123 ",
    });
    expect(made).toEqual([
      expect.objectContaining({
        repoUrl: "https://github.com/YearningAsian/merge-desk.git",
        dependencies: { snapshotId: "snap_abc123" },
      }),
    ]);
  });

  it("clones from git, with no snapshot, when none or a malformed id is set", async () => {
    const { liveRunner } = await import("@/server/runner");
    liveRunner("YearningAsian/merge-desk", undefined, { VERCEL: "1" });
    liveRunner("YearningAsian/merge-desk", undefined, { VERCEL: "1", DEPS_SNAPSHOT_ID: "x y" });
    for (const options of made)
      expect((options as { dependencies?: unknown }).dependencies).toBeUndefined();
    expect(made).toHaveLength(2);
  });
});
