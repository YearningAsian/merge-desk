import { openRepo } from "@/server/github/access";
import { listPulls } from "@/server/github/prs";
import { guardLive } from "@/server/session";

export const runtime = "nodejs";
export const maxDuration = 30;

const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { "cache-control": "no-store" } });

// Open pull requests on ?repo=owner/name, conflicting first, for someone who
// can push to it.
export async function GET(request: Request) {
  const guard = await guardLive(request);
  if (!guard.ok) return guard.response;
  const repo = new URL(request.url).searchParams.get("repo") ?? "";
  const access = await openRepo(guard.login, repo, { pull_requests: "read", contents: "read" });
  if (!access.ok) return json({ error: access.error }, access.status);
  try {
    return json(await listPulls(access.octokit, repo));
  } catch {
    return json({ error: "GitHub isn't reachable right now. Try again." }, 503);
  }
}
