// Measures the demo numbers from demo/recordings and writes them, with how
// they were measured, to docs/FACTS.json. Other entries are left alone.
//
//   npm run facts

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Recording, SCENARIOS, recordingFacts } from "@/core/recording";
import { ROOT } from "./lib/git.mts";

const path = join(ROOT, "docs", "FACTS.json");
const facts = JSON.parse(readFileSync(path, "utf8"));
const recordings = SCENARIOS.map((id) =>
  Recording.parse(JSON.parse(readFileSync(join(ROOT, "demo", "recordings", `${id}.json`), "utf8"))),
);
const measured = recordingFacts(recordings);
const today = new Date().toISOString().slice(0, 10);
const captured = [...new Set(recordings.map((recording) => recording.capturedAt.slice(0, 10)))];
const how = `npm run facts: counted from demo/recordings/*.json, captured ${captured.join(", ")} by npm run record (${today})`;
const labels: Record<keyof typeof measured, string> = {
  demoRecordedRuns: "recorded demo runs",
  demoRecordedVerified: "recorded runs VERIFIED",
  demoRecordedHeld: "recorded runs HELD",
  demoRunSecondsMin: "fastest recorded run, seconds from start to verdict",
  demoRunSecondsMax: "slowest recorded run, seconds from start to verdict",
};

for (const [key, value] of Object.entries(measured) as Array<[keyof typeof measured, number]>) {
  facts.metrics[key] = value;
  facts.provenance[key] = how;
  facts.labels[key] = labels[key];
}
facts.asOf = today;
writeFileSync(path, `${JSON.stringify(facts, null, 2)}\n`);
console.log(JSON.stringify(measured));
