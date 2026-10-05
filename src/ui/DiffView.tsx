"use client";

import dynamic from "next/dynamic";
import { Component, useEffect, useState } from "react";
import { useMediaQuery } from "@/ui/hooks/useMediaQuery";
import { useSettings } from "@/ui/settings";
import { cn } from "@/ui/utils";

// A GitHub-style diff of one side's change to a conflicted file, against the
// merge base. Both sides are drawn up front (one hidden), so switching sides
// is instant. `onReady` fires once the visible side has been drawn, or the
// plain-text fallback is showing, or after a few seconds at worst, so the
// caller can reveal it whole. If Pierre fails, the plain text of the side is
// shown so the code is always readable.

const MAX_RENDER = 150_000;
const READY_FALLBACK_MS = 4_000;

// Fetch the renderer and its highlighter in idle time, before anyone clicks.
export function warmDiffs(paths: string[]) {
  void import("./DiffPierre").then((module) => module.warm(paths)).catch(() => undefined);
}

function Plain({ text, label }: { text: string; label: string }) {
  return (
    <pre
      aria-label={label}
      className="max-h-[480px] overflow-auto bg-surface p-3 font-mono text-[12px] leading-relaxed whitespace-pre-wrap"
    >
      {text}
    </pre>
  );
}

const DiffPierre = dynamic(() => import("./DiffPierre"), { ssr: false });

class Fallback extends Component<
  { fallback: React.ReactNode; onFail: () => void; children: React.ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch() {
    this.props.onFail();
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

type Side = "ours" | "theirs";

export function DiffView({
  path,
  base,
  ours,
  theirs,
  onReady,
}: {
  path: string;
  base: string;
  ours: string;
  theirs: string;
  onReady?: () => void;
}) {
  const [side, setSide] = useState<Side>("ours");
  const settings = useSettings();
  const wide = useMediaQuery("(min-width: 1024px)");
  const split = settings.diffLayout === "auto" ? wide : settings.diffLayout === "split";
  const tooLarge = Math.max(ours.length, theirs.length) + base.length > MAX_RENDER;

  useEffect(() => {
    if (tooLarge) {
      onReady?.();
      return;
    }
    const timer = setTimeout(() => onReady?.(), READY_FALLBACK_MS);
    return () => clearTimeout(timer);
    // Once per mount: later re-renders must not re-arm it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="overflow-hidden rounded-desk border border-hair bg-surface">
      <div
        role="group"
        aria-label="Which side's change"
        className="flex gap-1 border-b border-hair p-1.5"
      >
        {(["ours", "theirs"] as const).map((value) => (
          <button
            key={value}
            type="button"
            aria-pressed={side === value}
            onClick={() => setSide(value)}
            className={cn(
              "rounded-[6px] px-2.5 py-1 text-[12px] font-medium transition-colors duration-150",
              side === value
                ? value === "ours"
                  ? "bg-ours-wash text-ours-text"
                  : "bg-theirs-wash text-theirs-text"
                : "text-muted hover:text-ink",
            )}
          >
            {value === "ours" ? "Ours vs base" : "Theirs vs base"}
          </button>
        ))}
      </div>
      {(["ours", "theirs"] as const).map((value) => {
        const after = value === "ours" ? ours : theirs;
        const label = `${path}: ${value} compared with the merge base`;
        return (
          <div
            key={value}
            role="region"
            aria-label={label}
            hidden={side !== value}
            className="relative max-h-[560px] overflow-auto duration-150 animate-in fade-in-0"
          >
            {tooLarge ? (
              <Plain text={after} label={label} />
            ) : (
              <Fallback fallback={<Plain text={after} label={label} />} onFail={() => onReady?.()}>
                <DiffPierre
                  name={path}
                  before={base}
                  after={after}
                  split={split}
                  wrap={settings.wrap}
                  onRendered={value === "ours" ? onReady : undefined}
                />
              </Fallback>
            )}
          </div>
        );
      })}
    </div>
  );
}
