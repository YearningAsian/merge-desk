import { Snapshot } from "@vercel/sandbox";
import { depsSnapshotId } from "@/server/env";

// Whether the configured trusted dependency snapshot is present (exists and
// hasn't expired), for /api/health. A well-formed id alone proves nothing
// (review 8.1 M1); a present snapshot still has to pass the runner's own
// checks before any test runs. Cached for a minute, like the throttle's count.

type Env = Record<string, string | undefined>;
type Found = { status: string; expiresAt?: Date };
export type GetSnapshot = (snapshotId: string, signal: AbortSignal) => Promise<Found>;

const getSnapshot: GetSnapshot = async (snapshotId, signal) => {
  const snapshot = await Snapshot.get({ snapshotId, signal });
  return { status: snapshot.status, expiresAt: snapshot.expiresAt };
};

let lastCheck: { at: number; id: string; ok: boolean } | null = null;
let inFlight: { id: string; check: Promise<boolean> } | null = null;
export async function snapshotReady(
  input: { env?: Env; now?: Date; get?: GetSnapshot } = {},
): Promise<boolean> {
  const id = depsSnapshotId(input.env);
  if (!id) return false;
  const now = input.now ?? new Date();
  if (lastCheck && lastCheck.id === id && now.getTime() - lastCheck.at < 60_000)
    return lastCheck.ok;
  // Concurrent visitors during a cache miss share one request.
  if (inFlight && inFlight.id === id) return inFlight.check;
  const check = (async () => {
    let ok = false;
    try {
      const found = await (input.get ?? getSnapshot)(id, AbortSignal.timeout(5_000));
      ok =
        found.status === "created" &&
        (!found.expiresAt || found.expiresAt.getTime() > now.getTime());
    } catch {
      ok = false;
    }
    lastCheck = { at: now.getTime(), id, ok };
    return ok;
  })();
  inFlight = { id, check };
  try {
    return await check;
  } finally {
    if (inFlight?.check === check) inFlight = null;
  }
}
