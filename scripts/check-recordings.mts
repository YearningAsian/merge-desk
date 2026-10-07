// Validates demo/recordings/{clean,held,drop}.json: each one passes the
// recording schema (no signatures, a finished analysis, one verdict per run,
// revisions bound to the pull request), belongs to its scenario's demo
// branch, and is complete (core/recording recordingGaps): every offered
// option, a steered retry of every held run, every hold and discard write,
// and a real Land of every verified run. So the demo never reaches a button
// it can't play back. Exits non-zero on any problem.
//
//   npm run recordings:check

import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  Recording,
  SCENARIOS,
  recordedAnalysis,
  recordedResult,
  recordingGaps,
} from "@/core/recording";
import { ROOT, loadDemoConfig } from "./lib/git.mts";

const config = loadDemoConfig();
const problems: string[] = [];
const prs = new Set<number>();

for (const id of SCENARIOS) {
  const file = `demo/recordings/${id}.json`;
  let recording: Recording;
  try {
    recording = Recording.parse(JSON.parse(readFileSync(join(ROOT, file), "utf8")));
  } catch (error) {
    problems.push(`${file}: ${error instanceof Error ? error.message : String(error)}`);
    continue;
  }
  const scenario = config.scenarios.find((item) => item.id === id)!;
  if (recording.scenario !== id) problems.push(`${file}: says it is ${recording.scenario}`);
  if (recording.pull.head.ref !== scenario.ours.branch || recording.pull.base.ref !== config.base)
    problems.push(`${file}: isn't the ${scenario.ours.branch} → ${config.base} pull request`);
  if (!recording.pull.demo) problems.push(`${file}: the pull request isn't labelled demo`);
  if (prs.has(recording.source.pr)) problems.push(`${file}: #${recording.source.pr} used twice`);
  prs.add(recording.source.pr);

  const analysis = recordedAnalysis(recording);
  for (const gap of recordingGaps(recording)) problems.push(`${file}: ${gap}`);

  const runs = recording.runs
    .map((run) => {
      const result = recordedResult(run);
      const steered = run.steer ? " (steered)" : "";
      const landed = run.land ? `, LANDED ${run.land.commit.slice(0, 7)}` : "";
      return `${run.option}${steered} ${result.verdict} ${(result.t / 1000).toFixed(1)} s${landed}`;
    })
    .join(", ");
  console.log(`${id}: #${recording.source.pr} (${recording.runner}, ${analysis.model}): ${runs}`);
}

if (problems.length > 0) {
  console.error(problems.map((problem) => `  ${problem}`).join("\n"));
  process.exit(1);
}
console.log("ok: recordings valid");
