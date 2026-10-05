"use client";

import dynamic from "next/dynamic";
import { Component, useState } from "react";
import { useMediaQuery } from "@/ui/hooks/useMediaQuery";
import { cn } from "@/ui/utils";

// A GitHub-style diff of one side's change to a conflicted file, against the
// merge base. Pierre loads lazily; until it does, or if it fails, the plain
// text of the side is shown so the code is always readable.

const MAX_RENDER = 150_000;

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

const DiffPierre = dynamic(() => import("./DiffPierre"), {
  ssr: false,
  loading: () => <div className="h-24 animate-pulse bg-ink/[0.04]" aria-hidden />,
});

class Fallback extends Component<
  { fallback: React.ReactNode; children: React.ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
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
}: {
  path: string;
  base: string;
  ours: string;
  theirs: string;
}) {
  const [side, setSide] = useState<Side>("ours");
  const wide = useMediaQuery("(min-width: 1024px)");
  const after = side === "ours" ? ours : theirs;
  const label = `${path}: ${side === "ours" ? "ours" : "theirs"} compared with the merge base`;
  const tooLarge = base.length + after.length > MAX_RENDER;

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
      <div className="max-h-[560px] overflow-auto" aria-label={label} role="region">
        {tooLarge ? (
          <Plain text={after} label={label} />
        ) : (
          <Fallback fallback={<Plain text={after} label={label} />}>
            <DiffPierre key={side} name={path} before={base} after={after} split={wide} />
          </Fallback>
        )}
      </div>
    </div>
  );
}
