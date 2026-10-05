"use client";

import * as React from "react";
import { RadioGroup as RadioGroupPrimitive } from "radix-ui";
import { cn } from "@/ui/utils";

// shadcn's RadioGroup: arrow keys move between options, Space selects.
// Restyled with a 3:1 control border and an ink dot.

function RadioGroup({
  className,
  ...props
}: React.ComponentProps<typeof RadioGroupPrimitive.Root>) {
  return (
    <RadioGroupPrimitive.Root
      data-slot="radio-group"
      className={cn("grid gap-2", className)}
      {...props}
    />
  );
}

function RadioGroupItem({
  className,
  ...props
}: React.ComponentProps<typeof RadioGroupPrimitive.Item>) {
  return (
    <RadioGroupPrimitive.Item
      data-slot="radio-group-item"
      className={cn(
        "grid aspect-square size-4 shrink-0 place-items-center rounded-full border border-control-border bg-surface transition-colors duration-150 disabled:opacity-50 data-[state=checked]:border-ink",
        className,
      )}
      {...props}
    >
      <RadioGroupPrimitive.Indicator className="size-2 rounded-full bg-ink" />
    </RadioGroupPrimitive.Item>
  );
}

export { RadioGroup, RadioGroupItem };
