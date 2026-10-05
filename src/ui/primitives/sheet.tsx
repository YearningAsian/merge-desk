"use client";

import * as React from "react";
import { ChevronLeft } from "lucide-react";
import { Dialog as SheetPrimitive } from "radix-ui";
import { cn } from "@/ui/utils";

// shadcn's Sheet on Radix Dialog: a named, focus-trapped dialog with Escape
// and focus return. Restyled for phones: a full-height bottom sheet over a
// plain dimmed overlay (no blur), an iOS-style bar with a labelled back
// button, scrolling content and 150 ms state motion.

const Sheet = (props: React.ComponentProps<typeof SheetPrimitive.Root>) => (
  <SheetPrimitive.Root data-slot="sheet" {...props} />
);

function SheetContent({
  className,
  children,
  backLabel,
  backName,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Content> & {
  backLabel: string;
  backName: string;
}) {
  return (
    <SheetPrimitive.Portal>
      <SheetPrimitive.Overlay className="fixed inset-0 z-40 bg-ink/40 duration-150 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
      <SheetPrimitive.Content
        data-slot="sheet-content"
        className={cn(
          "fixed inset-x-0 bottom-0 z-50 flex h-[100dvh] flex-col bg-bg duration-150 outline-none data-[state=closed]:animate-out data-[state=closed]:slide-out-to-bottom data-[state=open]:animate-in data-[state=open]:slide-in-from-bottom",
          className,
        )}
        {...props}
      >
        <div className="flex shrink-0 items-center border-b border-hair bg-surface px-1 pt-[env(safe-area-inset-top)]">
          <SheetPrimitive.Close
            aria-label={backName}
            className="inline-flex h-11 items-center gap-0.5 rounded-desk pr-3 pl-1.5 text-[15px] font-medium text-ink hover:bg-ink/[0.06]"
          >
            <ChevronLeft aria-hidden className="size-5" />
            {backLabel}
          </SheetPrimitive.Close>
        </div>
        {children}
      </SheetPrimitive.Content>
    </SheetPrimitive.Portal>
  );
}

const SheetTitle = ({ className, ...props }: React.ComponentProps<typeof SheetPrimitive.Title>) => (
  <SheetPrimitive.Title className={cn("font-semibold text-ink", className)} {...props} />
);

export { Sheet, SheetContent, SheetTitle };
