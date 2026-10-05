import { describe, expect, it } from "vitest";
import { z } from "zod";
import { ModelAnalysis } from "@/core/options";
import { MalformedOutputError } from "@/server/errors";
import { GeminiClient, jsonSchemaFor, type CreateInteraction } from "@/server/gemini/client";

const Schema = z.object({ answer: z.string().max(10) });
const answering =
  (reply: { status?: string; output_text?: string }): CreateInteraction =>
  async () =>
    reply;

describe("GeminiClient.structured", () => {
  it("sends store: false and the JSON schema, and returns the validated value", async () => {
    let sent: Parameters<CreateInteraction>[0] | undefined;
    const client = new GeminiClient(async (params) => {
      sent = params;
      return { status: "completed", output_text: '{"answer":"yes"}' };
    }, "gemini-test");
    const { value } = await client.structured({ schema: Schema, system: "s", input: "i" });
    expect(value).toEqual({ answer: "yes" });
    expect(sent).toMatchObject({
      model: "gemini-test",
      store: false,
      response_format: { type: "text", mime_type: "application/json" },
    });
    expect(sent!.response_format.schema).not.toHaveProperty("$schema");
  });

  it("treats non-JSON, the wrong shape, no text or a cut-off answer as malformed", async () => {
    for (const reply of [
      { status: "completed", output_text: "not json" },
      { status: "completed", output_text: '{"answer":"far too long for this"}' },
      { status: "completed" },
      { status: "incomplete", output_text: '{"answer":"yes"}' },
    ]) {
      const client = new GeminiClient(answering(reply), "m");
      await expect(client.structured({ schema: Schema, system: "s", input: "i" })).rejects.toThrow(
        MalformedOutputError,
      );
    }
  });

  it("treats a failed interaction as an error that is not retried", async () => {
    const client = new GeminiClient(answering({ status: "failed" }), "m");
    const call = client.structured({ schema: Schema, system: "s", input: "i" });
    await expect(call).rejects.toThrow(/status failed/);
    await expect(call).rejects.not.toBeInstanceOf(MalformedOutputError);
  });

  it("gives up at the deadline", async () => {
    const client = new GeminiClient(() => new Promise(() => {}), "m", 20);
    await expect(client.structured({ schema: Schema, system: "s", input: "i" })).rejects.toThrow(
      /did not answer within/,
    );
  });

  it("derives a plain JSON schema from the analysis schema", () => {
    const schema = jsonSchemaFor(ModelAnalysis) as { type: string; required: string[] };
    expect(schema.type).toBe("object");
    expect(schema.required).toEqual(["intents", "options"]);
  });
});
