import { PROVIDERS, parseModelChoice } from "@/core/models";
import { GeminiClient } from "@/server/gemini/client";
import type { ModelKeys } from "@/server/keys";
import { AnthropicClient } from "./anthropic";
import { OpenAIClient } from "./openai";
import { OpenRouterClient } from "./openrouter";
import type { StructuredClient } from "./structured";

// A choice the server can't serve: an unknown model, or a provider whose key
// isn't saved. Raised before any sandbox boots or any provider is called.
export class ModelChoiceError extends Error {}

type Env = Record<string, string | undefined>;
export type ModelPlan = (env?: Env) => StructuredClient;

// Checks a model choice from Settings and returns how to make its client:
// Gemini on the server's key (the default when there is no choice), anything
// else on the signed-in person's own key for that provider. Checking calls
// nothing and reads no configuration, so routes do it first and build the
// client only once the work is admitted.
export function planModel(choice: string | undefined, keys: ModelKeys): ModelPlan {
  if (!choice) return (env = process.env) => GeminiClient.fromEnv(env);
  const parsed = parseModelChoice(choice);
  if (!parsed) throw new ModelChoiceError("Merge Desk can't call that model.");
  if (parsed.provider === "gemini")
    return (env = process.env) => GeminiClient.fromEnv(env, parsed.model);
  const key = keys[parsed.provider];
  if (!key)
    throw new ModelChoiceError(
      `Add your ${PROVIDERS[parsed.provider].label} key in Settings to use ${parsed.model}.`,
    );
  switch (parsed.provider) {
    case "anthropic":
      return () => AnthropicClient.withKey(key, parsed.model);
    case "openai":
      return () => OpenAIClient.withKey(key, parsed.model);
    case "openrouter":
      return () => OpenRouterClient.withKey(key, parsed.model);
  }
}
