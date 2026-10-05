import { z } from "zod";
import { OptionKind, OPTION_LABELS } from "./options";
import { RunCheck } from "./run";

// The decision record: one Merge Desk comment per pull request, found by its
// marker and updated in place. A readable table for people, plus the same
// entries as JSON in a hidden block, sealed with a key only the server has,
// so an edit made outside Merge Desk is noticed rather than trusted. Pure;
// the GitHub calls live in server/github/comment.ts.

export const MARKER = "<!-- merge-desk:record -->";
const DATA_OPEN = "<!-- merge-desk:data";
const DATA_CLOSE = "-->";

export const RecordAction = z.enum(["landed", "dropped", "held", "discarded"]);
export type RecordAction = z.infer<typeof RecordAction>;

export const RecordEntry = z.object({
  id: z.string().min(1).max(100),
  action: RecordAction,
  who: z.string().max(100),
  at: z.string().max(40),
  option: OptionKind,
  reason: z.string().max(300).nullable(),
  checks: z.array(RunCheck.pick({ step: true, state: true })).max(20),
  head: z.string().max(40),
  base: z.string().max(40),
  commit: z.string().max(40).nullable(), // the landed merge commit
  dropped: z
    .object({
      side: z.enum(["ours", "theirs"]),
      branch: z.string().max(255),
      commits: z.array(z.object({ sha: z.string().max(40), subject: z.string().max(300) })).max(50),
      files: z.array(z.string().max(500)).max(50),
      authors: z.array(z.string().max(200)).max(50),
    })
    .nullable(),
});
export type RecordEntry = z.infer<typeof RecordEntry>;
const Entries = z.array(RecordEntry);

// The server's keyed seal over the visible record and entries (server/sign.ts).
export type RecordSeal = {
  seal: (text: string) => string;
  check: (text: string, mac: string) => boolean;
};

// Version 1 sealed entries only, so its visible table could have been edited.
// It is deliberately refused rather than migrated from an untrusted display.
const Data = z.object({ v: z.literal(2), entries: z.unknown(), mac: z.string().max(200) });

// Bind the exact text people see, the repository and pull request, and entries
// in schema key order. Hidden JSON key order may change without changing data;
// a visible edit or moving the sealed block to another PR must fail the check.
const canonical = (scope: string, entries: RecordEntry[], prefix: string) =>
  JSON.stringify({ v: 2, scope, prefix, entries: Entries.parse(entries) });

export type ParsedRecord = { ok: true; entries: RecordEntry[] } | { ok: false; reason: string };

// Reads the entries back from a comment body. A body without the marker is
// simply not ours. One with the marker is accepted only with exactly one
// data block, at the very end, whose seal checks out; anything else was
// changed outside Merge Desk and is refused, never trusted or overwritten.
export function parseRecord(body: string, seal: RecordSeal, scope: string): ParsedRecord {
  if (!body.includes(MARKER)) return { ok: true, entries: [] };
  const edited = {
    ok: false as const,
    reason: "The Merge Desk comment was changed outside Merge Desk.",
  };
  const start = body.indexOf(DATA_OPEN);
  if (start === -1 || start !== body.lastIndexOf(DATA_OPEN)) return edited;
  const end = body.indexOf(DATA_CLOSE, start + DATA_OPEN.length);
  if (end === -1 || body.slice(end + DATA_CLOSE.length).trim() !== "") return edited;
  try {
    const data = Data.parse(JSON.parse(body.slice(start + DATA_OPEN.length, end)));
    const entries = Entries.parse(data.entries);
    return seal.check(canonical(scope, entries, body.slice(0, start)), data.mac)
      ? { ok: true, entries }
      : edited;
  } catch {
    return edited;
  }
}

// Adds an entry unless one with the same id is already there (a retried
// request records once). History is never silently removed to fit a comment;
// the GitHub writer refuses an oversized record before making any update.
export function addEntry(entries: RecordEntry[], entry: RecordEntry): RecordEntry[] {
  if (entries.some((existing) => existing.id === entry.id)) return entries;
  return [...entries, entry];
}

const WORDS: Record<RecordAction, string> = {
  landed: "Landed",
  dropped: "Dropped",
  held: "Held",
  discarded: "Discarded",
};

// Text from commits, branches, authors and the model, made inert for a
// GitHub comment: every character that could start markup, a mention, a
// link (including bare www. and e-mail autolinks), an issue reference, a
// code span or a comment is written as an HTML entity (shown as itself), and
// line breaks become spaces.
const ENTITIES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  "@": "&#64;",
  "[": "&#91;",
  "]": "&#93;",
  "(": "&#40;",
  ")": "&#41;",
  "\\": "&#92;",
  "`": "&#96;",
  "|": "&#124;",
  "#": "&#35;",
  ":": "&#58;",
  "!": "&#33;",
  "*": "&#42;",
  _: "&#95;",
  "~": "&#126;",
  ".": "&#46;",
};
const cell = (text: string) =>
  text
    .replace(/[\r\n\t]+/g, " ")
    .trim()
    .replace(/[&<>@[\]()\\`|#:!*_~.]/g, (char) => ENTITIES[char]!);

const checksText = (checks: RecordEntry["checks"]) =>
  checks.length
    ? checks.map((check) => `${check.step} ${check.state.replace("_", " ")}`).join(", ")
    : "none";

const sha7 = (sha: string) => (/^[0-9a-f]{7,40}$/.test(sha) ? `\`${sha.slice(0, 7)}\`` : "");

export function renderRecord(
  entries: RecordEntry[],
  // `scope` is "owner/repo#pr", the pull request this record belongs to.
  options: { deskUrl: string | null; seal: RecordSeal; scope: string; note?: string | null },
): string {
  const normalized = Entries.parse(entries);
  const rows = normalized
    .map((entry) =>
      [
        cell(entry.at.replace("T", " ").replace(/\.\d+Z$/, " UTC")),
        cell(entry.who),
        WORDS[entry.action] + (entry.commit ? ` ${sha7(entry.commit)}` : ""),
        cell(OPTION_LABELS[entry.option]),
        cell(entry.reason ?? ""),
        cell(checksText(entry.checks)),
      ].join(" | "),
    )
    .map((row) => `| ${row} |`);
  const drops = normalized
    .filter((entry) => entry.dropped)
    .map((entry) => {
      const dropped = entry.dropped!;
      const commits = dropped.commits
        .map((commit) => `${sha7(commit.sha)} ${cell(commit.subject)}`)
        .join("; ");
      return `- ${WORDS[entry.action]} by ${cell(entry.who)}: ${dropped.side} (${cell(dropped.branch)}) by ${cell(dropped.authors.join(", ") || "nobody")} in ${cell(dropped.files.join(", "))}: ${commits || "no commits"}. The commits stay in the branch history.`;
    });
  const prefix =
    [
      MARKER,
      "### Merge Desk record",
      "",
      "Every decision Merge Desk made on this pull request. Merge Desk writes only to this pull request's branch and never deletes commits.",
      ...(options.note ? ["", `> ${options.note}`] : []),
      "",
      "| When | Who | What | Option | Reason shown | Checks |",
      "|---|---|---|---|---|---|",
      ...rows,
      ...(drops.length ? ["", "**Dropped work (recoverable)**", "", ...drops] : []),
      ...(options.deskUrl ? ["", `[Open in Merge Desk](${options.deskUrl})`] : []),
      "",
    ].join("\n") + "\n";
  const text = canonical(options.scope, normalized, prefix);
  // JSON can't close the hidden block: "--" is written as an escape.
  const data = JSON.stringify({ v: 2, entries: normalized, mac: options.seal.seal(text) }).replace(
    /--/g,
    "-\\u002d",
  );
  return `${prefix}${DATA_OPEN}\n${data}\n${DATA_CLOSE}`;
}
