"use client";

import { useEffect } from "react";
import { clearAnalyses } from "@/ui/cache";

// Rendered while signed out: analyses kept for the last session's reloads
// are dropped, so they never outlive the sign-in they came from.
export function ForgetSession() {
  useEffect(() => clearAnalyses(), []);
  return null;
}
