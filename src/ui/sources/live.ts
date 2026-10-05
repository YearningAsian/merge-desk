import { AnalyzeEvent } from "@/core/events";
import { PullList } from "@/core/pulls";
import { readNdjson } from "@/ui/ndjson";
import { SourceError, type DataSource } from "./types";

async function failure(response: Response): Promise<SourceError> {
  const body = (await response.json().catch(() => null)) as { error?: unknown } | null;
  const message =
    typeof body?.error === "string" ? body.error : `The server answered ${response.status}.`;
  return new SourceError(message, response.status);
}

export const liveSource: DataSource = {
  mode: "live",

  async listPullRequests(signal) {
    const response = await fetch("/api/live/prs", { signal, cache: "no-store" });
    if (!response.ok) throw await failure(response);
    return PullList.parse(await response.json());
  },

  async *analyze(pr, signal) {
    const response = await fetch("/api/live/analyze", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ pr }),
      signal,
    });
    if (!response.ok || !response.body) throw await failure(response);
    yield* readNdjson(response.body, AnalyzeEvent);
  },
};
