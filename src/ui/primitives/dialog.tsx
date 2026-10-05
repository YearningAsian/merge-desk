"use client";

import * as React from "react";
import { X } from "lucide-react";
import { Dialog as DialogPrimitive } from "radix-ui";
import { cn } from "@/ui/utils";

// shadcn's Dialog on Radix: focus-trapped, Escape and focus return. A
// centered panel with 16 px gutters on phones, scrolling inside itself.
// `data-overlay` turns the desk's single-key shortcuts off while it is open.

const Dialog = DialogPrimitive.Root;
const DialogTrigger = DialogPrimitive.Trigger;

function DialogContent({
  className,
  children,
  title,
  description,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content> & {
  title: string;
  description?: string;
}) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-ink/40 duration-150 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
      <DialogPrimitive.Content
        data-overlay
        // Without a description, say so explicitly (Radix otherwise warns).
        {...(description ? {} : { "aria-describedby": undefined })}
        className={cn(
          "fixed top-1/2 left-1/2 z-50 flex max-h-[min(720px,calc(100dvh-32px))] w-[min(520px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-desk border border-hair bg-surface shadow-[0_12px_40px_rgb(0_0_0/0.18)] duration-150 outline-none data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-[0.98] data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-[0.98]",
          className,
        )}
        {...props}
      >
        <div className="flex shrink-0 items-start gap-3 border-b border-hair px-5 py-3.5">
          <div className="min-w-0 flex-1">
            <DialogPrimitive.Title className="text-[15px] font-semibold text-ink">
              {title}
            </DialogPrimitive.Title>
            {description ? (
              <DialogPrimitive.Description className="mt-0.5 text-[12.5px] text-muted">
                {description}
              </DialogPrimitive.Description>
            ) : null}
          </div>
          <DialogPrimitive.Close
            aria-label="Close"
            className="-mr-1.5 inline-flex size-8 items-center justify-center rounded-[6px] text-muted hover:bg-ink/[0.06] hover:text-ink"
          >
            <X aria-hidden className="size-4" />
          </DialogPrimitive.Close>
        </div>
        <div className="relative min-h-0 flex-1 overflow-y-auto">{children}</div>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

export { Dialog, DialogContent, DialogTrigger };
