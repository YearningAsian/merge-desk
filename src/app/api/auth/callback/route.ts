import { isAllowedLogin } from "@/server/env";
import { loginFromCode } from "@/server/github/oauth";
import {
  OAUTH_COOKIE,
  SESSION_COOKIE,
  SESSION_TTL_S,
  checkOAuthState,
  cookieHeader,
  isSecure,
  sealSession,
} from "@/server/session";

export const runtime = "nodejs";

// Finishes sign-in: the state must match, GitHub must say who signed in, and
// only an allowlisted login gets a session. Every outcome lands on /live,
// which explains a refusal in plain words.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const back = (result?: string) => {
    const headers = new Headers({
      location: `${url.origin}/live${result ? `?signin=${result}` : ""}`,
      "cache-control": "no-store",
    });
    headers.append(
      "set-cookie",
      cookieHeader(OAUTH_COOKIE, "", { maxAge: 0, secure: isSecure(), path: "/api/auth" }),
    );
    return { headers, response: () => new Response(null, { status: 303, headers }) };
  };

  if (!(await checkOAuthState(request.headers.get("cookie"), url.searchParams.get("state"))))
    return back("expired").response();
  const code = url.searchParams.get("code");
  if (!code) return back("cancelled").response();

  let login: string;
  try {
    login = await loginFromCode(code, url.origin);
  } catch {
    return back("failed").response();
  }
  if (!isAllowedLogin(login)) return back("refused").response();

  const done = back();
  done.headers.append(
    "set-cookie",
    cookieHeader(SESSION_COOKIE, await sealSession(login), {
      maxAge: SESSION_TTL_S,
      secure: isSecure(),
    }),
  );
  return done.response();
}
