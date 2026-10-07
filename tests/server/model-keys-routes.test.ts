import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST as ANALYZE } from "@/app/api/live/analyze/route";
import { DELETE, GET, POST as SAVE } from "@/app/api/live/keys/route";
import { POST as RUN } from "@/app/api/live/run/route";
import { AnalyzeEvent, type Analysis } from "@/core/events";
import { KEYS_COOKIE, readKeys, sealKeys } from "@/server/keys";
import { signAnalysis } from "@/server/pipeline/analyze";
import { SESSION_COOKIE, SESSION_TTL_S, sealSession } from "@/server/session";

// Your own model keys at the routes: a key is required before anything is
// spent, belongs to one sign-in, and is never sent back.

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
// One sign-in session per test: the session cookie and the keys seal share it.
let now = Date.now();
const me = () => ({ login: "YearningAsian", exp: now + SESSION_TTL_S * 1000 });
const KEY = "sk-ant-api03-" + "A".repeat(40);
const saved = { ...process.env };
beforeEach(() => {
  vi.resetAllMocks();
  now = Date.now();
  process.env.SESSION_SECRET = SECRET;
  process.env.ALLOWED_LOGINS = "YearningAsian";
  delete process.env.RUNNER;
  mocks.client.mockRejectedValue(new Error("GitHub must not be called"));
  mocks.admit.mockResolvedValue({ ok: false, status: 429, reason: "stopped at the count" });
});
afterEach(() => {
  process.env = { ...saved };
});

const drop = readFileSync(join(import.meta.dirname, "../e2e/fixtures/analyze-drop.ndjson"), "utf8")
  .split("\n")
  .filter(Boolean)
  .map((line) => AnalyzeEvent.parse(JSON.parse(line)))
  .flatMap((event) => ("type" in event && event.ok ? [event.analysis] : []))[0] as Analysis;

async function request(
  method: string,
  path: string,
  body: unknown,
  extra: { keys?: string; login?: string; origin?: string | null } = {},
) {
  const cookies = [
    `${SESSION_COOKIE}=${await sealSession(extra.login ?? "YearningAsian", { now })}`,
  ];
  if (extra.keys) cookies.push(`${KEYS_COOKIE}=${extra.keys}`);
  const headers: Record<string, string> = {
    cookie: cookies.join("; "),
    "content-type": "application/json",
  };
  if (extra.origin !== null) headers.origin = extra.origin ?? "http://localhost:3000";
  return new Request(`http://localhost:3000${path}`, {
    method,
    headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

const analyze = async (model: string, keys?: string) =>
  ANALYZE(await request("POST", "/api/live/analyze", { pr: 1, model }, { keys }));
const run = async (model: string, keys?: string) =>
  RUN(
    await request(
      "POST",
      "/api/live/run",
      {
        pr: drop.pr,
        token: signAnalysis(drop, { user: "YearningAsian", secret: SECRET }),
        option: "keep_ours",
        model,
      },
      { keys },
    ),
  );

describe("a model on your own key", () => {
  for (const [name, call] of [
    ["analyze", analyze],
    ["run", run],
  ] as const) {
    it(`${name}: without a saved key, refuses before the count, GitHub or a sandbox`, async () => {
      const response = await call("anthropic:claude-opus-5-5");
      expect(response.status).toBe(400);
      expect((await response.json()).error).toMatch(/Add your Anthropic key in Settings/);
      expect(mocks.admit).not.toHaveBeenCalled();
      expect(mocks.client).not.toHaveBeenCalled();
    });

    it(`${name}: a key sealed for another sign-in doesn't count`, async () => {
      const elsewhere = await sealKeys({ ...me(), login: "someone-else" }, { anthropic: KEY });
      expect((await call("anthropic:claude-opus-5-5", elsewhere)).status).toBe(400);
      expect(mocks.admit).not.toHaveBeenCalled();
    });

    it(`${name}: with the key saved, goes on to the daily count`, async () => {
      const keys = await sealKeys(me(), { anthropic: KEY });
      const response = await call("anthropic:claude-opus-5-5", keys);
      expect(response.status).toBe(429);
      expect(mocks.admit).toHaveBeenCalledTimes(1);
    });

    it(`${name}: refuses a model name of the wrong shape`, async () => {
      for (const model of ["anthropic:Claude Opus", "openrouter:no-vendor", "mistral:large"])
        expect((await call(model)).status, model).toBe(400);
      expect(mocks.admit).not.toHaveBeenCalled();
    });
  }
});

describe("/api/live/keys", () => {
  it("needs a sign-in, and saving needs Merge Desk's own origin", async () => {
    const signedOut = await GET(new Request("http://localhost:3000/api/live/keys"));
    expect(signedOut.status).toBe(401);
    const foreign = await SAVE(
      await request(
        "POST",
        "/api/live/keys",
        { provider: "anthropic", key: KEY },
        { origin: "https://evil.example" },
      ),
    );
    expect(foreign.status).toBe(403);
    expect(foreign.headers.get("set-cookie")).toBeNull();
  });

  it("seals a key into a strict, HTTP-only cookie and never sends it back", async () => {
    const response = await SAVE(
      await request("POST", "/api/live/keys", { provider: "anthropic", key: KEY }),
    );
    expect(response.status).toBe(200);
    const text = await response.text();
    expect(text).not.toContain(KEY);
    expect(JSON.parse(text)).toEqual({
      saved: { anthropic: true, openai: false, openrouter: false },
    });
    const cookie = response.headers.get("set-cookie")!;
    expect(cookie).toMatch(/^merge_desk_keys=/);
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Strict");
    expect(cookie).toContain("Path=/api/live");
    expect(cookie).not.toContain(KEY);
    const seal = cookie.split(";")[0]!.slice(`${KEYS_COOKIE}=`.length);
    expect(await readKeys(`${KEYS_COOKIE}=${seal}`, me())).toEqual({ anthropic: KEY });

    const listed = await GET(await request("GET", "/api/live/keys", undefined, { keys: seal }));
    const body = await listed.text();
    expect(body).not.toContain(KEY);
    expect(JSON.parse(body).saved.anthropic).toBe(true);
  });

  it("refuses what isn't a single key token", async () => {
    for (const key of ["short", `${KEY}\nX-Evil: 1`, `"${KEY}"`, `${KEY} ${KEY}`]) {
      const response = await SAVE(
        await request("POST", "/api/live/keys", { provider: "openai", key }),
      );
      expect(response.status, JSON.stringify(key)).toBe(400);
      expect(response.headers.get("set-cookie")).toBeNull();
    }
    const unknown = await SAVE(
      await request("POST", "/api/live/keys", { provider: "mistral", key: KEY }),
    );
    expect(unknown.status).toBe(400);
  });

  it("removes one key, and clears the cookie when none is left", async () => {
    const both = await sealKeys(me(), { anthropic: KEY, openai: KEY });
    const one = await DELETE(
      await request("DELETE", "/api/live/keys", { provider: "anthropic" }, { keys: both }),
    );
    expect((await one.json()).saved).toEqual({
      anthropic: false,
      openai: true,
      openrouter: false,
    });
    const rest = one.headers.get("set-cookie")!.split(";")[0]!.slice(`${KEYS_COOKIE}=`.length);
    const none = await DELETE(
      await request("DELETE", "/api/live/keys", { provider: "openai" }, { keys: rest }),
    );
    expect(none.headers.get("set-cookie")).toMatch(/^merge_desk_keys=; .*Max-Age=0/);
  });

  it("keys saved in an earlier sign-in don't open in a new one", async () => {
    const earlier = await sealKeys({ login: "YearningAsian", exp: now - 1 }, { anthropic: KEY });
    const response = await GET(
      await request("GET", "/api/live/keys", undefined, { keys: earlier }),
    );
    expect((await response.json()).saved.anthropic).toBe(false);
  });
});
