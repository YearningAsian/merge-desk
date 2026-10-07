import { z } from "zod";
import { MalformedOutputError } from "@/server/errors";

// What every model client does for the pipelines: one structured call, an
// answer validated against the same Zod schema, within a deadline. The
// answer is data; it never unlocks a merge (the parse, choice-honored and
// test checks decide). Gemini runs on the server's key (server/gemini);
// Anthropic, OpenAI and OpenRouter run on the signed-in person's own key
// (server/keys) and live in this folder.

export type StructuredRequest<T> = {
  schema: z.ZodType<T>;
  system: string;
  input: string;
  maxOutputTokens?: number;
  signal?: AbortSignal;
};

export interface StructuredClient {
  // The model as the analysis records it ("gemini-3.5-flash-lite",
  // "anthropic:claude-opus-5-5", ...).
  readonly model: string;
  // Who answered, for the proposal's source line.
  readonly label: string;
  structured<T>(request: StructuredRequest<T>): Promise<{ value: T; ms: number }>;
}

// A provider failure, in fixed words. Provider error bodies are never shown:
// some echo part of the key.
export class ProviderError extends Error {}

const STRIPPED = [
  "minLength",
  "maxLength",
  "minItems",
  "maxItems",
  "minimum",
  "maximum",
  "exclusiveMinimum",
  "exclusiveMaximum",
  "multipleOf",
  "pattern",
  "format",
  "$schema",
] as const;

// A JSON schema every strict structured-output mode accepts: every object
// closed (additionalProperties false) with every property required, and no
// length, size or number constraints (some providers reject them). The full
// Zod schema still validates the answer afterwards, so nothing is lost: an
// answer that breaks a stripped constraint is malformed and retried.
export function strictJsonSchema(schema: z.ZodType): Record<string, unknown> {
  const walk = (node: unknown): unknown => {
    if (Array.isArray(node)) return node.map(walk);
    if (!node || typeof node !== "object") return node;
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
      if ((STRIPPED as readonly string[]).includes(key)) continue;
      out[key] = key === "properties" ? mapValues(value, walk) : walk(value);
    }
    if (out.type === "object" && out.properties && typeof out.properties === "object") {
      out.additionalProperties = false;
      out.required = Object.keys(out.properties);
    }
    return out;
  };
  return walk(z.toJSONSchema(schema)) as Record<string, unknown>;
}

const mapValues = (value: unknown, fn: (item: unknown) => unknown) =>
  value && typeof value === "object"
    ? Object.fromEntries(Object.entries(value).map(([key, item]) => [key, fn(item)]))
    : value;

// Parses and validates a model's text answer.
export function parseAnswer<T>(text: string | null | undefined, schema: z.ZodType<T>, who: string) {
  const trimmed = text?.trim();
  if (!trimmed) throw new MalformedOutputError(`${who} returned no text`);
  let json: unknown;
  try {
    json = JSON.parse(trimmed);
  } catch {
    throw new MalformedOutputError(`${who}'s answer is not JSON`);
  }
  const parsed = schema.safeParse(json);
  if (!parsed.success)
    throw new MalformedOutputError(
      `${who}'s answer does not match the schema: ${z.prettifyError(parsed.error).replaceAll("\n", " ").slice(0, 300)}`,
    );
  return parsed.data;
}

// Fixed words for a failed provider call, by HTTP status only.
export function providerFailure(
  who: string,
  status: number | undefined,
  words: { notFound?: string } = {},
): ProviderError {
  if (status === 401 || status === 403)
    return new ProviderError(`${who} refused the key. Check it in Settings.`);
  if (status === 404)
    return new ProviderError(words.notFound ?? `${who} doesn't know that model. Pick another.`);
  if (status === 429)
    return new ProviderError(`${who} is rate limiting this key. Try again later.`);
  if (status === 400 || status === 422)
    return new ProviderError(`${who} refused the request (check the model name).`);
  if (status && status >= 500) return new ProviderError(`${who} is unavailable right now.`);
  return new ProviderError(`Couldn't reach ${who}.`);
}

// Runs one provider call under a deadline and the caller's signal, and turns
// anything that isn't a malformed answer into a ProviderError.
export async function withProviderDeadline<T>(
  who: string,
  deadlineMs: number,
  outer: AbortSignal | undefined,
  call: (signal: AbortSignal) => Promise<T>,
  words: { notFound?: string } = {},
): Promise<T> {
  const controller = new AbortController();
  const abort = () => controller.abort();
  outer?.addEventListener("abort", abort, { once: true });
  const timer = setTimeout(abort, deadlineMs);
  try {
    return await call(controller.signal);
  } catch (error) {
    if (error instanceof MalformedOutputError || error instanceof ProviderError) throw error;
    if (outer?.aborted) throw new ProviderError(`Stopped before ${who} answered.`);
    if (controller.signal.aborted)
      throw new ProviderError(`${who} did not answer within ${deadlineMs / 1000} s`);
    const status = (error as { status?: unknown }).status;
    throw providerFailure(who, typeof status === "number" ? status : undefined, words);
  } finally {
    clearTimeout(timer);
    outer?.removeEventListener("abort", abort);
  }
}

// Bring-your-own-key models can think longer than the server's Gemini.
export const KEY_CALL_DEADLINE_MS = 90_000;
