import { after } from "next/server";

// Keeps the function running until `work` settles, even after the response
// has been sent: a hosted function can be frozen once it answers, and the
// tail of a decision write releases its lock ref on GitHub. A frozen release
// would leave the lock for an operator to reconcile. Outside a request
// (unit tests, scripts) there is nothing to keep alive.
export function keepAlive(work: Promise<unknown>): void {
  const settled = work.then(
    () => undefined,
    () => undefined,
  );
  try {
    after(() => settled);
  } catch {
    // Not inside a request.
  }
}
