import { depsSnapshotId } from "@/server/env";
import { LocalRunner } from "./local";
import { SandboxRunner } from "./sandbox";
import type { Runner } from "./types";

// Which runner a live request gets. The deployed app always uses the
// sandbox; the laptop runner is for trusted local use only (RUNNER=local,
// never on Vercel), because it has no network isolation.
type Env = Record<string, string | undefined>;

export const usesSandbox = (env: Env = process.env) =>
  !(env.RUNNER?.trim() === "local" && !env.VERCEL);

export function liveRunner(repo: string, signal?: AbortSignal, env: Env = process.env): Runner {
  const url = `https://github.com/${repo}.git`;
  if (!usesSandbox(env)) return new LocalRunner({ source: url });
  const snapshotId = depsSnapshotId(env);
  return new SandboxRunner({
    repoUrl: url,
    signal,
    ...(snapshotId ? { dependencies: { snapshotId } } : {}),
  });
}
