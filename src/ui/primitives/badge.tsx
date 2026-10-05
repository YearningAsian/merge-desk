import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/ui/utils";

// Status and side labels: a dark text role on its quiet wash (all >= 4.5:1),
// always carrying a word, never color alone.
const badgeVariants = cva(
  "inline-flex w-fit shrink-0 items-center gap-1 rounded-[5px] px-1.5 font-mono text-[11px] leading-[18px] font-semibold whitespace-nowrap [&>svg]:size-3",
  {
    variants: {
      tone: {
        neutral: "bg-ink/[0.06] text-ink",
        ours: "bg-ours-wash text-ours-text",
        theirs: "bg-theirs-wash text-theirs-text",
        ok: "bg-ok-wash text-ok-text",
        stop: "bg-stop-wash text-stop-text",
        wait: "bg-wait-wash text-wait-text",
        outline: "border border-control-border text-ink",
      },
    },
    defaultVariants: { tone: "neutral" },
  },
);

function Badge({
  className,
  tone,
  ...props
}: React.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return <span data-slot="badge" className={cn(badgeVariants({ tone }), className)} {...props} />;
}

export { Badge, badgeVariants };
