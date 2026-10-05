// Runs the Merge Desk gate on a seeded demo conflict, on this machine.
//
//   npm run gate -- clean --candidate combined
//   npm run gate -- clean --candidate drop-theirs
//   npm run gate -- held --candidate combined
//   npm run gate -- drop --candidate keep-ours --option keep_ours
//
// Slice 1 uses hand-written candidate merges from tests/fixtures/candidates
// (no AI). Exit code 0 means VERIFIED, 1 means HELD. Nothing is pushed.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { STEP_LABELS, type RunEvent, type StepId } from "@/core/events";
import type { Option } from "@/core/honor";
import { runPipeline, type Proposer } from "@/server/pipeline/run";
import { LocalRunner } from "@/server/runner/local";
import { ROOT, loadDemoConfig, resolveBranch } from "./lib/git";

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    candidate: { type: "string" },
    option: { type: "string" },
    source: { type: "string" },
    json: { type: "boolean", default: false },
  },
});

const config = loadDemoConfig();
const scenario = config.scenarios.find((item) => item.id === positionals[0]);
if (!scenario) {
  console.error(
    `Usage: npm run gate -- <${config.scenarios.map((item) => item.id).join("|")}> --candidate <name> [--option combine|keep_ours|keep_theirs]`,
  );
  process.exit(2);
}
const option = (values.option ?? scenario.defaultOption) as Option;
if (!["combine", "keep_ours", "keep_theirs"].includes(option)) {
  console.error(`Unknown option ${option}`);
  process.exit(2);
}
const candidateName =
  values.candidate ?? (option === "combine" ? "combined" : option.replace("_", "-"));

const head = resolveBranch(scenario.ours.branch);
const base = resolveBranch(config.base);
if (!head || !base) {
  console.error(
    `Demo branches not found (${scenario.ours.branch}, ${config.base}). Run npm run demo:seed first.`,
  );
  process.exit(2);
}

const proposer: Proposer = async ({ conflictedPaths }) => ({
  files: conflictedPaths.map((path) => {
    const file = join(ROOT, "tests/fixtures/candidates", scenario.id, candidateName, path);
    try {
      return { path, content: readFileSync(file, "utf8") };
    } catch {
      throw new Error(`Candidate "${candidateName}" has no ${path}`);
    }
  }),
  description: `hand-written candidate "${candidateName}"`,
  source: "fixture (no AI)",
});

const tty = process.stdout.isTTY;
const paint = (code: number, text: string) => (tty ? `\x1b[${code}m${text}\x1b[0m` : text);
const MARK = {
  passed: paint(32, "passed "),
  failed: paint(31, "FAILED "),
  not_run: paint(33, "not run"),
  running: "running",
  queued: "queued ",
};
const started = new Map<StepId, number>();

if (!values.json) {
  console.log(`\nMerge Desk gate · ${scenario.title}`);
  console.log(`  ours ${scenario.ours.branch} (${head.slice(0, 7)}): ${scenario.ours.intent}`);
  console.log(`  theirs ${config.base} (${base.slice(0, 7)}): ${scenario.theirs.intent}`);
  console.log(
    `  option ${option} · candidate ${candidateName} · runner: local (trusted, no network isolation)\n`,
  );
}

let verdict: "VERIFIED" | "HELD" = "HELD";
const events: AsyncIterable<RunEvent> = runPipeline({
  runner: new LocalRunner({ source: values.source ?? ROOT }),
  proposer,
  revisions: { head, base },
  option,
  intents: { ours: scenario.ours.intent, theirs: scenario.theirs.intent },
  conflictedPaths: scenario.conflicted,
});

for await (const event of events) {
  if (values.json) console.log(JSON.stringify(event));
  if ("type" in event) {
    verdict = event.verdict;
    if (!values.json) {
      const color = verdict === "VERIFIED" ? 32 : 31;
      console.log(
        `\n${paint(color, verdict)}${verdict === "HELD" ? `: failed or not run: ${event.failed.map((id) => STEP_LABELS[id]).join(", ")}` : ""}`,
      );
      console.log(
        verdict === "VERIFIED"
          ? "Every step passed. Nothing was pushed (slice 1 has no Land)."
          : "Nothing was pushed.",
      );
    }
    continue;
  }
  if (event.state === "running") started.set(event.step, event.t);
  if (values.json || event.state === "queued" || event.state === "running") continue;
  const took = started.has(event.step) ? `${event.t - started.get(event.step)!} ms` : "";
  console.log(`  ${MARK[event.state]}  ${STEP_LABELS[event.step].padEnd(22)} ${took.padStart(8)}`);
  for (const line of (event.detail ?? "").split("\n").filter(Boolean))
    console.log(`             ${line}`);
  if (event.step === "tests" && event.state !== "passed" && event.log) {
    for (const line of event.log
      .split("\n")
      .filter((line) => /^(✖|not ok|ℹ (pass|fail))/.test(line.trim()))
      .slice(0, 12)) {
      console.log(`             ${line.trim()}`);
    }
  }
}

process.exit(verdict === "VERIFIED" ? 0 : 1);
