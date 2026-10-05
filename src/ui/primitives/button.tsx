import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "radix-ui";
import { cn } from "@/ui/utils";

// shadcn's Button, restyled to BRAND.md: one ink primary per view, quiet
// outline and ghost actions, 8 px radius, the global 2 px ink focus outline.
const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-1.5 rounded-desk font-medium whitespace-nowrap transition-colors duration-150 select-none active:translate-y-px disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        primary: "bg-ink text-white hover:bg-ink/90",
        outline: "border border-control-border bg-surface text-ink hover:border-ink hover:bg-bg",
        ghost: "text-ink hover:bg-ink/[0.06]",
        link: "h-auto px-0 text-ink underline underline-offset-2 hover:text-ink/80",
      },
      size: {
        sm: "h-7 px-2.5 text-[13px]",
        md: "h-8 px-3 text-[13px]",
        lg: "h-11 px-4 text-sm",
        icon: "size-8",
      },
    },
    defaultVariants: { variant: "outline", size: "md" },
  },
);

function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<"button"> & VariantProps<typeof buttonVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : "button";
  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };
