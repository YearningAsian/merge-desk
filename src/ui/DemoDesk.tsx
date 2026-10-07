"use client";

import { useEffect, useMemo, useState } from "react";
import type { Recording } from "@/core/recording";
import { Desk } from "@/ui/Desk";
import { ModeBanner } from "@/ui/ModeBanner";
import { DeskOverlays } from "@/ui/Overlays";
import { Providers } from "@/ui/providers";
import { recordedSource } from "@/ui/sources/recorded";

// Demo mode: the same desk as live mode, reading recordings of real runs.
// Reset remounts the session with a new source (no Lands, no record entries)
// and a fresh query cache, which also cancels any playback in progress, and
// drops the open pull request from the address.
export function DemoDesk({ recordings, repo }: { recordings: Recording[]; repo: string }) {
  const [epoch, setEpoch] = useState(0);
  const capturedAt = recordings.map((recording) => recording.capturedAt).sort()[0]!;

  useEffect(() => {
    if (epoch > 0) document.getElementById("main")?.focus();
  }, [epoch]);

  const reset = () => {
    const url = new URL(window.location.href);
    url.searchParams.delete("pr");
    window.history.replaceState(window.history.state, "", url);
    setEpoch((value) => value + 1);
  };

  return (
    <>
      <ModeBanner capturedAt={capturedAt} onReset={reset} />
      <p role="status" className="sr-only">
        {epoch > 0 ? "Demo reset. Every pull request is back to its starting state." : ""}
      </p>
      <Providers key={epoch}>
        <DemoSession recordings={recordings} repo={repo} />
      </Providers>
    </>
  );
}

// One demo session, from first click to Reset.
function DemoSession({ recordings, repo }: { recordings: Recording[]; repo: string }) {
  const source = useMemo(() => recordedSource(recordings), [recordings]);
  return (
    <>
      <Desk source={source} repo={repo} />
      <DeskOverlays demo />
    </>
  );
}
