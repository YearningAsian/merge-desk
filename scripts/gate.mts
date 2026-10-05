// Runs the Merge Desk gate on a seeded demo conflict.
//
//   npm run gate -- clean --candidate combined          hand-written merge, laptop
//   npm run gate -- clean --candidate drop-theirs
//   npm run gate -- clean --ai                          Gemini reads, proposes; sandbox runs
//   npm run gate -- held --ai --runner local
//   npm run gate -- drop --ai --option keep_ours
//
// --ai asks Gemini for each side's intent and the options, then for the merge.
// --runner sandbox (the default with --ai, or RUNNER) runs it in a Vercel
// Sandbox with the network denied; --runner local uses this machine.
// Exit code 0 means VERIFIED, 1 means HELD, 2 means it couldn't start.
// Nothing is pushed.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import {
  ANALYZE_STEP_LABELS,
  STEP_LABELS,
  type Analysis,
  type AnalyzeEvent,
  type RunEvent,
} from "@/core/events";
import type { Option } from "@/core/honor";
import { CODE_ALLOWED_REPOS } from "@/server/env";
import { GeminiClient } from "@/server/gemini/client";
import { geminiAnalyst } from "@/server/gemini/analyze";
import { geminiProposer } from "@/server/gemini/propose";
import { analyzePipeline, signAnalysis, verifyAnalysis } from "@/server/pipeline/analyze";
import { runPipeline, type Proposer } from "@/server/pipeline/run";
import { LocalRunner } from "@/server/runner/local";
import { SandboxRunner, type Timing } from "@/server/runner/sandbox";
import type { Revisions, Runner } from "@/server/runner/types";
import { loadLocalEnv } from "./lib/env.mts";
import { ROOT, loadDemoConfig, remoteRefs, resolveBranch } from "./lib/git.mts";

loadLocalEnv();

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    candidate: { type: "string" },
    option: { type: "string" },
    ai: { type: "boolean", default: false },
    runner: { type: "string" },
    steer: { type: "string" },
    source: { type: "string" },
    json: { type: "boolean", default: false },
  },
});

const REPO = CODE_ALLOWED_REPOS[0];
const config = loadDemoConfig();
const scenario = config.scenarios.find((item) => item.id === positionals[0]);
// Exits by setting process.exitCode, never process.exit(): on Windows, exiting
// while fetch sockets are still closing crashes Node.
class Stop extends Error {}
const stop = (message: string): never => {
  throw new Stop(message);
};

async function main(): Promise<number> {
  if (!scenario)
    stop(
      `Usage: npm run gate -- <${config.scenarios.map((item) => item.id).join("|")}> [--ai | --candidate <name>] [--option combine|keep_ours|keep_theirs] [--runner sandbox|local]`,
    );
  const demo = scenario!;
  const OPTIONS: Option[] = ["combine", "keep_ours", "keep_theirs"];
  if (values.option && !OPTIONS.includes(values.option as Option))
    stop(`Unknown option ${values.option}`);
  const runnerKind = values.runner ?? (values.ai ? (process.env.RUNNER ?? "sandbox") : "local");
  if (!["sandbox", "local"].includes(runnerKind)) stop(`Unknown runner ${runnerKind}`);

  // The sandbox clones from GitHub, so it must see the same commits we name.
  function currentRevisions(): Revisions | null {
    if (runnerKind === "sandbox") {
      const refs = remoteRefs("refs/heads/demo/*");
      const head = refs.get(`refs/heads/${demo.ours.branch}`);
      const base = refs.get(`refs/heads/${config.base}`);
      return head && base ? { head, base } : null;
    }
    const head = resolveBranch(demo.ours.branch);
    const base = resolveBranch(config.base);
    return head && base ? { head, base } : null;
  }
  const revisions =
    currentRevisions() ??
    stop(
      `Demo branches not found (${demo.ours.branch}, ${config.base}${runnerKind === "sandbox" ? " on origin" : ""}). Run npm run demo:seed first.`,
    );

  const makeRunner = (): Runner & { timings?: Timing[]; nodeVersion?: string | null } =>
    runnerKind === "sandbox"
      ? new SandboxRunner({ repoUrl: `https://github.com/${REPO}.git` })
      : new LocalRunner({ source: values.source ?? ROOT });

  const tty = process.stdout.isTTY;
  const paint = (code: number, text: string) => (tty ? `\x1b[${code}m${text}\x1b[0m` : text);
  const MARK = {
    passed: paint(32, "passed "),
    failed: paint(31, "FAILED "),
    not_run: paint(33, "not run"),
    running: "running",
    queued: "queued ",
  };
  const log = (line = "") => {
    if (!values.json) console.log(line);
  };
  const printTimings = (runner: { timings?: Timing[]; nodeVersion?: string | null }) => {
    if (!runner.timings?.length) return;
    log(
      `             sandbox (${runner.nodeVersion ?? "node ?"}): ${runner.timings.map((t) => `${t.label} ${(t.ms / 1000).toFixed(1)} s`).join(" · ")}`,
    );
  };

  // Prints a step list as events arrive: each step once, with its time.
  function stepPrinter(labels: Record<string, string>) {
    const started = new Map<string, number>();
    return (event: { t: number; step: string; state: string; detail?: string; log?: string }) => {
      if (values.json) return console.log(JSON.stringify(event));
      if (event.state === "running") {
        if (event.detail?.startsWith("Retrying")) log(`  ${paint(33, "retry  ")}  ${event.detail}`);
        started.set(event.step, event.t);
        return;
      }
      if (event.state === "queued") return;
      const took = started.has(event.step) ? `${event.t - started.get(event.step)!} ms` : "";
      log(
        `  ${MARK[event.state as keyof typeof MARK]}  ${labels[event.step]!.padEnd(22)} ${took.padStart(8)}`,
      );
      for (const line of (event.detail ?? "").split("\n").filter(Boolean))
        log(`             ${line}`);
      if (event.step === "tests" && event.state !== "passed" && event.log) {
        for (const line of event.log
          .split("\n")
          .filter((line) => /^(✖|not ok|ℹ (pass|fail))/.test(line.trim()))
          .slice(0, 12))
          log(`             ${line.trim()}`);
      }
    };
  }

  const runnerNote =
    runnerKind === "sandbox"
      ? "runner: Vercel Sandbox (network denied before candidate code)"
      : "runner: local (trusted, no network isolation)";
  log(`\nMerge Desk gate · ${demo.title}`);
  log(`  ours ${demo.ours.branch} (${revisions.head.slice(0, 7)})`);
  log(`  theirs ${config.base} (${revisions.base.slice(0, 7)})`);

  let option: Option;
  let intents: { ours: string; theirs: string };
  let conflictedPaths: string[];
  let proposer: Proposer;

  if (values.ai) {
    const client = GeminiClient.fromEnv();
    log(`  ${runnerNote} · model ${client.model}\n`);
    log("Analysis");
    const runner = makeRunner();
    const print = stepPrinter(ANALYZE_STEP_LABELS);
    let analysis: Analysis | null = null;
    const events: AsyncIterable<AnalyzeEvent> = analyzePipeline({
      runner,
      analyst: geminiAnalyst(client),
      model: client.model,
      repo: REPO,
      pr: null,
      revisions,
      branches: { ours: demo.ours.branch, theirs: config.base },
    });
    for await (const event of events) {
      if ("type" in event) {
        if (values.json) console.log(JSON.stringify(event));
        if (!event.ok) {
          printTimings(runner);
          stop(`\nAnalysis stopped: ${event.reason}`);
        } else analysis = event.analysis;
        continue;
      }
      print(event);
    }
    printTimings(runner);

    // The run trusts only what the server signed: sign, then verify, as the
    // desk will between the analyze and run requests.
    const secret =
      process.env.SESSION_SECRET ?? stop("SESSION_SECRET is needed to sign the analysis");
    const signer = { user: "gate-cli", secret };
    const trusted = verifyAnalysis(
      signAnalysis(analysis!, signer),
      { user: signer.user, repo: REPO, pr: null },
      { secret },
    );
    log("             signed analysis verified (user, repository, head and base bound)");

    log("\nOptions");
    for (const choice of trusted.options) {
      log(
        `  ${choice.recommended ? paint(32, "Recommended") : "           "}  ${choice.kind.padEnd(11)} ${choice.summary}`,
      );
      if (choice.reason) log(`               why: ${choice.reason}`);
      for (const kept of choice.keeps)
        log(
          `               keeps ${kept.side}: ${kept.commits.length} commits by ${kept.authors.join(", ") || "nobody"}`,
        );
      if (choice.drops)
        log(
          `               drops ${choice.drops.side}: ${choice.drops.commits.map((c) => `${c.sha.slice(0, 7)} ${c.subject}`).join("; ") || "nothing"} (${choice.drops.files.join(", ")}, by ${choice.drops.authors.join(", ")})`,
        );
    }
    const wanted =
      (values.option as Option | undefined) ?? trusted.options.find((o) => o.recommended)!.kind;
    if (!trusted.options.some((o) => o.kind === wanted))
      stop(
        `\nGemini did not offer ${wanted}; it offered ${trusted.options.map((o) => o.kind).join(", ")}.`,
      );
    option = wanted;
    intents = trusted.intents;
    conflictedPaths = trusted.files.map((file) => file.path);
    proposer = geminiProposer(client, trusted);
    log(`\nRun · option ${option}${values.option ? " (chosen)" : " (recommended)"}`);
  } else {
    option = (values.option ?? demo.defaultOption) as Option;
    const candidateName =
      values.candidate ?? (option === "combine" ? "combined" : option.replace("_", "-"));
    intents = { ours: demo.ours.intent, theirs: demo.theirs.intent };
    conflictedPaths = demo.conflicted;
    proposer = async ({ conflictedPaths: paths }) => ({
      files: paths.map((path) => {
        const file = join(ROOT, "tests/fixtures/candidates", demo.id, candidateName, path);
        try {
          return { path, content: readFileSync(file, "utf8") };
        } catch {
          throw new Error(`Candidate "${candidateName}" has no ${path}`);
        }
      }),
      description: `hand-written candidate "${candidateName}"`,
      source: "fixture (no AI)",
    });
    log(`  ours: ${intents.ours}`);
    log(`  theirs: ${intents.theirs}`);
    log(`  option ${option} · candidate ${candidateName} · ${runnerNote}\n`);
  }

  const runner = makeRunner();
  const print = stepPrinter(STEP_LABELS);
  let verdict: "VERIFIED" | "HELD" = "HELD";
  const events: AsyncIterable<RunEvent> = runPipeline({
    runner,
    proposer,
    revisions,
    option,
    intents,
    conflictedPaths,
    steer: values.steer,
    checkRevisions: async () => {
      const now = currentRevisions();
      const same = now?.head === revisions.head && now?.base === revisions.base;
      return {
        ok: same,
        detail: same
          ? `head ${revisions.head.slice(0, 7)} · base ${revisions.base.slice(0, 7)}`
          : "Pull request changed; re-run",
      };
    },
  });

  for await (const event of events) {
    if (!("type" in event)) {
      print(event);
      continue;
    }
    if (values.json) console.log(JSON.stringify(event));
    verdict = event.verdict;
    printTimings(runner);
    log(
      `\n${paint(verdict === "VERIFIED" ? 32 : 31, verdict)}${verdict === "HELD" ? `: failed or not run: ${event.failed.map((id) => STEP_LABELS[id]).join(", ")}` : ""}`,
    );
    log(
      verdict === "VERIFIED"
        ? "Every step passed. Nothing was pushed (Land comes in slice 5)."
        : "Nothing was pushed.",
    );
  }

  return verdict === "VERIFIED" ? 0 : 1;
}

main().then(
  (code) => {
    process.exitCode = code;
  },
  (error: unknown) => {
    console.error(error instanceof Stop ? error.message : error);
    process.exitCode = 2;
  },
);
