"use client";

import { useMemo } from "react";
import { Desk } from "@/ui/Desk";
import { DeskOverlays } from "@/ui/Overlays";
import { Providers } from "@/ui/providers";
import { liveSource } from "@/ui/sources/live";

// Live mode: the desk reading one repository through the API routes.
export function LiveDesk({ repo }: { repo: string }) {
  const source = useMemo(() => liveSource(repo), [repo]);
  return (
    <Providers>
      <Desk source={source} repo={repo} />
      <DeskOverlays />
    </Providers>
  );
}
