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
const Read = z.object({ entries: z.array(RecordEntry), note: z.string().nullable() });

const reasonOf = (body: unknown, status: number) => {
  const error = (body as { error?: unknown } | null)?.error;
  return typeof error === "string" ? error : `The server answered ${status}.`;
};

async function failure(response: Response): Promise<SourceError> {
  const body: unknown = await response.json().catch(() => null);
  return new SourceError(reasonOf(body, response.status), response.status);
}

// Every call names the repository; the server checks the signed-in
// person's push access to it each time.
export const liveSource = (repo: string): DataSource => ({
  mode: "live",

  async listPullRequests(signal) {
    const response = await fetch(`/api/live/prs?repo=${encodeURIComponent(repo)}`, {
      signal,
      cache: "no-store",
    });
    if (!response.ok) throw await failure(response);
    return PullList.parse(await response.json());
  },

  async *analyze(pr, signal, model) {
    const response = await fetch("/api/live/analyze", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(model ? { repo, pr, model } : { repo, pr }),
      signal,
    });
    if (!response.ok || !response.body) throw await failure(response);
    yield* readNdjson(response.body, AnalyzeEvent);
  },

  async *run(input, signal) {
    const response = await fetch("/api/live/run", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...input, repo }),
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
        body: JSON.stringify({ repo, pr, token }),
      });
    } catch {
      return {
        outcome: "UNKNOWN",
        reason:
          "The connection dropped before GitHub answered. Check the pull request before trying again.",
      };
    }
    const body: unknown = await response.json().catch(() => null);
    const answer = LandAnswer.safeParse(body);
    if (answer.success) return answer.data;
    return response.status === 401 || response.status === 403
      ? { outcome: "REFUSED", reason: reasonOf(body, response.status) }
      : {
          outcome: "UNKNOWN",
          reason: `The server answered ${response.status} without a clear result. Check the pull request before trying again.`,
        };
  },

  async record(pr, token, action) {
    const response = await fetch("/api/live/record", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ repo, pr, token, action }),
    });
    if (!response.ok) throw await failure(response);
    return Entries.parse(await response.json()).entries;
  },

  async readRecord(pr, signal) {
    const response = await fetch(`/api/live/record?repo=${encodeURIComponent(repo)}&pr=${pr}`, {
      signal,
      cache: "no-store",
    });
    if (!response.ok) throw await failure(response);
    return Read.parse(await response.json());
  },
});
