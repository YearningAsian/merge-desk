import type { AnalyzeEvent, RunEvent } from "@/core/events";
import type { Option } from "@/core/honor";
import type { RecordEntry } from "@/core/record";
import type { PullList } from "@/core/pulls";

// The only difference between demo and live mode: where the desk's data
// comes from. Live calls the API routes; demo replays recordings of them.
export interface DataSource {
  mode: "live" | "demo";
  listPullRequests(signal?: AbortSignal): Promise<PullList>;
  analyze(pr: number, signal: AbortSignal, model?: string): AsyncIterable<AnalyzeEvent>;
  run(input: RunRequest, signal: AbortSignal): AsyncIterable<RunEvent>;
  land(pr: number, token: string): Promise<LandOutcome>;
  record(pr: number, token: string, action: "held" | "discarded"): Promise<RecordEntry[]>;
  readRecord(
    pr: number,
    signal?: AbortSignal,
  ): Promise<{ entries: RecordEntry[]; note: string | null }>;
  // The one line a held option can be steered with, when the source can only
  // replay a recorded steered run (demo). Absent: any line can be sent.
  steerFor?(pr: number, option: Option): string | undefined;
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

// What Land answers. LANDED only when GitHub confirmed the branch moved;
// UNKNOWN when it didn't confirm either way; REFUSED when nothing moved.
export type LandOutcome =
  | {
      outcome: "LANDED";
      commit: string;
      branch: string;
      mergeable: "mergeable" | "conflicting" | "checking";
      record: { ok: boolean; reason?: string };
    }
  | { outcome: "REFUSED" | "UNKNOWN"; reason: string };

export class SourceError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}
