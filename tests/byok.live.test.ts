import { describe, expect, it } from "vitest";
import { KEY_PROVIDERS, PROVIDERS, modelChoice, type KeyProvider } from "@/core/models";
import { resolveOptions } from "@/core/options";
import { geminiAnalyst } from "@/server/gemini/analyze";
import { KEYS_COOKIE, readKeys, sealKeys } from "@/server/keys";
import { planModel } from "@/server/llm/client";
import { loadLocalEnv } from "../scripts/lib/env.mts";
import { scenarioFile } from "./helpers/scenarios";

loadLocalEnv();

const API = "playground/src/api.js";
const ENV_NAMES: Record<KeyProvider, string> = {
  anthropic: "ANTHROPIC_API_KEY",
  openai: "OPENAI_API_KEY",
  openrouter: "OPENROUTER_API_KEY",
};

// One schema-valid analysis call per provider whose key is in .env.local,
// sealed and opened like a key saved in Settings, then through planModel.
// A missing key skips.
describe("Your own model keys (live)", () => {
  for (const provider of KEY_PROVIDERS) {
    const key = process.env[ENV_NAMES[provider]]?.trim();
    it.skipIf(!key)(
      `${provider}: answers one structured analysis call that validates`,
      async () => {
        const model = PROVIDERS[provider].models[0]!.id;
        const session = { login: "live-test", exp: Date.now() + 10 * 60_000 };
        const sealed = await sealKeys(session, { [provider]: key });
        const keys = await readKeys(`${KEYS_COOKIE}=${sealed}`, session);
        const client = planModel(modelChoice(provider, model), keys)();
        const file = scenarioFile("clean", API, "");
        const started = Date.now();
        const answer = await geminiAnalyst(client)({
          files: [
            {
              path: API,
              base: file.base,
              ours: file.ours,
              theirs: file.theirs,
              merged: file.merged,
            },
          ],
          commits: { ours: [], theirs: [] },
          older: null,
        });
        const ms = Date.now() - started;
        const options = resolveOptions(answer.options, {
          commits: { ours: [], theirs: [] },
          conflictedPaths: [API],
        });
        console.log(
          `${provider} ${client.model}: ${ms} ms, options: ${answer.options.map((o) => o.kind).join(", ")}`,
        );
        expect(options.ok).toBe(true);
      },
    );
  }
});
