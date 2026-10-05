import type { Analysis, AnalyzeEvent, AnalyzeStepEvent, AnalyzeStepId } from "@/core/events";
import type { Option } from "@/core/honor";

// The desk's local state: which pull request is open and each analysis as
// its events arrive. Pure; the components dispatch validated stream events.
// An analysis belongs to one exact head and base, so a moved pull request
// gets a fresh one instead of reusing a stale result.

// Each step keeps its latest event and when it started running, for timings.
export type StepEntry = AnalyzeStepEvent & { from?: number };
export type Steps = Partial<Record<AnalyzeStepId, StepEntry>>;

export type AnalysisState =
  | { status: "running"; steps: Steps }
  | { status: "done"; steps: Steps; analysis: Analysis; token: string | null; option: Option }
  | { status: "failed"; steps: Steps; reason: string };

export type DeskState = {
  selected: number | null;
  analyses: Record<string, AnalysisState>;
};

export type DeskAction =
  | { type: "select"; pr: number | null }
  | { type: "analysis/start"; key: string }
  | { type: "analysis/event"; key: string; event: AnalyzeEvent }
  | { type: "analysis/error"; key: string; reason: string }
  | { type: "option"; key: string; option: Option }
  | { type: "hydrate"; analyses: Record<string, AnalysisState> };

export const initialDesk: DeskState = { selected: null, analyses: {} };

export const analysisKey = (pr: number, head: string, base: string) => `${pr}:${head}:${base}`;

export function deskReducer(state: DeskState, action: DeskAction): DeskState {
  const put = (key: string, next: AnalysisState): DeskState => ({
    ...state,
    analyses: { ...state.analyses, [key]: next },
  });
  switch (action.type) {
    case "select":
      return { ...state, selected: action.pr };
    case "analysis/start":
      return put(action.key, { status: "running", steps: {} });
    case "analysis/event": {
      const current = state.analyses[action.key];
      if (!current || current.status !== "running") return state;
      const { event } = action;
      if (!("type" in event)) {
        const before = current.steps[event.step];
        const from = event.state === "running" ? (before?.from ?? event.t) : before?.from;
        const entry: StepEntry = from === undefined ? event : { ...event, from };
        return put(action.key, { ...current, steps: { ...current.steps, [event.step]: entry } });
      }
      if (!event.ok)
        return put(action.key, { status: "failed", steps: current.steps, reason: event.reason });
      const recommended = event.analysis.options.find((option) => option.recommended);
      return put(action.key, {
        status: "done",
        steps: current.steps,
        analysis: event.analysis,
        token: event.token ?? null,
        option: (recommended ?? event.analysis.options[0]!).kind,
      });
    }
    case "analysis/error": {
      const current = state.analyses[action.key];
      if (current && current.status !== "running") return state;
      return put(action.key, {
        status: "failed",
        steps: current?.steps ?? {},
        reason: action.reason,
      });
    }
    case "hydrate":
      // Restored analyses never replace one already in this session.
      return { ...state, analyses: { ...action.analyses, ...state.analyses } };
    case "option": {
      const current = state.analyses[action.key];
      if (!current || current.status !== "done") return state;
      if (!current.analysis.options.some((option) => option.kind === action.option)) return state;
      return put(action.key, { ...current, option: action.option });
    }
  }
}
