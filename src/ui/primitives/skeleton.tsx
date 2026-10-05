import { cn } from "@/ui/utils";

// Placeholder blocks shaped like what is loading.
function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      aria-hidden
      className={cn("animate-pulse rounded-[6px] bg-ink/[0.07]", className)}
      {...props}
    />
  );
}

export { Skeleton };
