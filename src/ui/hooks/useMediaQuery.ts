"use client";

import { useSyncExternalStore } from "react";

// True while the media query matches. The server renders the desktop layout.
export function useMediaQuery(query: string, serverValue = true): boolean {
  return useSyncExternalStore(
    (notify) => {
      const list = window.matchMedia(query);
      list.addEventListener("change", notify);
      return () => list.removeEventListener("change", notify);
    },
    () => window.matchMedia(query).matches,
    () => serverValue,
  );
}
