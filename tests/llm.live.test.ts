import { describe, expect, it } from "vitest";
import { resolveOptions } from "@/core/options";
import { geminiAnalyst } from "@/server/gemini/analyze";
import { GeminiClient } from "@/server/gemini/client";
import { loadLocalEnv } from "../scripts/lib/env.mts";
import { scenarioFile } from "./helpers/scenarios";

loadLocalEnv();

const API = "playground/src/api.js";

describe("Gemini (live)", () => {
  it("answers one structured analysis call that validates", async () => {
    const client = GeminiClient.fromEnv();
    const file = scenarioFile("clean", API, "");
    const started = Date.now();
    const answer = await geminiAnalyst(client)({
      files: [
        { path: API, base: file.base, ours: file.ours, theirs: file.theirs, merged: file.merged },
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
      `Gemini ${client.model}: ${ms} ms\n  ours: ${answer.intents.ours}\n  theirs: ${answer.intents.theirs}\n  options: ${answer.options.map((o) => `${o.kind}${o.recommended ? " (recommended)" : ""}`).join(", ")}`,
    );
    expect(options.ok).toBe(true);
    expect(ms).toBeLessThan(30_000);
  });
});
