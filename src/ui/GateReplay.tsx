"use client";

import { RotateCcw } from "lucide-react";
import { useEffect, useState } from "react";
import type { StepEvent, Verdict } from "@/core/events";
import { Badge } from "@/ui/primitives/badge";
import { runSteps } from "@/ui/Run";
import { withStep, type RunSteps } from "@/ui/state";
import { Steps } from "@/ui/Steps";

// The home page's picture: one recorded run played back through the desk's
// own step list at its original pace. The server renders the finished run, so
// it reads the same without script or with reduced motion.

const reduced = () =>
  window.matchMedia("(prefers-reduced-motion: reduce)").matches ||
  document.documentElement.dataset.motion === "reduce";

export function GateReplay({
  events,
  verdictAt,
  verdict,
  after,
}: {
  events: StepEvent[];
  verdictAt: number;
  verdict: Verdict;
  after: string;
}) {
  const [shown, setShown] = useState(events.length);
  const [ended, setEnded] = useState(true);
  const [round, setRound] = useState(0);

  useEffect(() => {
    if (reduced()) return;
    const timers = [
      setTimeout(() => {
        setShown(0);
        setEnded(false);
      }, 0),
      ...events.map((event, index) => setTimeout(() => setShown(index + 1), event.t)),
      setTimeout(() => setEnded(true), verdictAt),
    ];
    return () => timers.forEach(clearTimeout);
  }, [events, verdictAt, round]);

  const steps = events
    .slice(0, shown)
    .reduce<RunSteps>(
      (acc, event) => ({ ...acc, [event.step]: withStep(acc[event.step], event) }),
      {},
    );

  return (
    <div className="space-y-3">
      <Steps steps={runSteps(steps)} label="Recorded run: Combine both" />
      <div aria-live="polite" className="flex min-h-9 flex-wrap items-center gap-x-3 gap-y-1">
        {ended ? (
          <>
            <Badge tone={verdict === "VERIFIED" ? "ok" : "stop"} className="text-[13px] leading-6">
              {verdict}
            </Badge>
            <span className="text-[13px]">{after}</span>
            <button
              type="button"
              onClick={() => setRound((value) => value + 1)}
              className="ml-auto inline-flex h-9 items-center gap-1.5 rounded-desk px-2 text-[13px] text-muted hover:bg-ink/[0.06] hover:text-ink active:bg-ink/10"
            >
              <RotateCcw aria-hidden className="size-3.5" />
              Play again
            </button>
          </>
        ) : (
          <Badge tone="wait" className="text-[13px] leading-6">
            VERIFYING
          </Badge>
        )}
      </div>
    </div>
  );
}
