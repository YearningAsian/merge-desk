import Anthropic from "@anthropic-ai/sdk";
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

// Claude through Anthropic's Messages API on your own key, with structured
// outputs (output_config.format, JSON schema) as Anthropic documents them.
// The client is pinned to Anthropic's API host with no other credential and
// no SDK logging, whatever the environment says.

export const ANTHROPIC_BASE_URL = "https://api.anthropic.com";

type MessageLike = {
  stop_reason: string | null;
  content: Array<{ type: string; text?: string }>;
};

// The slice of the SDK this module uses, so tests can stand in for Anthropic.
export type CreateMessage = (
  body: {
    model: string;
    max_tokens: number;
    system: string;
    messages: Array<{ role: "user"; content: string }>;
    output_config: {
      format: { type: "json_schema"; schema: Record<string, unknown> };
      effort?: "medium";
    };
  },
  options: { signal: AbortSignal; timeout: number; maxRetries: number },
) => Promise<MessageLike>;

// Opus and Sonnet 5.x take an effort level; Opus 5.5 defaults to medium
// and Anthropic recommends setting it explicitly. Other models (Haiku 4.5)
// reject the field, so it is left out for them.
const takesEffort = (model: string) => /^claude-(opus|sonnet)-5(-|$)/.test(model);

export class AnthropicClient implements StructuredClient {
  readonly label: string;
  readonly model: string;

  constructor(
    private readonly create: CreateMessage,
    private readonly modelName: string,
    private readonly deadlineMs = KEY_CALL_DEADLINE_MS,
  ) {
    this.model = `anthropic:${modelName}`;
    this.label = `Claude (${modelName})`;
  }

  static withKey(apiKey: string, model: string): AnthropicClient {
    const client = new Anthropic({
      apiKey,
      authToken: null,
      webhookKey: null,
      baseURL: ANTHROPIC_BASE_URL,
      logLevel: "off",
    });
    return new AnthropicClient(
      (body, options) => client.messages.create(body, options) as Promise<MessageLike>,
      model,
    );
  }

  async structured<T>(request: StructuredRequest<T>): Promise<{ value: T; ms: number }> {
    const started = Date.now();
    const message = await withProviderDeadline(
      "Anthropic",
      this.deadlineMs,
      request.signal,
      (signal) =>
        this.create(
          {
            model: this.modelName,
            // Room for adaptive thinking as well as the answer.
            max_tokens: Math.max(16_000, request.maxOutputTokens ?? 0),
            system: request.system,
            messages: [{ role: "user", content: request.input }],
            output_config: {
              format: { type: "json_schema", schema: strictJsonSchema(request.schema) },
              ...(takesEffort(this.modelName) ? { effort: "medium" as const } : {}),
            },
          },
          { signal, timeout: this.deadlineMs, maxRetries: 2 },
        ),
    );
    if (message.stop_reason === "refusal")
      throw new ProviderError("Claude declined this request. Nothing was run.");
    if (message.stop_reason === "max_tokens")
      throw new MalformedOutputError("Claude's answer was cut off");
    const text = message.content
      .filter((block) => block.type === "text")
      .map((block) => block.text ?? "")
      .join("");
    return { value: parseAnswer(text, request.schema, "Claude"), ms: Date.now() - started };
  }
}
