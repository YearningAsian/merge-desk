import { createAppAuth } from "@octokit/auth-app";
import { Octokit } from "@octokit/rest";
import { isAllowedRepo, requireEnv } from "@/server/env";

// The GitHub App's identity. Each call mints an installation token scoped to
// the one allowlisted repository and only the permissions that call needs.
// The private key stays in server memory; it is never logged or returned.

type Env = Record<string, string | undefined>;
export type RepoPermissions = {
  contents?: "read" | "write";
  pull_requests?: "read" | "write";
};

// Host settings often store a PEM with escaped newlines.
function privateKey(env: Env): string {
  const raw = requireEnv("GITHUB_APP_PRIVATE_KEY", env).trim();
  return raw.includes("\\n") ? raw.replace(/\\n/g, "\n") : raw;
}

function appAuth(env: Env) {
  return createAppAuth({ appId: requireEnv("GITHUB_APP_ID", env), privateKey: privateKey(env) });
}

export function splitRepo(repo: string): { owner: string; name: string } {
  const [owner, name, ...rest] = repo.split("/");
  if (!owner || !name || rest.length) throw new Error(`Not a repository name: ${repo}`);
  return { owner, name };
}

const installations = new Map<string, number>();

export async function installationOctokit(
  repo: string,
  permissions: RepoPermissions,
  env: Env = process.env,
): Promise<Octokit> {
  if (!isAllowedRepo(repo, env)) throw new Error(`${repo} is not an allowed repository`);
  const { owner, name } = splitRepo(repo);
  const auth = appAuth(env);
  let installationId = installations.get(repo);
  if (!installationId) {
    const { token } = await auth({ type: "app" });
    const app = new Octokit({ auth: token });
    const { data } = await app.apps.getRepoInstallation({ owner, repo: name });
    installationId = data.id;
    installations.set(repo, installationId);
  }
  const { token } = await auth({
    type: "installation",
    installationId,
    repositoryNames: [name],
    permissions,
  });
  return new Octokit({ auth: token });
}

// The App's own identity: its id (to recognise its own comments) and its bot
// account (the committer of a landed merge). Read once with the App's key.
export type AppIdentity = { id: number; slug: string; botName: string; botEmail: string };
let identity: Promise<AppIdentity> | null = null;

export function appIdentity(env: Env = process.env): Promise<AppIdentity> {
  identity ??= (async () => {
    const { token } = await appAuth(env)({ type: "app" });
    const app = new Octokit({ auth: token });
    const { data } = await app.apps.getAuthenticated();
    if (!data?.slug) throw new Error("GitHub didn't say which App this is");
    const botName = `${data.slug}[bot]`;
    const { data: bot } = await app.users.getByUsername({ username: botName });
    return {
      id: data.id,
      slug: data.slug,
      botName,
      botEmail: `${bot.id}+${botName}@users.noreply.github.com`,
    };
  })().catch((error) => {
    identity = null;
    throw error;
  });
  return identity;
}
