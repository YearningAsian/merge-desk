import type { z } from "zod";

// Reads a newline-delimited JSON stream, validating every line. A line that
// doesn't match the schema stops the stream: the desk never renders a state
// the server didn't send.
export async function* readNdjson<T>(
  body: ReadableStream<Uint8Array>,
  schema: z.ZodType<T>,
): AsyncGenerator<T> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  const parse = (line: string): T => {
    let json: unknown;
    try {
      json = JSON.parse(line);
    } catch {
      throw new Error("The server sent something that isn't JSON.");
    }
    const result = schema.safeParse(json);
    if (!result.success) throw new Error("The server sent an event the desk doesn't recognise.");
    return result.data;
  };
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let newline = buffer.indexOf("\n");
      while (newline !== -1) {
        const line = buffer.slice(0, newline).trim();
        buffer = buffer.slice(newline + 1);
        if (line) yield parse(line);
        newline = buffer.indexOf("\n");
      }
    }
    const rest = (buffer + decoder.decode()).trim();
    if (rest) yield parse(rest);
  } finally {
    reader.releaseLock();
  }
}
