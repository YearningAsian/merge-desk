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

const SCOPE = "YearningAsian/merge-desk#3";
const render = (entries: RecordEntry[], deskUrl: string | null = null) =>
  renderRecord(entries, { deskUrl, seal, scope: SCOPE });

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
    expect(parseRecord(body, seal, SCOPE)).toEqual({ ok: true, entries });
  });

  it("can't be closed early by text inside it", () => {
    const body = render([entry()]);
    // Exactly two comment closers: the marker's and the data block's.
    expect(body.match(/-->/g)).toHaveLength(2);
    const parsed = parseRecord(body, seal, SCOPE);
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
    expect(parseRecord(body, seal, SCOPE)).toEqual({ ok: true, entries });
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
    expect(parseRecord(edited, seal, SCOPE)).toMatchObject({ ok: false });
  });

  // Review round 4, M3: readers see the table, link and note, not hidden JSON.
  it.each([
    ["Who", "| YearningAsian |", "| someone-else |"],
    ["What", "| Dropped `ccccccc` |", "| Landed `eeeeeee` |"],
    ["desk URL", "https://desk.example/live?pr=3", "https://evil.example/live?pr=3"],
    ["note", "> The ref update was confirmed.", "> The ref update was refused."],
    ["prefix whitespace", "### Merge Desk record", "### Merge Desk record "],
  ])("refuses an edit to the visible %s with untouched sealed entries", (_field, from, to) => {
    const body = renderRecord([entry()], {
      deskUrl: "https://desk.example/live?pr=3",
      note: "The ref update was confirmed.",
      seal,
      scope: SCOPE,
    });
    const start = body.indexOf("<!-- merge-desk:data");
    const edited = body.slice(0, start).replace(from, to) + body.slice(start);
    expect(edited).not.toBe(body);
    expect(parseRecord(edited, seal, SCOPE)).toMatchObject({ ok: false });
  });

  it("accepts reordered hidden JSON when the visible prefix and entries are unchanged", () => {
    const entries = [entry()];
    const body = render(entries, "https://desk.example/live?pr=3");
    const reordered = body.replace(/<!-- merge-desk:data\n([\s\S]*?)\n-->$/, (_block, raw) => {
      const data = JSON.parse(raw) as { v: number; entries: RecordEntry[]; mac: string };
      return `<!-- merge-desk:data\n${JSON.stringify({
        mac: data.mac,
        entries: data.entries.map((item) => Object.fromEntries(Object.entries(item).reverse())),
        v: data.v,
      }).replace(/--/g, "-\\u002d")}\n-->`;
    });
    expect(reordered).not.toBe(body);
    expect(parseRecord(reordered, seal, SCOPE)).toEqual({ ok: true, entries });
  });

  it("refuses legacy entries-only seals instead of trusting an unsealed visible record", () => {
    const entries = [entry({ dropped: null })];
    const body = render(entries);
    const prefix = body.slice(0, body.indexOf("<!-- merge-desk:data"));
    const legacy = `${prefix}<!-- merge-desk:data\n${JSON.stringify({
      v: 1,
      entries,
      mac: seal.seal(`${SCOPE}\n${JSON.stringify(entries)}`),
    })}\n-->`;
    expect(parseRecord(legacy, seal, SCOPE)).toMatchObject({ ok: false });
  });

  it("treats a comment without the marker as not ours, and refuses broken or doubled data", () => {
    expect(parseRecord("Looks good to me", seal, SCOPE)).toEqual({ ok: true, entries: [] });
    const edited = render([entry()]).replace('"action":"dropped"', '"action":"merged"');
    expect(parseRecord(edited, seal, SCOPE)).toMatchObject({ ok: false });
    expect(parseRecord(`${MARKER}\nthe data block was deleted`, seal, SCOPE)).toMatchObject({
      ok: false,
    });
    const body = render([entry()]);
    expect(
      parseRecord(`${body}\n${body.slice(body.indexOf("<!-- merge-desk:data"))}`, seal, SCOPE),
    ).toMatchObject({ ok: false });
  });

  // Review round 2, L1: bare www. and e-mail autolinks can't form either.
  it("breaks www. and e-mail autolinks", () => {
    const body = render([
      entry({
        reason: "see www.evil.example/phish or mail someone@evil.example",
        dropped: {
          ...entry().dropped!,
          commits: [{ sha: "d".repeat(40), subject: "www.evil.example" }],
        },
      }),
    ]);
    const visible = body.slice(0, body.indexOf("<!-- merge-desk:data"));
    expect(visible).not.toMatch(/www\.[a-z]/i);
    expect(visible).not.toMatch(/@evil/);
  });

  // Review round 2, L2: a sealed block belongs to one pull request.
  it("refuses a sealed block moved from another pull request", () => {
    const body = render([entry()]);
    expect(parseRecord(body, seal, "YearningAsian/merge-desk#4")).toMatchObject({ ok: false });
    expect(parseRecord(body, seal, SCOPE)).toMatchObject({ ok: true });
  });

  it("records a retried request once", () => {
    const once = addEntry([], entry());
    expect(addEntry(once, entry())).toHaveLength(1);
    expect(addEntry(once, entry({ id: "run-3:held" }))).toHaveLength(2);
  });

  // Review round 4, M4: subsequent decisions must not erase dropped-work recovery.
  it("retains earlier decisions and dropped-work details after more than forty entries", () => {
    const dropped = entry({
      id: "original-drop",
      dropped: {
        ...entry().dropped!,
        branch: "demo/history-to-keep",
        commits: [{ sha: "f".repeat(40), subject: "Original contribution" }],
      },
    });
    let entries = [dropped];
    for (let index = 1; index <= 40; index++) {
      entries = addEntry(
        entries,
        entry({ id: `later-${index}:held`, action: "held", commit: null, dropped: null }),
      );
    }
    expect(entries).toHaveLength(41);
    expect(entries[0]).toEqual(dropped);
    const body = render(entries);
    expect(body).toContain("demo/history-to-keep");
    expect(body).toContain("Original contribution");
    const parsed = parseRecord(body, seal, SCOPE);
    expect(parsed.ok && parsed.entries[0]).toEqual(dropped);
  });
});
