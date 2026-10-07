import { GoogleGenAI } from "@google/genai";
import { z } from "zod";
import { requireEnv } from "@/server/env";
import { MalformedOutputError } from "@/server/errors";
import {
  ProviderError,
  type StructuredClient,
  type StructuredRequest,
} from "@/server/llm/structured";

export type { StructuredRequest };

// One structured Gemini call through the Interactions API: nothing stored on
// Google's side, a JSON schema derived from the same Zod schema that then
// validates the answer, and a 30-second deadline. The answer is data; it is
// used only after it parses and validates, and it never unlocks a merge.

// Learner decision 2026-10-05: free on the free plan, 1.5 to 2 s per call and
// right on all three demo scenarios, while gemini-3.8-flash answered 503
// "high demand". GEMINI_MODEL overrides it.
export const DEFAULT_MODEL = "gemini-3.5-flash-lite";
export const CALL_DEADLINE_MS = 30_000;

type InteractionLike = { status?: string; output_text?: string };

// The slice of the SDK this module uses, so tests can stand in for Google.
export type CreateInteraction = (
  params: {
    model: string;
    input: string;
    system_instruction: string;
    store: false;
    response_format: { type: "text"; mime_type: "application/json"; schema: object };
    generation_config: { thinking_level: "low"; max_output_tokens: number };
  },
  options: { timeout: number; maxRetries: number; fetchOptions: { signal: AbortSignal } },
) => Promise<InteractionLike>;

export function modelId(env: Record<string, string | undefined> = process.env): string {
  return env.GEMINI_MODEL?.trim() || DEFAULT_MODEL;
}

export function jsonSchemaFor(schema: z.ZodType): object {
  const json = z.toJSONSchema(schema) as Record<string, unknown>;
  delete json.$schema;
  return json;
}

export class GeminiClient implements StructuredClient {
  readonly label: string;

  constructor(
    private readonly create: CreateInteraction,
    readonly model: string,
    private readonly deadlineMs = CALL_DEADLINE_MS,
  ) {
    this.label = `Gemini (${model})`;
  }

  // `model` comes from the browser (Settings), so it must already have been
  // checked against MODEL_CHOICES; without it the server default is used.
  static fromEnv(
    env: Record<string, string | undefined> = process.env,
    model?: string,
  ): GeminiClient {
    const ai = new GoogleGenAI({ apiKey: requireEnv("GEMINI_API_KEY", env) });
    return new GeminiClient(
      (params, options) => ai.interactions.create(params, options) as Promise<InteractionLike>,
      model ?? modelId(env),
    );
  }

  async structured<T>(request: StructuredRequest<T>): Promise<{ value: T; ms: number }> {
    // A cancel that landed between calls: never start one.
    if (request.signal?.aborted) throw new ProviderError("Stopped before Gemini answered.");
    const started = Date.now();
    const controller = new AbortController();
    const abort = () => controller.abort();
    request.signal?.addEventListener("abort", abort, { once: true });
    let timer: ReturnType<typeof setTimeout> | undefined;
    const deadline = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        controller.abort();
        reject(new Error(`Gemini did not answer within ${this.deadlineMs / 1000} s`));
      }, this.deadlineMs);
    });

    let interaction: InteractionLike;
    try {
      interaction = await Promise.race([
        this.create(
          {
            model: this.model,
            input: request.input,
            system_instruction: request.system,
            store: false,
            response_format: {
              type: "text",
              mime_type: "application/json",
              schema: jsonSchemaFor(request.schema),
            },
            generation_config: {
              thinking_level: "low",
              max_output_tokens: request.maxOutputTokens ?? 8_192,
            },
          },
          {
            timeout: this.deadlineMs,
            maxRetries: 2, // transient 429/5xx only, inside the same deadline
            fetchOptions: { signal: controller.signal },
          },
        ),
        deadline,
      ]);
    } finally {
      clearTimeout(timer);
      request.signal?.removeEventListener("abort", abort);
    }

    if (interaction.status === "incomplete")
      throw new MalformedOutputError("Gemini's answer was cut off");
    if (interaction.status && interaction.status !== "completed")
      throw new Error(`Gemini returned status ${interaction.status}`);
    const text = interaction.output_text?.trim();
    if (!text) throw new MalformedOutputError("Gemini returned no text");
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      throw new MalformedOutputError("Gemini's answer is not JSON");
    }
    const parsed = request.schema.safeParse(json);
    if (!parsed.success)
      throw new MalformedOutputError(
        `Gemini's answer does not match the schema: ${z.prettifyError(parsed.error).replaceAll("\n", " ").slice(0, 300)}`,
      );
    return { value: parsed.data, ms: Date.now() - started };
  }
}
