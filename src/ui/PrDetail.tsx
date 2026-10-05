"use client";

import { ExternalLink, RotateCw } from "lucide-react";
import type { Option } from "@/core/honor";
import { modelLabel } from "@/core/models";
import type { PullSummary } from "@/core/pulls";
import { AnalysisView } from "@/ui/Analysis";
import { DevDetails } from "@/ui/DevDetails";
import { Options } from "@/ui/Options";
import { Section } from "@/ui/Section";
import { Badge } from "@/ui/primitives/badge";
import { Button } from "@/ui/primitives/button";
import { Kbd } from "@/ui/primitives/kbd";
import type { AnalysisState } from "@/ui/state";

// One pull request, top to bottom: header, Analysis, Options, then the run
// (once one exists) and Details. Sections fold smoothly; Details starts
// folded. Pull requests with nothing to resolve say so plainly instead of
// showing empty sections.

function Notice({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-desk border border-hair bg-surface px-4 py-3 text-[13px] duration-150 animate-in fade-in-0">
      <span className="min-w-0 flex-1">{children}</span>
      {action}
    </div>
  );
}

export function PrDetail({
  pull,
  analysis,
  stale,
  titleId,
  model,
  detailsOpen,
  onDetailsOpen,
  onAnalyze,
  onOption,
  onRefresh,
  run,
  runLog,
  landed,
  record,
}: {
  pull: PullSummary;
  analysis: AnalysisState | undefined;
  stale: boolean;
  titleId: string;
  // The model Settings asks for (undefined: the server's default).
  model: string | undefined;
  detailsOpen: boolean;
  onDetailsOpen: (open: boolean) => void;
  onAnalyze: () => void;
  onOption: (option: Option) => void;
  onRefresh: () => void;
  run?: React.ReactNode;
  runLog?: string | null;
  // Shown on top while the branch head is the commit Merge Desk landed.
  landed?: React.ReactNode;
  record?: React.ReactNode;
}) {
  const branches = { ours: pull.head.ref, theirs: pull.base.ref };
  const done = analysis?.status === "done" ? analysis : null;
  const otherModel = done && model && model !== done.analysis.model ? model : null;
  return (
    <article
      aria-labelledby={titleId}
      className="w-full max-w-[960px] px-4 pt-5 pb-10 md:px-8 lg:px-10"
    >
      <header className="pb-4">
        <h2 id={titleId} className="text-[17px] leading-snug font-semibold tracking-tight">
          {pull.title}
        </h2>
        <div className="mt-2 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1.5 text-[12.5px] text-muted">
          <span className="font-mono text-ink">#{pull.number}</span>
          <span>by {pull.author}</span>
          <span className="inline-flex min-w-0 items-center gap-1.5">
            <Badge tone="ours">ours</Badge>
            <span className="truncate font-mono text-ours-text">{pull.head.ref}</span>
          </span>
          <span>into</span>
          <span className="inline-flex min-w-0 items-center gap-1.5">
            <Badge tone="theirs">theirs</Badge>
            <span className="truncate font-mono text-theirs-text">{pull.base.ref}</span>
          </span>
          {pull.demo ? <Badge tone="outline">DEMO</Badge> : null}
          <a
            href={pull.url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 rounded-[4px] hover:text-ink md:ml-auto"
          >
            Open on GitHub <ExternalLink aria-hidden className="size-3.5" />
          </a>
        </div>
      </header>

      {landed ? <div className="mb-4">{landed}</div> : null}
      {pull.fork ? (
        <Notice>Pull requests from forks aren&apos;t supported yet. Nothing was run.</Notice>
      ) : pull.mergeable === "mergeable" ? (
        <Notice>Nothing needs resolving. This pull request can merge as it is.</Notice>
      ) : pull.mergeable === "checking" ? (
        <Notice
          action={
            <Button size="sm" onClick={onRefresh}>
              Check again
            </Button>
          }
        >
          GitHub is still working out whether this pull request can merge.
        </Notice>
      ) : !analysis ? (
        <Notice
          action={
            <Button size="sm" variant="primary" onClick={onAnalyze}>
              {stale ? "Analyze again" : "Analyze"}
              <Kbd className="border-white/30 bg-transparent text-white/80">A</Kbd>
            </Button>
          }
        >
          {stale
            ? "This pull request changed since its last analysis."
            : "Not analyzed yet. Nothing is sent to Gemini until you ask."}
        </Notice>
      ) : (
        <>
          <Section
            title="Analysis"
            aside={
              done ? (
                <span className="ml-auto flex min-w-0 items-center gap-1 text-[12px] text-muted">
                  <span className="truncate" title={done.analysis.model}>
                    {modelLabel(done.analysis.model)}
                  </span>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={onAnalyze}
                    className="text-muted hover:text-ink"
                  >
                    <RotateCw aria-hidden className="size-3.5" />
                    {otherModel ? `Analyze with ${modelLabel(otherModel)}` : "Analyze again"}
                  </Button>
                </span>
              ) : null
            }
          >
            <AnalysisView state={analysis} branches={branches} onRetry={onAnalyze} />
          </Section>
          {done ? (
            <>
              <Section title="Options">
                <Options options={done.analysis.options} value={done.option} onChange={onOption} />
              </Section>
              {run}
              <Section title="Details" open={detailsOpen} onOpenChange={onDetailsOpen}>
                <DevDetails analysis={done.analysis} steps={done.steps} runLog={runLog} />
              </Section>
            </>
          ) : null}
        </>
      )}
      {record}
    </article>
  );
}
