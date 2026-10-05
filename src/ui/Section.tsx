"use client";

import { ChevronRight } from "lucide-react";
import { useId, useState } from "react";
import { Reveal } from "@/ui/primitives/reveal";
import { cn } from "@/ui/utils";

// A foldable section of the pull request detail: a heading button with an
// optional aside, and content that grows and shrinks smoothly. Open by
// default; pass `open` and `onOpenChange` to control it from outside.
export function Section({
  title,
  aside,
  open: controlled,
  onOpenChange,
  defaultOpen = true,
  children,
}: {
  title: string;
  aside?: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [own, setOwn] = useState(defaultOpen);
  const open = controlled ?? own;
  const setOpen = onOpenChange ?? setOwn;
  const id = useId();
  return (
    <section className="border-t border-hair pt-3">
      <h3 className="flex min-h-7 items-center gap-2">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={id}
          onClick={() => setOpen(!open)}
          className="-ml-1 inline-flex items-center gap-1 rounded-[6px] px-1 py-0.5 text-[13px] font-semibold text-ink hover:bg-ink/[0.05]"
        >
          <ChevronRight
            aria-hidden
            className={cn(
              "size-4 text-muted transition-transform duration-200",
              open && "rotate-90",
            )}
          />
          {title}
        </button>
        {aside}
      </h3>
      <Reveal open={open} id={id}>
        <div className="pt-3 pb-5">{children}</div>
      </Reveal>
    </section>
  );
}
