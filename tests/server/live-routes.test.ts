import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
// Static imports: vi.mock is hoisted above them, and loading the analyze
// route (Gemini, Sandbox, TypeScript) inside a test can outlast its timeout
// when every test file loads at once.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { POST } from "@/app/api/live/analyze/route";
import { GET } from "@/app/api/live/prs/route";
import { POST as LAND } from "@/app/api/live/land/route";
import { POST as RECORD } from "@/app/api/live/record/route";
import { POST as RUN } from "@/app/api/live/run/route";
import { AnalyzeEvent, type Analysis } from "@/core/events";
import type { RunRecord } from "@/core/run";
import { signAnalysis } from "@/server/pipeline/analyze";
import { signRun } from "@/server/pipeline/run";
import { installationOctokit } from "@/server/github/app";
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

describe("POST /api/live/land and /api/live/record", () => {
  const record: RunRecord = {
    v: 1,
    repo: "YearningAsian/merge-desk",
    pr: 1,
    verdict: "VERIFIED",
    option: "combine",
    drops: null,
    revisions: { head: "a".repeat(40), base: "b".repeat(40) },
    tree: "c".repeat(40),
    changes: [{ path: "playground/src/api.js", mode: "100644", content: "x" }],
    changesNote: null,
    description: null,
    reason: null,
    summary: [],
    checks: [],
    analysisModel: "m",
    proposeModel: "m",
    steer: null,
    finishedAt: "2026-10-05T12:00:00.000Z",
  };
  const call = async (
    handler: (request: Request) => Promise<Response>,
    path: string,
    body: unknown,
    origin = "http://localhost:3000",
  ) =>
    handler(
      new Request(`http://localhost:3000${path}`, {
        method: "POST",
        headers: {
          cookie: `${SESSION_COOKIE}=${await sealSession("YearningAsian")}`,
          origin,
          "content-type": "application/json",
        },
        body: JSON.stringify(body),
      }),
    );

  it("refuses a cross-site Land before reading anything", async () => {
    const token = signRun(record, { user: "YearningAsian", secret: SECRET });
    const response = await call(LAND, "/api/live/land", { pr: 1, token }, "https://evil.example");
    expect(response.status).toBe(403);
  });

  it("refuses to land a forged run, someone else's run or another pull request's run", async () => {
    const forged = await call(LAND, "/api/live/land", { pr: 1, token: "v1.forged.sig" });
    expect(forged.status).toBe(403);
    expect(await forged.json()).toMatchObject({ outcome: "REFUSED" });
    const theirs = signRun(record, { user: "someone-else", secret: SECRET });
    expect((await call(LAND, "/api/live/land", { pr: 1, token: theirs })).status).toBe(403);
    const mine = signRun(record, { user: "YearningAsian", secret: SECRET });
    expect((await call(LAND, "/api/live/land", { pr: 2, token: mine })).status).toBe(403);
  });

  it("records a hold only for a run that was actually held", async () => {
    const verified = signRun(record, { user: "YearningAsian", secret: SECRET });
    const response = await call(RECORD, "/api/live/record", {
      pr: 1,
      token: verified,
      action: "held",
    });
    expect(response.status).toBe(409);
  });
});

// Review 10.1: readPull reads the base branch's tip (git refs), which needs
// contents:read on the token, and a base it can't read is named as such.
describe("analyze and run read the base branch", () => {
  const octokit = vi.mocked(installationOctokit);
  const signedIn = async (path: string, body: unknown) =>
    new Request(`http://localhost:3000${path}`, {
      method: "POST",
      headers: {
        cookie: `${SESSION_COOKIE}=${await sealSession("YearningAsian")}`,
        origin: "http://localhost:3000",
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    });
  beforeEach(() => {
    process.env.RUNNER = "local"; // no sandbox, so no daily count to read
    delete process.env.VERCEL;
  });

  it("asks for a token that can read the base branch's ref", async () => {
    octokit.mockRejectedValueOnce(Object.assign(new Error("down"), { status: 500 }));
    expect((await POST(await signedIn("/api/live/analyze", { pr: 1 }))).status).toBe(503);
    expect(octokit).toHaveBeenLastCalledWith(
      "YearningAsian/merge-desk",
      expect.objectContaining({ pull_requests: "read", contents: "read" }),
    );

    const drop = readFileSync(
      join(import.meta.dirname, "../e2e/fixtures/analyze-drop.ndjson"),
      "utf8",
    )
      .split("\n")
      .filter(Boolean)
      .map((line) => AnalyzeEvent.parse(JSON.parse(line)))
      .flatMap((event) => ("type" in event && event.ok ? [event.analysis] : []))[0] as Analysis;
    const token = signAnalysis(drop, { user: "YearningAsian", secret: SECRET });
    octokit.mockRejectedValueOnce(Object.assign(new Error("down"), { status: 500 }));
    const run = await RUN(
      await signedIn("/api/live/run", { pr: drop.pr, token, option: drop.options[0]!.kind }),
    );
    expect(run.status).toBe(503);
    expect(octokit).toHaveBeenLastCalledWith(
      "YearningAsian/merge-desk",
      expect.objectContaining({ pull_requests: "read", contents: "read" }),
    );
  });

  it("names a base branch it can't read instead of calling the pull request missing", async () => {
    octokit.mockResolvedValueOnce({
      pulls: {
        get: async () => ({
          data: {
            number: 10,
            title: "x",
            html_url: "https://github.com/YearningAsian/merge-desk/pull/10",
            updated_at: "2026-10-07T10:00:00Z",
            user: { login: "YearningAsian" },
            labels: [],
            state: "open",
            head: {
              ref: "feat/x",
              sha: "a".repeat(40),
              repo: { full_name: "YearningAsian/merge-desk" },
            },
            base: { ref: "release/old", sha: "b".repeat(40) },
          },
        }),
      },
      git: {
        getRef: async () => {
          throw Object.assign(new Error("Not Found"), { status: 404 });
        },
      },
    } as never);
    const response = await POST(await signedIn("/api/live/analyze", { pr: 10 }));
    expect(response.status).toBe(409);
    expect((await response.json()).error).toMatch(/base branch release\/old/);
  });
});
