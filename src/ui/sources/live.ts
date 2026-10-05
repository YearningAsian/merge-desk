import { z } from "zod";
import { AnalyzeEvent, RunEvent } from "@/core/events";
import { RecordEntry } from "@/core/record";
import { PullList } from "@/core/pulls";
import { readNdjson } from "@/ui/ndjson";
import { SourceError, type DataSource, type LandOutcome } from "./types";

const LandAnswer = z.union([
  z.object({
    outcome: z.literal("LANDED"),
    commit: z.string().regex(/^[0-9a-f]{40}$/),
    branch: z.string(),
    mergeable: z.enum(["mergeable", "conflicting", "checking"]),
    record: z.object({ ok: z.boolean(), reason: z.string().optional() }),
  }),
  z.object({ outcome: z.enum(["REFUSED", "UNKNOWN"]), reason: z.string() }),
]);
const Entries = z.object({ entries: z.array(RecordEntry) });

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

  async *analyze(pr, signal, model) {
    const response = await fetch("/api/live/analyze", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(model ? { pr, model } : { pr }),
      signal,
    });
    if (!response.ok || !response.body) throw await failure(response);
    yield* readNdjson(response.body, AnalyzeEvent);
  },

  async *run(input, signal) {
    const response = await fetch("/api/live/run", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
      signal,
    });
    if (!response.ok || !response.body) throw await failure(response);
    yield* readNdjson(response.body, RunEvent);
  },

  // Never retried. An answer that can't be read is UNKNOWN, never LANDED.
  async land(pr, token): Promise<LandOutcome> {
    let response: Response;
    try {
      response = await fetch("/api/live/land", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ pr, token }),
      });
    } catch {
      return {
        outcome: "UNKNOWN",
        reason:
          "The connection dropped before GitHub answered. Check the pull request before trying again.",
      };
    }
    const answer = LandAnswer.safeParse(await response.json().catch(() => null));
    if (answer.success) return answer.data;
    return response.status === 401 || response.status === 403
      ? { outcome: "REFUSED", reason: (await failure(response)).message }
      : {
          outcome: "UNKNOWN",
          reason: `The server answered ${response.status} without a clear result. Check the pull request before trying again.`,
        };
  },

  async record(pr, token, action) {
    const response = await fetch("/api/live/record", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ pr, token, action }),
    });
    if (!response.ok) throw await failure(response);
    return Entries.parse(await response.json()).entries;
  },

  async readRecord(pr, signal) {
    const response = await fetch(`/api/live/record?pr=${pr}`, { signal, cache: "no-store" });
    if (!response.ok) throw await failure(response);
    return Entries.parse(await response.json()).entries;
  },
};
