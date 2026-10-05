import { z } from "zod";

// The Gemini models someone may pick in Settings. The server accepts only
// these ids from the browser (anything else is refused before Google is
// called); GEMINI_MODEL still sets the server's default. Notes come from the
// measured runs recorded in devpost/checklist.md (2026-10-05).

export const MODEL_CHOICES = [
  {
    id: "gemini-3.5-flash-lite",
    label: "Gemini 3.5 Flash-Lite",
    note: "Default. About 2 s per call; free on the free plan.",
  },
  {
    id: "gemini-3.8-flash",
    label: "Gemini 3.8 Flash",
    note: "Stronger. Often answers 503 (busy) on the free plan.",
  },
  {
    id: "gemini-3.1-flash-lite",
    label: "Gemini 3.1 Flash-Lite",
    note: "Cheapest on the paid plan. Timed out on 2 of 4 test calls.",
  },
] as const;

export const ModelId = z.enum(MODEL_CHOICES.map((choice) => choice.id) as [string, ...string[]]);
export type ModelId = (typeof MODEL_CHOICES)[number]["id"];

export const modelLabel = (id: string) =>
  MODEL_CHOICES.find((choice) => choice.id === id)?.label ?? id;
