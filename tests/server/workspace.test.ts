import { describe, expect, it } from "vitest";
import { isRepoPath } from "@/server/runner/workspace";

describe("isRepoPath", () => {
  it("accepts relative paths inside the repository", () => {
    expect(isRepoPath("playground/src/api.js")).toBe(true);
    expect(isRepoPath("src/core/.hidden.ts")).toBe(true);
  });

  it("refuses absolute, parent, Windows, empty-segment and .git paths", () => {
    for (const path of [
      "",
      "/etc/passwd",
      "../outside.js",
      "playground/../../x",
      "C:/x.js",
      String.raw`playground\src\api.js`,
      "playground//api.js",
      "./api.js",
      ".git/hooks/pre-commit",
      "sub/.GIT/config",
      "a\0b",
    ])
      expect(isRepoPath(path), path).toBe(false);
  });
});
