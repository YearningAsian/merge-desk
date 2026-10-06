import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { GET } from "@/app/api/stats/route";

describe("GET /api/stats", () => {
  it("serves docs/FACTS.json unchanged", async () => {
    const file = JSON.parse(
      readFileSync(join(import.meta.dirname, "../../docs/FACTS.json"), "utf8"),
    );
    const response = GET();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(file);
  });

  it("gives every metric a provenance entry", async () => {
    const body = await GET().json();
    for (const key of Object.keys(body.metrics)) expect(body.provenance[key]).toBeTruthy();
  });
});
