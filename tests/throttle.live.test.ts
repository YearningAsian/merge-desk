import { Sandbox } from "@vercel/sandbox";
import { describe, expect, it } from "vitest";
import { SANDBOX_IMAGE, SANDBOX_TAGS } from "@/server/runner/sandbox";
import { countToday, listTagged } from "@/server/throttle";
import { loadLocalEnv } from "../scripts/lib/env.mts";

loadLocalEnv();

// Review 6.1 M2: the daily throttle counts tagged sandboxes created today,
// and every runner stops its sandbox when done. That only works if a stopped,
// non-persistent sandbox stays in Sandbox.list. Boots one bare sandbox (no
// source, no commands), stops it, and counts again.
describe("daily throttle (live)", () => {
  it("still counts a tagged sandbox after it has been stopped", async () => {
    const count = () => countToday(listTagged, new Date(), AbortSignal.timeout(20_000));
    const before = await count();
    const started = Date.now();
    const sandbox = await Sandbox.create({
      image: SANDBOX_IMAGE,
      persistent: false,
      timeout: 60_000,
      resources: { vcpus: 2 },
      tags: SANDBOX_TAGS,
    });
    try {
      expect(await count()).toBe(before + 1);
    } finally {
      await sandbox.stop();
    }
    // Listing can lag a stop; poll briefly for the stopped state.
    let after = 0;
    let status: string | undefined;
    for (let attempt = 0; attempt < 10; attempt += 1) {
      after = await count();
      const listed = await Sandbox.list({
        tags: SANDBOX_TAGS,
        sortBy: "createdAt",
        sortOrder: "desc",
        limit: 5,
      });
      status = listed.sandboxes.find((item) => item.name === sandbox.name)?.status;
      if (status === "stopped") break;
      await new Promise((resolve) => setTimeout(resolve, 2_000));
    }
    console.log(
      `throttle: ${before} today before, ${after} after one boot and stop (status ${status}), ${Date.now() - started} ms`,
    );
    expect(status).toBe("stopped");
    expect(after).toBeGreaterThanOrEqual(before + 1);
  });
});
