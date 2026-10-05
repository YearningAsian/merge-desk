import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
// Static imports: vi.mock is hoisted above them, and loading the analyze
// route (Gemini, Sandbox, TypeScript) inside a test can outlast its timeout
// when every test file loads at once.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { POST } from "@/app/api/live/analyze/route";
import { GET } from "@/app/api/live/prs/route";
import { POST as RUN } from "@/app/api/live/run/route";
import { AnalyzeEvent, type Analysis } from "@/core/events";
import { signAnalysis } from "@/server/pipeline/analyze";
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

describe("POST /api/live/run", () => {
  // The real recorded drop analysis: Gemini offered keep ours and keep theirs.
  const drop = readFileSync(
    join(import.meta.dirname, "../e2e/fixtures/analyze-drop.ndjson"),
    "utf8",
  )
    .split("\n")
    .filter(Boolean)
    .map((line) => AnalyzeEvent.parse(JSON.parse(line)))
    .flatMap((event) => ("type" in event && event.ok ? [event.analysis] : []))[0] as Analysis;

  const post = async (body: unknown, origin = "http://localhost:3000") =>
    RUN(
      new Request("http://localhost:3000/api/live/run", {
        method: "POST",
        headers: {
          cookie: `${SESSION_COOKIE}=${await sealSession("YearningAsian")}`,
          origin,
          "content-type": "application/json",
        },
        body: JSON.stringify(body),
      }),
    );

  it("refuses a cross-site request", async () => {
    const token = signAnalysis(drop, { user: "YearningAsian", secret: SECRET });
    const response = await post(
      { pr: drop.pr, token, option: "keep_ours" },
      "https://evil.example",
    );
    expect(response.status).toBe(403);
  });

  it("refuses an analysis this server didn't sign for this user", async () => {
    expect((await post({ pr: drop.pr, token: "v1.forged.sig", option: "keep_ours" })).status).toBe(
      403,
    );
    const someoneElses = signAnalysis(drop, { user: "someone-else", secret: SECRET });
    expect((await post({ pr: drop.pr, token: someoneElses, option: "keep_ours" })).status).toBe(
      403,
    );
    const otherPr = signAnalysis(drop, { user: "YearningAsian", secret: SECRET });
    expect((await post({ pr: drop.pr! + 1, token: otherPr, option: "keep_ours" })).status).toBe(
      403,
    );
  });

  it("refuses an option the analysis didn't offer", async () => {
    const token = signAnalysis(drop, { user: "YearningAsian", secret: SECRET });
    const response = await post({ pr: drop.pr, token, option: "combine" });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "That option wasn't offered for this analysis.",
    });
  });
});
