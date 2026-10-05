import type { AnalyzeEvent, RunEvent } from "@/core/events";
import type { Option } from "@/core/honor";
import type { PullList } from "@/core/pulls";

// The only difference between demo and live mode: where the desk's data
// comes from. Live calls the API routes; demo (slice 7) replays recordings.
export interface DataSource {
  mode: "live" | "demo";
  listPullRequests(signal?: AbortSignal): Promise<PullList>;
  analyze(pr: number, signal: AbortSignal, model?: string): AsyncIterable<AnalyzeEvent>;
  run(input: RunRequest, signal: AbortSignal): AsyncIterable<RunEvent>;
}

// What the browser sends to run an option: the analysis token the server
// signed, never the analysis itself.
export type RunRequest = {
  pr: number;
  token: string;
  option: Option;
  steer?: string;
  model?: string;
};

export class SourceError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}
