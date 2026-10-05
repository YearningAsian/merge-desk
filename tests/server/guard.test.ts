import { describe, expect, it } from "vitest";
import { chooseTestSuite } from "@/server/guard";

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
