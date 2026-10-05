import { createHash } from "node:crypto";
import { mkdir, rmdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";

// GitHub comments have no compare-and-swap. This writer is deliberately
// restricted to a loopback development server with shared local storage.
// Distributed deployments must refuse until a shared coordinator exists.
export function decisionWriterReason(request?: Request): string | null {
  if (
    !["development", "test"].includes(process.env.NODE_ENV ?? "") ||
    process.env.VERCEL ||
    process.env.AWS_LAMBDA_FUNCTION_NAME
  )
    return "Decision writes require the local development writer; production coordination is not configured.";
  if (
    request &&
    !["localhost", "127.0.0.1", "::1", "[::1]"].includes(new URL(request.url).hostname)
  )
    return "Decision writes are available only on the local development server.";
  return null;
}

const shared = globalThis as typeof globalThis & {
  mergeDeskRecordQueues?: Map<string, Promise<unknown>>;
};
const queues = (shared.mergeDeskRecordQueues ??= new Map<string, Promise<unknown>>());

export function withLocalRecordWriter<T>(
  key: string,
  work: (lease: { dispatched: () => void; confirmed: () => void }) => Promise<T>,
): Promise<T | { ok: false; reason: string }> {
  const reason = decisionWriterReason();
  if (reason) return Promise.resolve({ ok: false, reason });
  const previous = queues.get(key) ?? Promise.resolve();
  const next = previous.then(async () => {
    const root = resolve(join(tmpdir(), "merge-desk-record-locks"));
    const path = resolve(root, createHash("sha256").update(key).digest("hex"));
    if (!path.startsWith(root + sep)) throw new Error("Invalid record lock path");
    try {
      await mkdir(root, { recursive: true });
      await mkdir(path); // Atomic across processes on this host; never steal a lock.
    } catch {
      return {
        ok: false as const,
        reason:
          "This decision record has an active or unconfirmed local writer. Reconcile it before trying again.",
      };
    }
    let unresolved = false;
    try {
      return await work({
        dispatched: () => {
          unresolved = true;
        },
        confirmed: () => {
          unresolved = false;
        },
      });
    } finally {
      // An aborted/failed HTTP call can still complete at GitHub. Retain its
      // lock until human reconciliation; a TTL or automatic unlock would let
      // that late stale body erase a subsequently confirmed decision.
      // Non-recursive: remove only our exact empty directory after confirmation
      // or when no mutation was dispatched.
      if (!unresolved) await rmdir(path).catch(() => undefined);
    }
  });
  const settled = next.catch(() => undefined);
  queues.set(key, settled);
  void settled.then(() => {
    if (queues.get(key) === settled) queues.delete(key);
  });
  return next;
}
