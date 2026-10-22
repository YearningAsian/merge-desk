import { describe, expect, it } from "vitest";
import { z } from "zod";
import { parseMergeMarkers } from "@/core/conflicts";
import { checkChoiceHonored, type FileVersions, type Option } from "@/core/honor";
import { normalizedLines, normalizeLine, splitLines, tokenize } from "@/core/text";
import { GeminiClient } from "@/server/gemini/client";
import { candidate, gitMergeFile, resolveWith, scenarioFile } from "../helpers/scenarios";

const INTENTS = { ours: "ours intent", theirs: "theirs intent" };

const file = (base: string, ours: string, theirs: string, result = ""): FileVersions => ({
  path: "x.js",
  base,
  ours,
  theirs,
  merged: gitMergeFile(ours, base, theirs),
  result,
});

const conflicts = (merged: string) =>
  parseMergeMarkers(merged).filter((segment) => segment.kind === "conflict").length;

const honor = (option: Option, f: FileVersions, result: string) =>
  checkChoiceHonored({ option, intents: INTENTS, files: [{ ...f, result }] });

// Keep ours: an admin check followed by the grant.
const ACCESS = {
  base: "export function access(user) {\n  check(user);\n  return deny();\n}\n",
  ours: "export function access(user) {\n  if (!user.admin) return deny();\n  grant(user);\n  return ok();\n}\n",
  theirs: 'export function access(user) {\n  check(user, "strict");\n  return deny("strict");\n}\n',
};
const grantFirst = (kept: string) =>
  kept.replace(
    "  if (!user.admin) return deny();\n  grant(user);\n",
    "  grant(user);\n  if (!user.admin) return deny();\n",
  );

// Two conflicts in one file; ours and theirs both write "y", in different functions.
const SWAP = (() => {
  const base =
    'function a() {\n  return "a0";\n}\nconst s1 = 1;\nconst s2 = 2;\nconst s3 = 3;\nfunction b() {\n  return "b0";\n}\n';
  return {
    base,
    ours: base.replace('"a0"', '"x"').replace('"b0"', '"y"'),
    theirs: base.replace('"a0"', '"y"').replace('"b0"', '"z"'),
    // a() returns theirs' "y"; ours' "x" sits in b(), where ours never wrote it.
    swapped: base.replace('"a0"', '"y"').replace('"b0"', '"x"'),
  };
})();

describe("core-llm audit: keep one side accepts a result that does not match the kept side", () => {
  it("keep_ours passes a result that moves ours' admin check below the grant", () => {
    const f = file(ACCESS.base, ACCESS.ours, ACCESS.theirs);
    expect(conflicts(f.merged), "one conflict").toBe(1);
    const kept = resolveWith(f.merged, "ours");
    expect(honor("keep_ours", f, kept).ok, "control: git checkout --ours passes").toBe(true);

    const reordered = grantFirst(kept);
    expect(reordered).not.toBe(kept);
    expect(
      honor("keep_ours", f, reordered).ok,
      "the rule says the result must match ours inside the conflicts",
    ).toBe(false);
  });

  it("keep_ours passes a result where theirs' value took over a() and ours' a() value moved to b()", () => {
    const f = file(SWAP.base, SWAP.ours, SWAP.theirs);
    expect(conflicts(f.merged), "two conflicts").toBe(2);
    const result = honor("keep_ours", f, SWAP.swapped);
    expect(result.ok, `summary was: ${result.summary.join(" | ")}`).toBe(false);
  });

  it("control for the fix: the checkout rule accepts the honest keep fixtures and rejects both cases", () => {
    const checkoutRule = (f: FileVersions, keep: "ours" | "theirs", result: string) =>
      normalizedLines(splitLines(resolveWith(f.merged, keep))).join("\n") ===
      normalizedLines(splitLines(result)).join("\n");

    const money = "playground/src/money.js";
    const drop = scenarioFile("drop", money, "");
    expect(checkoutRule(drop, "ours", candidate("drop", "keep-ours", money))).toBe(true);
    expect(checkoutRule(drop, "ours", candidate("drop", "leak-theirs", money))).toBe(false);

    const access = file(ACCESS.base, ACCESS.ours, ACCESS.theirs);
    expect(checkoutRule(access, "ours", grantFirst(resolveWith(access.merged, "ours")))).toBe(
      false,
    );
    expect(checkoutRule(file(SWAP.base, SWAP.ours, SWAP.theirs), "ours", SWAP.swapped)).toBe(false);
  });
});

describe("core-llm audit: combine pools every conflict in a file into one bag", () => {
  it("combine passes a result that moves ours' audit call from a() into b()", () => {
    const base =
      "function a(user) {\n  load(user);\n  return 1;\n}\nconst s1 = 1;\nconst s2 = 2;\nconst s3 = 3;\nfunction b(user) {\n  save(user);\n  return 2;\n}\n";
    const ours = base
      .replace("  load(user);\n", "  load(user, true);\n  audit(user);\n")
      .replace("save(user)", "save(user, true)");
    const theirs = base.replace("return 1;", "return 10;").replace("return 2;", "return 20;");
    const f = file(base, ours, theirs);
    expect(conflicts(f.merged), "two conflicts").toBe(2);

    const honest = base
      .replace("  load(user);\n  return 1;", "  load(user, true);\n  audit(user);\n  return 10;")
      .replace("  save(user);\n  return 2;", "  save(user, true);\n  return 20;");
    expect(honor("combine", f, honest).ok, "control: the honest combine passes").toBe(true);

    const moved = base
      .replace("  load(user);\n  return 1;", "  load(user, true);\n  return 10;")
      .replace("  save(user);\n  return 2;", "  save(user, true);\n  audit(user);\n  return 20;");
    const result = honor("combine", f, moved);
    expect(result.ok, `summary was: ${result.summary.join(" | ")}`).toBe(false);
  });
});

describe("core-llm audit: whitespace inside string literals is invisible to the check", () => {
  it("combine reports ours present when ours' only change, a string's spacing, is gone", () => {
    const base = 'export const MESSAGE = "Payment  failed";\nexport const LIMIT = 1;\n';
    const ours = 'export const MESSAGE = "Payment failed";\nexport const LIMIT = 1;\n';
    const theirs = 'export const MESSAGE = "Payment  failed";\nexport const LIMIT = 2;\n';
    const f = file(base, ours, theirs);
    expect(conflicts(f.merged), "one conflict").toBe(1);
    const result = honor("combine", f, resolveWith(f.merged, "theirs"));
    expect(result.ok, `summary was: ${result.summary.join(" | ")}`).toBe(false);
  });
});

describe("core-llm audit: a file the check could not read still reports both sides present", () => {
  it("a merge text with a nested marker is held, yet the summary says ours and theirs are present", () => {
    const merged =
      "x\n<<<<<<< ours\n<<<<<<< ours\na\n||||||| base\nb\n=======\nc\n>>>>>>> theirs\n";
    const result = checkChoiceHonored({
      option: "combine",
      intents: INTENTS,
      files: [{ path: "n.js", base: "", ours: "", theirs: "", merged, result: "x\n" }],
    });
    expect(result.ok, "fails closed").toBe(false);
    expect(result.summary.slice(0, 2), "neither side was compared").not.toContain(
      "ours: ours intent, present",
    );
  });
});

describe("core-llm audit: Gemini errors cross the boundary in the provider's words", () => {
  it("a Gemini error body reaches the caller verbatim; the key clients map it to fixed words", async () => {
    const client = new GeminiClient(async () => {
      throw Object.assign(new Error("400 PROVIDER-BODY-ECHO request=abc"), { status: 400 });
    }, "m");
    const call = client.structured({
      schema: z.object({ a: z.string() }),
      system: "s",
      input: "i",
    });
    await expect(call).rejects.toThrow(/refused the request/);
  });
});

describe("core-llm audit: honor cost on a whole-file reformat", () => {
  it("checks a 1,000-line file one side reformatted within 2 s", () => {
    const n = 1_000;
    const base =
      Array.from({ length: n }, (_, k) => `const v${k} = 'item ${k}';`).join("\n") + "\n";
    const ours = base.replaceAll("'", '"');
    const theirs = base.replace("const v0 = 'item 0';", "const v0 = 'first';");
    const f = file(base, ours, theirs);
    expect(conflicts(f.merged)).toBeGreaterThan(0);
    const started = performance.now();
    honor("keep_ours", f, resolveWith(f.merged, "ours"));
    const ms = Math.round(performance.now() - started);
    expect(ms, `honor on ${n} reformatted lines took ${ms} ms`).toBeLessThan(2_000);
  }, 600_000);
});

describe("combine checks conflicts that share a region of the result together", () => {
  it("passes an honest combine of two conflicts split only by a blank line, then a third", () => {
    const conflict = (ours: string, theirs: string) =>
      `<<<<<<< ours\n${ours}\n||||||| base\n=======\n${theirs}\n>>>>>>> theirs\n`;
    const merged =
      "function a() {\n" +
      conflict("  one();", "  two();") +
      "\n" +
      conflict("  three();", "  four();") +
      "}\nconst z = 1;\n" +
      conflict("five();", "six();");
    const result =
      "function a() {\n  one();\n  two();\n\n  three();\n  four();\n}\nconst z = 1;\nfive();\nsix();\n";
    const report = checkChoiceHonored({
      option: "combine",
      intents: INTENTS,
      files: [{ path: "a.js", base: "", ours: "", theirs: "", merged, result }],
    });
    expect(report.ok, `summary was: ${report.summary.join(" | ")}`).toBe(true);
  });
});

describe("review round 3 claims, settled by tests", () => {
  it("holds a third copy of a line both sides inserted, even in a region two conflicts share", () => {
    const conflict = (ours: string, theirs: string) =>
      `<<<<<<< ours\n${ours}\n||||||| base\n=======\n${theirs}\n>>>>>>> theirs\n`;
    const merged =
      "function a() {\n" +
      conflict("  x();\n  a();", "  x();\n  b();") +
      "\n" +
      conflict("  c();", "  d();") +
      "}\n";
    const honest = "function a() {\n  x();\n  a();\n  b();\n\n  c();\n  d();\n}\n";
    const tripled = "function a() {\n  x();\n  x();\n  a();\n  b();\n\n  x();\n  c();\n  d();\n}\n";
    const run = (result: string) =>
      checkChoiceHonored({
        option: "combine",
        intents: INTENTS,
        files: [{ path: "a.js", base: "", ours: "", theirs: "", merged, result }],
      });
    expect(run(honest).ok, "control").toBe(true);
    expect(run(tripled).ok).toBe(false);
  });

  it("reads an escaped quote the way a JavaScript lexer does", () => {
    expect(tokenize('"a\\" + "b"')).toEqual(['"a\\" + "', "b", '"']);
  });
});

describe("review round 4: template literals", () => {
  it("keeps a plain template whole and tokenizes an interpolated one piece by piece", () => {
    expect(tokenize("x = `a  b`;")).toEqual(["x", "=", "`a  b`", ";"]);
    expect(normalizeLine("x = `a ${ b } c`;")).toBe(normalizeLine("x = `a ${b} c`;"));
  });
});
