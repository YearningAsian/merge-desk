import { cn } from "@/ui/utils";

function Kbd({ className, ...props }: React.ComponentProps<"kbd">) {
  return (
    <kbd
      data-slot="kbd"
      className={cn(
        "inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-[4px] border border-hair bg-surface px-1 font-mono text-[11px] leading-none text-muted",
        className,
      )}
      {...props}
    />
  );
}

export { Kbd };
