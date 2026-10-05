import { z } from "zod";
import { Analysis, AnalyzeStepEvent } from "@/core/events";
import { OptionKind } from "@/core/options";
import type { AnalysisState } from "@/ui/state";

// Finished analyses survive a reload of this tab (sessionStorage), so a
// reload or a ?pr= link doesn't spend another Gemini call. Entries are keyed
// by pull request and exact head and base, validated on the way back in, and
// dropped after 55 minutes, before the server's 60-minute signature expires.
// Signing out clears them.

const KEY = "merge-desk:analyses";
const TTL_MS = 55 * 60 * 1000;

const Entry = z.object({
  savedAt: z.number(),
  analysis: Analysis,
  token: z.string().nullable(),
  option: OptionKind,
  steps: z.record(z.string(), AnalyzeStepEvent.extend({ from: z.number().optional() })),
});
type Entry = z.infer<typeof Entry>;
type Done = Extract<AnalysisState, { status: "done" }>;

function readAll(): Record<string, Entry> {
  try {
    const raw = window.sessionStorage.getItem(KEY);
    const parsed = raw ? z.record(z.string(), z.unknown()).parse(JSON.parse(raw)) : {};
    const out: Record<string, Entry> = {};
    for (const [key, value] of Object.entries(parsed)) {
      const entry = Entry.safeParse(value);
      if (entry.success && Date.now() - entry.data.savedAt < TTL_MS) out[key] = entry.data;
    }
    return out;
  } catch {
    return {};
  }
}

export function loadAnalyses(): Record<string, Done> {
  return Object.fromEntries(
    Object.entries(readAll()).map(([key, entry]) => [
      key,
      {
        status: "done",
        analysis: entry.analysis,
        token: entry.token,
        option: entry.option,
        steps: entry.steps as Done["steps"],
      } satisfies Done,
    ]),
  );
}

export function saveAnalyses(analyses: Record<string, AnalysisState>) {
  const kept = readAll();
  const out: Record<string, Entry> = {};
  for (const [key, state] of Object.entries(analyses)) {
    if (state.status !== "done") continue;
    out[key] = {
      savedAt: kept[key]?.savedAt ?? Date.now(),
      analysis: state.analysis,
      token: state.token,
      option: state.option,
      steps: state.steps as Entry["steps"],
    };
  }
  try {
    window.sessionStorage.setItem(KEY, JSON.stringify(out));
  } catch {
    // Full or refused storage only costs a fresh analysis after a reload.
  }
}

export function clearAnalyses() {
  try {
    window.sessionStorage.removeItem(KEY);
  } catch {
    // Nothing to clear.
  }
}
