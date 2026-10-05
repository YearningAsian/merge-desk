import type { AnalyzeEvent } from "@/core/events";
import type { PullList } from "@/core/pulls";

// The only difference between demo and live mode: where the desk's data
// comes from. Live calls the API routes; demo (slice 7) replays recordings.
export interface DataSource {
  mode: "live" | "demo";
  listPullRequests(signal?: AbortSignal): Promise<PullList>;
  analyze(pr: number, signal: AbortSignal): AsyncIterable<AnalyzeEvent>;
}

export class SourceError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}
