"use client";

import { ChevronRight, FileCode2, LoaderCircle } from "lucide-react";
import { useEffect, useState } from "react";
import {
  ANALYZE_STEP_IDS,
  ANALYZE_STEP_LABELS,
  type Analysis as AnalysisData,
} from "@/core/events";
import type { Commit } from "@/core/options";
import { DiffView, warmDiffs } from "@/ui/DiffView";
import { Badge } from "@/ui/primitives/badge";
import { Button } from "@/ui/primitives/button";
import { CopyButton } from "@/ui/primitives/copy-button";
import { Reveal } from "@/ui/primitives/reveal";
import { Skeleton } from "@/ui/primitives/skeleton";
import type { AnalysisState, Steps as StepMap } from "@/ui/state";
import { Steps, type StepRow } from "@/ui/Steps";
import { cn } from "@/ui/utils";

// Both sides of the conflict side by side, what each meant in one line,
// with the commits, files and authors behind it one click away; then each
// conflicted file with a GitHub-style diff.

export function analysisSteps(steps: StepMap): StepRow[] {
  return ANALYZE_STEP_IDS.map((id) => {
    const event = steps[id];
    const done = event && event.state !== "running" && event.state !== "queued";
    return {
      id,
      label: ANALYZE_STEP_LABELS[id],
      state: event?.state ?? "queued",
      ms: done && event.from !== undefined ? event.t - event.from : undefined,
      detail: event?.state === "running" ? undefined : event?.detail,
      log: event?.log,
    };
  });
}

const DAY = 24 * 60 * 60 * 1000;
const age = (ms: number) =>
  ms >= DAY ? `${Math.round(ms / DAY)} days` : `${Math.round(ms / (60 * 60 * 1000))} hours`;

function SidePanel({
  side,
  branch,
  intent,
  commits,
  conflicted,
  older,
}: {
  side: "ours" | "theirs";
  branch: string;
  intent: string;
  commits: Commit[];
  conflicted: string[];
  older: number | null;
}) {
  // `mounted` holds the detail row while it opens, is open, or closes; it is
  // added at zero height first so the opening animates.
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  const toggle = () => {
    if (open) {
      setOpen(false);
      window.setTimeout(() => setMounted(false), 220);
    } else {
      setMounted(true);
      window.requestAnimationFrame(() => window.requestAnimationFrame(() => setOpen(true)));
    }
  };
  const files = [...new Set(commits.flatMap((commit) => commit.files))];
  const authors = [...new Set(commits.map((commit) => commit.author))];
  const id = `side-${side}-detail`;
  const text = side === "ours" ? "text-ours-text" : "text-theirs-text";
  // Side by side, both panels share the header, intent and summary rows
  // (CSS subgrid), so they line up; only a panel whose detail is showing
  // spans the extra detail row, so opening one never stretches the other.
  return (
    <section
      aria-label={side === "ours" ? "Ours" : "Theirs"}
      className={cn(
        "flex min-w-0 flex-col overflow-hidden rounded-desk border border-t-2 border-hair bg-surface lg:row-start-1 lg:grid lg:grid-rows-subgrid lg:gap-y-0",
        side === "ours" ? "border-t-ours lg:col-start-1" : "border-t-theirs lg:col-start-2",
        mounted ? "lg:row-span-4" : "lg:row-span-3",
      )}
    >
      <div
        className={cn(
          "flex min-w-0 items-center gap-2 px-4 py-2",
          side === "ours" ? "bg-ours-wash" : "bg-theirs-wash",
        )}
      >
        <span className={cn("font-mono text-[11px] font-semibold", text)}>{side}</span>
        <span className={cn("min-w-0 truncate font-mono text-[12px]", text)}>{branch}</span>
        {older !== null ? (
          <Badge tone="wait" className="ml-auto">
            older by {age(older)}
          </Badge>
        ) : null}
      </div>
      <p className="px-4 pt-2.5 pb-3 text-[15px] leading-snug font-medium text-ink first-letter:uppercase">
        {intent}
      </p>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={toggle}
        className="mt-auto flex items-center gap-1.5 border-t border-hair px-4 py-2 text-left text-[12px] text-muted hover:text-ink lg:mt-0"
      >
        <ChevronRight
          aria-hidden
          className={cn("size-3.5 transition-transform duration-150", open && "rotate-90")}
        />
        {commits.length} {commits.length === 1 ? "commit" : "commits"}, {files.length}{" "}
        {files.length === 1 ? "file" : "files"} by {authors.join(", ") || "nobody"}
      </button>
      {mounted ? (
        <Reveal open={open} id={id}>
          <div className="border-t border-hair px-4 py-3 text-[12px]">
            <ul className="space-y-1.5">
              {commits.map((commit) => (
                <li key={commit.sha} className="flex min-w-0 items-start gap-2">
                  <CopyButton
                    text={commit.sha}
                    label={`Copy commit ${commit.sha.slice(0, 7)}`}
                    className={cn("shrink-0 font-mono", text)}
                  >
                    {commit.sha.slice(0, 7)}
                  </CopyButton>
                  <span className="min-w-0 flex-1">
                    {commit.subject}
                    <span className="text-muted">
                      {" "}
                      by {commit.author}, {new Date(commit.date).toLocaleDateString()}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
            <ul className="mt-2.5 space-y-0.5 font-mono text-[11.5px]">
              {files.map((file) => (
                <li key={file} className={conflicted.includes(file) ? "text-ink" : "text-muted"}>
                  {file}
                  {conflicted.includes(file) ? (
                    <span className="text-wait-text"> conflicted</span>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        </Reveal>
      ) : null}
    </section>
  );
}

// Both sides changed this file: their two colors, joined.
function BothSides() {
  return (
    <span className="ml-auto inline-flex shrink-0 overflow-hidden rounded-[5px] font-mono text-[11px] leading-[18px] font-semibold">
      <span className="sr-only">changed on both sides: </span>
      <span className="bg-ours-wash px-1.5 text-ours-text">ours</span>
      <span className="bg-theirs-wash px-1.5 text-theirs-text">theirs</span>
    </span>
  );
}

// The diff is drawn out of sight first and revealed once it is complete,
// so the row never opens onto an empty box. It stays mounted after that,
// so closing and reopening is instant.
function ConflictedFile({ file }: { file: AnalysisData["files"][number] }) {
  const [wanted, setWanted] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [ready, setReady] = useState(false);
  const open = wanted && ready;
  const loading = wanted && !ready;
  return (
    <li>
      <button
        type="button"
        aria-expanded={open}
        aria-busy={loading}
        onClick={() => {
          setMounted(true);
          setWanted((value) => !value);
        }}
        className="flex w-full min-w-0 items-center gap-2 py-2 text-left hover:text-ink"
      >
        <ChevronRight
          aria-hidden
          className={cn(
            "size-3.5 shrink-0 text-muted transition-transform duration-200",
            (open || loading) && "rotate-90",
          )}
        />
        <FileCode2 aria-hidden className="size-4 shrink-0 text-muted" />
        <span className="min-w-0 truncate font-mono text-[12.5px]">{file.path}</span>
        {loading ? (
          <span className="inline-flex shrink-0 items-center gap-1 text-[12px] text-muted duration-150 animate-in fade-in-0">
            <LoaderCircle aria-hidden className="size-3.5 animate-spin" />
            Loading diff
          </span>
        ) : null}
        <BothSides />
      </button>
      <Reveal open={open}>
        {mounted ? (
          <div className="pb-3">
            <DiffView
              path={file.path}
              base={file.base}
              ours={file.ours}
              theirs={file.theirs}
              onReady={() => setReady(true)}
            />
          </div>
        ) : null}
      </Reveal>
    </li>
  );
}

export function AnalysisView({
  state,
  branches,
  onRetry,
}: {
  state: AnalysisState | undefined;
  branches: { ours: string; theirs: string };
  onRetry: () => void;
}) {
  if (!state || state.status === "running") {
    return (
      <div className="space-y-4">
        <Steps label="Analysis steps" steps={analysisSteps(state?.steps ?? {})} />
        <div className="grid gap-3 lg:grid-cols-2" aria-hidden>
          {[0, 1].map((key) => (
            <div key={key} className="space-y-2.5 rounded-desk border border-hair bg-surface p-4">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-5 w-4/5" />
              <Skeleton className="h-4 w-2/5" />
            </div>
          ))}
        </div>
      </div>
    );
  }
  if (state.status === "failed") {
    return (
      <div className="space-y-3">
        <Steps label="Analysis steps" steps={analysisSteps(state.steps)} />
        <div
          role="alert"
          className="rounded-desk border border-stop/30 bg-stop-wash px-4 py-3 text-[13px] text-stop-text"
        >
          {state.reason} Nothing was changed.
        </div>
        <Button variant="primary" onClick={onRetry}>
          Analyze again
        </Button>
      </div>
    );
  }

  return <Finished analysis={state.analysis} branches={branches} />;
}

function Finished({
  analysis,
  branches,
}: {
  analysis: AnalysisData;
  branches: { ours: string; theirs: string };
}) {
  const conflicted = analysis.files.map((file) => file.path);
  const paths = JSON.stringify(conflicted);
  // Warm the diff renderer while the reader takes in the intents.
  useEffect(() => {
    const files = JSON.parse(paths) as string[];
    const idle = window.requestIdleCallback ?? ((run: () => void) => window.setTimeout(run, 200));
    const cancel = window.cancelIdleCallback ?? window.clearTimeout;
    const handle = idle(() => warmDiffs(files));
    return () => cancel(handle);
  }, [paths]);
  return (
    <div className="space-y-4 duration-200 animate-in fade-in-0">
      <div className="grid gap-3 lg:grid-cols-2 lg:gap-y-0">
        <SidePanel
          side="ours"
          branch={branches.ours}
          intent={analysis.intents.ours}
          commits={analysis.commits.ours}
          conflicted={conflicted}
          older={analysis.older?.side === "ours" ? analysis.older.byMs : null}
        />
        <SidePanel
          side="theirs"
          branch={branches.theirs}
          intent={analysis.intents.theirs}
          commits={analysis.commits.theirs}
          conflicted={conflicted}
          older={analysis.older?.side === "theirs" ? analysis.older.byMs : null}
        />
      </div>
      <div>
        <h3 className="text-[12px] font-semibold text-muted">
          Conflicted {conflicted.length === 1 ? "file" : "files"}{" "}
          <span className="font-mono">{conflicted.length}</span>
        </h3>
        <ul className="divide-y divide-hair">
          {analysis.files.map((file) => (
            <ConflictedFile key={file.path} file={file} />
          ))}
        </ul>
      </div>
    </div>
  );
}
