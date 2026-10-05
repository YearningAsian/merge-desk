import { describe, expect, it } from "vitest";
import { WRITE_SCOPE, checkWritableBranch } from "@/core/scope";

describe("checkWritableBranch (demo-only until the learner approves the dogfood Land)", () => {
  it("is demo-only by default", () => {
    expect(WRITE_SCOPE).toBe("demo-only");
  });

  it("accepts a demo branch by short name or full ref", () => {
    expect(checkWritableBranch("demo/clean/rename")).toEqual({
      ok: true,
      branch: "demo/clean/rename",
    });
    expect(checkWritableBranch("refs/heads/demo/base")).toEqual({ ok: true, branch: "demo/base" });
  });

  it.each(["main", "refs/heads/main", "feature/retry", "release/1.0"])(
    "refuses the non-demo branch %s",
    (ref) => {
      const result = checkWritableBranch(ref);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason).toMatch(/only demo\/\* branches/);
    },
  );

  it.each([
    "demo",
    "demo/",
    "demox/clean",
    "DEMO/clean",
    "/demo/clean",
    "refs/tags/demo-seed/clean/ours",
    "refs/remotes/origin/demo/clean",
    "refs/heads/demo/../main",
    "demo/clean/../../main",
    "demo//clean",
    "demo/clean/",
    "demo/.hidden",
    "demo/clean.lock",
    "demo/clean name",
    "demo/clean~1",
    "demo/@{-1}",
    "",
  ])("refuses the malformed or out-of-scope ref %j", (ref) => {
    expect(checkWritableBranch(ref).ok).toBe(false);
  });

  it("allows any well-formed branch only when the repository scope is passed explicitly", () => {
    expect(checkWritableBranch("feature/retry", "repository")).toEqual({
      ok: true,
      branch: "feature/retry",
    });
    expect(checkWritableBranch("refs/heads/../main", "repository").ok).toBe(false);
  });
});
