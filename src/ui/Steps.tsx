"use client";

import {
  ChevronRight,
  CircleCheck,
  CircleDashed,
  CircleMinus,
  CircleX,
  LoaderCircle,
} from "lucide-react";
import { useState } from "react";
import type { StepState } from "@/core/events";
import { Badge } from "@/ui/primitives/badge";
import { cn } from "@/ui/utils";

// A deployment-style step list: every step shows its state as a word, its
// time, and its detail; a raw log stays collapsed until asked for.

export type StepRow = {
  id: string;
  label: string;
  state: StepState;
  ms?: number;
  detail?: string;
  log?: string;
};

const LOOK: Record<
  StepState,
  {
    icon: typeof CircleCheck;
    tone: "neutral" | "wait" | "ok" | "stop";
    word: string;
    color: string;
  }
> = {
  queued: { icon: CircleDashed, tone: "neutral", word: "queued", color: "text-muted" },
  running: { icon: LoaderCircle, tone: "wait", word: "running", color: "text-wait-text" },
  passed: { icon: CircleCheck, tone: "ok", word: "passed", color: "text-ok" },
  failed: { icon: CircleX, tone: "stop", word: "failed", color: "text-stop" },
  not_run: { icon: CircleMinus, tone: "wait", word: "not run", color: "text-wait" },
};

function Step({ step }: { step: StepRow }) {
  const [open, setOpen] = useState(false);
  const look = LOOK[step.state];
  const Icon = look.icon;
  return (
    <li className="py-2">
      <div className="flex items-center gap-2.5">
        <Icon
          aria-hidden
          className={cn("size-4 shrink-0", look.color, step.state === "running" && "animate-spin")}
        />
        <span className="min-w-0 flex-1 truncate text-[13px] font-medium">{step.label}</span>
        <Badge tone={look.tone}>{look.word}</Badge>
        <span className="w-14 text-right font-mono text-[12px] text-muted tabular-nums">
          {step.ms === undefined
            ? ""
            : step.ms < 1000
              ? `${step.ms} ms`
              : `${(step.ms / 1000).toFixed(1)} s`}
        </span>
      </div>
      {step.detail ? (
        <p className="mt-1 pl-[26px] text-[13px] whitespace-pre-line text-muted">{step.detail}</p>
      ) : null}
      {step.log ? (
        <div className="mt-1 pl-[26px]">
          <button
            type="button"
            onClick={() => setOpen((value) => !value)}
            aria-expanded={open}
            className="inline-flex items-center gap-1 rounded-[4px] text-[12px] text-muted hover:text-ink"
          >
            <ChevronRight
              aria-hidden
              className={cn("size-3.5 transition-transform duration-150", open && "rotate-90")}
            />
            Raw log
          </button>
          {open ? (
            <pre className="mt-1.5 max-h-72 overflow-auto rounded-[6px] border border-hair bg-surface p-3 font-mono text-[12px] leading-relaxed whitespace-pre-wrap">
              {step.log}
            </pre>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}

export function Steps({ steps, label }: { steps: StepRow[]; label: string }) {
  return (
    <ol aria-label={label} className="divide-y divide-hair">
      {steps.map((step) => (
        <Step key={step.id} step={step} />
      ))}
    </ol>
  );
}
