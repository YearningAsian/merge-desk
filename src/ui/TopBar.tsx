import Link from "next/link";
import { Badge } from "@/ui/primitives/badge";
import { OverlayButtons } from "@/ui/Overlays";
import { Button } from "@/ui/primitives/button";
import { RepoPicker } from "@/ui/RepoPicker";

// The slim bar over every desk view: the product and which mode this is.
// Live mode names the signed-in account, switches between their
// repositories and offers sign-out; demo mode links to live mode.
export function TopBar({
  repo,
  repos,
  login,
  demo = false,
}: {
  repo?: string;
  repos?: string[];
  login?: string;
  demo?: boolean;
}) {
  return (
    <header className="flex h-12 shrink-0 items-center gap-3 border-b border-hair bg-surface px-4 pt-[env(safe-area-inset-top)]">
      <Link
        href="/"
        className="shrink-0 text-[14px] font-semibold tracking-tight whitespace-nowrap"
      >
        Merge Desk
      </Link>
      {repo && repos ? <RepoPicker repo={repo} repos={repos} /> : null}
      <div className="ml-auto flex shrink-0 items-center gap-2.5">
        {demo ? (
          <>
            <Badge tone="outline">Demo mode</Badge>
            <OverlayButtons />
            <Button asChild variant="ghost" size="sm">
              <Link href="/live">Live mode</Link>
            </Button>
          </>
        ) : login ? (
          <>
            <Badge tone="outline" className={repos?.length ? "hidden sm:inline-flex" : undefined}>
              Live mode
            </Badge>
            <span className="hidden text-[13px] text-muted sm:inline">@{login}</span>
            <OverlayButtons />
            <form action="/api/auth/signout" method="post">
              <Button type="submit" variant="ghost" size="sm">
                Sign out
              </Button>
            </form>
          </>
        ) : null}
      </div>
    </header>
  );
}
