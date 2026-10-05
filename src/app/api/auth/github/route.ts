import { randomBytes } from "node:crypto";
import { authorizeUrl } from "@/server/github/oauth";
import {
  OAUTH_COOKIE,
  OAUTH_COOKIE_TTL_S,
  cookieHeader,
  isSecure,
  sealOAuthState,
} from "@/server/session";

export const runtime = "nodejs";

// Starts "Sign in with GitHub": a random state, sealed in a short-lived
// cookie, then GitHub's authorize page.
export async function GET(request: Request) {
  const origin = new URL(request.url).origin;
  const state = randomBytes(32).toString("hex");
  const headers = new Headers({
    location: authorizeUrl(origin, state),
    "cache-control": "no-store",
  });
  headers.append(
    "set-cookie",
    cookieHeader(OAUTH_COOKIE, await sealOAuthState(state), {
      maxAge: OAUTH_COOKIE_TTL_S,
      secure: isSecure(),
      path: "/api/auth",
    }),
  );
  return new Response(null, { status: 302, headers });
}
