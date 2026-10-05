import { describe, expect, it } from "vitest";
import { addEntry, MARKER, parseRecord, renderRecord, type RecordEntry } from "@/core/record";

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

describe("decision record", () => {
  it("renders a readable table and reads the same entries back", () => {
    const entries = [
      entry(),
      entry({ id: "run-2:held", action: "held", commit: null, dropped: null }),
    ];
    const body = renderRecord(entries, "https://desk.example/live?pr=3");
    expect(body.startsWith(MARKER)).toBe(true);
    expect(body).toContain("| When | Who | What | Option | Reason shown | Checks |");
    expect(body).toContain("Dropped `ccccccc`");
    expect(body).toContain("Ours parses strings \\| and validates them");
    expect(body).toContain("[Open in Merge Desk](https://desk.example/live?pr=3)");
    expect(parseRecord(body)).toEqual({ ok: true, entries });
  });

  it("can't be closed early by text inside it", () => {
    const body = renderRecord([entry()], null);
    // Exactly two comment closers: the marker's and the data block's.
    expect(body.match(/-->/g)).toHaveLength(2);
    const parsed = parseRecord(body);
    expect(parsed.ok && parsed.entries[0]!.dropped!.commits[0]!.subject).toBe(
      "Round cents --> with an epsilon -- nudge",
    );
  });

  it("treats a comment without the marker as not ours, and refuses an edited one", () => {
    expect(parseRecord("Looks good to me")).toEqual({ ok: true, entries: [] });
    const edited = renderRecord([entry()], null).replace('"action":"dropped"', '"action":"merged"');
    expect(parseRecord(edited)).toMatchObject({ ok: false });
    expect(parseRecord(`${MARKER}\nthe data block was deleted`)).toMatchObject({ ok: false });
  });

  it("records a retried request once", () => {
    const once = addEntry([], entry());
    expect(addEntry(once, entry())).toHaveLength(1);
    expect(addEntry(once, entry({ id: "run-3:held" }))).toHaveLength(2);
  });
});
