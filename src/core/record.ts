import { z } from "zod";
import { OptionKind, OPTION_LABELS } from "./options";
import { RunCheck } from "./run";

// The decision record: one Merge Desk comment per pull request, found by its
// marker and updated in place. A readable table for people, plus the same
// entries as JSON in a hidden block for Merge Desk to read back. Pure; the
// GitHub calls live in server/github/comment.ts.

export const MARKER = "<!-- merge-desk:record -->";
const DATA_OPEN = "<!-- merge-desk:data";
const DATA_CLOSE = "-->";
const MAX_ENTRIES = 40;

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

export type ParsedRecord = { ok: true; entries: RecordEntry[] } | { ok: false; reason: string };

// Reads the entries back from a comment body. A body without the marker is
// simply not ours; one with the marker whose data can't be read is refused,
// so an edited comment is never silently overwritten and its history lost.
export function parseRecord(body: string): ParsedRecord {
  if (!body.includes(MARKER)) return { ok: true, entries: [] };
  const start = body.indexOf(DATA_OPEN);
  const end = start === -1 ? -1 : body.indexOf(DATA_CLOSE, start + DATA_OPEN.length);
  if (start === -1 || end === -1)
    return { ok: false, reason: "The Merge Desk comment was edited and its data is missing." };
  try {
    const data = JSON.parse(body.slice(start + DATA_OPEN.length, end));
    return { ok: true, entries: z.array(RecordEntry).parse(data) };
  } catch {
    return { ok: false, reason: "The Merge Desk comment was edited and its data can't be read." };
  }
}

// Adds an entry unless one with the same id is already there (a retried
// request records once), keeping the newest entries.
export function addEntry(entries: RecordEntry[], entry: RecordEntry): RecordEntry[] {
  if (entries.some((existing) => existing.id === entry.id)) return entries;
  return [...entries, entry].slice(-MAX_ENTRIES);
}

const WORDS: Record<RecordAction, string> = {
  landed: "Landed",
  dropped: "Dropped",
  held: "Held",
  discarded: "Discarded",
};

// Table cells: no pipes or line breaks, nothing that could close a comment.
const cell = (text: string) =>
  text
    .replace(/\|/g, "\\|")
    .replace(/[\r\n]+/g, " ")
    .replace(/<!--|-->/g, "")
    .trim();

const checksText = (checks: RecordEntry["checks"]) =>
  checks.length
    ? checks.map((check) => `${check.step} ${check.state.replace("_", " ")}`).join(", ")
    : "none";

export function renderRecord(entries: RecordEntry[], deskUrl: string | null): string {
  const rows = entries
    .map((entry) =>
      [
        cell(entry.at.replace("T", " ").replace(/\.\d+Z$/, " UTC")),
        `@${cell(entry.who)}`,
        WORDS[entry.action] + (entry.commit ? ` \`${entry.commit.slice(0, 7)}\`` : ""),
        cell(OPTION_LABELS[entry.option]),
        cell(entry.reason ?? ""),
        cell(checksText(entry.checks)),
      ].join(" | "),
    )
    .map((row) => `| ${row} |`);
  const drops = entries
    .filter((entry) => entry.dropped)
    .map((entry) => {
      const dropped = entry.dropped!;
      const commits = dropped.commits
        .map((commit) => `\`${commit.sha.slice(0, 7)}\` ${cell(commit.subject)}`)
        .join("; ");
      return `- ${WORDS[entry.action]} by @${cell(entry.who)}: ${dropped.side} (\`${cell(dropped.branch)}\`) by ${cell(dropped.authors.join(", ") || "nobody")} in ${cell(dropped.files.join(", "))}: ${commits || "no commits"}. The commits stay in the branch history.`;
    });
  // JSON can't close the hidden block: "--" is written as an escape.
  const data = JSON.stringify(entries).replace(/--/g, "-\\u002d");
  return [
    MARKER,
    "### Merge Desk record",
    "",
    "Every decision Merge Desk made on this pull request. Merge Desk writes only to this pull request's branch and never deletes commits.",
    "",
    "| When | Who | What | Option | Reason shown | Checks |",
    "|---|---|---|---|---|---|",
    ...rows,
    ...(drops.length ? ["", "**Dropped work (recoverable)**", "", ...drops] : []),
    ...(deskUrl ? ["", `[Open in Merge Desk](${deskUrl})`] : []),
    "",
    `${DATA_OPEN}\n${data}\n${DATA_CLOSE}`,
  ].join("\n");
}
