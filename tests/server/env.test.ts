import { describe, expect, it } from "vitest";
import { integrationStatus, isAllowedLogin, isAllowedRepo, requireEnv } from "@/server/env";

describe("allowlists: environment can narrow access but never widen it", () => {
  it("allows the code default login and repository when variables are unset", () => {
    expect(isAllowedLogin("YearningAsian", {})).toBe(true);
    expect(isAllowedRepo("YearningAsian/merge-desk", {})).toBe(true);
  });

  it("compares logins and repositories case-insensitively, as GitHub does", () => {
    expect(isAllowedLogin("yearningasian", {})).toBe(true);
    expect(isAllowedRepo("yearningasian/Merge-Desk", {})).toBe(true);
  });

  it("refuses logins and repositories outside the code default even if the env lists them", () => {
    const env = { ALLOWED_LOGINS: "YearningAsian,someone-else", ALLOWED_REPOS: "someone/else" };
    expect(isAllowedLogin("someone-else", env)).toBe(false);
    expect(isAllowedRepo("someone/else", env)).toBe(false);
  });

  it("lets the env remove the default", () => {
    expect(isAllowedLogin("YearningAsian", { ALLOWED_LOGINS: "someone-else" })).toBe(false);
  });

  it("treats an empty or blank variable as unset, never as allow-all", () => {
    expect(isAllowedLogin("YearningAsian", { ALLOWED_LOGINS: " " })).toBe(true);
    expect(isAllowedLogin("someone-else", { ALLOWED_LOGINS: "" })).toBe(false);
  });

  it("refuses empty input", () => {
    expect(isAllowedLogin("", {})).toBe(false);
    expect(isAllowedRepo("", {})).toBe(false);
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
    expect(status).toEqual({ github: true, gemini: false, sandbox: false, session: true });
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
