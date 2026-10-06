import { spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { once } from "node:events";
import { rmdir, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";
import { join, resolve, sep } from "node:path";
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

  it("keeps a dispatched aborted writer locked and gives a private-path-free reconciliation reference", async () => {
    const key = `test-aborted-record-${randomUUID()}`;
    const root = resolve(join(tmpdir(), "merge-desk-record-locks"));
    const lock = resolve(root, createHash("sha256").update(key).digest("hex"));
    if (!lock.startsWith(root + sep)) throw new Error("Unexpected fixture lock path");
    const controller = new AbortController();
    try {
      await expect(
        withLocalRecordWriter(key, async (lease) => {
          lease.dispatched();
          controller.abort();
          controller.signal.throwIfAborted();
        }),
      ).rejects.toThrow();
      let laterWrites = 0;
      const next = await withLocalRecordWriter(key, async () => {
        laterWrites += 1;
        return { ok: true as const };
      });
      expect(next).toMatchObject({ ok: false });
      expect(laterWrites).toBe(0);
      if (next?.ok !== false) throw new Error("Expected retained-lock refusal");
      const reference = next.reason.match(/merge-desk-record-locks\/([a-f0-9]{64})/);
      expect(reference).not.toBeNull();
      expect((await stat(resolve(root, reference![1]!))).isDirectory()).toBe(true);
      expect(next.reason.includes(tmpdir())).toBe(false);
      expect(next.reason.includes(key)).toBe(false);
      expect(next.reason).toMatch(
        /operator.*reconcile GitHub comments and branch state.*docs\/record-reconciliation\.md.*before retrying/i,
      );
    } finally {
      // This fixture never dispatched HTTP. Its only operation has settled;
      // remove only this test's exact empty lock, never a real provider lock.
      await rmdir(lock).catch(() => undefined);
    }
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
