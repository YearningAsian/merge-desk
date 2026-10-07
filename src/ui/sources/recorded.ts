import type { AnalyzeEvent } from "@/core/events";
import type { Option } from "@/core/honor";
import type { PullSummary } from "@/core/pulls";
import type { RecordEntry } from "@/core/record";
import type { RecordedRun, Recording } from "@/core/recording";
import { SourceError, type DataSource, type LandOutcome } from "./types";

// Demo mode: the desk's data comes from recordings of real live-mode work
// (see core/recording), replayed with their original timings: the analysis,
// every run, steered retries, the decision-record writes and the Lands. The
// Lands really happened on the demo pull requests, which were reset to their
// seeds afterwards. Nothing here touches the network, so nothing is written.
// One source is one demo session; Reset starts a new one.
//
// Tokens only name what was recorded ("demo", "demo:<pr>:<option>:<0|1>").
// Only this source accepts them; every server route refuses them like any
// other unsigned token.

export const DEMO_TOKEN = "demo";
const runToken = (pr: number, run: RecordedRun) =>
  `${DEMO_TOKEN}:${pr}:${run.option}:${run.steer === null ? 0 : 1}`;

function wait(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason);
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", stop);
      resolve();
    }, ms);
    const stop = () => {
      clearTimeout(timer);
      reject(signal!.reason);
    };
    signal?.addEventListener("abort", stop, { once: true });
  });
}

// Each event arrives when it did in the real run.
async function* replay<T extends { t: number }>(events: T[], signal: AbortSignal) {
  let at = 0;
  for (const event of events) {
    await wait(Math.max(0, event.t - at), signal);
    at = event.t;
    yield event;
  }
}

export function recordedSource(recordings: Recording[]): DataSource {
  // This session's state: pull requests as GitHub listed them after a Land,
  // and the decision-record entries written so far.
  const landed = new Map<number, PullSummary>();
  const records = new Map<number, RecordEntry[]>();

  const find = (pr: number) => {
    const recording = recordings.find((item) => item.source.pr === pr);
    if (!recording) throw new SourceError(`Pull request #${pr} isn't in the demo.`, 404);
    return recording;
  };
  const recordedRun = (pr: number, token: string) =>
    find(pr).runs.find((run) => runToken(pr, run) === token);
  const append = (pr: number, entry: RecordEntry) => {
    const entries = records.get(pr) ?? [];
    const next = entries.some((item) => item.id === entry.id) ? entries : [...entries, entry];
    records.set(pr, next);
    return next;
  };

  return {
    mode: "demo",

    async listPullRequests() {
      return {
        repo: recordings[0]?.source.repo ?? "",
        pulls: recordings
          .map((recording) => landed.get(recording.source.pr) ?? recording.pull)
          .sort((a, b) => a.number - b.number),
      };
    },

    async *analyze(pr, signal) {
      for await (const event of replay<AnalyzeEvent>(find(pr).analysis, signal))
        yield "type" in event && event.ok ? { ...event, token: DEMO_TOKEN } : event;
    },

    async *run(input, signal) {
      const steer = input.steer?.trim() || null;
      const recorded = find(input.pr).runs.find(
        (run) => run.option === input.option && run.steer === steer,
      );
      if (!recorded)
        throw new SourceError(
          steer ? "That steering line wasn't recorded." : "This option wasn't recorded.",
          404,
        );
      for await (const event of replay(recorded.events, signal))
        yield "type" in event ? { ...event, token: runToken(input.pr, recorded) } : event;
    },

    async land(pr, token): Promise<LandOutcome> {
      const land = recordedRun(pr, token)?.land;
      if (!land) return { outcome: "REFUSED", reason: "This run wasn't landed when recorded." };
      await wait(land.ms);
      landed.set(pr, land.pull);
      if (land.entry) append(pr, land.entry);
      return {
        outcome: "LANDED",
        commit: land.commit,
        branch: land.branch,
        mergeable: land.mergeable,
        record: land.record,
      };
    },

    async record(pr, token, action) {
      const write = recordedRun(pr, token)?.[action];
      if (!write) throw new SourceError(`This ${action} wasn't recorded.`, 409);
      await wait(write.ms);
      return append(pr, write.entry);
    },

    async readRecord(pr) {
      return { entries: records.get(pr) ?? [], note: null };
    },

    steerFor(pr: number, option: Option) {
      return (
        find(pr).runs.find((run) => run.option === option && run.steer !== null)?.steer ?? undefined
      );
    },
  };
}
