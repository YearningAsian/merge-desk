import { describe, expect, it } from "vitest";
import type { RunEvent } from "@/core/events";
import { MalformedOutputError } from "@/server/errors";
import { runPipeline, type Proposer } from "@/server/pipeline/run";
import type { Runner } from "@/server/runner/types";
import { candidate, scenarioFile } from "../helpers/scenarios";

const API = "playground/src/api.js";
const clean = scenarioFile("clean", API, "");
const conflicted = [
  { path: API, base: clean.base, ours: clean.ours, theirs: clean.theirs, merged: clean.merged },
];

function fakeRunner(overrides: Partial<Runner> = {}): Runner & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    prepareMerge: async () => {
      throw new Error("not used by run");
    },
    applyProposal: async (_revisions, files) => {
      calls.push("apply");
      return {
        conflicted,
        changedFiles: [API, "playground/test/retry.test.js"],
        patch: `diff for ${files.length}`,
      };
    },
    parseCheck: async (paths) => {
      calls.push("parse");
      return paths.map((path) => ({ path, state: "passed" as const, detail: "node --check" }));
    },
    runTests: async () => {
      calls.push("tests");
      return {
        state: "passed",
        suite: "node --test (playground)",
        exitCode: 0,
        output: "pass 10",
        durationMs: 5,
      };
    },
    dispose: async () => {
      calls.push("dispose");
    },
    ...overrides,
  };
}

const propose =
  (name: string): Proposer =>
  async () => ({
    files: [{ path: API, content: candidate("clean", name, API) }],
    description: name,
    source: `fixture ${name}`,
  });

const revisions = { head: "a".repeat(40), base: "b".repeat(40) };
const intents = { ours: "renames fetchUser to getUser", theirs: "retry on 429" };
const conflictedPaths = [API];

async function collect(events: AsyncIterable<RunEvent>) {
  const all: RunEvent[] = [];
  for await (const event of events) all.push(event);
  const result = all.at(-1);
  if (!result || !("type" in result)) throw new Error("no result event");
  const final = new Map<string, string>();
  for (const event of all) if ("step" in event) final.set(event.step, event.state);
  return { all, result, final };
}

describe("runPipeline", () => {
  it("is VERIFIED only when every step passed", async () => {
    const runner = fakeRunner();
    const { result, final } = await collect(
      runPipeline({
        runner,
        proposer: propose("combined"),
        revisions,
        option: "combine",
        intents,
        conflictedPaths,
      }),
    );
    expect(result.verdict).toBe("VERIFIED");
    expect([...final.values()].every((state) => state === "passed")).toBe(true);
    expect(runner.calls.at(-1)).toBe("dispose");
  });

  it("holds a merge that dropped an intent, and still runs the tests for evidence", async () => {
    const runner = fakeRunner();
    const { result, final } = await collect(
      runPipeline({
        runner,
        proposer: propose("drop-theirs"),
        revisions,
        option: "combine",
        intents,
        conflictedPaths,
      }),
    );
    expect(result.verdict).toBe("HELD");
    expect(result.failed).toEqual(["honor"]);
    expect(result.summary).toContain("theirs: retry on 429, MISSING (6 lines)");
    expect(final.get("tests")).toBe("passed");
  });

  it("holds when the tests could not run, never showing a pass", async () => {
    const runner = fakeRunner({
      runTests: async () => ({
        state: "not_run",
        suite: "npm run test:core",
        exitCode: null,
        output: "",
        durationMs: 0,
      }),
    });
    const { result, final } = await collect(
      runPipeline({
        runner,
        proposer: propose("combined"),
        revisions,
        option: "combine",
        intents,
        conflictedPaths,
      }),
    );
    expect(final.get("tests")).toBe("not_run");
    expect(result.verdict).toBe("HELD");
  });

  it("holds when a changed file can't be parse-checked", async () => {
    const runner = fakeRunner({
      parseCheck: async (paths) =>
        paths.map((path) => ({ path, state: "not_run" as const, detail: "unsupported" })),
    });
    const { result } = await collect(
      runPipeline({
        runner,
        proposer: propose("combined"),
        revisions,
        option: "combine",
        intents,
        conflictedPaths,
      }),
    );
    expect(result.verdict).toBe("HELD");
    expect(result.failed).toContain("parse");
  });

  it("refuses a proposal that edits files outside the conflict before writing anything", async () => {
    const runner = fakeRunner();
    const sneaky: Proposer = async () => ({
      files: [
        { path: API, content: candidate("clean", "combined", API) },
        { path: ".github/workflows/ci.yml", content: "on: push" },
      ],
      description: "",
      source: "model",
    });
    const { result, final } = await collect(
      runPipeline({
        runner,
        proposer: sneaky,
        revisions,
        option: "combine",
        intents,
        conflictedPaths,
      }),
    );
    expect(final.get("propose")).toBe("failed");
    expect(final.get("write")).toBe("not_run");
    expect(result.verdict).toBe("HELD");
    expect(runner.calls).not.toContain("apply");
  });

  it("holds and stops when the proposer fails, and still disposes the runner", async () => {
    const runner = fakeRunner();
    const failing: Proposer = async () => {
      throw new Error("model unavailable");
    };
    const { result, final } = await collect(
      runPipeline({
        runner,
        proposer: failing,
        revisions,
        option: "combine",
        intents,
        conflictedPaths,
      }),
    );
    expect(final.get("propose")).toBe("failed");
    expect(final.get("tests")).toBe("not_run");
    expect(result.verdict).toBe("HELD");
    expect(runner.calls).toEqual(["dispose"]);
  });

  it("retries a malformed model answer at most twice, passing the reason back", async () => {
    const runner = fakeRunner();
    const seen: Array<number | undefined> = [];
    const flaky: Proposer = async (request) => {
      seen.push(request.retry?.attempt);
      if (seen.length < 3) throw new MalformedOutputError("not JSON");
      return propose("combined")(request);
    };
    const { result } = await collect(
      runPipeline({
        runner,
        proposer: flaky,
        revisions,
        option: "combine",
        intents,
        conflictedPaths,
      }),
    );
    expect(seen).toEqual([undefined, 2, 3]);
    expect(result.verdict).toBe("VERIFIED");

    let calls = 0;
    const broken: Proposer = async () => {
      calls += 1;
      throw new MalformedOutputError("not JSON");
    };
    const held = await collect(
      runPipeline({
        runner: fakeRunner(),
        proposer: broken,
        revisions,
        option: "combine",
        intents,
        conflictedPaths,
      }),
    );
    expect(calls).toBe(3);
    expect(held.result.verdict).toBe("HELD");
    expect(held.final.get("propose")).toBe("failed");
  });

  it("retries a proposal that doesn't parse, and holds if it never does", async () => {
    let parses = 0;
    const runner = fakeRunner({
      parseCheck: async (paths) => {
        parses += 1;
        return paths.map((path) => ({
          path,
          state: parses < 2 ? ("failed" as const) : ("passed" as const),
          detail: parses < 2 ? "SyntaxError" : "node --check",
        }));
      },
    });
    const reasons: string[] = [];
    const proposer: Proposer = async (request) => {
      if (request.retry) reasons.push(request.retry.reason);
      return propose("combined")(request);
    };
    const { result } = await collect(
      runPipeline({ runner, proposer, revisions, option: "combine", intents, conflictedPaths }),
    );
    expect(result.verdict).toBe("VERIFIED");
    expect(reasons).toEqual([`it did not parse (${API}: SyntaxError)`]);

    const never = fakeRunner({
      parseCheck: async (paths) =>
        paths.map((path) => ({ path, state: "failed" as const, detail: "SyntaxError" })),
    });
    const held = await collect(
      runPipeline({
        runner: never,
        proposer: propose("combined"),
        revisions,
        option: "combine",
        intents,
        conflictedPaths,
      }),
    );
    expect(never.calls.filter((call) => call === "apply")).toHaveLength(3);
    expect(never.calls).not.toContain("tests");
    expect(held.result.verdict).toBe("HELD");
  });

  it("does not retry a proposal that fails for other reasons", async () => {
    let calls = 0;
    const failing: Proposer = async () => {
      calls += 1;
      throw new Error("model unavailable");
    };
    await collect(
      runPipeline({
        runner: fakeRunner(),
        proposer: failing,
        revisions,
        option: "combine",
        intents,
        conflictedPaths,
      }),
    );
    expect(calls).toBe(1);
  });
});
