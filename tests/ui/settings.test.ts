import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, Settings } from "@/ui/settings";

describe("Settings", () => {
  it("falls back field by field, so one bad value can't break the desk", () => {
    expect(
      Settings.parse({ model: "gpt-anything", refreshSeconds: 7, wrap: false, extra: 1 }),
    ).toEqual({ ...DEFAULT_SETTINGS, wrap: false });
  });

  it("keeps a model from the fixed list", () => {
    expect(Settings.parse({ model: "gemini-3.8-flash" }).model).toBe("gemini-3.8-flash");
  });
});
