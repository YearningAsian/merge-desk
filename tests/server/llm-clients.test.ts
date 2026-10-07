import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ModelAnalysis } from "@/core/options";
import { MalformedOutputError } from "@/server/errors";
import { geminiAnalyst } from "@/server/gemini/analyze";
import { ModelProposal, geminiProposer } from "@/server/gemini/propose";
import { AnthropicClient } from "@/server/llm/anthropic";
import { ModelChoiceError, planModel } from "@/server/llm/client";
import { OpenAIClient } from "@/server/llm/openai";
import { OpenRouterClient } from "@/server/llm/openrouter";
import { ProviderError, strictJsonSchema, type StructuredClient } from "@/server/llm/structured";

// The bring-your-own-key clients, through the real Anthropic and OpenAI SDKs
// with only fetch replaced: each request must go to the provider's own host
// with your key and the documented structured-output body, whatever the
// environment says, and each documented answer shape must come back as
// validated data. No key, prompt or provider error text may leak.

const KEY = "sk-test-" + "k".repeat(40);
const answer = {
  intents: { ours: "renames fetchUser to getUser", theirs: "retries on HTTP 429" },
  options: [
    {
      kind: "combine",
      summary: "keeps the rename and the retry",
      recommended: true,
      reason: "both matter",
    },
    {
      kind: "keep_ours",
      summary: "keeps only the rename",
      recommended: false,
      reason: "if the retry is unwanted",
    },
  ],
};
const request = { schema: ModelAnalysis, system: "SYSTEM PROMPT", input: "THE CONFLICT" };

type Sent = { url: string; headers: Headers; body: Record<string, unknown> };
let sent: Sent[] = [];
let reply: { status: number; body: unknown } = { status: 200, body: {} };
const saved = { ...process.env };

beforeEach(() => {
  sent = [];
  // A hostile environment: none of this may redirect or add credentials.
  Object.assign(process.env, {
    ANTHROPIC_BASE_URL: "https://evil.example",
    ANTHROPIC_AUTH_TOKEN: "env-token",
    ANTHROPIC_API_KEY: "env-key",
    ANTHROPIC_LOG: "debug",
    OPENAI_BASE_URL: "https://evil.example/v1",
    OPENAI_ORG_ID: "org-env",
    OPENAI_PROJECT_ID: "proj-env",
    OPENAI_API_KEY: "env-key",
    OPENAI_LOG: "debug",
  });
  vi.stubGlobal("fetch", async (url: string | URL | Request, init?: RequestInit) => {
    sent.push({
      url: String(url instanceof Request ? url.url : url),
      headers: new Headers(init?.headers),
      body: JSON.parse(String(init?.body ?? "{}")),
    });
    return new Response(JSON.stringify(reply.body), {
      status: reply.status,
      headers: { "content-type": "application/json" },
    });
  });
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  process.env = { ...saved };
});

const walk = (node: unknown, visit: (object: Record<string, unknown>) => void): void => {
  if (Array.isArray(node)) node.forEach((item) => walk(item, visit));
  else if (node && typeof node === "object") {
    visit(node as Record<string, unknown>);
    Object.values(node).forEach((value) => walk(value, visit));
  }
};

describe("strict JSON schema for every provider", () => {
  it("closes every object, requires every property and drops size constraints", () => {
    for (const schema of [ModelAnalysis, ModelProposal]) {
      const json = strictJsonSchema(schema);
      walk(json, (node) => {
        for (const key of ["minLength", "maxLength", "minItems", "maxItems", "$schema"])
          expect(node, key).not.toHaveProperty(key);
        if (node.type === "object") {
          expect(node.additionalProperties).toBe(false);
          expect(node.required).toEqual(Object.keys(node.properties as object));
        }
      });
      // The descriptions the model reads survive.
      expect(JSON.stringify(json)).toContain("conflict");
    }
  });
});

describe("Claude on your Anthropic key", () => {
  const message = (text: string, stop = "end_turn") => ({
    id: "msg_1",
    type: "message",
    role: "assistant",
    model: "claude-opus-5-5",
    content: [{ type: "text", text }],
    stop_reason: stop,
    stop_sequence: null,
    usage: { input_tokens: 10, output_tokens: 20 },
  });

  it("sends the documented structured-output request to Anthropic, with your key only", async () => {
    reply = { status: 200, body: message(JSON.stringify(answer)) };
    const log = vi.spyOn(console, "log");
    const client = AnthropicClient.withKey(KEY, "claude-opus-5-5");
    const { value } = await client.structured(request);
    expect(value).toEqual(answer);
    expect(client.model).toBe("anthropic:claude-opus-5-5");

    const [call] = sent;
    expect(call!.url).toBe("https://api.anthropic.com/v1/messages");
    expect(call!.headers.get("x-api-key")).toBe(KEY);
    expect(call!.headers.get("authorization")).toBeNull();
    expect(call!.headers.get("anthropic-version")).toBeTruthy();
    expect(call!.body).toMatchObject({
      model: "claude-opus-5-5",
      system: "SYSTEM PROMPT",
      messages: [{ role: "user", content: "THE CONFLICT" }],
      output_config: { effort: "medium", format: { type: "json_schema" } },
    });
    expect(call!.body).not.toHaveProperty("thinking");
    expect(JSON.stringify(call!.body)).not.toContain("minLength");
    expect(log).not.toHaveBeenCalled();
  });

  it("leaves effort out for models that don't take it", async () => {
    reply = { status: 200, body: message(JSON.stringify(answer)) };
    await AnthropicClient.withKey(KEY, "claude-haiku-4-5").structured(request);
    expect(sent[0]!.body.output_config as object).not.toHaveProperty("effort");
  });

  it("holds a refusal, retries a cut-off or invalid answer, and names a bad key in fixed words", async () => {
    reply = { status: 200, body: message("", "refusal") };
    await expect(
      AnthropicClient.withKey(KEY, "claude-opus-5-5").structured(request),
    ).rejects.toThrow(ProviderError);
    reply = { status: 200, body: message('{"intents":', "max_tokens") };
    await expect(
      AnthropicClient.withKey(KEY, "claude-opus-5-5").structured(request),
    ).rejects.toThrow(MalformedOutputError);
    const tooLong = { ...answer, intents: { ...answer.intents, ours: "x".repeat(500) } };
    reply = { status: 200, body: message(JSON.stringify(tooLong)) };
    await expect(
      AnthropicClient.withKey(KEY, "claude-opus-5-5").structured(request),
    ).rejects.toThrow(MalformedOutputError);

    reply = {
      status: 401,
      body: {
        type: "error",
        error: { type: "authentication_error", message: `invalid x-api-key ${KEY}` },
      },
    };
    const error = (await AnthropicClient.withKey(KEY, "claude-opus-5-5")
      .structured(request)
      .catch((caught: unknown) => caught)) as Error;
    expect(error).toBeInstanceOf(ProviderError);
    expect(error.message).toBe("Anthropic refused the key. Check it in Settings.");
    expect(error.message).not.toContain(KEY.slice(-12));
  });

  it("stops at its deadline", async () => {
    vi.stubGlobal(
      "fetch",
      (_url: string, init?: RequestInit) =>
        new Promise((_, reject) =>
          init?.signal?.addEventListener("abort", () =>
            reject(new DOMException("aborted", "AbortError")),
          ),
        ),
    );
    const create: ConstructorParameters<typeof AnthropicClient>[0] = (_body, options) =>
      new Promise((_, reject) =>
        options.signal.addEventListener("abort", () => reject(new Error("aborted"))),
      );
    await expect(
      new AnthropicClient(create, "claude-opus-5-5", 20).structured(request),
    ).rejects.toThrow(/did not answer within/);
  });
});

describe("GPT on your OpenAI key", () => {
  const response = (text: string, status = "completed", content?: unknown[]) => ({
    id: "resp_1",
    object: "response",
    created_at: 1,
    model: "gpt-6-astra",
    status,
    output: [
      {
        type: "message",
        id: "msg_1",
        role: "assistant",
        status,
        content: content ?? [{ type: "output_text", text, annotations: [] }],
      },
    ],
  });

  it("sends the documented Responses API request to OpenAI, unstored, with your key only", async () => {
    reply = { status: 200, body: response(JSON.stringify(answer)) };
    const client = OpenAIClient.withKey(KEY, "gpt-6-astra");
    expect((await client.structured(request)).value).toEqual(answer);
    const [call] = sent;
    expect(call!.url).toBe("https://api.openai.com/v1/responses");
    expect(call!.headers.get("authorization")).toBe(`Bearer ${KEY}`);
    expect(call!.headers.get("openai-organization")).toBeNull();
    expect(call!.headers.get("openai-project")).toBeNull();
    expect(call!.body).toMatchObject({
      model: "gpt-6-astra",
      instructions: "SYSTEM PROMPT",
      input: "THE CONFLICT",
      store: false,
      text: { format: { type: "json_schema", name: "merge_desk_answer", strict: true } },
    });
  });

  it("holds a refusal and retries a cut-off answer", async () => {
    reply = {
      status: 200,
      body: response("", "completed", [{ type: "refusal", refusal: "no" }]),
    };
    await expect(OpenAIClient.withKey(KEY, "gpt-6-astra").structured(request)).rejects.toThrow(
      ProviderError,
    );
    reply = { status: 200, body: response('{"intents":', "incomplete") };
    await expect(OpenAIClient.withKey(KEY, "gpt-6-astra").structured(request)).rejects.toThrow(
      MalformedOutputError,
    );
  });

  it("never repeats OpenAI's error text, which can echo part of the key", async () => {
    reply = {
      status: 401,
      body: {
        error: { message: `Incorrect API key provided: ${KEY}`, type: "invalid_request_error" },
      },
    };
    const error = (await OpenAIClient.withKey(KEY, "gpt-6-astra")
      .structured(request)
      .catch((caught: unknown) => caught)) as Error;
    expect(error.message).toBe("OpenAI refused the key. Check it in Settings.");
    reply = { status: 404, body: { error: { message: "The model does not exist" } } };
    await expect(OpenAIClient.withKey(KEY, "gpt-6-nope").structured(request)).rejects.toThrow(
      "OpenAI doesn't know that model. Pick another.",
    );
  });
});

describe("any model on your OpenRouter key", () => {
  const completion = (content: string | null, finish = "stop", refusal: string | null = null) => ({
    id: "gen_1",
    object: "chat.completion",
    created: 1,
    model: "anthropic/claude-sonnet-5.5",
    choices: [
      { index: 0, finish_reason: finish, message: { role: "assistant", content, refusal } },
    ],
  });

  it("sends the documented request to OpenRouter, only to endpoints that honor it", async () => {
    reply = { status: 200, body: completion(JSON.stringify(answer)) };
    const client = OpenRouterClient.withKey(KEY, "anthropic/claude-sonnet-5.5");
    expect((await client.structured(request)).value).toEqual(answer);
    const [call] = sent;
    expect(call!.url).toBe("https://openrouter.ai/api/v1/chat/completions");
    expect(call!.headers.get("authorization")).toBe(`Bearer ${KEY}`);
    expect(call!.body).toMatchObject({
      model: "anthropic/claude-sonnet-5.5",
      messages: [
        { role: "system", content: "SYSTEM PROMPT" },
        { role: "user", content: "THE CONFLICT" },
      ],
      response_format: {
        type: "json_schema",
        json_schema: { name: "merge_desk_answer", strict: true },
      },
      provider: { require_parameters: true, data_collection: "deny" },
    });
  });

  it("holds a refusal, retries a cut-off answer and explains a missing endpoint", async () => {
    reply = { status: 200, body: completion(null, "stop", "no") };
    await expect(
      OpenRouterClient.withKey(KEY, "x-ai/grok-4.7").structured(request),
    ).rejects.toThrow(ProviderError);
    reply = { status: 200, body: completion('{"intents":', "length") };
    await expect(
      OpenRouterClient.withKey(KEY, "x-ai/grok-4.7").structured(request),
    ).rejects.toThrow(MalformedOutputError);
    reply = { status: 404, body: { error: { message: "No endpoints found", code: 404 } } };
    await expect(
      OpenRouterClient.withKey(KEY, "x-ai/grok-4.7").structured(request),
    ).rejects.toThrow(/no endpoint for that model with structured output/);
  });
});

describe("choosing a model", () => {
  it("needs the provider's key, and makes nothing until asked", () => {
    expect(() => planModel("anthropic:claude-opus-5-5", {})).toThrow(ModelChoiceError);
    expect(() => planModel("openrouter:openai/gpt-6.1-sol", { anthropic: KEY })).toThrow(
      /OpenRouter key/,
    );
    expect(() => planModel("anthropic:Claude!", { anthropic: KEY })).toThrow(ModelChoiceError);
    expect(sent).toEqual([]);

    expect(planModel("anthropic:claude-sonnet-5-5", { anthropic: KEY })().model).toBe(
      "anthropic:claude-sonnet-5-5",
    );
    expect(planModel("openai:gpt-6-luna", { openai: KEY })().label).toBe("GPT (gpt-6-luna)");
    expect(planModel("openrouter:deepseek/deepseek-v4.1-flash", { openrouter: KEY })().model).toBe(
      "openrouter:deepseek/deepseek-v4.1-flash",
    );
    expect(planModel(undefined, {})({ GEMINI_API_KEY: "g".repeat(39) }).model).toBe(
      "gemini-3.5-flash-lite",
    );
    expect(planModel("gemini-3.8-flash", {})({ GEMINI_API_KEY: "g".repeat(39) }).label).toBe(
      "Gemini (gemini-3.8-flash)",
    );
    expect(sent).toEqual([]);
  });

  describe("cancelling a call on your key", () => {
    it("the analyst and the proposer hand the signal to the model call", async () => {
      const signals: Array<AbortSignal | undefined> = [];
      const client = {
        model: "anthropic:claude-opus-5-5",
        label: "Claude (claude-opus-5-5)",
        structured: async <T>(req: {
          signal?: AbortSignal;
          schema: { parse: (v: unknown) => T };
        }) => {
          signals.push(req.signal);
          throw new MalformedOutputError("stop here");
        },
      } as unknown as StructuredClient;
      const controller = new AbortController();
      await geminiAnalyst(client)({
        files: [],
        commits: { ours: [], theirs: [] },
        older: "ours",
        signal: controller.signal,
      } as unknown as Parameters<ReturnType<typeof geminiAnalyst>>[0]).catch(() => undefined);
      await geminiProposer(client, { files: [], intents: { ours: "a", theirs: "b" } })({
        conflictedPaths: [],
        option: "combine",
        signal: controller.signal,
      }).catch(() => undefined);
      expect(signals).toEqual([controller.signal, controller.signal]);
    });

    it("stops an in-flight provider call at once and says it was stopped", async () => {
      const create: ConstructorParameters<typeof AnthropicClient>[0] = (_body, options) =>
        new Promise((_, reject) =>
          options.signal.addEventListener("abort", () => reject(new Error("aborted"))),
        );
      const controller = new AbortController();
      const started = Date.now();
      const call = new AnthropicClient(create, "claude-opus-5-5", 60_000).structured({
        ...request,
        signal: controller.signal,
      });
      setTimeout(() => controller.abort(), 10);
      await expect(call).rejects.toThrow("Stopped before Anthropic answered.");
      expect(Date.now() - started).toBeLessThan(1_000);
    });
  });
});
