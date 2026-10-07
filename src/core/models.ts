import { z } from "zod";

// The models someone may pick in Settings. The server checks every choice
// again before calling anything (a choice that doesn't match is refused
// before any provider is called); GEMINI_MODEL still sets the server's
// default. Gemini runs on the server's key. Anthropic, OpenAI and OpenRouter
// run on the signed-in person's own key (see server/keys) and are written
// "provider:model", so a choice always says whose key pays for it.

// Notes come from the measured runs recorded in devpost/checklist.md (2026-10-05).
export const MODEL_CHOICES = [
  {
    id: "gemini-3.5-flash-lite",
    label: "Gemini 3.5 Flash-Lite",
    note: "Default. About 2 s per call; free on the free plan.",
  },
  {
    id: "gemini-3.8-flash",
    label: "Gemini 3.8 Flash",
    note: "Stronger. Often answers 503 (busy) on the free plan.",
  },
  {
    id: "gemini-3.1-flash-lite",
    label: "Gemini 3.1 Flash-Lite",
    note: "Cheapest on the paid plan. Timed out on 2 of 4 test calls.",
  },
] as const;

export const ModelId = z.enum(MODEL_CHOICES.map((choice) => choice.id) as [string, ...string[]]);
export type ModelId = (typeof MODEL_CHOICES)[number]["id"];

// Providers that run on your own key. Suggested models come from each
// provider's own model documentation (Anthropic and OpenAI) or OpenRouter's
// public model list filtered to structured-output support, read 2026-10-07.
// Any other model name of the right shape can be typed in Settings.
export const KEY_PROVIDERS = ["anthropic", "openai", "openrouter"] as const;
export const KeyProvider = z.enum(KEY_PROVIDERS);
export type KeyProvider = z.infer<typeof KeyProvider>;

export const PROVIDERS: Record<
  KeyProvider,
  { label: string; family: string; keyHint: string; models: Array<{ id: string; label: string }> }
> = {
  anthropic: {
    label: "Anthropic",
    family: "Claude",
    keyHint: "sk-ant-...",
    models: [
      { id: "claude-opus-5-5", label: "Claude Opus 5.5" },
      { id: "claude-sonnet-5-5", label: "Claude Sonnet 5.5" },
      { id: "claude-haiku-4-5", label: "Claude Haiku 4.5" },
    ],
  },
  openai: {
    label: "OpenAI",
    family: "GPT",
    keyHint: "sk-...",
    models: [
      { id: "gpt-6-astra", label: "GPT-6 Astra" },
      { id: "gpt-6.1-sol", label: "GPT-6.1 Sol" },
      { id: "gpt-6-luna", label: "GPT-6 Luna" },
    ],
  },
  openrouter: {
    label: "OpenRouter",
    family: "OpenRouter",
    keyHint: "sk-or-...",
    models: [
      { id: "anthropic/claude-sonnet-5.5", label: "Claude Sonnet 5.5 via OpenRouter" },
      { id: "openai/gpt-6.1-sol", label: "GPT-6.1 Sol via OpenRouter" },
      { id: "google/gemini-3.8-flash", label: "Gemini 3.8 Flash via OpenRouter" },
      { id: "deepseek/deepseek-v4.1-flash", label: "DeepSeek V4.1 Flash via OpenRouter" },
    ],
  },
};

// A model name as each provider writes it: lowercase letters, digits, dots
// and dashes; OpenRouter adds "vendor/" and may add a ":variant".
const MODEL_NAME: Record<KeyProvider, RegExp> = {
  anthropic: /^[a-z0-9][a-z0-9.-]{1,63}$/,
  openai: /^[a-z0-9][a-z0-9.-]{1,63}$/,
  openrouter: /^[a-z0-9][a-z0-9._-]{0,39}\/[a-z0-9][a-z0-9._-]{0,63}(:[a-z0-9-]{1,20})?$/,
};

export type ParsedChoice =
  { provider: "gemini"; model: ModelId } | { provider: KeyProvider; model: string };

// "gemini-3.5-flash-lite" | "anthropic:claude-opus-5-5" | "openrouter:openai/gpt-6.1-sol"
export function parseModelChoice(choice: string): ParsedChoice | null {
  const gemini = ModelId.safeParse(choice);
  if (gemini.success) return { provider: "gemini", model: gemini.data as ModelId };
  const colon = choice.indexOf(":");
  if (colon < 0) return null;
  const provider = KeyProvider.safeParse(choice.slice(0, colon));
  const model = choice.slice(colon + 1);
  if (!provider.success || !MODEL_NAME[provider.data].test(model)) return null;
  return { provider: provider.data, model };
}

export const ModelChoice = z
  .string()
  .max(100)
  .refine((choice) => parseModelChoice(choice) !== null, "Not a model Merge Desk can call.");
export type ModelChoice = z.infer<typeof ModelChoice>;

export const modelChoice = (provider: KeyProvider, model: string) => `${provider}:${model}`;

export function modelLabel(id: string): string {
  const gemini = MODEL_CHOICES.find((choice) => choice.id === id);
  if (gemini) return gemini.label;
  const parsed = parseModelChoice(id);
  if (!parsed || parsed.provider === "gemini") return id;
  const known = PROVIDERS[parsed.provider].models.find((model) => model.id === parsed.model);
  if (known) return known.label;
  return parsed.provider === "openrouter" ? `${parsed.model} via OpenRouter` : parsed.model;
}
