"use client";

import { ChevronRight, GitPullRequestArrow, RefreshCw } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { Option } from "@/core/honor";
import type { PullSummary } from "@/core/pulls";
import { Badge } from "@/ui/primitives/badge";
import { Kbd } from "@/ui/primitives/kbd";
import { SHORT_LABELS } from "@/ui/resolution";
import { cn } from "@/ui/utils";

// The left column: conflicting pull requests first, the ones that can merge
// collapsed underneath. Rows are buttons with one tab stop: J/K or Up/Down
// move focus, Enter or Space opens. Focus (outline) and the open row (filled,
// with an ink bar) look different.

export type RowState = "needs" | "running" | "analyzed" | "failed" | "checking" | "mergeable";

// Red and green are kept for HELD and VERIFIED; list states stay quiet.
const STATE: Record<RowState, { word: string; tone: "wait" | "neutral" | "outline" }> = {
  needs: { word: "Needs resolution", tone: "neutral" },
  running: { word: "Analyzing", tone: "wait" },
  analyzed: { word: "Options ready", tone: "neutral" },
  failed: { word: "Analysis failed", tone: "wait" },
  checking: { word: "Checking", tone: "wait" },
  mergeable: { word: "Can merge", tone: "outline" },
};

// Once analyzed, a row shows the option chosen on its slider, in that side's
// color (both sides' options stay neutral).
const CHOSEN_TONE: Record<Option, "ours" | "theirs" | "neutral"> = {
  keep_ours: "ours",
  combine: "neutral",
  keep_theirs: "theirs",
};

const EDITABLE =
  "input, textarea, select, [contenteditable=true], [role=dialog], [role=radiogroup], [role=slider]";

// "Updated 40 s ago", re-rendered every 10 s; it says when the list last
// heard from GitHub, so a quiet list is never mistaken for a live one.
function Updated({ at }: { at: number }) {
  const [now, setNow] = useState(at);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 10_000);
    return () => clearInterval(timer);
  }, []);
  if (!at) return null;
  const s = Math.max(0, Math.round((Math.max(now, at) - at) / 1000));
  return (
    <span className="tabular-nums">
      Updated {s < 10 ? "just now" : s < 60 ? `${s} s ago` : `${Math.round(s / 60)} min ago`}
    </span>
  );
}

export function PrList({
  pulls,
  selected,
  rowState,
  chosen,
  updatedAt,
  refreshing,
  onRefresh,
  onOpen,
}: {
  pulls: PullSummary[];
  selected: number | null;
  rowState: (pull: PullSummary) => RowState;
  chosen: (pull: PullSummary) => Option | null;
  updatedAt: number;
  refreshing: boolean;
  onRefresh: () => void;
  onOpen: (pr: number) => void;
}) {
  const needs = pulls.filter((pull) => pull.mergeable !== "mergeable");
  const canMerge = pulls.filter((pull) => pull.mergeable === "mergeable");
  const [showMergeable, setShowMergeable] = useState(false);
  const expanded = showMergeable || needs.length === 0;
  const visible = expanded ? [...needs, ...canMerge] : needs;
  const [focused, setFocused] = useState<number | null>(null);
  const root = useRef<HTMLElement>(null);
  const tabStop =
    visible.find((pull) => pull.number === focused)?.number ??
    visible.find((pull) => pull.number === selected)?.number ??
    visible[0]?.number;

  const focusRow = (number: number) => {
    setFocused(number);
    root.current?.querySelector<HTMLButtonElement>(`[data-pr="${number}"]`)?.focus();
  };
  const move = (by: number) => {
    if (!visible.length) return;
    const from = visible.findIndex((pull) => pull.number === (focused ?? selected));
    const next = Math.min(visible.length - 1, Math.max(0, from === -1 ? 0 : from + by));
    focusRow(visible[next]!.number);
  };

  // J/K anywhere on the desk moves through the list, unless someone is typing
  // or a dialog is open.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.key !== "j" && event.key !== "k") return;
      const target = event.target as HTMLElement | null;
      if (target?.closest(EDITABLE) || root.current?.contains(target)) return;
      event.preventDefault();
      move(event.key === "j" ? 1 : -1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const onRowKey = (event: React.KeyboardEvent) => {
    if (event.key === "ArrowDown" || event.key === "j") {
      event.preventDefault();
      move(1);
    } else if (event.key === "ArrowUp" || event.key === "k") {
      event.preventDefault();
      move(-1);
    }
  };

  const row = (pull: PullSummary) => {
    const look = STATE[rowState(pull)];
    const option = rowState(pull) === "analyzed" ? chosen(pull) : null;
    const isOpen = pull.number === selected;
    const files = pull.filesBothSides;
    return (
      <li key={pull.number}>
        <button
          type="button"
          data-pr={pull.number}
          tabIndex={pull.number === tabStop ? 0 : -1}
          aria-current={isOpen ? "true" : undefined}
          onKeyDown={onRowKey}
          onFocus={() => setFocused(pull.number)}
          onClick={() => onOpen(pull.number)}
          className={cn(
            "relative block w-full px-4 py-2.5 text-left transition-colors duration-150 focus-visible:-outline-offset-2",
            isOpen ? "bg-ink/[0.06]" : "hover:bg-ink/[0.03]",
          )}
        >
          {isOpen ? (
            <span aria-hidden className="absolute inset-y-2 left-0 w-0.5 rounded-r bg-ink" />
          ) : null}
          <span className="flex items-start gap-2">
            <span className="min-w-0 flex-1 text-[13px] leading-5 font-medium text-ink">
              {pull.title}
            </span>
            {option ? (
              <Badge tone={CHOSEN_TONE[option]} className="mt-px">
                <span className="sr-only">{look.word}, chosen: </span>
                {SHORT_LABELS[option]}
              </Badge>
            ) : (
              <Badge tone={look.tone} className="mt-px">
                {look.word}
              </Badge>
            )}
          </span>
          <span className="mt-1 flex min-w-0 items-center gap-2 font-mono text-[11.5px] text-muted">
            <span className="text-ink">#{pull.number}</span>
            <span className="min-w-0 truncate">
              <span className="text-ours-text">{pull.head.ref}</span>
              <span className="sr-only"> into </span>
              <span aria-hidden> → </span>
              <span className="text-theirs-text">{pull.base.ref}</span>
            </span>
          </span>
          <span className="mt-1 flex min-w-0 items-center gap-2 text-[11.5px] text-muted">
            <span className="truncate">{pull.author}</span>
            {files?.length && pull.mergeable === "conflicting" ? (
              <span className="shrink-0">
                {files.length} {files.length === 1 ? "file" : "files"} on both sides
              </span>
            ) : null}
            {pull.demo ? (
              <Badge tone="outline" className="ml-auto">
                DEMO
              </Badge>
            ) : null}
          </span>
        </button>
      </li>
    );
  };

  return (
    <nav ref={root} aria-label="Pull requests" className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto">
        {pulls.length === 0 ? (
          <div className="flex flex-col items-start gap-2 px-4 py-6 text-[13px] text-muted">
            <GitPullRequestArrow aria-hidden className="size-5" />
            No open pull requests.
          </div>
        ) : needs.length === 0 ? (
          <p className="border-b border-hair px-4 py-3 text-[13px] text-muted">
            No conflicts. Every open pull request can merge.
          </p>
        ) : (
          <>
            <h2 className="px-4 pt-3 pb-1 text-[12px] font-semibold text-muted">
              Needs resolution <span className="font-mono">{needs.length}</span>
            </h2>
            <ul>{needs.map(row)}</ul>
          </>
        )}
        {canMerge.length ? (
          <>
            {needs.length ? (
              <button
                type="button"
                aria-expanded={expanded}
                onClick={() => setShowMergeable((value) => !value)}
                className="flex w-full items-center gap-1.5 border-t border-hair px-4 py-2.5 text-left text-[12px] font-semibold text-muted hover:text-ink"
              >
                <ChevronRight
                  aria-hidden
                  className={cn(
                    "size-3.5 transition-transform duration-150",
                    expanded && "rotate-90",
                  )}
                />
                Can merge <span className="font-mono">{canMerge.length}</span>
              </button>
            ) : null}
            {expanded ? <ul>{canMerge.map(row)}</ul> : null}
          </>
        ) : null}
      </div>
      <div className="flex items-center gap-1.5 border-t border-hair px-4 py-1.5 text-[12px] text-muted">
        <Updated at={updatedAt} />
        <button
          type="button"
          aria-label="Refresh pull requests"
          onClick={onRefresh}
          disabled={refreshing}
          className="inline-flex size-8 items-center justify-center rounded-[6px] hover:bg-ink/[0.05] hover:text-ink disabled:opacity-60"
        >
          <RefreshCw aria-hidden className={cn("size-3.5", refreshing && "animate-spin")} />
        </button>
        <span className="ml-auto hidden items-center gap-1.5 md:flex">
          <Kbd>J</Kbd>
          <Kbd>K</Kbd> move
          <Kbd className="ml-2">Enter</Kbd> open
        </span>
      </div>
    </nav>
  );
}
