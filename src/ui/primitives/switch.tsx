"use client";

import * as React from "react";
import { Switch as SwitchPrimitive } from "radix-ui";
import { cn } from "@/ui/utils";

// shadcn's Switch: a labelled on/off control. The off track keeps a 3:1
// control border; on is ink, like the one primary action.
function Switch({ className, ...props }: React.ComponentProps<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      className={cn(
        "inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border border-control-border bg-surface p-px transition-colors duration-150 data-[state=checked]:border-ink data-[state=checked]:bg-ink",
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb className="block size-4 rounded-full bg-control-border shadow-sm transition-transform duration-150 data-[state=checked]:translate-x-4 data-[state=checked]:bg-surface" />
    </SwitchPrimitive.Root>
  );
}

export { Switch };
