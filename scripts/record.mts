// Captures the demo recordings from real runs. For each demo pull request:
// one analysis, then one run of every option it offered (recommended first),
// through the same pipeline, runner, Gemini client and GitHub reads as the
// live routes. Every sandbox boot goes through the daily throttle first.
// Nothing is pushed or written to GitHub, and nothing is signed, so a
// recording can't authorize a run, a Land or a record write.
//
//   npm run record              all three scenarios
//   npm run record -- held      one scenario (clean, held or drop)

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { AnalyzeEvent, RunEvent } from "@/core/events";
import { Recording, ScenarioId, type RecordedRun } from "@/core/recording";
import { CODE_ALLOWED_REPOS } from "@/server/env";
import { geminiAnalyst } from "@/server/gemini/analyze";
import { GeminiClient } from "@/server/gemini/client";
import { geminiProposer } from "@/server/gemini/propose";
import { installationOctokit } from "@/server/github/app";
import { listPulls, readPull } from "@/server/github/prs";
import { analyzePipeline } from "@/server/pipeline/analyze";
import { runPipeline } from "@/server/pipeline/run";
import { liveRunner, usesSandbox } from "@/server/runner";
import { admitLiveWork } from "@/server/throttle";
import { loadLocalEnv } from "./lib/env.mts";
import { ROOT, loadDemoConfig } from "./lib/git.mts";

loadLocalEnv();
const REPO = CODE_ALLOWED_REPOS[0];
const OUT = join(ROOT, "demo", "recordings");
const DEADLINE_MS = 210_000; // the live routes' overall deadline

const wanted = process.argv.slice(2).map((arg) => ScenarioId.parse(arg));
const config = loadDemoConfig();
const runner = usesSandbox() ? "sandbox" : "local";
const client = GeminiClient.fromEnv();
const octokit = await installationOctokit(REPO, { pull_requests: "read", contents: "read" });
const { pulls } = await listPulls(octokit, REPO);
mkdirSync(OUT, { recursive: true });

// The same admission live routes use; the laptop runner boots no sandbox.
async function admit() {
  if (runner !== "sandbox") return;
  const admission = await admitLiveWork();
  if (!admission.ok) throw new Error(admission.reason);
}

for (const scenario of config.scenarios) {
  if (wanted.length > 0 && !wanted.includes(scenario.id)) continue;
  const pull = pulls.find(
    (item) => item.demo && item.head.ref === scenario.ours.branch && item.base.ref === config.base,
  );
  if (!pull)
    throw new Error(`${scenario.id}: no open demo pull request from ${scenario.ours.branch}`);
  if (pull.mergeable !== "conflicting")
    throw new Error(`${scenario.id}: #${pull.number} is ${pull.mergeable}, not conflicting`);
  const revisions = { head: pull.head.sha, base: pull.base.sha };
  const capturedAt = new Date().toISOString();

  await admit();
  const analysisEvents: AnalyzeEvent[] = [];
  for await (const event of analyzePipeline({
    runner: liveRunner(REPO, AbortSignal.timeout(DEADLINE_MS)),
    analyst: geminiAnalyst(client),
    model: client.model,
    repo: REPO,
    pr: pull.number,
    revisions,
    branches: { ours: pull.head.ref, theirs: pull.base.ref },
  }))
    analysisEvents.push(AnalyzeEvent.parse(event));
  const finished = analysisEvents.at(-1);
  if (!finished || !("type" in finished) || !finished.ok)
    throw new Error(
      `${scenario.id}: the analysis didn't finish: ${finished && "reason" in finished ? finished.reason : "no result"}`,
    );
  const { analysis } = finished;
  console.log(`${scenario.id} #${pull.number}: analysis in ${finished.t} ms (${analysis.model})`);

  const order = [...analysis.options].sort((a, b) => Number(b.recommended) - Number(a.recommended));
  const runs: RecordedRun[] = [];
  for (const option of order) {
    await admit();
    const events: RunEvent[] = [];
    for await (const event of runPipeline({
      runner: liveRunner(REPO, AbortSignal.timeout(DEADLINE_MS)),
      proposer: geminiProposer(client, analysis),
      revisions: analysis.revisions,
      option: option.kind,
      intents: analysis.intents,
      conflictedPaths: analysis.files.map((file) => file.path),
      // The run route's check, word for word.
      checkRevisions: async () => {
        try {
          const current = await readPull(octokit, REPO, pull.number);
          if (current.data.state !== "open")
            return { ok: false, detail: "The pull request is closed." };
          const same =
            current.summary.head.sha === revisions.head &&
            current.summary.base.sha === revisions.base;
          return same
            ? {
                ok: true,
                detail: `head ${revisions.head.slice(0, 7)} · base ${revisions.base.slice(0, 7)}`,
              }
            : { ok: false, detail: "The pull request changed since the analysis. Analyze again." };
        } catch {
          return { ok: false, detail: "Couldn't re-read the pull request from GitHub." };
        }
      },
    }))
      events.push(RunEvent.parse(event));
    const verdict = events.at(-1);
    if (!verdict || !("type" in verdict))
      throw new Error(`${scenario.id} ${option.kind}: the run ended without a verdict`);
    runs.push({ option: option.kind, events });
    console.log(`  ${option.kind}: ${verdict.verdict} in ${verdict.t} ms`);
  }

  const recording = Recording.parse({
    v: 1,
    scenario: scenario.id,
    capturedAt,
    runner,
    source: { repo: REPO, pr: pull.number, headSha: revisions.head, baseSha: revisions.base },
    pull,
    analysis: analysisEvents,
    runs,
  });
  writeFileSync(join(OUT, `${scenario.id}.json`), `${JSON.stringify(recording, null, 2)}\n`);
  console.log(`  wrote demo/recordings/${scenario.id}.json`);
}
