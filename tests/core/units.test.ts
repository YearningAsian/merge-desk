import { describe, expect, it } from "vitest";
import { normalizeLine, normalizedLines, splitLines, tokenize } from "@/core/text";
import { merge3 } from "@/core/merge3";
import { alignSide, similarity } from "@/core/align";
import { ConflictParseError, matchOutside, parseMergeMarkers } from "@/core/conflicts";
import { applyRenames, detectRenames } from "@/core/atoms";

describe("text", () => {
  it("tokenizes identifiers, numbers and single punctuation characters", () => {
    expect(tokenize("const x = a+b1;")).toEqual(["const", "x", "=", "a", "+", "b1", ";"]);
  });

  it("normalizes whitespace so formatting differences compare equal", () => {
    expect(normalizeLine("  foo(a,b)  ")).toBe(normalizeLine("foo( a , b )"));
  });

  it("drops blank lines when normalizing a block", () => {
    expect(normalizedLines(["a", "  ", "", "b"])).toEqual(["a", "b"]);
  });

  it("splits text on LF and CRLF without a trailing empty line", () => {
    expect(splitLines("a\r\nb\n")).toEqual(["a", "b"]);
    expect(splitLines("")).toEqual([]);
  });
});

describe("merge3 (token level)", () => {
  const t = (s: string) => s.split(" ");

  it("merges non-overlapping edits from both sides", () => {
    const result = merge3(t("f ( a , b )"), t("g ( a , b )"), t("f ( a , b , c )"));
    expect(result).toEqual({ ok: true, merged: t("g ( a , b , c )") });
  });

  it("takes an identical edit once", () => {
    expect(merge3(t("x = 1"), t("x = 2"), t("x = 2"))).toEqual({ ok: true, merged: t("x = 2") });
  });

  it("refuses overlapping different edits", () => {
    expect(merge3(t("x = 1"), t("x = 2"), t("x = 3")).ok).toBe(false);
  });

  it("refuses different insertions at the same point", () => {
    expect(merge3(t("[ a ]"), t("[ a , b ]"), t("[ a , c ]")).ok).toBe(false);
  });

  it("returns the changed side when the other is unchanged", () => {
    expect(merge3(t("a b"), t("a b"), t("a c"))).toEqual({ ok: true, merged: t("a c") });
  });
});

describe("alignSide", () => {
  it("scores similar lines above unrelated ones", () => {
    expect(
      similarity("return Math . floor ( x ) ;", "return Math . round ( x ) ;"),
    ).toBeGreaterThan(0.7);
    expect(similarity("return Math . floor ( x ) ;", "if ( ! ok ) {")).toBeLessThan(0.3);
  });

  it("marks unchanged, modified, removed and inserted lines against the base", () => {
    const base = ["a ( 1 ) ;", "keep ;", "drop me now ;"];
    const side = ["new first ;", "a ( 2 ) ;", "keep ;"];
    const alignment = alignSide(base, side);
    expect(alignment.base).toEqual([
      { kind: "modified", to: "a ( 2 ) ;" },
      { kind: "same" },
      { kind: "removed" },
    ]);
    expect(alignment.inserted.get(-1)).toEqual(["new first ;"]);
  });
});

describe("conflict markers", () => {
  const merged = [
    "top",
    "<<<<<<< ours",
    "o1",
    "||||||| base",
    "b1",
    "=======",
    "t1",
    "t2",
    ">>>>>>> theirs",
    "middle",
    "end",
  ].join("\n");

  it("parses diff3 output into clean and conflict segments", () => {
    expect(parseMergeMarkers(merged)).toEqual([
      { kind: "clean", lines: ["top"] },
      { kind: "conflict", ours: ["o1"], base: ["b1"], theirs: ["t1", "t2"] },
      { kind: "clean", lines: ["middle", "end"] },
    ]);
  });

  it("refuses conflict output without a base section", () => {
    expect(() => parseMergeMarkers("<<<<<<< a\nx\n=======\ny\n>>>>>>> b\n")).toThrow(
      ConflictParseError,
    );
  });

  it("refuses an unterminated conflict", () => {
    expect(() => parseMergeMarkers("<<<<<<< a\nx\n||||||| b\ny\n=======\n")).toThrow(
      ConflictParseError,
    );
  });

  it("finds the clean segments in order and returns what fills each conflict", () => {
    const segments = parseMergeMarkers(merged);
    const result = matchOutside(segments, ["top", "resolved one", "resolved two", "middle", "end"]);
    expect(result).toEqual({
      ok: true,
      missing: [],
      extra: [],
      gaps: [["resolved one", "resolved two"]],
    });
  });

  it("fails when a line outside the conflict changed", () => {
    const segments = parseMergeMarkers(merged);
    const result = matchOutside(segments, ["top", "resolved", "middle", "end changed"]);
    expect(result.ok).toBe(false);
    expect(result.missing).toEqual(["end"]);
  });

  it("fails when lines were added after the last clean segment", () => {
    const segments = parseMergeMarkers(merged);
    const result = matchOutside(segments, ["top", "resolved", "middle", "end", "appended"]);
    expect(result.ok).toBe(false);
    expect(result.extra).toEqual(["appended"]);
  });
});

describe("renames", () => {
  const base = [
    "export function fetchUser(id) {",
    "  throw new Error(`fetchUser failed`);",
    "}",
    "export const n = fetchUser(1);",
  ].join("\n");

  it("detects one identifier consistently replaced by a new one", () => {
    const side = [
      "export function getUser(id) {",
      "  throw new Error(`getUser failed`);",
      "}",
      "export const n = getUser(1);",
      "export const fetchUser = getUser;",
    ].join("\n");
    expect(detectRenames(base, side).map(({ from, to }) => ({ from, to }))).toEqual([
      { from: "fetchUser", to: "getUser" },
    ]);
  });

  it("does not call it a rename while the old name is still used on its own", () => {
    const side = base.replace("export function fetchUser", "export function getUser");
    expect(detectRenames(base, side)).toEqual([]);
  });

  it("does not call it a rename when the new name already existed in the base", () => {
    const withGetUser = `${base}\nexport const getUser = 1;`;
    const side = withGetUser.replaceAll("fetchUser", "getUser");
    expect(detectRenames(withGetUser, side)).toEqual([]);
  });

  it("ignores keyword swaps such as const to let", () => {
    expect(detectRenames("const x = 1;", "let x = 1;")).toEqual([]);
  });

  it("rewrites whole identifier tokens only", () => {
    const renames = [{ from: "fetchUser", to: "getUser", evidence: "" }];
    expect(applyRenames("fetchUser ( fetchUserX )", renames)).toBe("getUser ( fetchUserX )");
  });
});
