"use client";

import { createContext, useContext } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/ui/utils";

// On a phone the pull request opens as a full-height sheet, and its one
// primary action (Run, hold to drop, Land, or trying the next option after a
// hold) belongs at the bottom within thumb reach. The sheet provides a bar
// element; PinnedActions renders its children there when one is provided,
// and in place otherwise (desktop). The states that show these actions never
// overlap, so the bar holds one at a time.

export const ActionBar = createContext<HTMLElement | null>(null);

export function PinnedActions({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const bar = useContext(ActionBar);
  if (!bar) return <div className={className}>{children}</div>;
  return createPortal(
    <div data-pinned className={cn(className, "[&_button]:min-h-11")}>
      {children}
    </div>,
    bar,
  );
}

// The sheet's bar: under the scrolling detail, above the home indicator.
// Hidden while empty, so a pull request without an action keeps the space.
export function ActionBarSlot({
  onElement,
}: {
  onElement: (element: HTMLDivElement | null) => void;
}) {
  return (
    <div
      ref={onElement}
      role="group"
      aria-label="Actions"
      className="shrink-0 border-t border-hair bg-surface px-4 pt-2 pb-[calc(env(safe-area-inset-bottom)+8px)] empty:hidden"
    />
  );
}
