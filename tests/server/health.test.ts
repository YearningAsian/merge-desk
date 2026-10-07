import { afterEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/health/route";

const ready = vi.hoisted(() => vi.fn());
const snapshot = vi.hoisted(() => vi.fn());
vi.mock("@/server/throttle", () => ({ throttleReady: ready }));
vi.mock("@/server/deps-snapshot", () => ({ snapshotReady: snapshot }));

afterEach(() => vi.unstubAllEnvs());

const health = async () => (await GET()).json();

describe("GET /api/health", () => {
  it("answers booleans only", async () => {
    ready.mockResolvedValue(true);
    vi.stubEnv("GEMINI_API_KEY", "a-value-that-must-not-appear");
    const body = await health();
    expect(body.ok).toBe(true);
    for (const value of Object.values(body.integrations)) expect(typeof value).toBe("boolean");
    expect(JSON.stringify(body)).not.toContain("a-value-that-must-not-appear");
  });

  // Review 6.1 L1: a request header proves nothing; a real count does.
  it("never takes a caller's OIDC header as the sandbox credential", async () => {
    ready.mockResolvedValue(false);
    vi.stubEnv("VERCEL_OIDC_TOKEN", "");
    expect(GET.length).toBe(0); // it reads nothing a caller sends, headers included
    expect((await health()).integrations.sandbox).toBe(false);
    ready.mockResolvedValue(true);
    expect((await health()).integrations.sandbox).toBe(true);
  });

  it("reports the throttle only as ready as its last real count", async () => {
    ready.mockResolvedValue(false);
    expect((await health()).integrations.throttle).toBe(false);
    ready.mockResolvedValue(true);
    expect((await health()).integrations.throttle).toBe(true);
  });
});

describe("GET /api/health: the trusted dependency snapshot", () => {
  it("reports only what the snapshot check found", async () => {
    ready.mockResolvedValue(true);
    snapshot.mockResolvedValue(false);
    expect((await health()).integrations.snapshot).toBe(false);
    snapshot.mockResolvedValue(true);
    expect((await health()).integrations.snapshot).toBe(true);
  });
});
