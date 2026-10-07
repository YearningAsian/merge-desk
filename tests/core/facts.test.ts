import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { Recording, SCENARIOS, recordingFacts } from "@/core/recording";

// Public numbers live in docs/FACTS.json, each with the command that
// measured it. The demo numbers must match the committed recordings.

const read = (path: string) => JSON.parse(readFileSync(join(process.cwd(), path), "utf8"));
const facts = read("docs/FACTS.json") as {
  metrics: Record<string, number>;
  provenance: Record<string, string>;
  labels: Record<string, string>;
  headline: string[];
};
const recordings = SCENARIOS.map((id) => Recording.parse(read(`demo/recordings/${id}.json`)));

describe("FACTS", () => {
  it("states the demo numbers measured from the recordings (npm run facts)", () => {
    expect(facts.metrics).toMatchObject(recordingFacts(recordings));
  });

  it("records how every number was measured, and labels it", () => {
    for (const key of Object.keys(facts.metrics)) {
      expect(facts.provenance[key], key).toBeTruthy();
      expect(facts.labels[key], key).toBeTruthy();
    }
    for (const key of facts.headline) expect(facts.metrics).toHaveProperty(key);
  });
});
