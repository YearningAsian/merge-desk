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

// GPT through OpenAI's Responses API on your own key, with structured
// outputs (text.format, strict JSON schema) as OpenAI documents them, and
// nothing stored on OpenAI's side. The client is pinned to OpenAI's API host
// with no organization, project or SDK logging from the environment.

export const OPENAI_BASE_URL = "https://api.openai.com/v1";

type ResponseLike = {
  status?: string;
  incomplete_details?: { reason?: string } | null;
  output_text?: string;
  output?: Array<{ type: string; content?: Array<{ type: string }> }>;
};

// The slice of the SDK this module uses, so tests can stand in for OpenAI.
export type CreateResponse = (
  body: {
    model: string;
    instructions: string;
    input: string;
    store: false;
    max_output_tokens: number;
    text: {
      format: {
        type: "json_schema";
        name: string;
        schema: Record<string, unknown>;
        strict: true;
      };
    };
  },
  options: { signal: AbortSignal; timeout: number; maxRetries: number },
) => Promise<ResponseLike>;

export class OpenAIClient implements StructuredClient {
  readonly label: string;
  readonly model: string;

  constructor(
    private readonly create: CreateResponse,
    private readonly modelName: string,
    private readonly deadlineMs = KEY_CALL_DEADLINE_MS,
  ) {
    this.model = `openai:${modelName}`;
    this.label = `GPT (${modelName})`;
  }

  static withKey(apiKey: string, model: string): OpenAIClient {
    const client = new OpenAI({
      apiKey,
      organization: null,
      project: null,
      webhookSecret: null,
      baseURL: OPENAI_BASE_URL,
      logLevel: "off",
    });
    return new OpenAIClient(
      (body, options) => client.responses.create(body, options) as Promise<ResponseLike>,
      model,
    );
  }

  async structured<T>(request: StructuredRequest<T>): Promise<{ value: T; ms: number }> {
    const started = Date.now();
    const response = await withProviderDeadline(
      "OpenAI",
      this.deadlineMs,
      request.signal,
      (signal) =>
        this.create(
          {
            model: this.modelName,
            instructions: request.system,
            input: request.input,
            store: false,
            // Room for reasoning as well as the answer.
            max_output_tokens: Math.max(16_000, request.maxOutputTokens ?? 0),
            text: {
              format: {
                type: "json_schema",
                name: "merge_desk_answer",
                schema: strictJsonSchema(request.schema),
                strict: true,
              },
            },
          },
          { signal, timeout: this.deadlineMs, maxRetries: 2 },
        ),
    );
    const refused = response.output?.some((item) =>
      item.content?.some((part) => part.type === "refusal"),
    );
    if (refused) throw new ProviderError("GPT declined this request. Nothing was run.");
    if (response.status === "incomplete")
      throw new MalformedOutputError("GPT's answer was cut off");
    if (response.status && response.status !== "completed")
      throw new ProviderError(`OpenAI returned status ${response.status.slice(0, 40)}`);
    return {
      value: parseAnswer(response.output_text, request.schema, "GPT"),
      ms: Date.now() - started,
    };
  }
}
