import { createHmac, hkdfSync, timingSafeEqual } from "node:crypto";
import type { z } from "zod";

// Signed analyses and run results. The browser carries them between steps,
// so the server signs who asked, the repository, the pull request, the exact
// head and base commits, an expiry and the payload. A changed byte, another
// user, another pull request or an expired token is refused. The key is
// derived from SESSION_SECRET, never the secret itself.

export type SignedKind = "analysis" | "result";

export type SignedScope = {
  kind: SignedKind;
  user: string;
  repo: string;
  pr: number | null;
  head: string;
  base: string;
};

type Envelope = SignedScope & { v: 1; iat: number; exp: number; body: unknown };

export class SignatureError extends Error {}

const VERSION = "v1";
const MIN_SECRET_LENGTH = 32;
const CLOCK_SKEW_MS = 60_000;
export const DEFAULT_TTL_MS: Record<SignedKind, number> = {
  analysis: 60 * 60 * 1000,
  result: 15 * 60 * 1000,
};

function signingKey(secret: string): Buffer {
  if (secret.trim().length < MIN_SECRET_LENGTH)
    throw new SignatureError("Signing needs a SESSION_SECRET of at least 32 characters");
  return Buffer.from(hkdfSync("sha256", secret, "merge-desk", "merge-desk signing v1", 32));
}

const mac = (key: Buffer, data: string) => createHmac("sha256", key).update(data).digest();

export function sign(
  scope: SignedScope,
  body: unknown,
  options: { secret: string; ttlMs?: number; now?: number },
): string {
  const now = options.now ?? Date.now();
  const envelope: Envelope = {
    v: 1,
    ...scope,
    iat: now,
    exp: now + (options.ttlMs ?? DEFAULT_TTL_MS[scope.kind]),
    body,
  };
  const payload = Buffer.from(JSON.stringify(envelope)).toString("base64url");
  const data = `${VERSION}.${payload}`;
  return `${data}.${mac(signingKey(options.secret), data).toString("base64url")}`;
}

export function verify<T>(
  token: string,
  expected: Omit<SignedScope, "head" | "base">,
  schema: z.ZodType<T>,
  options: { secret: string; now?: number },
): { scope: SignedScope; body: T; exp: number } {
  const now = options.now ?? Date.now();
  const parts = token.split(".");
  if (parts.length !== 3 || parts[0] !== VERSION) throw new SignatureError("Malformed token");
  const [, payload, signature] = parts as [string, string, string];
  const actual = Buffer.from(signature, "base64url");
  const wanted = mac(signingKey(options.secret), `${VERSION}.${payload}`);
  if (actual.length !== wanted.length || !timingSafeEqual(actual, wanted))
    throw new SignatureError("Signature does not match");

  let envelope: Envelope;
  try {
    envelope = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as Envelope;
  } catch {
    throw new SignatureError("Malformed token");
  }
  if (envelope.v !== 1) throw new SignatureError("Unknown token version");
  if (typeof envelope.exp !== "number" || envelope.exp <= now)
    throw new SignatureError("Expired; run the analysis again");
  if (typeof envelope.iat !== "number" || envelope.iat > now + CLOCK_SKEW_MS)
    throw new SignatureError("Issued in the future");
  for (const key of ["kind", "user", "repo", "pr"] as const) {
    if (envelope[key] !== expected[key])
      throw new SignatureError(`Signed for a different ${key === "pr" ? "pull request" : key}`);
  }
  const body = schema.safeParse(envelope.body);
  if (!body.success) throw new SignatureError("Signed payload has the wrong shape");
  return {
    scope: {
      kind: envelope.kind,
      user: envelope.user,
      repo: envelope.repo,
      pr: envelope.pr,
      head: envelope.head,
      base: envelope.base,
    },
    body: body.data,
    exp: envelope.exp,
  };
}
