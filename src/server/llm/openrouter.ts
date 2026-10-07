import OpenAI from "openai";
import { MalformedOutputError } from "@/server/errors";
import {
  KEY_CALL_DEADLINE_MS,
  ProviderError,
  parseAnswer,
  strictJsonSchema,
  withProviderDeadline,
  type StructuredClient,
  type StructuredRequest,
} from "./structured";

// Any OpenRouter model on your own OpenRouter key, through its
// OpenAI-compatible chat completions API with structured outputs
// (response_format json_schema, strict) as OpenRouter documents them.
// Requests route only to endpoints that support every parameter sent
// (provider.require_parameters) and that don't collect prompts
// (provider.data_collection "deny"). Pinned to OpenRouter's API host, with
// no organization, project or SDK logging from the environment.

export const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";

type CompletionLike = {
  choices?: Array<{
    finish_reason?: string | null;
    message?: { content?: string | null; refusal?: string | null };
  }>;
};

// The slice of the SDK this module uses, so tests can stand in for OpenRouter.
export type CreateCompletion = (
  body: {
    model: string;
    messages: Array<{ role: "system" | "user"; content: string }>;
    max_tokens: number;
    response_format: {
      type: "json_schema";
      json_schema: { name: string; strict: true; schema: Record<string, unknown> };
    };
    provider: { require_parameters: true; data_collection: "deny" };
  },
  options: { signal: AbortSignal; timeout: number; maxRetries: number },
) => Promise<CompletionLike>;

export class OpenRouterClient implements StructuredClient {
  readonly label: string;
  readonly model: string;

  constructor(
    private readonly create: CreateCompletion,
    private readonly modelName: string,
    private readonly deadlineMs = KEY_CALL_DEADLINE_MS,
  ) {
    this.model = `openrouter:${modelName}`;
    this.label = `${modelName} via OpenRouter`;
  }

  static withKey(apiKey: string, model: string): OpenRouterClient {
    const client = new OpenAI({
      apiKey,
      organization: null,
      project: null,
      webhookSecret: null,
      baseURL: OPENROUTER_BASE_URL,
      logLevel: "off",
      defaultHeaders: { "X-Title": "Merge Desk" },
    });
    return new OpenRouterClient(
      // `provider` is OpenRouter's own field; the SDK sends the body as given.
      (body, options) =>
        client.chat.completions.create(
          body as unknown as OpenAI.Chat.ChatCompletionCreateParamsNonStreaming,
          options,
        ) as Promise<CompletionLike>,
      model,
    );
  }

  async structured<T>(request: StructuredRequest<T>): Promise<{ value: T; ms: number }> {
    const started = Date.now();
    const completion = await withProviderDeadline(
      "OpenRouter",
      this.deadlineMs,
      request.signal,
      (signal) =>
        this.create(
          {
            model: this.modelName,
            messages: [
              { role: "system", content: request.system },
              { role: "user", content: request.input },
            ],
            max_tokens: Math.max(16_000, request.maxOutputTokens ?? 0),
            response_format: {
              type: "json_schema",
              json_schema: {
                name: "merge_desk_answer",
                strict: true,
                schema: strictJsonSchema(request.schema),
              },
            },
            provider: { require_parameters: true, data_collection: "deny" },
          },
          { signal, timeout: this.deadlineMs, maxRetries: 2 },
        ),
      {
        notFound: "OpenRouter has no endpoint for that model with structured output. Pick another.",
      },
    );
    const choice = completion.choices?.[0];
    if (choice?.message?.refusal)
      throw new ProviderError(`${this.modelName} declined this request. Nothing was run.`);
    if (choice?.finish_reason === "length")
      throw new MalformedOutputError(`${this.modelName}'s answer was cut off`);
    return {
      value: parseAnswer(choice?.message?.content, request.schema, this.modelName),
      ms: Date.now() - started,
    };
  }
}
