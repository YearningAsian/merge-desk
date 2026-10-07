import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Recording, SCENARIOS, recordedResult } from "@/core/recording";
import { DEMO_TOKEN, recordedSource } from "@/ui/sources/recorded";

// Demo mode replays the committed recordings: the same events and writes,
// at their original pace, and nothing that could write or authorize anything.

const recordings = SCENARIOS.map((id) =>
  Recording.parse(
    JSON.parse(readFileSync(join(process.cwd(), "demo", "recordings", `${id}.json`), "utf8")),
  ),
);
const held = recordings.find((recording) => recording.scenario === "held")!;
const clean = recordings.find((recording) => recording.scenario === "clean")!;
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

  it("replays the run of the chosen option, verdict last, naming the recorded run", async () => {
    const recorded = held.runs[0]!;
    const done = collect(
      source.run(
        { pr: held.source.pr, token: DEMO_TOKEN, option: recorded.option },
        new AbortController().signal,
      ),
    );
    await vi.runAllTimersAsync();
    const events = await done;
    expect(events.slice(0, -1)).toEqual(recorded.events.slice(0, -1));
    const last = events.at(-1)!;
    expect("type" in last && last.token).toBe(
      `${DEMO_TOKEN}:${held.source.pr}:${recorded.option}:0`,
    );
  });

  it("stops at once when cancelled (Reset or leaving)", async () => {
    const controller = new AbortController();
    const done = collect(source.analyze(held.source.pr, controller.signal));
    await vi.advanceTimersByTimeAsync(10);
    controller.abort();
    await expect(done).rejects.toThrow();
  });

  it("steers only with the recorded line, and replays that steered run", async () => {
    const signal = new AbortController().signal;
    const steered = held.runs.find((run) => run.option === "combine" && run.steer)!;
    expect(source.steerFor?.(held.source.pr, "combine")).toBe(steered.steer);
    const done = collect(
      source.run(
        { pr: held.source.pr, token: DEMO_TOKEN, option: "combine", steer: steered.steer! },
        signal,
      ),
    );
    await vi.runAllTimersAsync();
    expect((await done).at(-1)).toMatchObject({ verdict: recordedResult(steered).verdict });

    await expect(
      collect(
        source.run(
          { pr: held.source.pr, token: DEMO_TOKEN, option: "combine", steer: "fix it" },
          signal,
        ),
      ),
    ).rejects.toThrow(/wasn't recorded/);
    await expect(
      collect(source.run({ pr: 999, token: DEMO_TOKEN, option: "combine" }, signal)),
    ).rejects.toThrow(/isn't in the demo/);
  });

  it("acts out a recorded Land: same answer, same pace, the PR as GitHub showed it after", async () => {
    const session = recordedSource(recordings);
    const run = clean.runs.find((item) => item.land)!;
    const token = `${DEMO_TOKEN}:${clean.source.pr}:${run.option}:0`;
    const started = Date.now();
    const landing = session.land(clean.source.pr, token);
    await vi.runAllTimersAsync();
    await expect(landing).resolves.toEqual({
      outcome: "LANDED",
      commit: run.land!.commit,
      branch: run.land!.branch,
      mergeable: run.land!.mergeable,
      record: run.land!.record,
    });
    expect(Date.now() - started).toBe(run.land!.ms);
    const after = (await session.listPullRequests()).pulls.find(
      (p) => p.number === clean.source.pr,
    );
    expect(after).toEqual(run.land!.pull);
    expect((await session.readRecord(clean.source.pr)).entries).toEqual([run.land!.entry]);

    // A new session (Reset) starts from the conflict again.
    const fresh = recordedSource(recordings);
    const before = (await fresh.listPullRequests()).pulls.find((p) => p.number === clean.source.pr);
    expect(before).toEqual(clean.pull);
    expect((await fresh.readRecord(clean.source.pr)).entries).toEqual([]);
  });

  it("acts out the recorded hold and discard writes, and nothing it didn't record", async () => {
    const session = recordedSource(recordings);
    const run = held.runs.find((item) => item.held && !item.steer)!;
    const token = `${DEMO_TOKEN}:${held.source.pr}:${run.option}:0`;
    const writing = session.record(held.source.pr, token, "held");
    await vi.runAllTimersAsync();
    await expect(writing).resolves.toEqual([run.held!.entry]);
    const discarding = session.record(held.source.pr, token, "discarded");
    await vi.runAllTimersAsync();
    await expect(discarding).resolves.toEqual([run.held!.entry, run.discarded!.entry]);

    const verified = clean.runs.find((item) => item.land)!;
    await expect(
      session.record(
        clean.source.pr,
        `${DEMO_TOKEN}:${clean.source.pr}:${verified.option}:0`,
        "held",
      ),
    ).rejects.toThrow(/wasn't recorded/);
    // The analysis token names no run, and a held run never landed.
    await expect(session.land(held.source.pr, DEMO_TOKEN)).resolves.toMatchObject({
      outcome: "REFUSED",
    });
    await expect(session.land(held.source.pr, token)).resolves.toMatchObject({
      outcome: "REFUSED",
    });
  });
});
