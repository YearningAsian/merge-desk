import { RotateCcw } from "lucide-react";
import { Button } from "@/ui/primitives/button";

// UTC and a fixed locale, so the server and the browser print the same date.
const day = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: "UTC" });

// Demo mode's label, always visible: what is being replayed and a way to
// start over. Live mode names the signed-in account in the top bar instead.
export function ModeBanner({ capturedAt, onReset }: { capturedAt: string; onReset: () => void }) {
  return (
    <section
      aria-label="Demo mode"
      className="flex shrink-0 items-center gap-3 border-b border-hair bg-bg px-4 py-1.5"
    >
      <div className="min-w-0 flex-1 leading-snug">
        <p className="text-[13px] font-semibold text-ink">Demo: recorded from a real run</p>
        <p className="hidden text-[12.5px] text-muted sm:block">
          Real Gemini answers, sandbox checks, test output and Lands from{" "}
          {day.format(new Date(capturedAt))}, replayed at their original pace. The demo itself
          writes nothing to GitHub.
        </p>
      </div>
      <Button onClick={onReset} className="h-11 md:h-8">
        <RotateCcw aria-hidden className="size-3.5" />
        Reset
      </Button>
    </section>
  );
}
