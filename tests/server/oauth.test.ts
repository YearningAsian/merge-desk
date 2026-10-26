import { describe, expect, it, vi } from "vitest";
import { loginFromCode } from "@/server/github/oauth";

// Sign-in lists the repositories with the App installed that this person can
// push to, for the picker. A failed listing still signs them in, with none.

const env = { GITHUB_APP_CLIENT_ID: "client-fixture", GITHUB_APP_CLIENT_SECRET: "secret-fixture" };

function github(repositories: (id: number) => Response) {
  return vi.fn(async (input: string | URL | Request) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url === "https://github.com/login/oauth/access_token")
      return Response.json({ access_token: "user-token-fixture" });
    if (url === "https://api.github.com/user") return Response.json({ login: "someone", id: 7 });
    if (url.startsWith("https://api.github.com/user/installations?"))
      return Response.json({ installations: [{ id: 1 }, { id: 2 }] });
    const installation = /\/user\/installations\/(\d+)\/repositories/.exec(url);
    if (installation) return repositories(Number(installation[1]));
    if (url.endsWith("/token")) return new Response(null, { status: 204 });
    throw new Error(`Unexpected request: ${url}`);
  });
}

describe("loginFromCode", () => {
  it("lists only repositories this person can push to, once each and sorted", async () => {
    const fetcher = github((id) =>
      Response.json({
        repositories:
          id === 1
            ? [
                { full_name: "someone/zeta", permissions: { push: true } },
                { full_name: "org/read-only", permissions: { push: false } },
                { full_name: "org/no-permissions" },
              ]
            : [
                { full_name: "someone/zeta", permissions: { push: true } },
                { full_name: "org/alpha", permissions: { push: true } },
              ],
      }),
    );
    expect(await loginFromCode("code", "http://localhost:3000", env, fetcher)).toEqual({
      login: "someone",
      id: 7,
      repos: ["org/alpha", "someone/zeta"],
    });
  });

  it("still signs in, with no repositories, when GitHub can't list them", async () => {
    const fetcher = github(() => new Response("down", { status: 500 }));
    expect(await loginFromCode("code", "http://localhost:3000", env, fetcher)).toEqual({
      login: "someone",
      id: 7,
      repos: [],
    });
  });

  it("refuses a sign-in when GitHub doesn't give the account's numeric id", async () => {
    const base = github(() => Response.json({ repositories: [] }));
    const fetcher = vi.fn(async (input: string | URL | Request) =>
      String(input) === "https://api.github.com/user"
        ? Response.json({ login: "someone" })
        : base(input),
    );
    await expect(loginFromCode("code", "http://localhost:3000", env, fetcher)).rejects.toThrow();
  });
});
