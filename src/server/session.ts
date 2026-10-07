import { timingSafeEqual } from "node:crypto";
import { sealData, unsealData } from "iron-session";
import { z } from "zod";
import { isAllowedLogin, requireEnv } from "@/server/env";

// The live-mode session: a sealed, HTTP-only cookie holding only the GitHub
// login and an expiry (8 hours). Sealing keeps it from being read or forged;
// it is not authorization. Every live route also checks the login allowlist,
// and every mutating route checks the request's origin.

type Env = Record<string, string | undefined>;

export const SESSION_COOKIE = "merge_desk_session";
export const OAUTH_COOKIE = "merge_desk_oauth";
export const SESSION_TTL_S = 8 * 60 * 60;
const OAUTH_TTL_S = 10 * 60;

const SessionData = z.object({ login: z.string().min(1).max(100), exp: z.number().int() });
export type SessionData = z.infer<typeof SessionData>;
const OAuthState = z.object({ state: z.string().min(32), exp: z.number().int() });

const password = (env: Env) => requireEnv("SESSION_SECRET", env);

export function readCookie(header: string | null, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return rest.join("=") || null;
  }
  return null;
}

export function cookieHeader(
  name: string,
  value: string,
  options: { maxAge: number; secure: boolean; path?: string; sameSite?: "Lax" | "Strict" },
): string {
  return [
    `${name}=${value}`,
    `Path=${options.path ?? "/"}`,
    `Max-Age=${options.maxAge}`,
    "HttpOnly",
    `SameSite=${options.sameSite ?? "Lax"}`,
    ...(options.secure ? ["Secure"] : []),
  ].join("; ");
}

export const isSecure = (env: Env = process.env) => env.NODE_ENV === "production";

export async function sealSession(
  login: string,
  options: { env?: Env; now?: number } = {},
): Promise<string> {
  const now = options.now ?? Date.now();
  return sealData(
    { login, exp: now + SESSION_TTL_S * 1000 },
    { password: password(options.env ?? process.env), ttl: SESSION_TTL_S },
  );
}

export async function readSession(
  cookies: string | null,
  options: { env?: Env; now?: number } = {},
): Promise<SessionData | null> {
  const seal = readCookie(cookies, SESSION_COOKIE);
  if (!seal) return null;
  try {
    const data = SessionData.safeParse(
      await unsealData(seal, {
        password: password(options.env ?? process.env),
        ttl: SESSION_TTL_S,
      }),
    );
    if (!data.success || data.data.exp <= (options.now ?? Date.now())) return null;
    return data.data;
  } catch {
    return null;
  }
}

export async function sealOAuthState(state: string, env: Env = process.env): Promise<string> {
  return sealData(
    { state, exp: Date.now() + OAUTH_TTL_S * 1000 },
    { password: password(env), ttl: OAUTH_TTL_S },
  );
}

export async function checkOAuthState(
  cookies: string | null,
  returned: string | null,
  env: Env = process.env,
): Promise<boolean> {
  const seal = readCookie(cookies, OAUTH_COOKIE);
  if (!seal || !returned) return false;
  try {
    const data = OAuthState.safeParse(
      await unsealData(seal, { password: password(env), ttl: OAUTH_TTL_S }),
    );
    if (!data.success || data.data.exp <= Date.now()) return false;
    const a = Buffer.from(data.data.state);
    const b = Buffer.from(returned);
    return a.length === b.length && timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export const OAUTH_COOKIE_TTL_S = OAUTH_TTL_S;

const json = (status: number, error: string) =>
  Response.json({ error }, { status, headers: { "cache-control": "no-store" } });

export type LiveGuard = { ok: true; login: string } | { ok: false; response: Response };

// Every /api/live route: signed in, allowlisted, and for anything that spends
// quota or writes, sent by this site's own pages.
export async function guardLive(
  request: Request,
  options: { mutating?: boolean; env?: Env; now?: number } = {},
): Promise<LiveGuard> {
  const env = options.env ?? process.env;
  const session = await readSession(request.headers.get("cookie"), { env, now: options.now });
  if (!session) return { ok: false, response: json(401, "Sign in to use live mode.") };
  if (!isAllowedLogin(session.login, env))
    return { ok: false, response: json(403, "This account can't use live mode.") };
  if (options.mutating && !isSameOrigin(request))
    return { ok: false, response: json(403, "Request refused: it didn't come from Merge Desk.") };
  return { ok: true, login: session.login };
}

export function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  return origin === new URL(request.url).origin;
}
