import { Sandbox } from "@vercel/sandbox";
import { SANDBOX_TAGS } from "@/server/runner/sandbox";

// The daily usage throttle (spec: Spending guards). Every live analysis and
// run boots at least one sandbox tagged app=merge-desk, so the count of those
// created since 00:00 UTC is the day's live work, wherever it ran (laptop or
// production share the Vercel project). New live work is refused once the
// count reaches DAILY_LIVE_RUN_CAP, and whenever the count can't be read.
// Listing then starting isn't atomic: two requests at the same moment can
// both pass, so this is a throttle, not a guaranteed daily or dollar limit.

export const DEFAULT_DAILY_CAP = 30;
const LIST_MS = 10_000;

type Env = Record<string, string | undefined>;
type Created = { createdAt: number };

// Tagged sandboxes, newest first.
export type ListSandboxes = (signal: AbortSignal) => AsyncIterable<Created>;

export type Admission =
  { ok: true; used: number; cap: number } | { ok: false; status: 429 | 503; reason: string };

const listTagged: ListSandboxes = (signal) => ({
  async *[Symbol.asyncIterator]() {
    const result = await Sandbox.list({
      tags: SANDBOX_TAGS,
      sortBy: "createdAt",
      sortOrder: "desc",
      limit: 50,
      signal,
    });
    for await (const sandbox of result) yield sandbox;
  },
});

// The configured cap, or null when the variable is set to anything other
// than a whole number from 1 to 1000 (a typo must not lift the throttle).
export function dailyCap(env: Env = process.env): number | null {
  const raw = env.DAILY_LIVE_RUN_CAP?.trim();
  if (!raw) return DEFAULT_DAILY_CAP;
  if (!/^\d{1,4}$/.test(raw)) return null;
  const cap = Number(raw);
  return cap >= 1 && cap <= 1000 ? cap : null;
}

export const dayStart = (now: Date) =>
  Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());

// Sandboxes created since 00:00 UTC. The list is read newest first and stops
// at the first older one, so it checks that order holds as it reads; an
// out-of-order or malformed entry throws (an unreadable count never admits).
export async function countToday(
  list: ListSandboxes,
  now: Date,
  signal: AbortSignal,
): Promise<number> {
  const since = dayStart(now);
  let used = 0;
  let previous = Infinity;
  for await (const sandbox of list(signal)) {
    const created = sandbox.createdAt;
    if (!Number.isFinite(created) || created > previous)
      throw new Error("Sandbox list isn't in creation order");
    if (created < since) break;
    previous = created;
    used += 1;
  }
  return used;
}

export async function admitLiveWork(
  input: { env?: Env; now?: Date; list?: ListSandboxes; signal?: AbortSignal } = {},
): Promise<Admission> {
  const cap = dailyCap(input.env);
  if (cap === null)
    return {
      ok: false,
      status: 503,
      reason: "The daily live-run limit isn't configured correctly, so nothing was started.",
    };
  const signal = AbortSignal.any([
    AbortSignal.timeout(LIST_MS),
    ...(input.signal ? [input.signal] : []),
  ]);
  let used: number;
  try {
    used = await countToday(input.list ?? listTagged, input.now ?? new Date(), signal);
  } catch {
    log({ admitted: false, cap, used: null });
    return {
      ok: false,
      status: 503,
      reason: "Couldn't count today's live runs, so nothing was started. Try again in a moment.",
    };
  }
  const admitted = used < cap;
  log({ admitted, cap, used });
  return admitted
    ? { ok: true, used, cap }
    : {
        ok: false,
        status: 429,
        reason: `Today's live runs are used up (${used} of ${cap} sandboxes since 00:00 UTC). Live mode opens again after 00:00 UTC; the recorded demo still works.`,
      };
}

// One structured line per decision: counts only, never request data.
function log(entry: { admitted: boolean; cap: number; used: number | null }) {
  console.info(JSON.stringify({ event: "throttle", ...entry }));
}

// Whether the count answered recently, for /api/health. Cached for a minute
// so the probe and visitors don't list sandboxes on every request.
let lastCheck: { at: number; ok: boolean } | null = null;
export async function throttleReady(
  input: { env?: Env; now?: Date; list?: ListSandboxes } = {},
): Promise<boolean> {
  const now = input.now ?? new Date();
  if (lastCheck && now.getTime() - lastCheck.at < 60_000) return lastCheck.ok;
  let ok = dailyCap(input.env) !== null;
  if (ok) {
    try {
      await countToday(input.list ?? listTagged, now, AbortSignal.timeout(5_000));
    } catch {
      ok = false;
    }
  }
  lastCheck = { at: now.getTime(), ok };
  return ok;
}
