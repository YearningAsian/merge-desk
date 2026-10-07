import { createHmac } from "node:crypto";
import { sealData, unsealData } from "iron-session";
import { z } from "zod";
import { KEY_PROVIDERS, KeyProvider } from "@/core/models";
import { requireEnv } from "@/server/env";
import { SESSION_TTL_S, cookieHeader, isSecure, readCookie } from "@/server/session";

// Your own model keys (Anthropic, OpenAI, OpenRouter) live only in your
// browser, sealed: an HTTP-only, SameSite=Strict cookie scoped to the live
// API, encrypted and signed with a key derived from SESSION_SECRET for this
// purpose alone. The server opens it per request to make that request's
// calls, and never stores, logs or returns a key: the browser only learns
// which providers have one. The seal names the GitHub login and the exact
// sign-in session it was saved in, and ends with that session, so it can't
// be opened under another login, a later sign-in, or after the session.

type Env = Record<string, string | undefined>;

export const KEYS_COOKIE = "merge_desk_keys";
const KEYS_PATH = "/api/live";

// What a key may look like: a single token of key characters. Anything
// else (spaces, line breaks, quotes) is refused before it is sealed, so a
// key can never inject into a header.
export const ApiKey = z
  .string()
  .trim()
  .min(20)
  .max(400)
  .regex(/^[A-Za-z0-9_.:-]+$/, "That doesn't look like an API key.");

export const ModelKeys = z.object({
  anthropic: ApiKey.optional(),
  openai: ApiKey.optional(),
  openrouter: ApiKey.optional(),
});
export type ModelKeys = z.infer<typeof ModelKeys>;

const Sealed = z.object({
  login: z.string().min(1).max(100),
  exp: z.number().int(),
  keys: ModelKeys,
});

// A separate password for this cookie, derived from the session secret, so
// a sealed key and a sealed session can never be swapped for each other.
const password = (env: Env) =>
  createHmac("sha256", requireEnv("SESSION_SECRET", env))
    .update("merge-desk:model-keys:v1")
    .digest("hex");

// The sign-in session the keys belong to (from guardLive).
export type KeySession = { login: string; exp: number };

export async function readKeys(
  cookies: string | null,
  session: KeySession,
  options: { env?: Env; now?: number } = {},
): Promise<ModelKeys> {
  const seal = readCookie(cookies, KEYS_COOKIE);
  if (!seal) return {};
  try {
    const data = Sealed.safeParse(
      await unsealData(seal, {
        password: password(options.env ?? process.env),
        ttl: SESSION_TTL_S,
      }),
    );
    if (!data.success) return {};
    if (data.data.login !== session.login || data.data.exp !== session.exp) return {};
    if (data.data.exp <= (options.now ?? Date.now())) return {};
    return data.data.keys;
  } catch {
    return {};
  }
}

export async function sealKeys(
  session: KeySession,
  keys: ModelKeys,
  options: { env?: Env } = {},
): Promise<string> {
  return sealData(
    { login: session.login, exp: session.exp, keys: ModelKeys.parse(keys) },
    { password: password(options.env ?? process.env), ttl: SESSION_TTL_S },
  );
}

// The Set-Cookie header for sealed keys, or one that removes them.
export function keysCookie(seal: string | null, env: Env = process.env): string {
  return cookieHeader(KEYS_COOKIE, seal ?? "", {
    maxAge: seal ? SESSION_TTL_S : 0,
    secure: isSecure(env),
    path: KEYS_PATH,
    sameSite: "Strict",
  });
}

// Which providers have a key, and nothing else.
export const savedProviders = (keys: ModelKeys) =>
  Object.fromEntries(
    KEY_PROVIDERS.map((provider) => [provider, Boolean(keys[provider])]),
  ) as Record<KeyProvider, boolean>;
