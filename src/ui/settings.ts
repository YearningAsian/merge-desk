"use client";

import { useSyncExternalStore } from "react";
import { z } from "zod";
import { ModelChoice } from "@/core/models";

// Merge Desk's preferences, kept in this browser (localStorage) and shared
// by its tabs. Nothing here is secret (model keys live in a sealed cookie,
// see server/keys), and the server checks the model again.
// Each field falls back to its default on its own, so a stale or hand-edited
// value can't break the desk.

export const Settings = z.object({
  model: z.union([z.literal("server"), ModelChoice]).catch("server"),
  autoAnalyze: z.boolean().catch(true),
  refreshSeconds: z.union([z.literal(0), z.literal(15), z.literal(30), z.literal(60)]).catch(30),
  diffLayout: z.enum(["auto", "split", "unified"]).catch("auto"),
  wrap: z.boolean().catch(true),
  reduceMotion: z.boolean().catch(false),
  shortcuts: z.boolean().catch(true),
});
export type Settings = z.infer<typeof Settings>;

export const DEFAULT_SETTINGS: Settings = Settings.parse({});
const KEY = "merge-desk:settings";
const listeners = new Set<() => void>();
let current: Settings | null = null;

function read(): Settings {
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? Settings.parse(JSON.parse(raw)) : DEFAULT_SETTINGS;
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function getSettings(): Settings {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;
  current ??= read();
  return current;
}

export function updateSettings(patch: Partial<Settings>) {
  current = Settings.parse({ ...getSettings(), ...patch });
  try {
    window.localStorage.setItem(KEY, JSON.stringify(current));
  } catch {
    // Private windows can refuse storage; the change still applies here.
  }
  listeners.forEach((listener) => listener());
}

export function resetSettings() {
  updateSettings(DEFAULT_SETTINGS);
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (event.key !== KEY) return;
    current = read();
    listener();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

export function useSettings(): Settings {
  return useSyncExternalStore(subscribe, getSettings, () => DEFAULT_SETTINGS);
}

// The model to ask for, or undefined for the server's default.
export const chosenModel = (settings: Settings) =>
  settings.model === "server" ? undefined : settings.model;

// Overlays (Settings, shortcut help) open from buttons and from the keyboard
// through one window event, so neither needs to know who asked.
export type Overlay = "settings" | "shortcuts";
const OVERLAY_EVENT = "merge-desk:overlay";
export const openOverlay = (overlay: Overlay) =>
  window.dispatchEvent(new CustomEvent<Overlay>(OVERLAY_EVENT, { detail: overlay }));
export function onOverlay(handler: (overlay: Overlay) => void) {
  const listener = (event: Event) => handler((event as CustomEvent<Overlay>).detail);
  window.addEventListener(OVERLAY_EVENT, listener);
  return () => window.removeEventListener(OVERLAY_EVENT, listener);
}

// Single-key shortcuts stay out of the way of typing and of open overlays.
export function shortcutTarget(event: KeyboardEvent): boolean {
  if (event.metaKey || event.ctrlKey || event.altKey) return false;
  if (!getSettings().shortcuts) return false;
  const target = event.target as HTMLElement | null;
  return !target?.closest("input, textarea, select, [contenteditable=true], [data-overlay]");
}
