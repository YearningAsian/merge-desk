import { keysCookie } from "@/server/keys";
import { SESSION_COOKIE, cookieHeader, isSameOrigin, isSecure } from "@/server/session";

export const runtime = "nodejs";

// Sign out: a form POST from this site clears the session cookie and any
// model keys saved in Settings.
export function POST(request: Request) {
  const origin = new URL(request.url).origin;
  if (!isSameOrigin(request)) return new Response(null, { status: 403 });
  const headers = new Headers({ location: `${origin}/live`, "cache-control": "no-store" });
  headers.append("set-cookie", cookieHeader(SESSION_COOKIE, "", { maxAge: 0, secure: isSecure() }));
  headers.append("set-cookie", keysCookie(null));
  return new Response(null, { status: 303, headers });
}
