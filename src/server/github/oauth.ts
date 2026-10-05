import { requireEnv } from "@/server/env";

// "Sign in with GitHub" through the GitHub App's user authorization. The
// user token is used once, to read who signed in, then revoked.

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
): Promise<string> {
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
    const data = (await user.json().catch(() => ({}))) as { login?: string };
    if (!user.ok || !data.login) throw new Error("GitHub did not say who signed in");
    return data.login;
  } finally {
    // Best effort: the token has done its one job.
    void fetcher(`https://api.github.com/applications/${clientId}/token`, {
      method: "DELETE",
      headers: {
        accept: "application/vnd.github+json",
        authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ access_token: token }),
      signal: AbortSignal.timeout(10_000),
    }).catch(() => {});
  }
}
