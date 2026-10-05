import { describe, expect, it } from "vitest";
import { withDeadline } from "@/server/deadline";

// Review round 2, M1: after Land, slow optional work can't hold the answer.
describe("withDeadline", () => {
  it("answers the work's result when it is in time", async () => {
    expect(await withDeadline(Promise.resolve("done"), 50, "late")).toBe("done");
  });

  it("answers the fallback when the work never settles", async () => {
    const never = new Promise<string>(() => undefined);
    expect(await withDeadline(never, 20, "late")).toBe("late");
  });
});
