import { describe, expect, it } from "vitest";
import {
  integrationStatus,
  isAllowedLogin,
  isAllowedRepo,
  isRepoName,
  requireEnv,
} from "@/server/env";

describe("narrowing: open to any account unless the environment lists names", () => {
  it("allows any login and well-formed repository when the variables are unset", () => {
    expect(isAllowedLogin("someone-else", {})).toBe(true);
    expect(isAllowedRepo("someone/else", {})).toBe(true);
  });

  it("allows only the listed names when set, case-insensitively as GitHub does", () => {
    const env = { ALLOWED_LOGINS: "YearningAsian", ALLOWED_REPOS: "YearningAsian/merge-desk" };
    expect(isAllowedLogin("yearningasian", env)).toBe(true);
    expect(isAllowedRepo("yearningasian/Merge-Desk", env)).toBe(true);
    expect(isAllowedLogin("someone-else", env)).toBe(false);
    expect(isAllowedRepo("someone/else", env)).toBe(false);
  });

  it("treats a blank variable as unset", () => {
    expect(isAllowedLogin("someone-else", { ALLOWED_LOGINS: " " })).toBe(true);
  });

  it("refuses empty input and malformed repository names", () => {
    expect(isAllowedLogin("", {})).toBe(false);
    expect(isAllowedRepo("", {})).toBe(false);
    for (const bad of [
      "owner",
      "owner/",
      "/repo",
      "a/b/c",
      "owner/..",
      "owner/.",
      "-x/repo",
      "o w/r",
    ])
      expect(isRepoName(bad), bad).toBe(false);
    expect(isRepoName("Owner-1/repo.name_2")).toBe(true);
  });
});

describe("integrationStatus", () => {
  it("reports booleans from presence only", () => {
    const status = integrationStatus({
      GITHUB_APP_ID: "1",
      GITHUB_APP_CLIENT_ID: "c",
      GITHUB_APP_CLIENT_SECRET: "s",
      GITHUB_APP_PRIVATE_KEY: "k",
      GEMINI_API_KEY: "",
      SESSION_SECRET: "x".repeat(32),
    });
    expect(status).toEqual({
      github: true,
      gemini: false,
      sandbox: false,
      session: true,
      snapshot: false,
    });
  });

  it("does not count a short session secret as configured", () => {
    expect(integrationStatus({ SESSION_SECRET: "short" }).session).toBe(false);
  });
});

describe("requireEnv", () => {
  it("returns a present value", () => {
    expect(requireEnv("GEMINI_API_KEY", { GEMINI_API_KEY: "abc" })).toBe("abc");
  });

  it("throws naming only the variable, never a value", () => {
    expect(() => requireEnv("GEMINI_API_KEY", { OTHER: "secret-value" })).toThrowError(
      /^Missing configuration: GEMINI_API_KEY$/,
    );
  });
});
