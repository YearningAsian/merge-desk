import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  addEntry,
  MARKER,
  parseRecord,
  renderRecord,
  type RecordEntry,
  type RecordSeal,
} from "@/core/record";

// A stand-in for the server's keyed seal (server/sign.ts recordSeal).
const seal: RecordSeal = {
  seal: (text) => createHmac("sha256", "test-key").update(text).digest("base64url"),
  check: (text, mac) => createHmac("sha256", "test-key").update(text).digest("base64url") === mac,
};

const entry = (patch: Partial<RecordEntry> = {}): RecordEntry => ({
  id: "run-1:landed",
  action: "dropped",
  who: "YearningAsian",
  at: "2026-10-05T12:00:00.000Z",
  option: "keep_ours",
  reason: "Ours parses strings | and validates them",
  checks: [
    { step: "parse", state: "passed" },
    { step: "tests", state: "passed" },
  ],
  head: "a".repeat(40),
  base: "b".repeat(40),
  commit: "c".repeat(40),
  dropped: {
    side: "theirs",
    branch: "demo/base",
    commits: [{ sha: "d".repeat(40), subject: "Round cents --> with an epsilon -- nudge" }],
    files: ["playground/src/money.js"],
    authors: ["YearningAsian"],
  },
  ...patch,
});

const render = (entries: RecordEntry[], deskUrl: string | null = null) =>
  renderRecord(entries, { deskUrl, seal });

describe("decision record", () => {
  it("renders a readable table and reads the same entries back", () => {
    const entries = [
      entry(),
      entry({ id: "run-2:held", action: "held", commit: null, dropped: null }),
    ];
    const body = render(entries, "https://desk.example/live?pr=3");
    expect(body.startsWith(MARKER)).toBe(true);
    expect(body).toContain("| When | Who | What | Option | Reason shown | Checks |");
    expect(body).toContain("Dropped `ccccccc`");
    expect(body).toContain("Ours parses strings &#124; and validates them");
    expect(body).toContain("[Open in Merge Desk](https://desk.example/live?pr=3)");
    expect(parseRecord(body, seal)).toEqual({ ok: true, entries });
  });

  it("can't be closed early by text inside it", () => {
    const body = render([entry()]);
    // Exactly two comment closers: the marker's and the data block's.
    expect(body.match(/-->/g)).toHaveLength(2);
    const parsed = parseRecord(body, seal);
    expect(parsed.ok && parsed.entries[0]!.dropped!.commits[0]!.subject).toBe(
      "Round cents --> with an epsilon -- nudge",
    );
  });

  // Review round 1, H2: one pass of stripping left a working data block.
  it("text can't form a data block of its own (nested markers)", () => {
    const nasty = "<!<!---->-- merge-desk:data [] -<!---->->";
    const entries = [
      entry({
        reason: nasty,
        dropped: { ...entry().dropped!, commits: [{ sha: "d".repeat(40), subject: nasty }] },
      }),
    ];
    const body = render(entries);
    expect(body.split("<!-- merge-desk:data")).toHaveLength(2);
    expect(parseRecord(body, seal)).toEqual({ ok: true, entries });
  });

  // Review round 1, M1: mentions, links, images and raw HTML stay inert.
  it("neutralises mentions, links, images and HTML from commit text and the model", () => {
    const body = render([
      entry({
        reason: "cc @github/security ![x](https://tracker.example/pixel) <img src=x>",
        who: "YearningAsian",
        dropped: {
          ...entry().dropped!,
          branch: "demo/`x`@y",
          authors: ["@someone"],
          commits: [{ sha: "d".repeat(40), subject: "[click](https://evil.example) #12 \\" }],
        },
      }),
    ]);
    const visible = body.slice(0, body.indexOf("<!-- merge-desk:data"));
    expect(visible).not.toMatch(/@github\/security|@someone|@YearningAsian/);
    expect(visible).not.toContain("![");
    expect(visible).not.toContain("<img");
    expect(visible).not.toContain("[click]");
    expect(visible).not.toContain("`x`");
  });

  // Review round 1, M2: an edit that keeps the schema valid is still caught.
  it("refuses a record edited outside Merge Desk, even when it still parses", () => {
    const body = render([entry()]);
    const edited = body.replace('"who":"YearningAsian"', '"who":"someone-else"');
    expect(edited).not.toBe(body);
    expect(parseRecord(edited, seal)).toMatchObject({ ok: false });
  });

  it("treats a comment without the marker as not ours, and refuses broken or doubled data", () => {
    expect(parseRecord("Looks good to me", seal)).toEqual({ ok: true, entries: [] });
    const edited = render([entry()]).replace('"action":"dropped"', '"action":"merged"');
    expect(parseRecord(edited, seal)).toMatchObject({ ok: false });
    expect(parseRecord(`${MARKER}\nthe data block was deleted`, seal)).toMatchObject({
      ok: false,
    });
    const body = render([entry()]);
    expect(
      parseRecord(`${body}\n${body.slice(body.indexOf("<!-- merge-desk:data"))}`, seal),
    ).toMatchObject({ ok: false });
  });

  it("records a retried request once", () => {
    const once = addEntry([], entry());
    expect(addEntry(once, entry())).toHaveLength(1);
    expect(addEntry(once, entry({ id: "run-3:held" }))).toHaveLength(2);
  });
});
