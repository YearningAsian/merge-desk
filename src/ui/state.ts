import type {
  Analysis,
  AnalyzeEvent,
  AnalyzeStepEvent,
  AnalyzeStepId,
  ResultEvent,
  RunEvent,
  StepEvent,
  StepId,
} from "@/core/events";
import type { Option } from "@/core/honor";

// The desk's local state: which pull request is open, each analysis as its
// events arrive, and each run. Pure; the components dispatch validated
// stream events. An analysis belongs to one exact head and base, so a moved
// pull request gets a fresh one instead of reusing a stale result. A run
// belongs to one analysis and one option, so moving the slider shows that
// option's own run (or none) rather than another option's verdict.

// Each step keeps its latest event and when it started running, for timings.
export type StepEntry = AnalyzeStepEvent & { from?: number };
export type Steps = Partial<Record<AnalyzeStepId, StepEntry>>;

export type AnalysisState =
  | { status: "running"; steps: Steps }
  | { status: "done"; steps: Steps; analysis: Analysis; token: string | null; option: Option }
  | { status: "failed"; steps: Steps; reason: string };

export type RunStepEntry = StepEvent & { from?: number };
export type RunSteps = Partial<Record<StepId, RunStepEntry>>;

export type RunState =
  | { status: "running"; steps: RunSteps; events: RunEvent[]; steer: string | null }
  | {
      status: "done";
      steps: RunSteps;
      events: RunEvent[];
      steer: string | null;
      result: ResultEvent;
    }
  | { status: "failed"; steps: RunSteps; events: RunEvent[]; steer: string | null; reason: string };

export type DeskState = {
  selected: number | null;
  analyses: Record<string, AnalysisState>;
  runs: Record<string, RunState>;
};

export type DeskAction =
  | { type: "select"; pr: number | null }
  | { type: "analysis/start"; key: string }
  | { type: "analysis/event"; key: string; event: AnalyzeEvent }
  | { type: "analysis/error"; key: string; reason: string }
  | { type: "option"; key: string; option: Option }
  | { type: "hydrate"; analyses: Record<string, AnalysisState> }
  | { type: "run/start"; key: string; steer: string | null }
  | { type: "run/event"; key: string; event: RunEvent }
  | { type: "run/error"; key: string; reason: string }
  | { type: "run/discard"; key: string };

export const initialDesk: DeskState = { selected: null, analyses: {}, runs: {} };

export const analysisKey = (pr: number, head: string, base: string) => `${pr}:${head}:${base}`;
export const runKey = (analysis: string, option: Option) => `${analysis}:${option}`;

// Keeps each step's latest event and when it started running.
function withStep<S extends { from?: number; state: string; t: number }>(
  before: S | undefined,
  event: Omit<S, "from">,
): S {
  const from = event.state === "running" ? (before?.from ?? event.t) : before?.from;
  return (from === undefined ? event : { ...event, from }) as S;
}

function runReducer(current: RunState | undefined, action: DeskAction): RunState | undefined {
  switch (action.type) {
    case "run/start":
      return { status: "running", steps: {}, events: [], steer: action.steer };
    case "run/event": {
      if (!current || current.status !== "running") return current;
      const events = [...current.events, action.event];
      const { event } = action;
      if ("type" in event) return { ...current, status: "done", events, result: event };
      const steps = { ...current.steps, [event.step]: withStep(current.steps[event.step], event) };
      return { ...current, steps, events };
    }
    case "run/error":
      if (current && current.status !== "running") return current;
      return {
        status: "failed",
        steps: current?.steps ?? {},
        events: current?.events ?? [],
        steer: current?.steer ?? null,
        reason: action.reason,
      };
    default:
      return current;
  }
}

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
        const entry = withStep<StepEntry>(current.steps[event.step], event);
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
    case "run/start":
    case "run/event":
    case "run/error": {
      const next = runReducer(state.runs[action.key], action);
      return next === state.runs[action.key]
        ? state
        : { ...state, runs: { ...state.runs, [action.key]: next! } };
    }
    case "run/discard": {
      const runs = { ...state.runs };
      delete runs[action.key];
      return { ...state, runs };
    }
    case "option": {
      const current = state.analyses[action.key];
      if (!current || current.status !== "done") return state;
      if (!current.analysis.options.some((option) => option.kind === action.option)) return state;
      return put(action.key, { ...current, option: action.option });
    }
  }
}
