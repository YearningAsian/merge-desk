import { describe, expect, it } from "vitest";
import { z } from "zod";
import { readNdjson } from "@/ui/ndjson";

const Event = z.object({ n: z.number() });
const streamOf = (...chunks: string[]) =>
  new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(new TextEncoder().encode(chunk));
      controller.close();
    },
  });
const collect = async (stream: ReadableStream<Uint8Array>) => {
  const out: unknown[] = [];
  for await (const item of readNdjson(stream, Event)) out.push(item);
  return out;
};

describe("readNdjson", () => {
  it("reads lines split across chunks, and a last line without a newline", async () => {
    expect(await collect(streamOf('{"n":1}\n{"n"', ":2}\n\n", '{"n":3}'))).toEqual([
      { n: 1 },
      { n: 2 },
      { n: 3 },
    ]);
  });

  it("stops at a line that isn't JSON or doesn't match the schema", async () => {
    await expect(collect(streamOf('{"n":1}\nnot json\n'))).rejects.toThrow(/isn't JSON/);
    await expect(collect(streamOf('{"n":"one"}\n'))).rejects.toThrow(/doesn't recognise/);
  });
});
