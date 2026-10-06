import { afterEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/health/route";

const ready = vi.hoisted(() => vi.fn());
vi.mock("@/server/throttle", () => ({ throttleReady: ready }));

afterEach(() => vi.unstubAllEnvs());

const health = async (headers: Record<string, string> = {}) =>
  (await GET(new Request("https://example.invalid/api/health", { headers }))).json();

describe("GET /api/health", () => {
  it("answers booleans only", async () => {
    ready.mockResolvedValue(true);
    vi.stubEnv("GEMINI_API_KEY", "a-value-that-must-not-appear");
    const body = await health();
    expect(body.ok).toBe(true);
    for (const value of Object.values(body.integrations)) expect(typeof value).toBe("boolean");
    expect(JSON.stringify(body)).not.toContain("a-value-that-must-not-appear");
  });

  it("counts Vercel's per-request OIDC header as the sandbox credential", async () => {
    ready.mockResolvedValue(false);
    vi.stubEnv("VERCEL_OIDC_TOKEN", "");
    expect((await health()).integrations.sandbox).toBe(false);
    expect((await health({ "x-vercel-oidc-token": "t" })).integrations.sandbox).toBe(true);
  });

  it("reports the throttle only as ready as its last real count", async () => {
    ready.mockResolvedValue(false);
    expect((await health()).integrations.throttle).toBe(false);
    ready.mockResolvedValue(true);
    expect((await health()).integrations.throttle).toBe(true);
  });
});
