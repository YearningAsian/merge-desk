import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/auth/callback/route";
import { OAUTH_COOKIE, SESSION_COOKIE, readSession, sealOAuthState } from "@/server/session";

const ORIGIN = "http://localhost:3000";
const STATE = "s".repeat(64);

function github(login: string) {
  return vi.fn(async (input: string | URL | Request) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url === "https://github.com/login/oauth/access_token")
      return Response.json({ access_token: "user-token-fixture" });
    if (url === "https://api.github.com/user") return Response.json({ login, id: 7 });
    if (url.endsWith("/token")) return new Response(null, { status: 204 });
    throw new Error(`Unexpected request: ${url}`);
  });
}

async function callback(state: string) {
  const seal = await sealOAuthState(STATE);
  return GET(
    new Request(`${ORIGIN}/api/auth/callback?code=code-fixture&state=${state}`, {
      headers: { cookie: `${OAUTH_COOKIE}=${seal}` },
    }),
  );
}
const sessionCookie = (response: Response) =>
  response.headers.getSetCookie().find((cookie) => cookie.startsWith(`${SESSION_COOKIE}=`));

beforeEach(() => {
  vi.stubEnv("SESSION_SECRET", "x".repeat(48));
  vi.stubEnv("ALLOWED_LOGINS", "YearningAsian");
  vi.stubEnv("GITHUB_APP_CLIENT_ID", "client-fixture");
  vi.stubEnv("GITHUB_APP_CLIENT_SECRET", "secret-fixture");
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("sign-in callback", () => {
  it("gives the allowlisted login a session", async () => {
    vi.stubGlobal("fetch", github("YearningAsian"));
    const response = await callback(STATE);
    expect(response.headers.get("location")).toBe(`${ORIGIN}/live`);
    const cookie = sessionCookie(response)!.split(";")[0]!;
    expect(await readSession(cookie)).toMatchObject({ login: "YearningAsian", id: 7 });
  });

  it("refuses any other GitHub login without a session", async () => {
    vi.stubGlobal("fetch", github("someone-else"));
    const response = await callback(STATE);
    expect(response.headers.get("location")).toBe(`${ORIGIN}/live?signin=refused`);
    expect(sessionCookie(response)).toBeUndefined();
  });

  it("never calls GitHub when the state doesn't match", async () => {
    const fetcher = github("YearningAsian");
    vi.stubGlobal("fetch", fetcher);
    const response = await callback("t".repeat(64));
    expect(response.headers.get("location")).toBe(`${ORIGIN}/live?signin=expired`);
    expect(sessionCookie(response)).toBeUndefined();
    expect(fetcher).not.toHaveBeenCalled();
  });
});
