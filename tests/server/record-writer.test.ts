import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { decisionWriterReason, withLocalRecordWriter } from "@/server/record-writer";

afterEach(() => vi.unstubAllEnvs());
describe("local record writer boundary", () => {
  it("rejects unknown and hosted writers and non-loopback requests", () => {
    vi.stubEnv("NODE_ENV", "");
    expect(decisionWriterReason()).not.toBeNull();
    vi.stubEnv("NODE_ENV", "development");
    expect(decisionWriterReason(new Request("https://example.invalid/live"))).not.toBeNull();
    expect(decisionWriterReason(new Request("http://localhost:3000/live"))).toBeNull();
    vi.stubEnv("VERCEL", "1");
    expect(decisionWriterReason()).not.toBeNull();
  });

  it("refuses a second operating-system process while its writer owns the lock", async () => {
    const key = `test-process-${randomUUID()}`;
    const moduleUrl = pathToFileURL(resolve("src/server/record-writer.ts")).href;
    const script = `import { withLocalRecordWriter } from ${JSON.stringify(moduleUrl)};
      await withLocalRecordWriter(${JSON.stringify(key)}, async () => {
        process.stdout.write('LOCKED');
        await new Promise(resolve => process.stdin.once('data', resolve));
      });`;
    const keep = ["PATH", "Path", "SystemRoot", "TEMP", "TMP", "USERPROFILE"];
    const env = Object.fromEntries(
      keep.filter((name) => process.env[name]).map((name) => [name, process.env[name]]),
    );
    const child = spawn(
      process.execPath,
      ["--import", "tsx", "--input-type=module", "-e", script],
      {
        cwd: process.cwd(),
        env: { ...env, NODE_ENV: "test" },
        stdio: ["pipe", "pipe", "pipe"],
      },
    );
    const closed = once(child, "close");
    try {
      const [data] = await once(child.stdout, "data");
      expect(data.toString()).toBe("LOCKED");
      const work = vi.fn(async () => ({ ok: true as const }));
      expect(await withLocalRecordWriter(key, work)).toMatchObject({ ok: false });
      expect(work).not.toHaveBeenCalled();
    } finally {
      child.stdin.end("release");
      await closed;
    }
    expect(await withLocalRecordWriter(key, async () => ({ ok: true }))).toEqual({ ok: true });
  }, 15_000);
});
