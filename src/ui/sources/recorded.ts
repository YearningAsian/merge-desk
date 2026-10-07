import type { AnalyzeEvent } from "@/core/events";
import type { Recording } from "@/core/recording";
import { SourceError, type DataSource } from "./types";

// Demo mode: the desk's data comes from recordings of real runs (see
// core/recording), replayed with their original timings. Nothing here
// touches the network, so nothing can be written. A recorded analysis is
// marked runnable with DEMO_TOKEN, which only this source accepts; every
// server route refuses it like any other unsigned token.

export const DEMO_TOKEN = "demo";
const NEVER_WRITES = "Demo mode never writes to GitHub. Sign in to live mode to land or record.";

function wait(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(signal.reason);
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", stop);
      resolve();
    }, ms);
    const stop = () => {
      clearTimeout(timer);
      reject(signal.reason);
    };
    signal.addEventListener("abort", stop, { once: true });
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
  const find = (pr: number) => {
    const recording = recordings.find((item) => item.source.pr === pr);
    if (!recording) throw new SourceError(`Pull request #${pr} isn't in the demo.`, 404);
    return recording;
  };
  return {
    mode: "demo",

    async listPullRequests() {
      return {
        repo: recordings[0]?.source.repo ?? "",
        pulls: recordings.map((recording) => recording.pull).sort((a, b) => a.number - b.number),
      };
    },

    async *analyze(pr, signal) {
      for await (const event of replay<AnalyzeEvent>(find(pr).analysis, signal))
        yield "type" in event && event.ok ? { ...event, token: DEMO_TOKEN } : event;
    },

    async *run(input, signal) {
      if (input.steer)
        throw new SourceError("Steering asks Gemini again, so it needs live mode.", 400);
      const recorded = find(input.pr).runs.find((run) => run.option === input.option);
      if (!recorded) throw new SourceError("This option wasn't recorded for the demo.", 404);
      yield* replay(recorded.events, signal);
    },

    async land() {
      return { outcome: "REFUSED", reason: NEVER_WRITES };
    },

    async record() {
      throw new SourceError(NEVER_WRITES, 400);
    },

    async readRecord() {
      return { entries: [], note: null };
    },
  };
}
