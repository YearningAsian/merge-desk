import { LocalRunner } from "./local";
import { SandboxRunner } from "./sandbox";
import type { Runner } from "./types";

// Which runner a live request gets. The deployed app always uses the
// sandbox; the laptop runner is for trusted local use only (RUNNER=local,
// never on Vercel), because it has no network isolation.
export function liveRunner(
  repo: string,
  signal?: AbortSignal,
  env: Record<string, string | undefined> = process.env,
): Runner {
  const url = `https://github.com/${repo}.git`;
  if (env.RUNNER?.trim() === "local" && !env.VERCEL) return new LocalRunner({ source: url });
  return new SandboxRunner({ repoUrl: url, signal });
}
