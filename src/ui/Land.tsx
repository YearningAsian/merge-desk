"use client";

import { useQuery } from "@tanstack/react-query";
import { ExternalLink, GitCommitHorizontal, LoaderCircle } from "lucide-react";
import { OPTION_LABELS } from "@/core/options";
import type { RecordEntry } from "@/core/record";
import { Badge } from "@/ui/primitives/badge";
import { Button } from "@/ui/primitives/button";
import { Section } from "@/ui/Section";
import type { DataSource, LandOutcome } from "@/ui/sources/types";
import { cn } from "@/ui/utils";

// Land and the decision record on the desk. Land is one deliberate click on
// a VERIFIED result; its outcome is LANDED only when GitHub confirmed the
// branch moved, UNKNOWN when it didn't say, REFUSED when nothing moved.

export type LandState = { status: "landing" } | LandOutcome;

const MERGEABLE: Record<"mergeable" | "conflicting" | "checking", string> = {
  mergeable: "GitHub says the pull request can merge now.",
  checking: "GitHub is still working out whether it can merge; the list will update.",
  conflicting:
    "GitHub still reports a conflict: the base probably moved after the run. Analyze and run again.",
};

export function LandAction({
  branch,
  base,
  state,
  onLand,
}: {
  branch: string;
  base: string;
  state: LandState | undefined;
  onLand: () => void;
}) {
  if (state && "outcome" in state) return null;
  const landing = state !== undefined;
  return (
    <div className="space-y-1 border-t border-hair pt-3">
      <Button
        variant="primary"
        className="h-11 max-w-full px-4 md:h-9"
        disabled={landing}
        onClick={onLand}
      >
        {landing ? <LoaderCircle aria-hidden className="size-4 animate-spin" /> : null}
        <span className="truncate">
          {landing ? "Landing…" : "Land: push merge commit to "}
          {landing ? null : <code className="font-mono text-[12.5px]">{branch}</code>}
        </span>
      </Button>
      <p className="text-[12.5px] text-muted">
        Does not merge into <code className="font-mono text-[12px]">{base}</code>. Your team still
        merges the pull request.
      </p>
    </div>
  );
}

export function LandResult({
  outcome,
  repo,
  pullUrl,
}: {
  outcome: LandOutcome;
  repo: string;
  pullUrl: string;
}) {
  const tone =
    outcome.outcome === "LANDED" ? "ok" : outcome.outcome === "UNKNOWN" ? "wait" : "stop";
  return (
    <div
      role="group"
      aria-label={`Land: ${outcome.outcome}`}
      className={cn(
        "space-y-2 rounded-desk border px-4 py-3 text-[13px] duration-200 animate-in fade-in-0 slide-in-from-bottom-1",
        tone === "ok" && "border-ok/40 bg-ok-wash",
        tone === "wait" && "border-wait/40 bg-wait-wash",
        tone === "stop" && "border-stop/40 bg-stop-wash",
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={tone} className="px-2 text-[12px] leading-[20px]">
          {outcome.outcome}
        </Badge>
        {outcome.outcome === "LANDED" ? (
          <a
            href={`https://github.com/${repo}/commit/${outcome.commit}`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 font-mono text-[12.5px] text-ok-text hover:underline"
          >
            <GitCommitHorizontal aria-hidden className="size-4" />
            {outcome.commit.slice(0, 7)} on {outcome.branch}
          </a>
        ) : null}
      </div>
      {outcome.outcome === "LANDED" ? (
        <>
          <p className="text-ink">{MERGEABLE[outcome.mergeable]}</p>
          <p className="text-ink/80">
            {outcome.record.ok
              ? "Recorded on the pull request."
              : `Landed, but the record wasn't updated: ${outcome.record.reason ?? "unknown reason"}`}
          </p>
          <a
            href={pullUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-ok-text hover:underline"
          >
            Open the pull request on GitHub <ExternalLink aria-hidden className="size-3.5" />
          </a>
        </>
      ) : (
        <p className={tone === "wait" ? "text-wait-text" : "text-stop-text"}>{outcome.reason}</p>
      )}
    </div>
  );
}

const ACTION_WORDS: Record<
  RecordEntry["action"],
  { word: string; tone: "ok" | "stop" | "neutral" }
> = {
  landed: { word: "Landed", tone: "ok" },
  dropped: { word: "Dropped", tone: "ok" },
  held: { word: "Held", tone: "stop" },
  discarded: { word: "Discarded", tone: "neutral" },
};

// The same record that is on the pull request, read back from GitHub.
export function RecordSection({ source, pr }: { source: DataSource; pr: number }) {
  const query = useQuery({
    queryKey: [source.mode, "record", pr],
    queryFn: ({ signal }) => source.readRecord(pr, signal),
  });
  const entries = query.data?.entries ?? [];
  const note = query.data?.note ?? null;
  return (
    <Section
      title="Record"
      defaultOpen={false}
      aside={
        <span className="text-[12px] text-muted">
          {query.isPending ? "" : `${entries.length} on the pull request`}
        </span>
      }
    >
      {note ? <p className="mb-2 text-[12.5px] text-wait-text">{note}</p> : null}
      {query.isError ? (
        <p className="text-[13px] text-muted">{query.error.message}</p>
      ) : entries.length === 0 ? (
        <p className="text-[13px] text-muted">
          Nothing recorded yet. Holds, discards, drops and landed merges appear here and in one
          Merge Desk comment on the pull request.
        </p>
      ) : (
        <ol className="divide-y divide-hair text-[13px]">
          {[...entries].reverse().map((entry) => {
            const look = ACTION_WORDS[entry.action];
            return (
              <li key={entry.id} className="space-y-0.5 py-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={look.tone}>{look.word}</Badge>
                  <span className="font-medium">{OPTION_LABELS[entry.option]}</span>
                  <span className="text-muted">
                    @{entry.who}, {new Date(entry.at).toLocaleString()}
                  </span>
                  {entry.commit ? (
                    <span className="font-mono text-[12px] text-muted">
                      {entry.commit.slice(0, 7)}
                    </span>
                  ) : null}
                </div>
                {entry.reason ? <p className="text-muted">{entry.reason}</p> : null}
                {entry.dropped ? (
                  <p className="text-[12.5px] text-muted">
                    Dropped {entry.dropped.side} ({entry.dropped.branch}):{" "}
                    {entry.dropped.commits.map((commit) => commit.sha.slice(0, 7)).join(", ")},
                    still in the branch history.
                  </p>
                ) : null}
              </li>
            );
          })}
        </ol>
      )}
    </Section>
  );
}
