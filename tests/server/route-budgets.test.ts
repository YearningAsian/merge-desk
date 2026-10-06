import { describe, expect, it } from "vitest";
import { maxDuration as landMax } from "@/app/api/live/land/route";
import { maxDuration as recordMax } from "@/app/api/live/record/route";
import { RECORD_BUDGET_MS } from "@/server/github/comment";

// Review 6.1 M4: a record write sent just before a route answers must be able
// to finish and release its lock before the platform stops the function.
// Answer deadlines (route constants): Land 55 s, record 25 s. Lock wait 8 s
// and release 5 s come from src/server/github/lock.ts.
const LOCK_WAIT_MS = 8_000;
const RELEASE_MS = 5_000;

describe("live route time limits", () => {
  it("Land outlives its answer by a record write's budget and the lock release", () => {
    expect(landMax * 1_000).toBeGreaterThanOrEqual(
      55_000 + LOCK_WAIT_MS + RECORD_BUDGET_MS + RELEASE_MS,
    );
  });

  it("the record route does too", () => {
    expect(recordMax * 1_000).toBeGreaterThanOrEqual(
      25_000 + LOCK_WAIT_MS + RECORD_BUDGET_MS + RELEASE_MS,
    );
  });

  it("both stay inside the 300 s platform limit", () => {
    expect(landMax).toBeLessThanOrEqual(300);
    expect(recordMax).toBeLessThanOrEqual(300);
  });
});
