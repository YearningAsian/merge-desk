import { describe, expect, it } from "vitest";
import { CODE_ALLOWED_REPOS } from "@/server/env";
import { SandboxRunner } from "@/server/runner/sandbox";
import { loadLocalEnv } from "../scripts/lib/env.mts";
import { loadDemoConfig, remoteRefs } from "../scripts/lib/git.mts";
import { candidate } from "./helpers/scenarios";

loadLocalEnv();

// The spec's one useful unknown: can a cloud sandbox clone, merge and run the
// tests fast enough to watch? Runs the held demo scenario end to end.
describe("Vercel Sandbox (live)", () => {
  it("creates, merges, denies the network, runs the real tests and stops", async () => {
    const config = loadDemoConfig();
    const held = config.scenarios.find((scenario) => scenario.id === "held")!;
    const refs = remoteRefs("refs/heads/demo/*");
    const revisions = {
      head: refs.get(`refs/heads/${held.ours.branch}`)!,
      base: refs.get(`refs/heads/${config.base}`)!,
    };
    expect(revisions.head && revisions.base, "demo branches on origin").toBeTruthy();

    const runner = new SandboxRunner({
      repoUrl: `https://github.com/${CODE_ALLOWED_REPOS[0]}.git`,
    });
    const started = Date.now();
    try {
      const path = held.conflicted[0]!;
      const applied = await runner.applyProposal(revisions, [
        { path, content: candidate("held", "combined", path) },
      ]);
      expect(applied.changedFiles).toContain(path);
      expect(await runner.parseCheck([path])).toEqual([
        { path, state: "passed", detail: "node --check" },
      ]);
      expect(await runner.checkNetworkDenied()).toBe(true);
      const tests = await runner.runTests(applied.changedFiles);
      // The held scenario's caller still uses the old signature: a real failure.
      expect(tests.state).toBe("failed");
      expect(tests.exitCode).not.toBeNull();
      expect(tests.exitCode).not.toBe(0);
      expect(tests.durationMs).toBeLessThan(30_000);
    } finally {
      await runner.dispose();
      const total = Date.now() - started;
      console.log(
        `Sandbox (${runner.nodeVersion ?? "node ?"}), total ${(total / 1000).toFixed(1)} s:\n${runner.timings.map((t) => `  ${t.label}: ${(t.ms / 1000).toFixed(1)} s`).join("\n")}`,
      );
      expect(total).toBeLessThan(120_000);
    }
  });
});
