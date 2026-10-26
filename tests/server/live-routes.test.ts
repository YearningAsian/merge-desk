import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
// Static imports: vi.mock is hoisted above them, and loading the analyze
// route (Gemini, Sandbox, TypeScript) inside a test can outlast its timeout
// when every test file loads at once.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { POST } from "@/app/api/live/analyze/route";
import { GET } from "@/app/api/live/prs/route";
import { POST as LAND } from "@/app/api/live/land/route";
import { GET as RECORD_GET, POST as RECORD } from "@/app/api/live/record/route";
import { POST as RUN } from "@/app/api/live/run/route";
import { AnalyzeEvent, type Analysis } from "@/core/events";
import type { RunRecord } from "@/core/run";
import { signAnalysis } from "@/server/pipeline/analyze";
import { signRun } from "@/server/pipeline/run";
import { openRepo } from "@/server/github/access";
import { installationOctokit } from "@/server/github/app";
import { listPulls } from "@/server/github/prs";
import { SESSION_COOKIE, sealSession } from "@/server/session";

vi.mock("@/server/github/access", async () => {
  const app = await import("@/server/github/app");
  return {
    // As the real one: a GitHub failure is a 503 answer, never a throw.
    openRepo: vi.fn(async (_user: unknown, repo: string, permissions: object) => {
      try {
        return { ok: true, octokit: await app.installationOctokit(repo, permissions as never) };
      } catch {
        return { ok: false, status: 503, error: "GitHub isn't reachable right now. Try again." };
      }
    }),
  };
});
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
  new Request("http://localhost:3000/api/live/prs?repo=YearningAsian/merge-desk", {
    headers: cookie ? { cookie: `${SESSION_COOKIE}=${cookie}` } : {},
  });

describe("GET /api/live/prs", () => {
  it("answers 401 signed out, 403 for another login, and the list when allowed", async () => {
    expect((await GET(get())).status).toBe(401);
    expect((await GET(get(await sealSession({ login: "someone-else", id: 1 })))).status).toBe(403);
    const ok = await GET(get(await sealSession({ login: "YearningAsian", id: 1 })));
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
          cookie: `${SESSION_COOKIE}=${await sealSession({ login: "YearningAsian", id: 1 })}`,
          origin: "https://evil.example",
          "content-type": "application/json",
        },
        body: JSON.stringify({ repo: "YearningAsian/merge-desk", pr: 1 }),
      }),
    );
    expect(response.status).toBe(403);
  });

  it("refuses a model outside the Settings list before calling anyone", async () => {
    const response = await POST(
      new Request("http://localhost:3000/api/live/analyze", {
        method: "POST",
        headers: {
          cookie: `${SESSION_COOKIE}=${await sealSession({ login: "YearningAsian", id: 1 })}`,
          origin: "http://localhost:3000",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          repo: "YearningAsian/merge-desk",
          pr: 1,
          model: "some-other-model",
        }),
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
          cookie: `${SESSION_COOKIE}=${await sealSession({ login: "YearningAsian", id: 1 })}`,
          origin,
          "content-type": "application/json",
        },
        body: JSON.stringify({ repo: "YearningAsian/merge-desk", ...(body as object) }),
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
          cookie: `${SESSION_COOKIE}=${await sealSession({ login: "YearningAsian", id: 1 })}`,
          origin,
          "content-type": "application/json",
        },
        body: JSON.stringify({ repo: "YearningAsian/merge-desk", ...(body as object) }),
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
        cookie: `${SESSION_COOKIE}=${await sealSession({ login: "YearningAsian", id: 1 })}`,
        origin: "http://localhost:3000",
        "content-type": "application/json",
      },
      body: JSON.stringify({ repo: "YearningAsian/merge-desk", ...(body as object) }),
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

// Live mode is open to any account: every route asks openRepo for push access
// to the named repository and stops at its refusal, before any other GitHub call.
describe("a refused repository stops every live route", () => {
  const access = vi.mocked(openRepo);
  const REPO = "someone/private-app";
  const ERROR = `You need write access to ${REPO} to use it in Merge Desk.`;
  const cookie = async () =>
    `${SESSION_COOKIE}=${await sealSession({ login: "YearningAsian", id: 1 })}`;
  const post = async (path: string, body: object) =>
    new Request(`http://localhost:3000${path}`, {
      method: "POST",
      headers: {
        cookie: await cookie(),
        origin: "http://localhost:3000",
        "content-type": "application/json",
      },
      body: JSON.stringify({ repo: REPO, ...body }),
    });
  const drop = readFileSync(
    join(import.meta.dirname, "../e2e/fixtures/analyze-drop.ndjson"),
    "utf8",
  )
    .split("\n")
    .filter(Boolean)
    .map((line) => AnalyzeEvent.parse(JSON.parse(line)))
    .flatMap((event) => ("type" in event && event.ok ? [event.analysis] : []))[0] as Analysis;
  const run: RunRecord = {
    v: 1,
    repo: REPO,
    pr: 1,
    verdict: "HELD",
    option: "combine",
    drops: null,
    revisions: { head: "a".repeat(40), base: "b".repeat(40) },
    tree: "c".repeat(40),
    changes: [],
    changesNote: null,
    description: null,
    reason: "held",
    summary: [],
    checks: [],
    analysisModel: "m",
    proposeModel: "m",
    steer: null,
    finishedAt: "2026-10-21T12:00:00.000Z",
  };
  beforeEach(() => {
    process.env.RUNNER = "local";
    delete process.env.VERCEL;
    delete process.env.ALLOWED_LOGINS;
    access.mockClear();
    vi.mocked(installationOctokit).mockClear();
    vi.mocked(listPulls).mockClear();
    access.mockResolvedValue({ ok: false, status: 403, error: ERROR });
  });
  afterEach(() => access.mockReset());

  it.each([
    [
      "GET prs",
      async () =>
        GET(
          new Request(`http://localhost:3000/api/live/prs?repo=${REPO}`, {
            headers: { cookie: await cookie() },
          }),
        ),
      { pull_requests: "read", contents: "read" },
    ],
    [
      "analyze",
      async () => POST(await post("/api/live/analyze", { pr: 1 })),
      { pull_requests: "read", contents: "read" },
    ],
    [
      "run",
      async () =>
        RUN(
          await post("/api/live/run", {
            pr: drop.pr,
            token: signAnalysis({ ...drop, repo: REPO }, { user: "YearningAsian", secret: SECRET }),
            option: drop.options[0]!.kind,
          }),
        ),
      { pull_requests: "read", contents: "read" },
    ],
    [
      "land",
      async () =>
        LAND(
          await post("/api/live/land", {
            pr: 1,
            token: signRun(run, { user: "YearningAsian", secret: SECRET }),
          }),
        ),
      { contents: "write", pull_requests: "write" },
    ],
    [
      "GET record",
      async () =>
        RECORD_GET(
          new Request(`http://localhost:3000/api/live/record?repo=${REPO}&pr=1`, {
            headers: { cookie: await cookie() },
          }),
        ),
      { pull_requests: "read" },
    ],
    [
      "POST record",
      async () =>
        RECORD(
          await post("/api/live/record", {
            pr: 1,
            token: signRun(run, { user: "YearningAsian", secret: SECRET }),
            action: "held",
          }),
        ),
      { contents: "write", pull_requests: "write" },
    ],
  ])("%s answers the refusal and reads nothing else", async (_name, call, permissions) => {
    const response = await call();
    expect(response.status).toBe(403);
    expect(JSON.stringify(await response.json())).toContain(ERROR);
    expect(access).toHaveBeenCalledWith(
      expect.objectContaining({ login: "YearningAsian", id: 1 }),
      REPO,
      permissions,
    );
    expect(installationOctokit).not.toHaveBeenCalled();
    expect(listPulls).not.toHaveBeenCalled();
  });
});
