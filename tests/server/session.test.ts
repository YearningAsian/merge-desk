import { describe, expect, it } from "vitest";
import {
  OAUTH_COOKIE,
  SESSION_COOKIE,
  SESSION_TTL_S,
  checkOAuthState,
  guardLive,
  readCookie,
  readSession,
  sealOAuthState,
  sealSession,
} from "@/server/session";

const env = { SESSION_SECRET: "x".repeat(48), ALLOWED_LOGINS: "YearningAsian" };
const cookie = (name: string, value: string) => `other=1; ${name}=${value}; theme=light`;
const request = (cookies?: string, origin?: string) =>
  new Request("http://localhost:3000/api/live/prs", {
    headers: {
      ...(cookies ? { cookie: cookies } : {}),
      ...(origin ? { origin } : {}),
    },
  });

describe("session cookie", () => {
  it("reads back the login it sealed, until it expires", async () => {
    const now = Date.now();
    const seal = await sealSession("YearningAsian", { env, now });
    expect(await readSession(cookie(SESSION_COOKIE, seal), { env, now })).toMatchObject({
      login: "YearningAsian",
    });
    expect(
      await readSession(cookie(SESSION_COOKIE, seal), { env, now: now + 8 * 60 * 60 * 1000 }),
    ).toBeNull();
  });

  it("refuses a tampered seal or one sealed with another secret", async () => {
    const seal = await sealSession("YearningAsian", { env });
    expect(
      await readSession(cookie(SESSION_COOKIE, `${seal.slice(0, -4)}AAAA`), { env }),
    ).toBeNull();
    const other = await sealSession("YearningAsian", { env: { SESSION_SECRET: "y".repeat(48) } });
    expect(await readSession(cookie(SESSION_COOKIE, other), { env })).toBeNull();
    expect(await readSession(null, { env })).toBeNull();
  });

  it("parses one cookie out of a header", () => {
    expect(readCookie("a=1; b=two=three; c=", "b")).toBe("two=three");
    expect(readCookie("a=1", "b")).toBeNull();
  });
});

describe("guardLive", () => {
  it("answers 401 signed out and 403 for a login that isn't allowlisted", async () => {
    const out = await guardLive(request(), { env });
    expect(out.ok ? 0 : out.response.status).toBe(401);
    const stranger = await sealSession("someone-else", { env });
    const refused = await guardLive(request(cookie(SESSION_COOKIE, stranger)), { env });
    expect(refused.ok ? 0 : refused.response.status).toBe(403);
  });

  it("lets the allowlisted login in, and checks the origin on mutating routes", async () => {
    const now = Date.now();
    const seal = await sealSession("YearningAsian", { env, now });
    expect(await guardLive(request(cookie(SESSION_COOKIE, seal)), { env })).toEqual({
      ok: true,
      login: "YearningAsian",
      exp: now + SESSION_TTL_S * 1000,
    });
    const crossSite = await guardLive(
      request(cookie(SESSION_COOKIE, seal), "https://evil.example"),
      {
        env,
        mutating: true,
      },
    );
    expect(crossSite.ok ? 0 : crossSite.response.status).toBe(403);
    const noOrigin = await guardLive(request(cookie(SESSION_COOKIE, seal)), {
      env,
      mutating: true,
    });
    expect(noOrigin.ok).toBe(false);
    const sameSite = await guardLive(
      request(cookie(SESSION_COOKIE, seal), "http://localhost:3000"),
      {
        env,
        mutating: true,
      },
    );
    expect(sameSite.ok).toBe(true);
  });
});

describe("OAuth state", () => {
  it("matches only the state it sealed", async () => {
    const state = "s".repeat(64);
    const seal = await sealOAuthState(state, env);
    expect(await checkOAuthState(cookie(OAUTH_COOKIE, seal), state, env)).toBe(true);
    expect(await checkOAuthState(cookie(OAUTH_COOKIE, seal), "t".repeat(64), env)).toBe(false);
    expect(await checkOAuthState(null, state, env)).toBe(false);
  });
});
