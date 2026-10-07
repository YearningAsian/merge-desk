import { describe, expect, it } from "vitest";
import type { AnalyzeEvent } from "@/core/events";
import type { ModelAnalysis } from "@/core/options";
import { MalformedOutputError } from "@/server/errors";
import {
  analyzePipeline,
  signAnalysis,
  verifyAnalysis,
  type Analyst,
} from "@/server/pipeline/analyze";
import type { PreparedMerge, Runner } from "@/server/runner/types";
import { SignatureError } from "@/server/sign";
import { scenarioFile } from "../helpers/scenarios";

const API = "playground/src/api.js";
const revisions = { head: "a".repeat(40), base: "b".repeat(40) };
const file = scenarioFile("clean", API, "");
const prepared: PreparedMerge = {
  revisions,
  mergeBase: "c".repeat(40),
  conflicted: [
    { path: API, base: file.base, ours: file.ours, theirs: file.theirs, merged: file.merged },
  ],
  unsupported: [],
  commits: {
    ours: [
      {
        sha: "d".repeat(40),
        author: "Ana",
        date: "2026-10-05T10:00:00Z",
        subject: "Rename fetchUser to getUser",
        files: [API],
      },
    ],
    theirs: [
      {
        sha: "e".repeat(40),
        author: "Teo",
        date: "2026-10-05T09:00:00Z",
        subject: "Retry fetchUser on HTTP 429",
        files: [API],
      },
    ],
  },
};

const good: ModelAnalysis = {
  intents: { ours: "renames fetchUser to getUser", theirs: "retry on 429" },
  options: [
    { kind: "combine", summary: "getUser with retry", recommended: true, reason: "Both fit." },
    { kind: "keep_ours", summary: "getUser only", recommended: false, reason: "" },
  ],
};

function fakeRunner(result: PreparedMerge | Error): Runner & { disposed: number } {
  const runner = {
    disposed: 0,
    prepareMerge: async () => {
      if (result instanceof Error) throw result;
      return result;
    },
    applyProposal: async () => {
      throw new Error("not used");
    },
    parseCheck: async () => [],
    runTests: async () => {
      throw new Error("not used");
    },
    dispose: async () => {
      runner.disposed += 1;
    },
  };
  return runner;
}

async function collect(events: AsyncIterable<AnalyzeEvent>) {
  const all: AnalyzeEvent[] = [];
  for await (const event of events) all.push(event);
  const last = all.at(-1)!;
  if (!("type" in last)) throw new Error("no analysis event");
  return { all, last };
}

const base = { model: "gemini-test", repo: "YearningAsian/merge-desk", pr: 1, revisions };

describe("analyzePipeline", () => {
  it("returns the analysis with git-derived keeps and drops, and disposes the runner first", async () => {
    const runner = fakeRunner(prepared);
    let disposedBeforeModel = false;
    const analyst: Analyst = async () => {
      disposedBeforeModel = runner.disposed === 1;
      return good;
    };
    const { last } = await collect(analyzePipeline({ ...base, runner, analyst }));
    if (!last.ok) throw new Error(last.reason);
    expect(disposedBeforeModel).toBe(true);
    expect(last.analysis.intents.theirs).toBe("retry on 429");
    expect(last.analysis.options[1]!.drops!.authors).toEqual(["Teo"]);
    expect(last.analysis.files[0]!.merged).toContain("|||||||");
  });

  it("retries a malformed answer at most twice, then fails", async () => {
    let calls = 0;
    const analyst: Analyst = async (input) => {
      calls += 1;
      if (calls === 2) expect(input.retry).toMatchObject({ attempt: 2 });
      throw new MalformedOutputError("not JSON");
    };
    const { all, last } = await collect(
      analyzePipeline({ ...base, runner: fakeRunner(prepared), analyst }),
    );
    expect(calls).toBe(3);
    expect(last).toMatchObject({ ok: false, reason: "not JSON" });
    expect(
      all
        .filter((e) => "step" in e && e.detail?.startsWith("Retrying"))
        .map((e) => "step" in e && e.detail),
    ).toHaveLength(2);
  });

  it("retries options that break the rules, and does not retry other errors", async () => {
    let calls = 0;
    const twoRecommended: ModelAnalysis = {
      ...good,
      options: good.options.map((o) => ({ ...o, recommended: true, reason: "x" })),
    };
    const { last } = await collect(
      analyzePipeline({
        ...base,
        runner: fakeRunner(prepared),
        analyst: async () => (++calls === 1 ? twoRecommended : good),
      }),
    );
    expect(last.ok).toBe(true);
    expect(calls).toBe(2);

    calls = 0;
    const failed = await collect(
      analyzePipeline({
        ...base,
        runner: fakeRunner(prepared),
        analyst: async () => {
          calls += 1;
          throw new Error("quota exceeded");
        },
      }),
    );
    expect(calls).toBe(1);
    expect(failed.last).toMatchObject({ ok: false, reason: "quota exceeded" });
  });

  it("stops before the model when there is nothing to resolve or the runner fails", async () => {
    let called = false;
    const analyst: Analyst = async () => {
      called = true;
      return good;
    };
    const clean = await collect(
      analyzePipeline({ ...base, runner: fakeRunner({ ...prepared, conflicted: [] }), analyst }),
    );
    expect(clean.last).toMatchObject({
      ok: false,
      reason: expect.stringContaining("No conflicts"),
    });
    const binary = await collect(
      analyzePipeline({
        ...base,
        runner: fakeRunner({
          ...prepared,
          unsupported: [{ path: "logo.png", reason: "binary file" }],
        }),
        analyst,
      }),
    );
    expect(binary.last).toMatchObject({ ok: false, reason: expect.stringContaining("logo.png") });
    const runner = fakeRunner(new Error("Sandbox didn't start"));
    const broken = await collect(analyzePipeline({ ...base, runner, analyst }));
    expect(broken.last).toMatchObject({ ok: false, reason: "Sandbox didn't start" });
    expect(runner.disposed).toBe(1);
    expect(called).toBe(false);
  });
});

describe("signed analysis", () => {
  it("verifies for the same user, repository and pull request only", async () => {
    const { last } = await collect(
      analyzePipeline({ ...base, runner: fakeRunner(prepared), analyst: async () => good }),
    );
    if (!last.ok) throw new Error(last.reason);
    const secret = "k".repeat(40);
    const token = signAnalysis(last.analysis, { user: "YearningAsian", secret });
    const expected = { user: "YearningAsian", repo: base.repo, pr: 1 };
    expect(verifyAnalysis(token, expected, { secret }).revisions).toEqual(revisions);
    expect(() => verifyAnalysis(token, { ...expected, pr: 2 }, { secret })).toThrow(SignatureError);
  });

  it("passes its signal to the model call, so a cancel or the route deadline stops it", async () => {
    const controller = new AbortController();
    let received: AbortSignal | undefined;
    const analyst: Analyst = async (input) => {
      received = input.signal;
      return good;
    };
    await collect(
      analyzePipeline({
        ...base,
        runner: fakeRunner(prepared),
        analyst,
        signal: controller.signal,
      }),
    );
    expect(received).toBe(controller.signal);
  });
});
