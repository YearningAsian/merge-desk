import { describe, expect, it } from "vitest";
import { ModelChoice, modelLabel, parseModelChoice } from "@/core/models";
import { ApiKey, KEYS_COOKIE, keysCookie, readKeys, savedProviders, sealKeys } from "@/server/keys";
import { SESSION_COOKIE, SESSION_TTL_S, sealSession } from "@/server/session";

const env = { SESSION_SECRET: "q".repeat(48) };
const KEY = "sk-or-v1-" + "a".repeat(48);
const now = 1_800_000_000_000;
const cookie = (seal: string) => `${KEYS_COOKIE}=${seal}`;
const me = { login: "YearningAsian", exp: now + SESSION_TTL_S * 1000 };

describe("model choices", () => {
  it("names a provider and a model of the provider's shape", () => {
    expect(parseModelChoice("gemini-3.5-flash-lite")).toEqual({
      provider: "gemini",
      model: "gemini-3.5-flash-lite",
    });
    expect(parseModelChoice("anthropic:claude-opus-5-5")).toEqual({
      provider: "anthropic",
      model: "claude-opus-5-5",
    });
    expect(parseModelChoice("openrouter:qwen/qwen3.8-flash:free")).toEqual({
      provider: "openrouter",
      model: "qwen/qwen3.8-flash:free",
    });
    for (const bad of [
      "gemini-9",
      "anthropic:",
      "anthropic:Claude",
      "openai:gpt 6",
      "openrouter:gpt-6",
      "openrouter:a/b/c",
      "openai:../../v1",
      "azure:gpt-6",
    ])
      expect(parseModelChoice(bad), bad).toBeNull();
    expect(ModelChoice.safeParse("x".repeat(101)).success).toBe(false);
  });

  it("labels each choice for people", () => {
    expect(modelLabel("anthropic:claude-opus-5-5")).toBe("Claude Opus 5.5");
    expect(modelLabel("openai:gpt-6-luna")).toBe("GPT-6 Luna");
    expect(modelLabel("openrouter:x-ai/grok-4.7")).toBe("x-ai/grok-4.7 via OpenRouter");
    expect(modelLabel("gemini-3.8-flash")).toBe("Gemini 3.8 Flash");
  });
});

describe("sealed model keys", () => {
  it("open only for the sign-in they were sealed for, until the session's end", async () => {
    const seal = await sealKeys(me, { openrouter: KEY }, { env });
    expect(seal).not.toContain(KEY);
    expect(await readKeys(cookie(seal), me, { env, now })).toEqual({
      openrouter: KEY,
    });
    expect(await readKeys(cookie(seal), { ...me, login: "someone-else" }, { env, now })).toEqual(
      {},
    );
    expect(await readKeys(cookie(seal), me, { env, now: me.exp })).toEqual({});
    expect(
      await readKeys(cookie(seal), me, { env: { SESSION_SECRET: "r".repeat(48) }, now }),
    ).toEqual({});
  });

  it("refuse a tampered seal, and a session seal can't stand in for keys", async () => {
    const seal = await sealKeys(me, { openrouter: KEY }, { env });
    const tampered = seal.slice(0, -4) + (seal.endsWith("AAAA") ? "BBBB" : "AAAA");
    expect(await readKeys(cookie(tampered), me, { env, now })).toEqual({});
    const session = await sealSession("YearningAsian", { env, now });
    expect(await readKeys(cookie(session), me, { env, now })).toEqual({});
    expect(await readKeys(`${SESSION_COOKIE}=${seal}`, me, { env, now })).toEqual({});
  });

  it("are one key-shaped token each, and say only which providers have one", () => {
    expect(ApiKey.safeParse(KEY).success).toBe(true);
    for (const bad of ["short", `${KEY}\r\nx: y`, `${KEY};`, `${KEY} `.repeat(2), "é".repeat(30)])
      expect(ApiKey.safeParse(bad).success, JSON.stringify(bad)).toBe(false);
    expect(savedProviders({ openrouter: KEY })).toEqual({
      anthropic: false,
      openai: false,
      openrouter: true,
    });
  });

  it("travel in a strict, HTTP-only cookie scoped to the live API", () => {
    const set = keysCookie("SEAL", { NODE_ENV: "production" });
    expect(set).toBe(
      `${KEYS_COOKIE}=SEAL; Path=/api/live; Max-Age=${SESSION_TTL_S}; HttpOnly; SameSite=Strict; Secure`,
    );
    expect(keysCookie(null, {})).toBe(
      `${KEYS_COOKIE}=; Path=/api/live; Max-Age=0; HttpOnly; SameSite=Strict`,
    );
  });

  it("belong to the sign-in session that saved them: a new session can't open them", async () => {
    const first = { login: "YearningAsian", exp: now + SESSION_TTL_S * 1000 };
    const later = { login: "YearningAsian", exp: now + 2 * SESSION_TTL_S * 1000 };
    const seal = await sealKeys(first, { openrouter: KEY }, { env });
    expect(await readKeys(cookie(seal), first, { env, now })).toEqual({ openrouter: KEY });
    expect(await readKeys(cookie(seal), later, { env, now })).toEqual({});
    // A later save in the same session keeps that session's end.
    const again = await sealKeys(first, { openrouter: KEY, openai: KEY }, { env });
    expect(await readKeys(cookie(again), first, { env, now: now + 3_600_000 })).toEqual({
      openrouter: KEY,
      openai: KEY,
    });
    expect(await readKeys(cookie(again), first, { env, now: first.exp })).toEqual({});
  });
});
