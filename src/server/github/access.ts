import type { Octokit } from "@octokit/rest";
import { isAllowedRepo } from "@/server/env";
import { installationOctokit, splitRepo, type RepoPermissions } from "@/server/github/app";

// Live mode's authorization: a signed-in person may work on a repository only
// where the App is installed and GitHub says they can push to it. It is asked
// with the installation's own token on every request, so a removed
// collaborator or an uninstalled App stops at once. Anything uncertain refuses.

type Env = Record<string, string | undefined>;

export type RepoAccess =
  { ok: true; octokit: Octokit } | { ok: false; status: 400 | 403 | 503; error: string };

// GitHub reports the maintain role as "write".
const CAN_PUSH = new Set(["admin", "write"]);

export async function openRepo(
  login: string,
  repo: string,
  permissions: RepoPermissions,
  env: Env = process.env,
): Promise<RepoAccess> {
  if (!isAllowedRepo(repo, env))
    return { ok: false, status: 400, error: "That isn't a repository live mode can open." };
  let octokit: Octokit;
  try {
    octokit = await installationOctokit(repo, { ...permissions, metadata: "read" }, env);
  } catch (error) {
    return (error as { status?: number }).status === 404
      ? {
          ok: false,
          status: 403,
          error: `Merge Desk isn't installed on ${repo}. Install it there, then try again.`,
        }
      : { ok: false, status: 503, error: "GitHub isn't reachable right now. Try again." };
  }
  try {
    const { owner, name } = splitRepo(repo);
    const { data } = await octokit.repos.getCollaboratorPermissionLevel({
      owner,
      repo: name,
      username: login,
    });
    if (CAN_PUSH.has(data.permission)) return { ok: true, octokit };
    return {
      ok: false,
      status: 403,
      error: `You need write access to ${repo} to use it in Merge Desk.`,
    };
  } catch (error) {
    // 404: GitHub doesn't know this login as anyone on the repository.
    return (error as { status?: number }).status === 404
      ? {
          ok: false,
          status: 403,
          error: `You need write access to ${repo} to use it in Merge Desk.`,
        }
      : { ok: false, status: 503, error: "Couldn't confirm your access with GitHub. Try again." };
  }
}
