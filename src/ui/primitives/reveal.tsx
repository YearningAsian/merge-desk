"use client";

import { useEffect, useState } from "react";
import { cn } from "@/ui/utils";

const DURATION_MS = 200;

// Opens and closes content by growing its height (CSS grid rows 0fr to 1fr,
// so no measuring) with a short fade, instead of a large block appearing at
// once. The content grows downward from where the reader clicked, so the
// view above stays put. Closed content is inert (no focus, no screen reader)
// and clipped; once fully open it stops clipping so focus outlines show.
export function Reveal({
  open,
  id,
  className,
  children,
}: {
  open: boolean;
  id?: string;
  className?: string;
  children: React.ReactNode;
}) {
  const [settled, setSettled] = useState(open);
  const [wasOpen, setWasOpen] = useState(open);
  if (wasOpen !== open) {
    setWasOpen(open);
    setSettled(false);
  }
  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(() => setSettled(true), DURATION_MS + 20);
    return () => clearTimeout(timer);
  }, [open]);
  return (
    <div
      id={id}
      inert={!open}
      className={cn(
        "grid transition-[grid-template-rows,opacity] duration-200 ease-out",
        open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0",
        className,
      )}
    >
      <div className={cn("min-h-0", open && settled ? "overflow-visible" : "overflow-hidden")}>
        {children}
      </div>
    </div>
  );
}
