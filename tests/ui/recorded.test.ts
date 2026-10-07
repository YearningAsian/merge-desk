import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Recording, SCENARIOS } from "@/core/recording";
import { DEMO_TOKEN, recordedSource } from "@/ui/sources/recorded";

// Demo mode replays the committed recordings: the same events, at their
// original pace, and nothing that could write or authorize anything.

const recordings = SCENARIOS.map((id) =>
  Recording.parse(
    JSON.parse(readFileSync(join(process.cwd(), "demo", "recordings", `${id}.json`), "utf8")),
  ),
);
const held = recordings.find((recording) => recording.scenario === "held")!;
const source = recordedSource(recordings);

async function collect<T>(events: AsyncIterable<T>): Promise<T[]> {
  const out: T[] = [];
  for await (const event of events) out.push(event);
  return out;
}

describe("recorded source", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("lists the recorded pull requests and nothing else", async () => {
    const list = await source.listPullRequests();
    expect(source.mode).toBe("demo");
    expect(list.pulls.map((pull) => pull.number)).toEqual(
      recordings.map((recording) => recording.source.pr).sort((a, b) => a - b),
    );
  });

  it("replays the analysis at its recorded pace and marks it runnable in the demo only", async () => {
    const started = Date.now();
    const done = collect(source.analyze(held.source.pr, new AbortController().signal));
    await vi.runAllTimersAsync();
    const events = await done;
    expect(events.map(({ t }) => t)).toEqual(held.analysis.map(({ t }) => t));
    expect(Date.now() - started).toBe(held.analysis.at(-1)!.t);
    const last = events.at(-1)!;
    expect("type" in last && last.ok && last.token).toBe(DEMO_TOKEN);
  });

  it("replays the run of the chosen option, verdict last, unsigned", async () => {
    const recorded = held.runs[0]!;
    const done = collect(
      source.run(
        { pr: held.source.pr, token: DEMO_TOKEN, option: recorded.option },
        new AbortController().signal,
      ),
    );
    await vi.runAllTimersAsync();
    const events = await done;
    expect(events).toEqual(recorded.events);
    const last = events.at(-1)!;
    expect("type" in last && last.token).toBeFalsy();
  });

  it("stops at once when cancelled (Reset or leaving)", async () => {
    const controller = new AbortController();
    const done = collect(source.analyze(held.source.pr, controller.signal));
    await vi.advanceTimersByTimeAsync(10);
    controller.abort();
    await expect(done).rejects.toThrow();
  });

  it("refuses steering and unrecorded options instead of inventing a run", async () => {
    const signal = new AbortController().signal;
    await expect(
      collect(
        source.run(
          { pr: held.source.pr, token: DEMO_TOKEN, option: "combine", steer: "fix it" },
          signal,
        ),
      ),
    ).rejects.toThrow(/live mode/);
    await expect(
      collect(source.run({ pr: 999, token: DEMO_TOKEN, option: "combine" }, signal)),
    ).rejects.toThrow(/isn't in the demo/);
  });

  it("never lands or records", async () => {
    await expect(source.land(held.source.pr, DEMO_TOKEN)).resolves.toMatchObject({
      outcome: "REFUSED",
    });
    await expect(source.record(held.source.pr, DEMO_TOKEN, "held")).rejects.toThrow(/never writes/);
    await expect(source.readRecord(held.source.pr)).resolves.toEqual({ entries: [], note: null });
  });
});
