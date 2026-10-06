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
// throttle is the one real call: today's tagged sandboxes were counted within
// the last minute, which also proves the sandbox credential works. A request
// header is never taken as that credential.
export async function GET() {
  const status = integrationStatus();
  const throttle = await throttleReady();
  return Response.json(
    {
      ok: true,
      at: new Date().toISOString(),
      integrations: {
        github: status.github,
        gemini: status.gemini,
        sandbox: status.sandbox || throttle,
        throttle,
        recordings: recordingsPresent(),
      },
    },
    { headers: { "cache-control": "no-store" } },
  );
}
