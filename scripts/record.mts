// Captures the demo recordings from real live-mode work, through live
// mode's own route handlers (called in this process, signed in as the
// allowlisted account with the local session secret). For each demo pull
// request: one analysis, a run of every option it offered (recommended
// first), a steered retry of every held run, the hold and discard writes on
// the pull request's decision record, and a real Land of every verified run.
// After each Land, `npm run demo:reset -- --yes` puts the demo branches back
// on their seeds, so the next Land starts from the same conflict and every
// demo pull request ends conflicting again.
//
// Writes to GitHub: demo/* branches (Land, then reset) and the Merge Desk
// comment on demo pull requests. Nothing else. Every sandbox boot goes
// through the daily throttle. Nothing is signed in the files written, so a
// recording can't authorize a run, a Land or a record write.
//
//   npm run record              all three scenarios
//   npm run record -- held      one scenario (clean, held or drop)

import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { z } from "zod";
import { AnalyzeEvent, RunEvent } from "@/core/events";
import { PullList, type PullSummary } from "@/core/pulls";
import { RecordEntry } from "@/core/record";
import {
  Recording,
  ScenarioId,
  recordingGaps,
  type RecordedLand,
  type RecordedRun,
  type RecordedWrite,
} from "@/core/recording";
import { readNdjson } from "@/ui/ndjson";
import { loadLocalEnv } from "./lib/env.mts";
import { ROOT, loadDemoConfig, remoteRefs } from "./lib/git.mts";

loadLocalEnv();
// After the environment is loaded: the routes read it when they run.
const { CODE_ALLOWED_LOGINS, CODE_ALLOWED_REPOS } = await import("@/server/env");
const { SESSION_COOKIE, sealSession } = await import("@/server/session");
const { usesSandbox } = await import("@/server/runner");
const analyzeRoute = (await import("@/app/api/live/analyze/route")).POST;
const runRoute = (await import("@/app/api/live/run/route")).POST;
const landRoute = (await import("@/app/api/live/land/route")).POST;
const recordRoutes = await import("@/app/api/live/record/route");
const prsRoute = (await import("@/app/api/live/prs/route")).GET;

const REPO = CODE_ALLOWED_REPOS[0];
const LOGIN = CODE_ALLOWED_LOGINS[0];
const OUT = join(ROOT, "demo", "recordings");
// The production origin, so the decision comment links back to the live desk.
const ORIGIN = (
  JSON.parse(readFileSync(join(ROOT, "docs", "FACTS.json"), "utf8")) as {
    demo: { liveUrl: string };
  }
).demo.liveUrl;
// The one line every steered retry sends, the desk's own example.
const STEER = "Keep the old call working too.";

const wanted = process.argv.slice(2).map((arg) => ScenarioId.parse(arg));
const config = loadDemoConfig();
const runner = usesSandbox() ? "sandbox" : "local";
const cookie = `${SESSION_COOKIE}=${await sealSession(LOGIN)}`;
const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// A request as the desk sends it: signed in, from Merge Desk's own origin.
function request(path: string, body?: unknown): Request {
  return new Request(`${ORIGIN}${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: { cookie, origin: ORIGIN, "content-type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

async function json<T>(response: Response, what: string): Promise<T> {
  const body = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) throw new Error(`${what}: ${response.status} ${body.error ?? ""}`.trim());
  return body;
}

async function collect<T extends { t: number }>(
  response: Response,
  schema: z.ZodType<T>,
  what: string,
): Promise<{ events: T[]; token: string | undefined }> {
  if (!response.ok || !response.body) await json(response, what);
  const events: T[] = [];
  let token: string | undefined;
  for await (const event of readNdjson(response.body!, schema)) {
    // Kept for the next call, never written to the recording.
    const { token: signed, ...rest } = event as T & { token?: unknown };
    if (typeof signed === "string") token = signed;
    events.push(rest as unknown as T);
  }
  return { events, token };
}

async function pulls(): Promise<PullSummary[]> {
  return PullList.parse(await json(await prsRoute(request("/api/live/prs")), "list")).pulls;
}

async function entries(pr: number): Promise<RecordEntry[]> {
  const body = await json<{ entries: unknown }>(
    await recordRoutes.GET(request(`/api/live/record?pr=${pr}`)),
    "read record",
  );
  return RecordEntry.array().parse(body.entries);
}

// Reads that only observe: a dropped connection is retried, never fatal.
function observe<T>(read: () => T): T | undefined {
  try {
    return read();
  } catch {
    return undefined;
  }
}

// Waits until no decision-record lock is left on the pull request: the
// route releases it after answering.
async function lockReleased(pr: number) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    if (observe(() => remoteRefs(`refs/merge-desk/locks/pr-${pr}`).size) === 0) return;
    await pause(1_000);
  }
  throw new Error(`#${pr}: the decision-record lock is still held. Reconcile it by hand.`);
}

// Waits until GitHub lists the pull request at the given head and has
// worked out whether it can merge.
async function settled(pr: number, head: string, mergeable?: PullSummary["mergeable"]) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const pull = (await pulls().catch(() => [])).find((item) => item.number === pr);
    if (pull && pull.head.sha === head && pull.mergeable !== "checking")
      if (!mergeable || pull.mergeable === mergeable) return pull;
    await pause(2_000);
  }
  throw new Error(`#${pr}: GitHub didn't settle at ${head.slice(0, 7)} in time`);
}

// `npm run demo:reset -- --yes`, without a shell.
function resetDemo() {
  execFileSync(
    process.execPath,
    ["--import", "tsx", join(ROOT, "scripts", "demo-reset.mts"), "--yes"],
    { cwd: ROOT, stdio: "inherit" },
  );
}

for (const scenario of config.scenarios) {
  if (wanted.length > 0 && !wanted.includes(scenario.id)) continue;
  const found = (await pulls()).find(
    (item) => item.demo && item.head.ref === scenario.ours.branch && item.base.ref === config.base,
  );
  if (!found)
    throw new Error(`${scenario.id}: no open demo pull request from ${scenario.ours.branch}`);
  const pull = await settled(found.number, found.head.sha, "conflicting");
  const pr = pull.number;
  const capturedAt = new Date().toISOString();
  const seen = new Set((await entries(pr)).map((entry) => entry.id));
  const newEntry = (list: RecordEntry[], what: string) => {
    const fresh = list.filter((entry) => !seen.has(entry.id));
    if (fresh.length !== 1) throw new Error(`#${pr} ${what}: expected one new record entry`);
    seen.add(fresh[0]!.id);
    return fresh[0]!;
  };

  const analysis = await collect(
    await analyzeRoute(request("/api/live/analyze", { pr })),
    AnalyzeEvent,
    `${scenario.id} analyze`,
  );
  const finished = analysis.events.at(-1);
  if (!finished || !("type" in finished) || !finished.ok || !analysis.token)
    throw new Error(`${scenario.id}: the analysis didn't finish`);
  console.log(`${scenario.id} #${pr}: analysis in ${finished.t} ms (${finished.analysis.model})`);

  async function write(token: string, action: "held" | "discarded"): Promise<RecordedWrite> {
    const started = Date.now();
    const body = await json<{ entries: unknown }>(
      await recordRoutes.POST(request("/api/live/record", { pr, token, action })),
      `#${pr} ${action}`,
    );
    const ms = Date.now() - started;
    await lockReleased(pr);
    return { ms, entry: newEntry(RecordEntry.array().parse(body.entries), action) };
  }

  const runs: Array<{ run: RecordedRun; token: string }> = [];
  async function runOnce(option: RecordedRun["option"], steer: string | null) {
    const result = await collect(
      await runRoute(
        request("/api/live/run", {
          pr,
          token: analysis.token,
          option,
          ...(steer ? { steer } : {}),
        }),
      ),
      RunEvent,
      `${scenario.id} ${option}`,
    );
    const verdict = result.events.at(-1);
    if (!verdict || !("type" in verdict) || !result.token)
      throw new Error(`${scenario.id} ${option}: the run ended without a signed verdict`);
    const run: RecordedRun = {
      option,
      steer,
      events: result.events,
      held: verdict.verdict === "HELD" ? await write(result.token, "held") : null,
      discarded: await write(result.token, "discarded"),
      land: null,
    };
    runs.push({ run, token: result.token });
    console.log(`  ${option}${steer ? " (steered)" : ""}: ${verdict.verdict} in ${verdict.t} ms`);
    return verdict.verdict;
  }

  const order = [...finished.analysis.options].sort(
    (a, b) => Number(b.recommended) - Number(a.recommended),
  );
  for (const option of order)
    if ((await runOnce(option.kind, null)) === "HELD") await runOnce(option.kind, STEER);

  // Every verified run lands for real, then the demo goes back to its seed.
  for (const item of runs) {
    const verdict = item.run.events.at(-1)!;
    if (!("type" in verdict) || verdict.verdict !== "VERIFIED") continue;
    await settled(pr, pull.head.sha);
    const started = Date.now();
    const outcome = await json<Record<string, unknown>>(
      await landRoute(request("/api/live/land", { pr, token: item.token })),
      `#${pr} land ${item.run.option}`,
    );
    const ms = Date.now() - started;
    if (outcome.outcome !== "LANDED")
      throw new Error(`#${pr} land ${item.run.option}: ${String(outcome.outcome)}`);
    await lockReleased(pr);
    const commit = String(outcome.commit);
    const after = await settled(pr, commit);
    const list = await entries(pr);
    const land: RecordedLand = {
      ms,
      commit,
      branch: String(outcome.branch),
      mergeable: outcome.mergeable as RecordedLand["mergeable"],
      record: outcome.record as RecordedLand["record"],
      entry: list.some((entry) => !seen.has(entry.id)) ? newEntry(list, "land") : null,
      pull: after,
    };
    item.run.land = land;
    console.log(
      `  ${item.run.option}${item.run.steer ? " (steered)" : ""}: LANDED ${commit.slice(0, 7)} in ${ms} ms, then reset`,
    );
    resetDemo();
    await settled(pr, pull.head.sha, "conflicting");
  }

  const recording = Recording.parse({
    v: 2,
    scenario: scenario.id,
    capturedAt,
    runner,
    source: { repo: REPO, pr, headSha: pull.head.sha, baseSha: pull.base.sha },
    pull,
    analysis: analysis.events,
    runs: runs.map((item) => item.run),
  });
  const gaps = recordingGaps(recording);
  if (gaps.length) console.warn(`  gaps: ${gaps.join("; ")}`);
  mkdirSync(OUT, { recursive: true });
  writeFileSync(join(OUT, `${scenario.id}.json`), `${JSON.stringify(recording, null, 2)}\n`);
  console.log(`  wrote demo/recordings/${scenario.id}.json`);
}

const locks = remoteRefs("refs/merge-desk/locks/*");
if (locks.size) throw new Error(`Decision-record locks left: ${[...locks.keys()].join(", ")}`);
console.log("ok: every demo pull request is back at its seed and no lock is held");
