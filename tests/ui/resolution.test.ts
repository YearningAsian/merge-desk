import { describe, expect, it } from "vitest";
import { reproduceCommands, SCALE, snap, suggestInstead } from "@/ui/resolution";

const ALL = [...SCALE];
const NO_COMBINE = ["keep_ours", "keep_theirs"] as const;
const NO_THEIRS = ["keep_ours", "combine"] as const;

describe("snap", () => {
  it("lands on the target when it was offered", () => {
    expect(snap(1, 0, ALL)).toBe(1);
    expect(snap(2, 1, ALL)).toBe(2);
  });

  it("skips a position that wasn't offered in the direction of travel", () => {
    expect(snap(1, 0, NO_COMBINE)).toBe(2);
    expect(snap(1, 2, NO_COMBINE)).toBe(0);
  });

  it("falls back to the closest offered position at the end of the scale", () => {
    expect(snap(2, 0, NO_THEIRS)).toBe(1);
    expect(snap(2, 1, NO_THEIRS)).toBe(1);
  });

  it("stays put when nothing else was offered", () => {
    expect(snap(2, 0, ["keep_ours"])).toBe(0);
  });
});

describe("reproduceCommands", () => {
  const head = "d".repeat(40);
  const base = "a".repeat(40);

  it("uses the exact commits, never branch names", () => {
    expect(reproduceCommands({ head, base })).toBe(
      [
        `git fetch origin ${head} ${base}`,
        `git switch --detach ${head}`,
        `git merge --no-ff ${base}`,
      ].join("\n"),
    );
  });

  it("refuses anything that isn't a full commit ID", () => {
    expect(reproduceCommands({ head: "main;rm -rf ~", base })).toBeNull();
    expect(reproduceCommands({ head, base: "$(curl evil)" })).toBeNull();
    expect(reproduceCommands({ head: head.slice(0, 7), base })).toBeNull();
  });
});

describe("suggestInstead", () => {
  const option = (kind: "combine" | "keep_ours" | "keep_theirs", recommended = false) =>
    ({
      kind,
      label: kind,
      summary: "",
      recommended,
      reason: null,
      keeps: [],
      drops: null,
    }) as never;

  it("suggests the recommendation when another option was held", () => {
    const options = [option("combine"), option("keep_ours", true), option("keep_theirs")];
    expect(suggestInstead(options, "combine", null)?.kind).toBe("keep_ours");
  });

  it("when the recommendation was held, keeps the newer side's work", () => {
    const options = [option("combine", true), option("keep_ours"), option("keep_theirs")];
    expect(suggestInstead(options, "combine", { side: "ours", byMs: 2 * 86_400_000 })?.kind).toBe(
      "keep_theirs",
    );
    expect(suggestInstead(options, "combine", null)?.kind).toBe("keep_ours");
  });

  it("suggests nothing when nothing else was offered", () => {
    expect(suggestInstead([option("keep_ours", true)], "keep_ours", null)).toBeNull();
  });
});
