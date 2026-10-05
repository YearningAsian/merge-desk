import Link from "next/link";
import { Badge } from "@/ui/primitives/badge";
import { OverlayButtons } from "@/ui/Overlays";
import { Button } from "@/ui/primitives/button";

// The slim bar over every desk view: the product, the repository, and which
// mode this is. Live mode names the signed-in account and offers sign-out.
export function TopBar({ repo, login }: { repo: string; login?: string }) {
  return (
    <header className="flex h-12 shrink-0 items-center gap-3 border-b border-hair bg-surface px-4 pt-[env(safe-area-inset-top)]">
      <Link href="/" className="text-[14px] font-semibold tracking-tight">
        Merge Desk
      </Link>
      <span className="hidden truncate font-mono text-[12px] text-muted sm:inline">{repo}</span>
      <div className="ml-auto flex items-center gap-2.5">
        {login ? (
          <>
            <Badge tone="outline">Live mode</Badge>
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
