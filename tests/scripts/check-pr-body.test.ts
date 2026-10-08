import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { checkPrBody } from "../../scripts/check-pr-body.mts";

const ready = `Adds X.

## Verification
- VERIFIED Land refuses a moved base: \`land.test.ts\` "refuses ..." fails on main, passes here.
- Not checked: the phone layout.

Review: Claude Sonnet round 12.1, ponytail-review Ship, adversarial CLEAN ROUND.`;

describe("merge gate PR description check", () => {
  it("passes a description with a VERIFIED claim and a shipping review verdict", () => {
    expect(checkPrBody(ready)).toEqual([]);
  });

  it("passes CRLF bodies, which is how GitHub stores edited descriptions", () => {
    expect(checkPrBody(ready.replace(/\n/g, "\r\n"))).toEqual([]);
  });

  it("refuses the pull request template until someone fills it in", () => {
    const template = readFileSync(".github/pull_request_template.md", "utf8");
    expect(checkPrBody(template)).toHaveLength(2);
  });

  it("ignores verdict words inside HTML comments", () => {
    expect(checkPrBody("<!--\n- VERIFIED x\nReview: Ship\n-->")).toHaveLength(2);
  });

  it("refuses an empty description and a prose-only verification line", () => {
    expect(checkPrBody(undefined)).toHaveLength(2);
    expect(checkPrBody("Verification: `land.test.ts` passes locally.")).toEqual([
      "no claim starts with VERIFIED (verify-this verdict)",
      "no shipping 'Review:' line (ponytail-review Ship, nothing NOT or fix)",
    ]);
  });

  it("refuses a NOT VERIFIED or INCONCLUSIVE claim even beside a VERIFIED one", () => {
    expect(checkPrBody(`${ready}\n- NOT VERIFIED retries stop after one attempt`)).toEqual([
      "a claim is NOT VERIFIED or INCONCLUSIVE: fix it or move it to 'Not checked:'",
    ]);
    expect(checkPrBody(`${ready}\nINCONCLUSIVE run time under 10 s`)).toHaveLength(1);
  });

  it("refuses a review that has not reached Ship or a clean round", () => {
    const blocked = ready.replace(
      /^Review:.*$/m,
      "Review: ponytail-review says fix 1 and 3 first.",
    );
    expect(checkPrBody(blocked)).toEqual([
      "no shipping 'Review:' line (ponytail-review Ship, nothing NOT or fix)",
    ]);
  });
});

describe("merge gate PR description check, round 11.1 bypasses", () => {
  const REVIEW = "no shipping 'Review:' line (ponytail-review Ship, nothing NOT or fix)";
  const BLOCKED = "a claim is NOT VERIFIED or INCONCLUSIVE: fix it or move it to 'Not checked:'";

  it("refuses a review line that negates or defers its verdict", () => {
    for (const review of [
      "Review: Sonnet 11.1, ponytail-review Ship, adversarial NOT CLEAN ROUND",
      "Review: Sonnet 11.1, ponytail-review Ship blocked until fix 3",
      "Review: Sonnet 11.1, adversarial CLEAN ROUND",
    ])
      expect(checkPrBody(`- VERIFIED a: test\n${review}`), review).toEqual([REVIEW]);
  });

  it("finds a blocking verdict under any list, checkbox, quote or bold prefix", () => {
    for (const claim of [
      "1. NOT VERIFIED x",
      "- [ ] NOT VERIFIED x",
      "**NOT VERIFIED** x",
      "> - INCONCLUSIVE x",
    ])
      expect(checkPrBody(`${ready}\n${claim}`), claim).toEqual([BLOCKED]);
  });

  it("ignores everything after an unterminated comment, as GitHub hides it", () => {
    expect(checkPrBody("Adds X.\n<!--\n- VERIFIED x\nReview: ponytail-review Ship")).toHaveLength(
      2,
    );
  });
});
