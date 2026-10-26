import { DEMO_OWNER, DEMO_REPO, depsSnapshotId } from "@/server/env";
import { installationToken } from "@/server/github/app";
import { confirmLiveWork } from "@/server/throttle";
import { LocalRunner } from "./local";
import { SandboxRunner } from "./sandbox";
import type { Runner } from "./types";

// Which runner a live request gets. The deployed app always uses the
// sandbox; the laptop runner is for trusted local use only (RUNNER=local,
// never on Vercel), because it has no network isolation.
type Env = Record<string, string | undefined>;

export const usesSandbox = (env: Env = process.env) =>
  !(env.RUNNER?.trim() === "local" && !env.VERCEL);

// `login` tags the sandbox for the per-person daily count. The trusted
// dependency snapshot holds the demo repository's checkout, so only that
// repository boots from it; any other installs its own dependencies.
export function liveRunner(
  repo: string,
  signal?: AbortSignal,
  who: { login: string } = { login: DEMO_OWNER },
  env: Env = process.env,
): Runner {
  const url = `https://github.com/${repo}.git`;
  const demo = repo.toLowerCase() === DEMO_REPO.toLowerCase();
  if (!usesSandbox(env)) return new LocalRunner({ source: url, runsTests: demo });
  const snapshotId = demo ? depsSnapshotId(env) : null;
  return new SandboxRunner({
    repoUrl: url,
    signal,
    login: who.login,
    afterCreate: async () => {
      const recount = await confirmLiveWork({ login: who.login, env, signal });
      if (!recount.ok) throw new Error(recount.reason);
    },
    // Read-only, this repository only, an hour at most; private repos need it.
    cloneToken: () => installationToken(repo, { contents: "read" }, env),
    ...(snapshotId ? { dependencies: { snapshotId } } : {}),
    ...(demo ? {} : { installDependencies: true }),
  });
}
