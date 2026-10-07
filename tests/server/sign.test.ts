import { describe, expect, it } from "vitest";
import { z } from "zod";
import { sign, verify, SignatureError, type SignedScope } from "@/server/sign";
import { DEMO_TOKEN } from "@/ui/sources/recorded";

const secret = "s".repeat(40);
const scope: SignedScope = {
  kind: "analysis",
  user: "YearningAsian",
  repo: "YearningAsian/merge-desk",
  pr: 1,
  head: "a".repeat(40),
  base: "b".repeat(40),
};
const Body = z.object({ option: z.string() });
const expected = { kind: "analysis" as const, user: scope.user, repo: scope.repo, pr: 1 };
const now = 1_800_000_000_000;

describe("sign and verify", () => {
  it("round-trips the scope and payload", () => {
    const token = sign(scope, { option: "combine" }, { secret, now });
    const result = verify(token, expected, Body, { secret, now: now + 1_000 });
    expect(result.scope).toEqual(scope);
    expect(result.body).toEqual({ option: "combine" });
  });

  it("refuses a changed payload or signature", () => {
    const token = sign(scope, { option: "combine" }, { secret, now });
    const [v, payload, mac] = token.split(".") as [string, string, string];
    const forged = Buffer.from(
      Buffer.from(payload, "base64url").toString().replace("combine", "keep_ours"),
    ).toString("base64url");
    expect(() => verify(`${v}.${forged}.${mac}`, expected, Body, { secret, now })).toThrow(
      /Signature does not match/,
    );
    expect(() =>
      verify(`${v}.${payload}.${mac.slice(1)}`, expected, Body, { secret, now }),
    ).toThrow(SignatureError);
  });

  it("refuses another key, user, pull request or kind", () => {
    const token = sign(scope, { option: "combine" }, { secret, now });
    expect(() => verify(token, expected, Body, { secret: "t".repeat(40), now })).toThrow(
      /does not match/,
    );
    expect(() => verify(token, { ...expected, user: "someone" }, Body, { secret, now })).toThrow(
      /different user/,
    );
    expect(() => verify(token, { ...expected, pr: 2 }, Body, { secret, now })).toThrow(
      /different pull request/,
    );
    expect(() => verify(token, { ...expected, kind: "result" }, Body, { secret, now })).toThrow(
      /different kind/,
    );
  });

  it("refuses an expired token and one with the wrong payload shape", () => {
    const token = sign(scope, { option: "combine" }, { secret, now, ttlMs: 1_000 });
    expect(() => verify(token, expected, Body, { secret, now: now + 1_000 })).toThrow(/Expired/);
    const wrong = sign(scope, { other: 1 }, { secret, now });
    expect(() => verify(wrong, expected, Body, { secret, now })).toThrow(/wrong shape/);
  });

  it("refuses demo mode's token like any other unsigned one", () => {
    for (const kind of ["analysis", "result"] as const)
      expect(() => verify(DEMO_TOKEN, { ...expected, kind }, Body, { secret, now })).toThrow(
        SignatureError,
      );
  });

  it("needs a long enough secret", () => {
    expect(() => sign(scope, {}, { secret: "short", now })).toThrow(/at least 32/);
  });
});
