"use client";

import { Download, LoaderCircle } from "lucide-react";
import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { STEP_IDS, STEP_LABELS, type Analysis, type ResultEvent, type StepId } from "@/core/events";
import type { Option } from "@/core/honor";
import type { ResolvedOption, SideWork } from "@/core/options";
import { PinnedActions } from "@/ui/ActionBar";
import { createHold, HOLD_MS } from "@/ui/hold";
import { Badge } from "@/ui/primitives/badge";
import { Button } from "@/ui/primitives/button";
import { Kbd } from "@/ui/primitives/kbd";
import { Reveal } from "@/ui/primitives/reveal";
import { suggestInstead } from "@/ui/resolution";
import { Section } from "@/ui/Section";
import type { RunState, RunSteps } from "@/ui/state";
import { Steps, type StepRow } from "@/ui/Steps";
import { cn } from "@/ui/utils";

// Running the chosen option, then its verdict. A drop is asked about once,
// inline, naming what is lost; it starts only after a deliberate hold (or
// Cmd/Ctrl+Enter). Steps tick live; the result says HELD or VERIFIED in
// words. A hold offers, in order: the next-best option, steer and retry, or
// discard. Nothing on this screen pushes anything.

const MAX_PATCH_LINES = 2_000;
const UNCONFIRMED_LAND =
  "The branch update is pending or unconfirmed. Discard is unavailable; reconcile this attempt on GitHub before starting over.";
const count = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

export const modifierKey = () =>
  typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.userAgent) ? "⌘" : "Ctrl";

export function runSteps(steps: RunSteps): StepRow[] {
  return STEP_IDS.map((id) => {
    const event = steps[id];
    const done = event && event.state !== "running" && event.state !== "queued";
    return {
      id,
      label: STEP_LABELS[id],
      state: event?.state ?? "queued",
      ms: done && event.from !== undefined ? event.t - event.from : undefined,
      detail: event?.detail,
      log: event?.log,
    };
  });
}

function HoldToConfirm({ label, onConfirm }: { label: string; onConfirm: () => void }) {
  const [holding, setHolding] = useState(false);
  const confirm = useRef(onConfirm);
  useLayoutEffect(() => {
    confirm.current = onConfirm;
  });
  // Created on the first press (event time), never during render.
  const hold = useRef<ReturnType<typeof createHold> | null>(null);
  useEffect(() => () => hold.current?.cancel(), []);
  const start = () => {
    hold.current ??= createHold(() => {
      setHolding(false);
      confirm.current();
    });
    hold.current.start();
    setHolding(true);
  };
  const cancel = () => {
    hold.current?.cancel();
    setHolding(false);
  };
  return (
    <button
      type="button"
      onPointerDown={(event) => {
        if (event.button === 0) start();
      }}
      onPointerUp={cancel}
      onPointerLeave={cancel}
      onPointerCancel={cancel}
      onBlur={cancel}
      onKeyDown={(event) => {
        if ((event.key === " " || event.key === "Enter") && !event.repeat) {
          event.preventDefault();
          if (!event.ctrlKey && !event.metaKey) start();
        }
      }}
      onKeyUp={(event) => {
        if (event.key === " " || event.key === "Enter") cancel();
      }}
      onContextMenu={(event) => event.preventDefault()}
      className="relative inline-flex h-11 touch-none items-center overflow-hidden rounded-desk border border-stop bg-surface px-4 text-[13px] font-semibold text-stop-text select-none md:h-9"
    >
      <span
        aria-hidden
        className="absolute inset-y-0 left-0 bg-stop-wash"
        style={{
          width: holding ? "100%" : "0%",
          transition: holding ? `width ${HOLD_MS}ms linear` : "width 150ms ease-out",
        }}
      />
      <span className="relative">{holding ? "Keep holding…" : label}</span>
    </button>
  );
}

function DropConfirm({ drops, baseRef }: { drops: SideWork; baseRef: string }) {
  return (
    <div className="rounded-desk border border-stop/40 bg-stop-wash px-4 py-3 text-[13px] duration-200 animate-in fade-in-0">
      <p className="font-semibold text-stop-text">
        This drops {drops.side}: {count(drops.commits.length, "commit")} by{" "}
        {drops.authors.join(", ") || "nobody"}
        {drops.files.length ? ` in ${drops.files.join(", ")}` : ""}.
      </p>
      {drops.commits.length ? (
        <ul className="mt-1.5 space-y-0.5 font-mono text-[12px] text-ink">
          {drops.commits.map((commit) => (
            <li key={commit.sha} className="truncate">
              {commit.sha.slice(0, 7)} <span className="font-sans">{commit.subject}</span>
            </li>
          ))}
        </ul>
      ) : null}
      <p className="mt-1.5 text-ink">
        {drops.side === "theirs" ? (
          <>
            When this pull request merges, it will undo this change on{" "}
            <code className="font-mono text-[12px]">{baseRef}</code>.
          </>
        ) : (
          "The commits stay in the branch history and are named in the record, so the work can be recovered."
        )}
      </p>
    </div>
  );
}

function RunControls({
  option,
  baseRef,
  canRun,
  onRun,
}: {
  option: ResolvedOption;
  baseRef: string;
  canRun: boolean;
  onRun: () => void;
}) {
  const drops = option.drops;
  const mod = modifierKey();
  if (!canRun)
    return (
      <p className="text-[13px] text-muted">
        This analysis can&apos;t be used for a run (it was restored without its signature). Analyze
        again to run it.
      </p>
    );
  return (
    <div className="space-y-3">
      {drops ? <DropConfirm drops={drops} baseRef={baseRef} /> : null}
      <PinnedActions className="flex flex-wrap items-center gap-3">
        {drops ? (
          <HoldToConfirm label={`Hold to drop ${drops.side} and run`} onConfirm={onRun} />
        ) : (
          <Button variant="primary" className="h-11 px-4 md:h-9" onClick={onRun}>
            Run checks
          </Button>
        )}
        <span className="inline-flex items-center gap-1 text-[12px] text-muted in-data-pinned:hidden">
          or <Kbd>{mod}</Kbd>
          <Kbd>Enter</Kbd>
        </span>
      </PinnedActions>
      <p className="text-[12.5px] text-muted">
        Gemini writes the merge for <span className="text-ink">{option.label}</span>. It must parse,
        keep what this option keeps, and pass the tests in an isolated sandbox. Nothing is pushed.
      </p>
    </div>
  );
}

function PatchView({ patch }: { patch: string }) {
  const lines = patch.split("\n");
  const shown = lines.slice(0, MAX_PATCH_LINES);
  return (
    <pre
      // Focusable, so the keyboard can scroll it.
      tabIndex={0}
      aria-label="The merge, compared with the pull request's head"
      className="max-h-[420px] overflow-auto rounded-[6px] border border-hair bg-surface py-2 font-mono text-[12px] leading-[1.6]"
    >
      {shown.map((line, index) => (
        <span
          key={index}
          className={cn(
            "block px-3 break-all whitespace-pre-wrap",
            line.startsWith("+") && !line.startsWith("+++") && "bg-[#e6ffec]",
            line.startsWith("-") && !line.startsWith("---") && "bg-[#ffebe9]",
            line.startsWith("@@") && "text-muted",
            line.startsWith("diff ") && "font-semibold",
          )}
        >
          {line || " "}
        </span>
      ))}
      {lines.length > shown.length ? (
        <span className="block px-3 text-muted">
          {lines.length - shown.length} more lines: download the patch for all of it.
        </span>
      ) : null}
    </pre>
  );
}

function downloadPatch(patch: string, name: string) {
  const url = URL.createObjectURL(new Blob([patch], { type: "text/x-diff" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

function HeldActions({
  suggestion,
  failedOption,
  steer,
  onTry,
  onSteer,
  onDiscard,
}: {
  suggestion: ResolvedOption | null;
  failedOption: ResolvedOption;
  steer: string | null;
  onTry: (option: Option) => void;
  onSteer: (steer: string) => void;
  onDiscard: () => void;
}) {
  const [text, setText] = useState(steer ?? "");
  const id = useId();
  return (
    <div className="space-y-3 border-t border-hair pt-3">
      {suggestion ? (
        <div className="space-y-1">
          <PinnedActions>
            <Button variant="primary" size="sm" onClick={() => onTry(suggestion.kind)}>
              Try {suggestion.label}
            </Button>
          </PinnedActions>
          <p className="text-[12.5px] text-muted">
            {failedOption.label} was held, so the next best is {suggestion.label.toLowerCase()}
            {suggestion.reason ? `: ${suggestion.reason}` : "."}
          </p>
        </div>
      ) : null}
      <form
        className="space-y-1.5"
        onSubmit={(event) => {
          event.preventDefault();
          if (text.trim()) onSteer(text.trim());
        }}
      >
        <label htmlFor={id} className="block text-[12.5px] font-medium text-ink">
          Steer and retry {failedOption.label.toLowerCase()}
        </label>
        <div className="flex gap-2">
          <input
            id={id}
            value={text}
            maxLength={200}
            onChange={(event) => setText(event.target.value)}
            placeholder="One line for Gemini, e.g. keep the old call working too"
            className="h-9 min-w-0 flex-1 rounded-[6px] border border-control-border bg-surface px-2.5 text-[13px] placeholder:text-muted"
          />
          <Button type="submit" disabled={!text.trim()}>
            Retry
          </Button>
        </div>
      </form>
      <Button size="sm" variant="ghost" onClick={onDiscard}>
        Discard this attempt
      </Button>
    </div>
  );
}

function ResultCard({
  result,
  steps,
  option,
  pr,
  pushed,
  pushUnconfirmed,
  children,
}: {
  result: ResultEvent;
  steps: RunSteps;
  option: ResolvedOption;
  pr: number;
  pushed: boolean;
  pushUnconfirmed: boolean;
  children?: React.ReactNode;
}) {
  const verified = result.verdict === "VERIFIED";
  const [showPatch, setShowPatch] = useState(false);
  const failed: StepId | undefined = result.failed[0];
  const failedDetail = failed ? steps[failed]?.detail : undefined;
  const patch = result.patch;
  return (
    <div
      role="group"
      aria-label={`Result: ${result.verdict}`}
      className="overflow-hidden rounded-desk border border-hair bg-surface duration-200 animate-in fade-in-0 slide-in-from-bottom-1"
    >
      <div aria-hidden className={cn("h-[3px]", verified ? "bg-ok" : "bg-stop")} />
      <div className="space-y-2.5 px-4 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={verified ? "ok" : "stop"} className="px-2 text-[12px] leading-[20px]">
            {result.verdict}
          </Badge>
          <span className="text-[13.5px] font-semibold">{option.label}</span>
        </div>
        {verified ? (
          <p className="text-[13px]">
            Every check passed on a scratch copy: it parses, the choice is honored and the tests
            pass.
          </p>
        ) : (
          <p className="text-[13px]">
            <span className="font-semibold text-stop-text">
              Held at {failed ? STEP_LABELS[failed].toLowerCase() : "an unfinished run"}
            </span>
            {failedDetail ? `: ${failedDetail}` : "."}
          </p>
        )}
        {result.description ? (
          <p className="text-[13px] text-ink/80">
            <span className="font-medium text-ink">What the merge did: </span>
            {result.description}
          </p>
        ) : null}
        {result.summary.length ? (
          <ul className="space-y-0.5 font-mono text-[12px]">
            {result.summary.map((line) => (
              <li
                key={line}
                className={cn(
                  /, (MISSING|LEAKED)/.test(line)
                    ? "text-stop-text"
                    : /, (present|dropped as chosen)$/.test(line)
                      ? "text-ok-text"
                      : "text-ink",
                )}
              >
                {line}
              </li>
            ))}
          </ul>
        ) : null}
        {patch ? (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" aria-expanded={showPatch} onClick={() => setShowPatch((v) => !v)}>
                {showPatch ? "Hide the merge" : "Show the merge"}
                {result.changedFiles?.length
                  ? ` (${count(result.changedFiles.length, "file")})`
                  : ""}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => downloadPatch(patch, `merge-desk-pr-${pr}-${option.kind}.patch`)}
              >
                <Download aria-hidden className="size-3.5" />
                Download patch
              </Button>
            </div>
            <Reveal open={showPatch}>
              <PatchView patch={patch} />
            </Reveal>
          </>
        ) : null}
        {pushUnconfirmed ? (
          <p className="text-[12.5px] text-wait-text">{UNCONFIRMED_LAND}</p>
        ) : pushed ? null : (
          <p className="text-[12.5px] text-muted">Nothing has been pushed.</p>
        )}
        {children}
      </div>
    </div>
  );
}

export function RunSection({
  analysis,
  canRun,
  option,
  run,
  pr,
  baseRef,
  onRun,
  onCancel,
  onDiscard,
  onOption,
  landing,
  pushed = false,
  pushUnconfirmed = false,
  discardBlocked = false,
  recordNote,
}: {
  analysis: Analysis;
  canRun: boolean;
  option: Option;
  run: RunState | undefined;
  pr: number;
  baseRef: string;
  onRun: (steer?: string) => void;
  onCancel: () => void;
  onDiscard: () => void;
  onOption: (option: Option) => void;
  // Land's button and outcome, shown on a VERIFIED result.
  landing?: React.ReactNode;
  pushed?: boolean;
  pushUnconfirmed?: boolean;
  discardBlocked?: boolean;
  // Whether a hold was recorded on the pull request.
  recordNote?: React.ReactNode;
}) {
  const chosen = analysis.options.find((item) => item.kind === option) ?? analysis.options[0]!;
  return (
    <Section
      title="Run"
      aside={
        run?.status === "running" ? (
          <span className="inline-flex items-center gap-1 text-[12px] text-wait-text">
            <LoaderCircle aria-hidden className="size-3.5 animate-spin" />
            Running
          </span>
        ) : null
      }
    >
      {!run ? (
        pushUnconfirmed ? (
          <p className="text-[12.5px] text-wait-text">{UNCONFIRMED_LAND}</p>
        ) : (
          <RunControls option={chosen} baseRef={baseRef} canRun={canRun} onRun={() => onRun()} />
        )
      ) : (
        <div className="space-y-3">
          {run.steer ? (
            <p className="text-[12.5px] text-muted">
              Steered: <span className="text-ink">&quot;{run.steer}&quot;</span>
            </p>
          ) : null}
          <Steps label="Run steps" steps={runSteps(run.steps)} />
          {run.status === "running" ? (
            <Button size="sm" variant="ghost" onClick={onCancel}>
              Cancel
            </Button>
          ) : null}
          {run.status === "failed" ? (
            <div className="space-y-2">
              <div
                role="alert"
                className="rounded-desk border border-stop/30 bg-stop-wash px-4 py-3 text-[13px] text-stop-text"
              >
                {run.reason}
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  onClick={() => onRun(run.steer ?? undefined)}
                  disabled={pushUnconfirmed}
                >
                  Run again
                </Button>
                <Button size="sm" variant="ghost" onClick={onDiscard} disabled={discardBlocked}>
                  Discard
                </Button>
              </div>
            </div>
          ) : null}
          {run.status === "done" ? (
            <ResultCard
              result={run.result}
              steps={run.steps}
              option={chosen}
              pr={pr}
              pushed={pushed}
              pushUnconfirmed={pushUnconfirmed}
            >
              {run.result.verdict === "HELD" ? (
                <>
                  {recordNote}
                  {!pushUnconfirmed ? (
                    <HeldActions
                      suggestion={suggestInstead(analysis.options, chosen.kind, analysis.older)}
                      failedOption={chosen}
                      steer={run.steer}
                      onTry={onOption}
                      onSteer={(steer) => onRun(steer)}
                      onDiscard={onDiscard}
                    />
                  ) : null}
                </>
              ) : (
                <>
                  {landing}
                  {pushed ? null : (
                    <Button size="sm" variant="ghost" onClick={onDiscard} disabled={discardBlocked}>
                      Discard this run
                    </Button>
                  )}
                </>
              )}
            </ResultCard>
          ) : null}
        </div>
      )}
    </Section>
  );
}
