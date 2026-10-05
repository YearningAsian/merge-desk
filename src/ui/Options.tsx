"use client";

import { Slider } from "radix-ui";
import { useEffect } from "react";
import type { Option } from "@/core/honor";
import type { ResolvedOption, SideWork } from "@/core/options";
import { Badge } from "@/ui/primitives/badge";
import { Button } from "@/ui/primitives/button";
import { Kbd } from "@/ui/primitives/kbd";
import { SCALE, SHORT_LABELS, snap } from "@/ui/resolution";
import { cn } from "@/ui/utils";

// Two or three ways to resolve the conflict on one slider: all ours on the
// left (blue), both in the middle, all theirs on the right (orange). It starts
// on the Recommended option. Under it, the chosen option: what the code will
// do, why someone would pick it, and what it keeps and drops (commits, files,
// authors), worked out from git rather than by the model. Choosing runs
// nothing by itself.

const TONE: Record<Option, { text: string; fill: string }> = {
  keep_ours: { text: "text-ours-text", fill: "bg-ours" },
  combine: { text: "text-ink", fill: "bg-ink" },
  keep_theirs: { text: "text-theirs-text", fill: "bg-theirs" },
};

const count = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

function Work({ verb, work }: { verb: "Keeps" | "Drops"; work: SideWork }) {
  const drop = verb === "Drops";
  const shaColor = work.side === "ours" ? "text-ours-text" : "text-theirs-text";
  return (
    <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1 text-[12.5px]">
      <span className={cn("w-11 shrink-0 font-semibold", drop ? "text-stop-text" : "text-ink")}>
        {verb}
      </span>
      <Badge tone={work.side}>{work.side}</Badge>
      <span className="min-w-0 break-words text-muted">
        {count(work.commits.length, "commit")} by {work.authors.join(", ") || "nobody"}
        {drop && work.files.length ? `, in ${work.files.join(", ")}` : ""}
      </span>
      {drop && work.commits.length ? (
        <ul className="w-full space-y-0.5 pl-[52px] font-mono text-[11.5px] text-muted">
          {work.commits.map((commit) => (
            <li key={commit.sha} className="truncate">
              <span className={shaColor}>{commit.sha.slice(0, 7)}</span>{" "}
              <span className="font-sans">{commit.subject}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

// The chosen option's colors as a bar: one side's color, or both halves.
function KindBar({ kind }: { kind: Option }) {
  return (
    <div aria-hidden className="flex h-[3px]">
      {kind === "combine" ? (
        <>
          <span className="flex-1 bg-ours" />
          <span className="flex-1 bg-theirs" />
        </>
      ) : (
        <span className={cn("flex-1", TONE[kind].fill)} />
      )}
    </div>
  );
}

function ResolutionSlider({
  options,
  value,
  onChange,
}: {
  options: ResolvedOption[];
  value: Option;
  onChange: (option: Option) => void;
}) {
  const offered = options.map((option) => option.kind);
  const index = SCALE.indexOf(value);
  const recommended = options.find((option) => option.recommended)?.kind;
  const chosen = options.find((option) => option.kind === value);

  // 1, 2 and 3 pick a position from anywhere on the desk, unless typing.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const at = ["1", "2", "3"].indexOf(event.key);
      if (at === -1) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable=true]")) return;
      const kind = SCALE[at]!;
      if (!offered.includes(kind)) return;
      event.preventDefault();
      onChange(kind);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <div>
      <Slider.Root
        min={0}
        max={SCALE.length - 1}
        step={1}
        value={[index]}
        onValueChange={([next]) => {
          const to = snap(next ?? index, index, offered);
          if (to !== index) onChange(SCALE[to]!);
        }}
        className="relative flex h-10 w-full cursor-pointer touch-none items-center select-none"
      >
        <Slider.Track className="relative flex h-1.5 w-full overflow-hidden rounded-full">
          <span className="flex-1 bg-ours" />
          <span className="flex-1 bg-theirs" />
        </Slider.Track>
        {/* Stops line up with the thumb's centre (inset by half its width). */}
        <span aria-hidden className="pointer-events-none absolute inset-x-[11px] top-1/2">
          {SCALE.map((kind, i) => (
            <span
              key={kind}
              className={cn(
                "absolute size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-surface",
                offered.includes(kind) ? "bg-ink" : "bg-hair",
              )}
              style={{ left: `${(i / (SCALE.length - 1)) * 100}%` }}
            />
          ))}
        </span>
        <Slider.Thumb
          aria-label="Resolution"
          aria-valuetext={
            chosen ? `${chosen.label}${chosen.recommended ? ", recommended" : ""}` : undefined
          }
          className={cn(
            "relative block size-[22px] cursor-grab rounded-full border-[3px] border-surface shadow-[0_0_0_1px_var(--color-ink),0_1px_3px_rgb(0_0_0/0.2)] transition-colors duration-150 before:absolute before:-inset-[11px] before:content-[''] active:cursor-grabbing",
            TONE[value].fill,
          )}
        />
      </Slider.Root>
      {/* Pointer shortcuts to each stop; keyboards and screen readers use the
          slider itself, so these stay out of the tab order and the a11y tree. */}
      <div aria-hidden className="grid grid-cols-3 gap-2">
        {SCALE.map((kind, i) => {
          const isOffered = offered.includes(kind);
          return (
            <button
              key={kind}
              type="button"
              tabIndex={-1}
              disabled={!isOffered}
              onClick={() => onChange(kind)}
              className={cn(
                "flex min-w-0 flex-col gap-1 rounded-[6px] py-1 text-[12.5px] leading-tight",
                i === 0
                  ? "items-start text-left"
                  : i === 1
                    ? "items-center"
                    : "items-end text-right",
                isOffered ? TONE[kind].text : "cursor-default text-muted",
                kind === value ? "font-semibold underline underline-offset-4" : "font-medium",
              )}
            >
              <span>{SHORT_LABELS[kind]}</span>
              {!isOffered ? (
                <span className="text-[11px] font-normal text-muted">not offered</span>
              ) : kind === recommended ? (
                <Badge tone="outline">Recommended</Badge>
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function Options({
  options,
  value,
  onChange,
}: {
  options: ResolvedOption[];
  value: Option;
  onChange: (option: Option) => void;
}) {
  const chosen = options.find((option) => option.kind === value) ?? options[0]!;
  const recommended = options.find((option) => option.recommended);
  return (
    <div className="space-y-3">
      <ResolutionSlider options={options} value={chosen.kind} onChange={onChange} />
      <div className="overflow-hidden rounded-desk border border-hair bg-surface">
        <KindBar kind={chosen.kind} />
        <div className="space-y-2 px-4 py-3">
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="text-[14px] font-semibold">{chosen.label}</h4>
            {chosen.recommended ? <Badge tone="outline">Recommended</Badge> : null}
          </div>
          <p className="text-[13px] text-ink/80">{chosen.summary}</p>
          {chosen.reason ? (
            <p className="text-[13px] text-muted">
              <span className="font-medium text-ink">Why: </span>
              {chosen.reason}
            </p>
          ) : null}
          <div className="space-y-1.5 border-t border-hair pt-2">
            {chosen.keeps.map((work) => (
              <Work key={work.side} verb="Keeps" work={work} />
            ))}
            {chosen.drops ? <Work verb="Drops" work={chosen.drops} /> : null}
          </div>
          {!chosen.recommended && recommended ? (
            <div className="flex flex-wrap items-center gap-2 border-t border-hair pt-2 text-[12.5px] text-muted">
              <span className="min-w-0 flex-1">Recommended: {recommended.label}</span>
              <Button size="sm" variant="ghost" onClick={() => onChange(recommended.kind)}>
                Use recommended
              </Button>
            </div>
          ) : null}
        </div>
      </div>
      <p className="hidden items-center gap-1.5 text-[12px] text-muted md:flex">
        <Kbd>←</Kbd>
        <Kbd>→</Kbd> or <Kbd>1</Kbd>
        <Kbd>2</Kbd>
        <Kbd>3</Kbd> to choose
      </p>
    </div>
  );
}
