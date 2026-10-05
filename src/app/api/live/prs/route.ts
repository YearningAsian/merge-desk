import { CODE_ALLOWED_REPOS } from "@/server/env";
import { installationOctokit } from "@/server/github/app";
import { listPulls } from "@/server/github/prs";
import { guardLive } from "@/server/session";

export const runtime = "nodejs";
export const maxDuration = 30;

const REPO = CODE_ALLOWED_REPOS[0];

// Open pull requests on the one allowlisted repository, conflicting first.
export async function GET(request: Request) {
  const guard = await guardLive(request);
  if (!guard.ok) return guard.response;
  try {
    const octokit = await installationOctokit(REPO, { pull_requests: "read", contents: "read" });
    return Response.json(await listPulls(octokit, REPO), {
      headers: { "cache-control": "no-store" },
    });
  } catch (error) {
    const status = (error as { status?: number }).status;
    return Response.json(
      {
        error:
          status === 404
            ? "GitHub can't see the repository: is the Merge Desk app installed on it?"
            : "GitHub isn't reachable right now. Try again.",
      },
      { status: 503, headers: { "cache-control": "no-store" } },
    );
  }
}
