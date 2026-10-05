"use client";

import { ChevronRight, ExternalLink } from "lucide-react";
import { useId, useState } from "react";
import type { Option } from "@/core/honor";
import type { PullSummary } from "@/core/pulls";
import { AnalysisView } from "@/ui/Analysis";
import { DevDetails } from "@/ui/DevDetails";
import { Options } from "@/ui/Options";
import { Badge } from "@/ui/primitives/badge";
import { Button } from "@/ui/primitives/button";
import type { AnalysisState } from "@/ui/state";
import { cn } from "@/ui/utils";

// One pull request, top to bottom: header, Analysis, Options, then Details
// for developers. Sections can be folded; Details starts folded. Pull
// requests with nothing to resolve say so plainly instead of empty sections.

function Section({
  title,
  aside,
  defaultOpen = true,
  children,
}: {
  title: string;
  aside?: React.ReactNode;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const id = useId();
  return (
    <section className="border-t border-hair pt-3">
      <h3 className="flex items-center gap-2">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={id}
          onClick={() => setOpen((value) => !value)}
          className="-ml-1 inline-flex items-center gap-1 rounded-[6px] px-1 py-0.5 text-[13px] font-semibold text-ink hover:bg-ink/[0.05]"
        >
          <ChevronRight
            aria-hidden
            className={cn(
              "size-4 text-muted transition-transform duration-150",
              open && "rotate-90",
            )}
          />
          {title}
        </button>
        {aside}
      </h3>
      <div id={id} hidden={!open} className="pt-3 pb-5">
        {children}
      </div>
    </section>
  );
}

function Notice({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-desk border border-hair bg-surface px-4 py-3 text-[13px]">
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
  onAnalyze,
  onOption,
  onRefresh,
}: {
  pull: PullSummary;
  analysis: AnalysisState | undefined;
  stale: boolean;
  titleId: string;
  onAnalyze: () => void;
  onOption: (option: Option) => void;
  onRefresh: () => void;
}) {
  const branches = { ours: pull.head.ref, theirs: pull.base.ref };
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
            <span className="truncate font-mono text-ink">{pull.head.ref}</span>
          </span>
          <span>into</span>
          <span className="inline-flex min-w-0 items-center gap-1.5">
            <Badge tone="theirs">theirs</Badge>
            <span className="truncate font-mono text-ink">{pull.base.ref}</span>
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
      ) : (
        <>
          {stale ? (
            <div className="mb-4">
              <Notice
                action={
                  <Button size="sm" variant="primary" onClick={onAnalyze}>
                    Analyze again
                  </Button>
                }
              >
                This pull request changed since its last analysis.
              </Notice>
            </div>
          ) : null}
          <Section
            title="Analysis"
            aside={
              analysis?.status === "done" ? (
                <span className="text-[12px] text-muted">{analysis.analysis.model}</span>
              ) : null
            }
          >
            {stale && !analysis ? (
              <p className="text-[13px] text-muted">Run a fresh analysis for the new commits.</p>
            ) : (
              <AnalysisView state={analysis} branches={branches} onRetry={onAnalyze} />
            )}
          </Section>
          {analysis?.status === "done" ? (
            <>
              <Section title="Options">
                <Options
                  options={analysis.analysis.options}
                  value={analysis.option}
                  onChange={onOption}
                />
              </Section>
              <Section
                title="Details"
                defaultOpen={false}
                aside={<span className="text-[12px] text-muted">for developers</span>}
              >
                <DevDetails analysis={analysis.analysis} steps={analysis.steps} />
              </Section>
            </>
          ) : null}
        </>
      )}
    </article>
  );
}
