import { existsSync } from "node:fs";
import { join } from "node:path";
import { integrationStatus } from "@/server/env";
import { throttleReady } from "@/server/throttle";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Literal paths keep the build's file tracing scoped to these three files.
const recordingsPresent = () =>
  existsSync(join(process.cwd(), "demo", "recordings", "clean.json")) &&
  existsSync(join(process.cwd(), "demo", "recordings", "held.json")) &&
  existsSync(join(process.cwd(), "demo", "recordings", "drop.json"));

// Booleans only: whether each integration is configured, never a value.
// Configured is not the same as proven; the live checks prove each one.
// On Vercel the sandbox credential arrives per request (the OIDC header), not
// as a variable. throttle is the one real call: today's tagged sandboxes were
// counted within the last minute, so live work can be admitted.
export async function GET(request: Request) {
  const status = integrationStatus();
  return Response.json(
    {
      ok: true,
      at: new Date().toISOString(),
      integrations: {
        github: status.github,
        gemini: status.gemini,
        sandbox: status.sandbox || Boolean(request.headers.get("x-vercel-oidc-token")),
        throttle: await throttleReady(),
        recordings: recordingsPresent(),
      },
    },
    { headers: { "cache-control": "no-store" } },
  );
}
