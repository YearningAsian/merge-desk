import { randomUUID } from "node:crypto";
import { createAppAuth } from "@octokit/auth-app";
import { Octokit } from "@octokit/rest";
import { z } from "zod";
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

const UpdateRefsResponse = z
  .object({ updateRefs: z.object({ clientMutationId: z.string() }).strict() })
  .strict();
const UPDATE_REFS = `mutation UpdateRef($input: UpdateRefsInput!) {
  updateRefs(input: $input) { clientMutationId }
}`;

// Moves one ref only if it still points at beforeOid (GitHub checks that
// atomically). True only when GitHub's answer names this very request;
// errors are thrown for the caller to judge.
export async function updateRef(
  octokit: Octokit,
  input: {
    repositoryId: string;
    name: string;
    beforeOid: string;
    afterOid: string;
    force: boolean;
    signal?: AbortSignal;
  },
): Promise<boolean> {
  const { repositoryId, signal, ...refUpdate } = input;
  const clientMutationId = randomUUID();
  const result = await octokit.graphql(UPDATE_REFS, {
    input: { repositoryId, clientMutationId, refUpdates: [refUpdate] },
    request: { signal },
  });
  const response = UpdateRefsResponse.safeParse(result);
  return response.success && response.data.updateRefs.clientMutationId === clientMutationId;
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
// account (the committer of a landed merge). App metadata uses its JWT; the
// bot profile uses the caller's installation client, since an anonymous call
// shares GitHub's 60-an-hour limit with every app on the host's address.
export type AppIdentity = { id: number; slug: string; botName: string; botEmail: string };
let identity: Promise<AppIdentity> | null = null;

export function appIdentity(installation: Octokit, env: Env = process.env): Promise<AppIdentity> {
  identity ??= (async () => {
    const { token } = await appAuth(env)({ type: "app" });
    const app = new Octokit({ auth: token });
    const { data } = await app.apps.getAuthenticated();
    if (!data?.slug) throw new Error("GitHub didn't say which App this is");
    const botName = `${data.slug}[bot]`;
    const { data: bot } = await installation.users.getByUsername({ username: botName });
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
