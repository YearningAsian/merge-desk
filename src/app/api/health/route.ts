import { existsSync } from "node:fs";
import { join } from "node:path";
import { integrationStatus } from "@/server/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Literal paths keep the build's file tracing scoped to these three files.
const recordingsPresent = () =>
  existsSync(join(process.cwd(), "demo", "recordings", "clean.json")) &&
  existsSync(join(process.cwd(), "demo", "recordings", "held.json")) &&
  existsSync(join(process.cwd(), "demo", "recordings", "drop.json"));

// Booleans only: whether each integration is configured, never a value.
// Configured is not the same as proven; the live checks prove each one.
export function GET() {
  const status = integrationStatus();
  return Response.json(
    {
      ok: true,
      at: new Date().toISOString(),
      integrations: {
        github: status.github,
        gemini: status.gemini,
        sandbox: status.sandbox,
        recordings: recordingsPresent(),
      },
    },
    { headers: { "cache-control": "no-store" } },
  );
}
