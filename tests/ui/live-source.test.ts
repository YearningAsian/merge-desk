import { afterEach, describe, expect, it, vi } from "vitest";
import { liveSource } from "@/ui/sources/live";

afterEach(() => vi.unstubAllGlobals());

describe("live source Land", () => {
  it("keeps the server's reason when the session guard refuses", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ error: "Sign in to use live mode." }, { status: 401 })),
    );
    await expect(liveSource("o/r").land(1, "token")).resolves.toEqual({
      outcome: "REFUSED",
      reason: "Sign in to use live mode.",
    });
  });
});
