"use client";

import { useQuery } from "@tanstack/react-query";
import { ExternalLink, GitCommitHorizontal, LoaderCircle } from "lucide-react";
import { OPTION_LABELS } from "@/core/options";
import type { RecordEntry } from "@/core/record";
import type { PullSummary } from "@/core/pulls";
import type { Option } from "@/core/honor";
import { PinnedActions } from "@/ui/ActionBar";
import { Badge } from "@/ui/primitives/badge";
import { Button } from "@/ui/primitives/button";
import { Section } from "@/ui/Section";
import type { DataSource, LandOutcome } from "@/ui/sources/types";
import { cn } from "@/ui/utils";

// Land and the decision record on the desk. Land is one deliberate click on
// a VERIFIED result; its outcome is LANDED only when GitHub confirmed the
// branch moved, UNKNOWN when it didn't say, REFUSED when nothing moved.

export type LandState = { status: "landing" } | (LandOutcome & { context: LandContext });

// A dispatched or unconfirmed attempt cannot be forgotten locally. Only a
// definite refusal permits starting over or another deliberate Land click.
export const blocksStartingOver = (state: LandState | undefined) =>
  Boolean(state && (!("outcome" in state) || state.outcome !== "REFUSED"));

export type LandContext = {
  runKey: string;
  option: Option;
  head: string;
  base: string;
  at: string;
};

export function LandAction({
  branch,
  base,
  state,
  blocked = false,
  onLand,
}: {
  branch: string;
  base: string;
  state: LandState | undefined;
  blocked?: boolean;
  onLand: () => void;
}) {
  if (blocked && (!state || "outcome" in state)) return null;
  if (state && "outcome" in state && state.outcome !== "REFUSED") return null;
  const landing = state !== undefined && "status" in state;
  const retry = state !== undefined && "outcome" in state && state.outcome === "REFUSED";
  return (
    <div className="space-y-1 border-t border-hair pt-3">
      <PinnedActions className="space-y-1">
        <Button
          variant="primary"
          className="h-11 max-w-full px-4 md:h-9"
          disabled={landing}
          onClick={onLand}
        >
          {landing ? <LoaderCircle aria-hidden className="size-4 animate-spin" /> : null}
          <span className="truncate">
            {landing
              ? "Landing…"
              : retry
                ? "Try Land again: push merge commit to "
                : "Land: push merge commit to "}
            {landing ? null : <code className="font-mono text-[12.5px]">{branch}</code>}
          </span>
        </Button>
        <p className="text-[12.5px] text-muted">
          Does not merge into <code className="font-mono text-[12px]">{base}</code>. Your team still
          merges the pull request.
        </p>
      </PinnedActions>
      {retry ? (
        <p className="text-[12.5px] text-muted">
          The previous attempt was refused before a branch update. Another click rechecks the same
          signed run and every Land guard. It is never retried automatically.
        </p>
      ) : null}
    </div>
  );
}

// Demo mode in place of Land: the same words, and what live mode would do.
// Nothing is pushed, so there is no button to press.
export function DemoLand({ branch, base }: { branch: string; base: string }) {
  return (
    <div className="space-y-1 border-t border-hair pt-3 text-[12.5px]">
      <p className="font-medium text-ink">
        Land: push merge commit to <code className="font-mono text-[12px]">{branch}</code>
      </p>
      <p className="text-muted">
        Live mode only. After rechecking that neither{" "}
        <code className="font-mono text-[12px]">{branch}</code> nor{" "}
        <code className="font-mono text-[12px]">{base}</code> moved since this run, Land adds this
        merge commit to the pull request&apos;s own branch and records the decision in one comment
        on the pull request. It never merges into{" "}
        <code className="font-mono text-[12px]">{base}</code>. Demo mode writes nothing.
      </p>
    </div>
  );
}

export function LandResult({
  outcome,
  repo,
  pullUrl,
  current,
  context,
}: {
  outcome: LandOutcome;
  repo: string;
  pullUrl: string;
  current: PullSummary;
  context: LandContext;
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
        <span className="font-medium">Historical Land result</span>
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
      <p className="text-[12px] text-muted">
        Attempt {new Date(context.at).toLocaleString()}: checked head{" "}
        <code>{context.head.slice(0, 7)}</code>, base <code>{context.base.slice(0, 7)}</code>. Run{" "}
        option: {OPTION_LABELS[context.option]}.
      </p>
      {outcome.outcome === "LANDED" ? (
        <>
          <p className="text-ink">
            GitHub confirmed this commit was pushed to the PR branch. This result does not describe
            current merge readiness.
          </p>
          {current.head.sha === outcome.commit ? (
            <p>The current snapshot has the Land commit as its head.</p>
          ) : current.head.sha === context.head ? (
            <p>
              The current snapshot has not confirmed the Land commit as its head. Refresh to
              reconcile.
            </p>
          ) : (
            <p>The current head differs from the Land commit and the checked head.</p>
          )}
          {current.base.sha !== context.base ? (
            <p>The base differs from the checked base.</p>
          ) : null}
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
