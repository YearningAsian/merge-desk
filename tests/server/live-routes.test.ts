import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
// Static imports: vi.mock is hoisted above them, and loading the analyze
// route (Gemini, Sandbox, TypeScript) inside a test can outlast its timeout
// when every test file loads at once.
import { POST } from "@/app/api/live/analyze/route";
import { GET } from "@/app/api/live/prs/route";
import { SESSION_COOKIE, sealSession } from "@/server/session";

vi.mock("@/server/github/app", () => ({
  installationOctokit: vi.fn(async () => ({})),
  splitRepo: (repo: string) => {
    const [owner, name] = repo.split("/");
    return { owner, name };
  },
}));
vi.mock("@/server/github/prs", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/github/prs")>()),
  listPulls: vi.fn(async (_octokit: unknown, repo: string) => ({ repo, pulls: [] })),
}));

const SECRET = "z".repeat(48);
const saved = { ...process.env };
beforeEach(() => {
  process.env.SESSION_SECRET = SECRET;
  process.env.ALLOWED_LOGINS = "YearningAsian";
});
afterEach(() => {
  process.env = { ...saved };
});

const get = (cookie?: string) =>
  new Request("http://localhost:3000/api/live/prs", {
    headers: cookie ? { cookie: `${SESSION_COOKIE}=${cookie}` } : {},
  });

describe("GET /api/live/prs", () => {
  it("answers 401 signed out, 403 for another login, and the list when allowed", async () => {
    expect((await GET(get())).status).toBe(401);
    expect((await GET(get(await sealSession("someone-else")))).status).toBe(403);
    const ok = await GET(get(await sealSession("YearningAsian")));
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({ repo: "YearningAsian/merge-desk", pulls: [] });
  });
});

describe("POST /api/live/analyze", () => {
  it("refuses a cross-site request before reading anything", async () => {
    const response = await POST(
      new Request("http://localhost:3000/api/live/analyze", {
        method: "POST",
        headers: {
          cookie: `${SESSION_COOKIE}=${await sealSession("YearningAsian")}`,
          origin: "https://evil.example",
          "content-type": "application/json",
        },
        body: JSON.stringify({ pr: 1 }),
      }),
    );
    expect(response.status).toBe(403);
  });

  it("refuses a model outside the Settings list before calling anyone", async () => {
    const response = await POST(
      new Request("http://localhost:3000/api/live/analyze", {
        method: "POST",
        headers: {
          cookie: `${SESSION_COOKIE}=${await sealSession("YearningAsian")}`,
          origin: "http://localhost:3000",
          "content-type": "application/json",
        },
        body: JSON.stringify({ pr: 1, model: "some-other-model" }),
      }),
    );
    expect(response.status).toBe(400);
  });
});
