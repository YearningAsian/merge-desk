import { Octokit } from "@octokit/rest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Keep the real Octokit request/authentication stack. Only credential minting
// and HTTP are fake: no environment file, private key or GitHub call is used.
const APP_JWT = "fixture.payload.signature";
const INSTALLATION_TOKEN = "fixture-installation-token";
vi.mock("@octokit/auth-app", () => ({
  createAppAuth: () => async () => ({ token: "fixture.payload.signature" }),
}));

const env = { GITHUB_APP_ID: "7", GITHUB_APP_PRIVATE_KEY: "fixture-not-a-private-key" };
const expectedIdentity = {
  id: 7,
  slug: "fixture-app",
  botName: "fixture-app[bot]",
  botEmail: "70+fixture-app[bot]@users.noreply.github.com",
};

function github({ failApp = false, failBot = false } = {}) {
  let appFailed = false;
  let botFailed = false;
  return async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(
      typeof input === "string" ? input : input instanceof URL ? input : input.url,
    );
    const authorization = new Headers(init?.headers).get("authorization");
    if (url.origin !== "https://api.github.com" || init?.method !== "GET")
      throw new Error("Unexpected HTTP request in identity test");
    if (url.pathname === "/app") {
      if (authorization !== `bearer ${APP_JWT}`)
        return Response.json({ message: "App authentication required" }, { status: 401 });
      if (failApp && !appFailed) {
        appFailed = true;
        return Response.json({ message: "App unavailable" }, { status: 503 });
      }
      return Response.json({ id: 7, slug: "fixture-app" });
    }
    if (decodeURIComponent(url.pathname) === "/users/fixture-app[bot]") {
      // Anonymous lookups share a 60-an-hour limit per address; the App JWT
      // is refused here. Only the installation token answers.
      if (authorization !== `token ${INSTALLATION_TOKEN}`)
        return Response.json({ message: "API rate limit exceeded" }, { status: 403 });
      if (failBot && !botFailed) {
        botFailed = true;
        return Response.json({ message: "Bot unavailable" }, { status: 503 });
      }
      return Response.json({ id: 70, login: "fixture-app[bot]", type: "Bot" });
    }
    throw new Error("Unexpected GitHub endpoint in identity test");
  };
}

const installation = () => new Octokit({ auth: INSTALLATION_TOKEN });

beforeEach(() => vi.resetModules());
afterEach(() => vi.unstubAllGlobals());

describe("GitHub App identity authentication", () => {
  it("resolves the committer using App auth for metadata and the installation token for the bot", async () => {
    vi.stubGlobal("fetch", github());
    const { appIdentity } = await import("@/server/github/app");
    await expect(appIdentity(installation(), env)).resolves.toEqual(expectedIdentity);
  });

  it("refuses unavailable App metadata and allows a later identity lookup", async () => {
    vi.stubGlobal("fetch", github({ failApp: true }));
    const { appIdentity } = await import("@/server/github/app");
    await expect(appIdentity(installation(), env)).rejects.toMatchObject({ status: 503 });
    await expect(appIdentity(installation(), env)).resolves.toEqual(expectedIdentity);
  });

  it("refuses an unavailable bot rather than inventing a committer and permits later recovery", async () => {
    vi.stubGlobal("fetch", github({ failBot: true }));
    const { appIdentity } = await import("@/server/github/app");
    await expect(appIdentity(installation(), env)).rejects.toMatchObject({ status: 503 });
    await expect(appIdentity(installation(), env)).resolves.toEqual(expectedIdentity);
  });
});
