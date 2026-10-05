import { SESSION_COOKIE, cookieHeader, isSameOrigin, isSecure } from "@/server/session";

export const runtime = "nodejs";

// Sign out: a form POST from this site clears the session cookie.
export function POST(request: Request) {
  const origin = new URL(request.url).origin;
  if (!isSameOrigin(request)) return new Response(null, { status: 403 });
  const headers = new Headers({ location: `${origin}/live`, "cache-control": "no-store" });
  headers.append("set-cookie", cookieHeader(SESSION_COOKIE, "", { maxAge: 0, secure: isSecure() }));
  return new Response(null, { status: 303, headers });
}
