import { z } from "zod";
import { isRepoName, requireEnv } from "@/server/env";
import { keepAlive } from "@/server/keep-alive";
import { MAX_SESSION_REPOS } from "@/server/session";

// "Sign in with GitHub" through the GitHub App's user authorization. The
// user token is used once, to read who signed in and which repositories
// with the App installed they can push to, then revoked. The list only
// fills the picker; every live request asks GitHub again.

type Env = Record<string, string | undefined>;

export function authorizeUrl(origin: string, state: string, env: Env = process.env): string {
  const url = new URL("https://github.com/login/oauth/authorize");
  url.searchParams.set("client_id", requireEnv("GITHUB_APP_CLIENT_ID", env));
  url.searchParams.set("redirect_uri", `${origin}/api/auth/callback`);
  url.searchParams.set("state", state);
  url.searchParams.set("allow_signup", "false");
  return url.toString();
}

export async function loginFromCode(
  code: string,
  origin: string,
  env: Env = process.env,
  fetcher: typeof fetch = fetch,
): Promise<{ login: string; id: number; repos: string[] }> {
  const clientId = requireEnv("GITHUB_APP_CLIENT_ID", env);
  const clientSecret = requireEnv("GITHUB_APP_CLIENT_SECRET", env);
  const exchange = await fetcher("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: { accept: "application/json", "content-type": "application/json" },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: `${origin}/api/auth/callback`,
    }),
    signal: AbortSignal.timeout(15_000),
  });
  const body = (await exchange.json().catch(() => ({}))) as { access_token?: string };
  if (!exchange.ok || !body.access_token) throw new Error("GitHub did not accept the sign-in");
  const token = body.access_token;
  try {
    const user = await fetcher("https://api.github.com/user", {
      headers: { accept: "application/vnd.github+json", authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(15_000),
    });
    const data = (await user.json().catch(() => ({}))) as { login?: string; id?: unknown };
    const id = data.id;
    if (!user.ok || !data.login || typeof id !== "number" || !Number.isSafeInteger(id) || id < 1)
      throw new Error("GitHub did not say who signed in");
    return {
      login: data.login,
      id,
      repos: await pushableRepos(token, fetcher).catch(() => []),
    };
  } finally {
    keepAlive(
      fetcher(`https://api.github.com/applications/${clientId}/token`, {
        method: "DELETE",
        headers: {
          accept: "application/vnd.github+json",
          authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ access_token: token }),
        signal: AbortSignal.timeout(10_000),
      }),
    );
  }
}

const Installations = z.object({ installations: z.array(z.object({ id: z.number().int() })) });
const Repositories = z.object({
  repositories: z.array(
    z.object({ full_name: z.string(), permissions: z.object({ push: z.boolean() }).optional() }),
  ),
});

// shortcut: the first 100 repositories of the first 10 installations; page
// further if people install the App on more.
async function pushableRepos(token: string, fetcher: typeof fetch): Promise<string[]> {
  const get = async (path: string) => {
    const response = await fetcher(`https://api.github.com${path}`, {
      headers: { accept: "application/vnd.github+json", authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error(`GitHub answered ${response.status}`);
    return response.json();
  };
  const { installations } = Installations.parse(await get("/user/installations?per_page=100"));
  const repos: string[] = [];
  for (const { id } of installations.slice(0, 10)) {
    const { repositories } = Repositories.parse(
      await get(`/user/installations/${id}/repositories?per_page=100`),
    );
    for (const repo of repositories)
      if (repo.permissions?.push && isRepoName(repo.full_name)) repos.push(repo.full_name);
  }
  return [...new Set(repos)].sort((a, b) => a.localeCompare(b)).slice(0, MAX_SESSION_REPOS);
}
