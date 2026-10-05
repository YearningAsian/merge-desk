"use client";

import { Desk } from "@/ui/Desk";
import { DeskOverlays } from "@/ui/Overlays";
import { Providers } from "@/ui/providers";
import { liveSource } from "@/ui/sources/live";

// Live mode: the desk reading this repository through the API routes.
export function LiveDesk({ repo }: { repo: string }) {
  return (
    <Providers>
      <Desk source={liveSource} repo={repo} />
      <DeskOverlays />
    </Providers>
  );
}
