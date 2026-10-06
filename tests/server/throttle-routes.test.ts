import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST as ANALYZE } from "@/app/api/live/analyze/route";
import { POST as RUN } from "@/app/api/live/run/route";
import { AnalyzeEvent, type Analysis } from "@/core/events";
import { signAnalysis } from "@/server/pipeline/analyze";
import { SESSION_COOKIE, sealSession } from "@/server/session";

const mocks = vi.hoisted(() => ({ admit: vi.fn(), client: vi.fn() }));
vi.mock("@/server/throttle", () => ({ admitLiveWork: mocks.admit }));
vi.mock("@/server/github/app", () => ({
  installationOctokit: mocks.client,
  splitRepo: (repo: string) => {
    const [owner, name] = repo.split("/");
    return { owner, name };
  },
}));

const SECRET = "z".repeat(48);
const saved = { ...process.env };
beforeEach(() => {
  vi.resetAllMocks();
  process.env.SESSION_SECRET = SECRET;
  process.env.ALLOWED_LOGINS = "YearningAsian";
  delete process.env.RUNNER;
  mocks.client.mockRejectedValue(new Error("GitHub must not be called"));
});
afterEach(() => {
  process.env = { ...saved };
});

const drop = readFileSync(join(import.meta.dirname, "../e2e/fixtures/analyze-drop.ndjson"), "utf8")
  .split("\n")
  .filter(Boolean)
  .map((line) => AnalyzeEvent.parse(JSON.parse(line)))
  .flatMap((event) => ("type" in event && event.ok ? [event.analysis] : []))[0] as Analysis;

const post = async (
  handler: (request: Request) => Promise<Response>,
  path: string,
  body: unknown,
) =>
  handler(
    new Request(`http://localhost:3000${path}`, {
      method: "POST",
      headers: {
        cookie: `${SESSION_COOKIE}=${await sealSession("YearningAsian")}`,
        origin: "http://localhost:3000",
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    }),
  );

const analyze = () => post(ANALYZE, "/api/live/analyze", { pr: 1 });
const run = () =>
  post(RUN, "/api/live/run", {
    pr: drop.pr,
    token: signAnalysis(drop, { user: "YearningAsian", secret: SECRET }),
    option: "keep_ours",
  });

describe("live analysis and runs behind the daily throttle", () => {
  for (const [name, call] of [
    ["analyze", analyze],
    ["run", run],
  ] as const) {
    it(`${name}: refuses at the cap before calling GitHub, Gemini or a sandbox`, async () => {
      mocks.admit.mockResolvedValue({ ok: false, status: 429, reason: "used up" });
      const response = await call();
      expect(response.status).toBe(429);
      expect(await response.json()).toEqual({ error: "used up" });
      expect(mocks.client).not.toHaveBeenCalled();
    });

    it(`${name}: refuses when the count is unavailable`, async () => {
      mocks.admit.mockResolvedValue({ ok: false, status: 503, reason: "couldn't count" });
      expect((await call()).status).toBe(503);
      expect(mocks.client).not.toHaveBeenCalled();
    });

    it(`${name}: goes on to GitHub once admitted`, async () => {
      mocks.admit.mockResolvedValue({ ok: true, used: 0, cap: 30 });
      await call();
      expect(mocks.admit).toHaveBeenCalledTimes(1);
      expect(mocks.client).toHaveBeenCalledTimes(1);
    });
  }

  it("skips the count for the trusted laptop runner, which boots no sandbox", async () => {
    process.env.RUNNER = "local";
    delete process.env.VERCEL;
    await analyze();
    expect(mocks.admit).not.toHaveBeenCalled();
  });

  it("never skips it on Vercel, whatever RUNNER says", async () => {
    process.env.RUNNER = "local";
    process.env.VERCEL = "1";
    mocks.admit.mockResolvedValue({ ok: false, status: 429, reason: "used up" });
    expect((await analyze()).status).toBe(429);
  });
});
