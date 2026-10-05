"use client";

import { Check, Copy } from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "@/ui/utils";

// One click copies `text`. The icon turns into a check and a polite status
// says "Copied" (or that copying failed), then both reset.
export function CopyButton({
  text,
  label,
  children,
  className,
}: {
  text: string;
  label: string;
  children?: React.ReactNode;
  className?: string;
}) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  useEffect(() => {
    if (state === "idle") return;
    const timer = setTimeout(() => setState("idle"), 1500);
    return () => clearTimeout(timer);
  }, [state]);
  const Icon = state === "copied" ? Check : Copy;
  return (
    <>
      <button
        type="button"
        aria-label={label}
        onClick={() =>
          navigator.clipboard.writeText(text).then(
            () => setState("copied"),
            () => setState("failed"),
          )
        }
        className={cn(
          "group inline-flex min-w-0 items-center gap-1 rounded-[4px] hover:text-ink",
          className,
        )}
      >
        {children}
        <Icon
          aria-hidden
          className={cn(
            "size-3.5 shrink-0 transition-opacity duration-150",
            state === "copied" ? "text-ok-text" : "opacity-60 group-hover:opacity-100",
          )}
        />
      </button>
      <span role="status" className="sr-only">
        {state === "copied" ? "Copied" : state === "failed" ? "Couldn't copy" : ""}
      </span>
    </>
  );
}
