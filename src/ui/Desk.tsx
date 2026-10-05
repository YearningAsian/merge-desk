"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { GitMerge } from "lucide-react";
import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import type { RunEvent } from "@/core/events";
import type { Option } from "@/core/honor";
import type { PullSummary } from "@/core/pulls";
import { useMediaQuery } from "@/ui/hooks/useMediaQuery";
import { PrDetail } from "@/ui/PrDetail";
import { PrList, type RowState } from "@/ui/PrList";
import { Button } from "@/ui/primitives/button";
import { Kbd } from "@/ui/primitives/kbd";
import { Sheet, SheetContent, SheetTitle } from "@/ui/primitives/sheet";
import { Skeleton } from "@/ui/primitives/skeleton";
import { loadAnalyses, saveAnalyses } from "@/ui/cache";
import { chosenModel, openOverlay, shortcutTarget, useSettings } from "@/ui/settings";
import type { DataSource, LandOutcome } from "@/ui/sources/types";
import { LandAction, LandResult, RecordSection, type LandState } from "@/ui/Land";
import { RunSection } from "@/ui/Run";
import {
  analysisKey,
  deskReducer,
  initialDesk,
  runKey,
  type AnalysisState,
  type DeskState,
  type RunState,
} from "@/ui/state";

// The one screen: pull requests on the left, the open one on the right.
// Below 768 px the list is the home view and the detail opens as a
// full-height sheet. Opening a conflicting pull request starts its analysis
// once per exact head and base (unless Settings turns that off). The list
// re-reads on a timer while the tab is visible (30 s unless Settings says
// otherwise), so new commits mark an analysis out of date without a reload.
// Finished analyses come back after a reload of the tab (see ui/cache).

const keyOf = (pull: PullSummary) => analysisKey(pull.number, pull.head.sha, pull.base.sha);

const without = <T,>(map: Record<string, T>, key: string) => {
  const next = { ...map };
  delete next[key];
  return next;
};

// Restored on the client only; the first render shows the list skeleton
// either way, so the server and browser agree.
const restore = (): DeskState => ({
  ...initialDesk,
  analyses: typeof window === "undefined" ? {} : loadAnalyses(),
});

// The open pull request lives in the address (?pr=N), so a reload, a
// bookmark or a link from GitHub lands on it again. Only the number goes in,
// and it is only opened if it is in the list.
function linkTo(pr: number | null) {
  const url = new URL(window.location.href);
  if (pr === null) url.searchParams.delete("pr");
  else url.searchParams.set("pr", String(pr));
  window.history.replaceState(window.history.state, "", url);
}

function ListSkeleton() {
  return (
    <div aria-hidden className="space-y-4 px-4 py-4">
      {[0, 1, 2].map((key) => (
        <div key={key} className="space-y-2">
          <Skeleton className="h-4 w-11/12" />
          <Skeleton className="h-3 w-3/5" />
        </div>
      ))}
    </div>
  );
}

export function Desk({ source, repo }: { source: DataSource; repo: string }) {
  const settings = useSettings();
  const query = useQuery({
    queryKey: [source.mode, repo, "pulls"],
    queryFn: ({ signal }) => source.listPullRequests(signal),
    refetchInterval: settings.refreshSeconds ? settings.refreshSeconds * 1000 : false,
    refetchIntervalInBackground: false,
  });
  const [state, dispatch] = useReducer(deskReducer, undefined, restore);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const queryClient = useQueryClient();
  // Land per run; the confirmed landing per pull request (it outlives the
  // analysis, whose head it just moved); whether each hold was recorded.
  const [lands, setLands] = useState<Record<string, LandState>>({});
  const [landed, setLanded] = useState<Record<number, Extract<LandOutcome, { outcome: "LANDED" }>>>(
    {},
  );
  const [recorded, setRecorded] = useState<Record<string, { ok: boolean; reason?: string }>>({});
  // Record updates for one pull request go one at a time from this tab (the
  // server also serializes and reads back), so a quick discard after an
  // automatic hold record can't race it.
  const recordQueue = useRef(new Map<number, Promise<unknown>>());
  const queueRecord = useCallback(<T,>(pr: number, work: () => Promise<T>): Promise<T> => {
    const previous = recordQueue.current.get(pr) ?? Promise.resolve();
    const next = previous.then(work, work);
    recordQueue.current.set(
      pr,
      next.catch(() => undefined),
    );
    return next;
  }, []);
  const wide = useMediaQuery("(min-width: 768px)");
  const running = useRef(new Map<string, AbortController>());
  const lastOpened = useRef<number | null>(null);
  const linked = useRef(false);

  useEffect(() => {
    const controllers = running.current;
    return () => controllers.forEach((controller) => controller.abort());
  }, []);

  useEffect(() => saveAnalyses(state.analyses), [state.analyses]);

  const pulls = query.data?.pulls ?? [];
  const selected = pulls.find((pull) => pull.number === state.selected) ?? null;
  const doneOf = (pull: PullSummary) => {
    const analysis = state.analyses[keyOf(pull)];
    return analysis?.status === "done" ? analysis : null;
  };
  const runOf = (pull: PullSummary): RunState | undefined => {
    const done = doneOf(pull);
    return done ? state.runs[runKey(keyOf(pull), done.option)] : undefined;
  };
  const selectedDone = selected ? doneOf(selected) : null;
  const selectedRun = selected ? runOf(selected) : undefined;
  const selectedRunKey =
    selected && selectedDone ? runKey(keyOf(selected), selectedDone.option) : null;
  const selectedLand = selectedRunKey ? lands[selectedRunKey] : undefined;
  const selectedRecorded = selectedRunKey ? recorded[selectedRunKey] : undefined;

  const analyze = useCallback(
    async (pull: PullSummary) => {
      const key = keyOf(pull);
      running.current.get(key)?.abort();
      const controller = new AbortController();
      running.current.set(key, controller);
      dispatch({ type: "analysis/start", key });
      try {
        const model = chosenModel(settings);
        for await (const event of source.analyze(pull.number, controller.signal, model))
          dispatch({ type: "analysis/event", key, event });
        dispatch({ type: "analysis/error", key, reason: "The analysis ended without a result." });
      } catch (error) {
        if (!controller.signal.aborted)
          dispatch({
            type: "analysis/error",
            key,
            reason: error instanceof Error ? error.message : "The analysis failed.",
          });
      } finally {
        if (running.current.get(key) === controller) running.current.delete(key);
      }
    },
    [source, settings],
  );

  // Runs the chosen option on the analysis the server signed. Never retried
  // automatically; a cancel or a dropped connection ends it as not pushed.
  const run = useCallback(
    async (pull: PullSummary, done: Extract<AnalysisState, { status: "done" }>, steer?: string) => {
      if (!done.token) return;
      const key = runKey(keyOf(pull), done.option);
      running.current.get(key)?.abort();
      const controller = new AbortController();
      running.current.set(key, controller);
      // A new attempt starts clean: no Land outcome or record note from the last one.
      setLands((map) => without(map, key));
      setRecorded((map) => without(map, key));
      dispatch({ type: "run/start", key, steer: steer ?? null });
      try {
        const events = source.run(
          {
            pr: pull.number,
            token: done.token,
            option: done.option,
            ...(steer ? { steer } : {}),
            ...(chosenModel(settings) ? { model: chosenModel(settings) } : {}),
          },
          controller.signal,
        );
        let last: RunEvent | undefined;
        for await (const event of events) {
          last = event;
          dispatch({ type: "run/event", key, event });
        }
        // A hold is recorded on the pull request as soon as it happens.
        if (last && "type" in last && last.verdict === "HELD" && last.token)
          void queueRecord(pull.number, () => source.record(pull.number, last.token!, "held")).then(
            () => {
              setRecorded((map) => ({ ...map, [key]: { ok: true } }));
              void queryClient.invalidateQueries({
                queryKey: [source.mode, "record", pull.number],
              });
            },
            (error: unknown) =>
              setRecorded((map) => ({
                ...map,
                [key]: { ok: false, reason: error instanceof Error ? error.message : undefined },
              })),
          );
        dispatch({
          type: "run/error",
          key,
          reason: "The run ended without a verdict. Nothing was pushed.",
        });
      } catch (error) {
        dispatch({
          type: "run/error",
          key,
          reason: controller.signal.aborted
            ? "Cancelled. Nothing was pushed."
            : `${error instanceof Error ? error.message : "The run failed."} Nothing was pushed.`,
        });
      } finally {
        if (running.current.get(key) === controller) running.current.delete(key);
      }
    },
    [source, settings, queryClient, queueRecord],
  );

  // One deliberate click; never retried. The list and the record refresh
  // afterwards whatever the outcome, since GitHub is the source of truth.
  const land = async (pull: PullSummary, key: string, token: string) => {
    setLands((map) => ({ ...map, [key]: { status: "landing" } }));
    const outcome = await source.land(pull.number, token);
    setLands((map) => ({ ...map, [key]: outcome }));
    if (outcome.outcome === "LANDED") setLanded((map) => ({ ...map, [pull.number]: outcome }));
    void queryClient.invalidateQueries({ queryKey: [source.mode, repo, "pulls"] });
    void queryClient.invalidateQueries({ queryKey: [source.mode, "record", pull.number] });
  };

  const discard = (pull: PullSummary, key: string, current: RunState | undefined) => {
    if (current?.status === "done" && current.result.token)
      void queueRecord(pull.number, () =>
        source.record(pull.number, current.result.token!, "discarded"),
      ).then(
        () => queryClient.invalidateQueries({ queryKey: [source.mode, "record", pull.number] }),
        () => undefined,
      );
    setLands((map) => without(map, key));
    setRecorded((map) => without(map, key));
    dispatch({ type: "run/discard", key });
  };

  const cancelRun = (pull: PullSummary) => {
    const done = doneOf(pull);
    if (done) running.current.get(runKey(keyOf(pull), done.option))?.abort();
  };

  // The tab title carries the open pull request's run, so a run can be
  // watched from another tab.
  const runWord =
    selectedRun?.status === "running"
      ? "Running"
      : selectedRun?.status === "done"
        ? selectedRun.result.verdict
        : null;
  useEffect(() => {
    const base = "Live mode | Merge Desk";
    document.title = runWord && selected ? `${runWord} #${selected.number} | Merge Desk` : base;
    return () => {
      document.title = base;
    };
  }, [runWord, selected]);

  const open = (number: number) => {
    lastOpened.current = number;
    linkTo(number);
    dispatch({ type: "select", pr: number });
    const pull = pulls.find((item) => item.number === number);
    if (pull && pull.mergeable === "conflicting" && !pull.fork && !state.analyses[keyOf(pull)]) {
      const earlier = Object.keys(state.analyses).some((key) => key.startsWith(`${number}:`));
      if (!earlier && settings.autoAnalyze) void analyze(pull);
    }
  };

  // Once, when the first list arrives: open the pull request in the address.
  useEffect(() => {
    if (linked.current || !query.data) return;
    linked.current = true;
    const pr = Number(new URLSearchParams(window.location.search).get("pr"));
    if (query.data.pulls.some((pull) => pull.number === pr)) open(pr);
  });

  // Desk-wide keys (the list and the slider handle their own): A analyze
  // again, D details, O open on GitHub, R refresh, comma settings, ? help,
  // and Cmd/Ctrl+Enter to run (for a drop, that is the confirmation).
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Enter" && (event.metaKey || event.ctrlKey) && !event.altKey) {
        const target = event.target as HTMLElement | null;
        if (target?.closest("input, textarea, select, [contenteditable=true], [data-overlay]"))
          return;
        if (!selected || !selectedDone?.token || selectedRun?.status === "running") return;
        if (selectedRun?.status === "done") return;
        event.preventDefault();
        void run(selected, selectedDone);
        return;
      }
      if (!shortcutTarget(event)) return;
      const current = selected ? state.analyses[keyOf(selected)] : undefined;
      const analyzable = selected?.mergeable === "conflicting" && !selected.fork;
      if (event.key === "?") openOverlay("shortcuts");
      else if (event.key === ",") openOverlay("settings");
      else if (event.key === "r") void query.refetch();
      else if (event.key === "a" && selected && analyzable && current?.status !== "running")
        void analyze(selected);
      else if (event.key === "d" && current?.status === "done") setDetailsOpen((value) => !value);
      else if (event.key === "o" && selected)
        window.open(selected.url, "_blank", "noopener,noreferrer");
      else return;
      event.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const chosen = (pull: PullSummary): Option | null => {
    const analysis = state.analyses[keyOf(pull)];
    return analysis?.status === "done" ? analysis.option : null;
  };

  const rowState = (pull: PullSummary): RowState => {
    if (pull.mergeable === "mergeable") return "mergeable";
    if (pull.mergeable === "checking") return "checking";
    const analysis = state.analyses[keyOf(pull)];
    if (!analysis) return "needs";
    const current = runOf(pull);
    if (current?.status === "running") return "run-running";
    if (current?.status === "done") return current.result.verdict === "HELD" ? "held" : "verified";
    return analysis.status === "running"
      ? "running"
      : analysis.status === "done"
        ? "analyzed"
        : "failed";
  };

  const detail = selected ? (
    <PrDetail
      pull={selected}
      titleId={`pr-title-${selected.number}`}
      analysis={state.analyses[keyOf(selected)]}
      stale={
        !state.analyses[keyOf(selected)] &&
        Object.keys(state.analyses).some((key) => key.startsWith(`${selected.number}:`))
      }
      model={chosenModel(settings)}
      detailsOpen={detailsOpen}
      onDetailsOpen={setDetailsOpen}
      onAnalyze={() => void analyze(selected)}
      onOption={(option) => dispatch({ type: "option", key: keyOf(selected), option })}
      onRefresh={() => void query.refetch()}
      runLog={
        selectedRun?.events.length
          ? selectedRun.events
              .map((event) => {
                if (!("type" in event)) return JSON.stringify(event);
                // The signed record authorizes Land; it never goes in a copied log.
                // eslint-disable-next-line @typescript-eslint/no-unused-vars
                const { token, ...rest } = event;
                return JSON.stringify(rest);
              })
              .join("\n")
          : null
      }
      run={
        selectedDone ? (
          <RunSection
            analysis={selectedDone.analysis}
            canRun={Boolean(selectedDone.token)}
            option={selectedDone.option}
            run={selectedRun}
            pr={selected.number}
            baseRef={selected.base.ref}
            onRun={(steer) => void run(selected, selectedDone, steer)}
            onCancel={() => cancelRun(selected)}
            onDiscard={() =>
              discard(selected, runKey(keyOf(selected), selectedDone.option), selectedRun)
            }
            onOption={(option) => dispatch({ type: "option", key: keyOf(selected), option })}
            pushed={
              selectedLand !== undefined &&
              "outcome" in selectedLand &&
              selectedLand.outcome === "LANDED"
            }
            landing={
              selectedRun?.status === "done" &&
              selectedRun.result.verdict === "VERIFIED" &&
              selectedRun.result.token ? (
                <>
                  <LandAction
                    branch={selected.head.ref}
                    base={selected.base.ref}
                    state={selectedLand}
                    onLand={() =>
                      void land(
                        selected,
                        runKey(keyOf(selected), selectedDone.option),
                        selectedRun.result.token!,
                      )
                    }
                  />
                  {selectedLand && "outcome" in selectedLand ? (
                    <LandResult outcome={selectedLand} repo={repo} pullUrl={selected.url} />
                  ) : null}
                </>
              ) : null
            }
            recordNote={
              selectedRecorded ? (
                <p className="text-[12.5px] text-muted">
                  {selectedRecorded.ok
                    ? "Recorded on the pull request."
                    : `Couldn't record this on the pull request: ${selectedRecorded.reason ?? "GitHub didn't answer"}.`}
                </p>
              ) : null
            }
          />
        ) : null
      }
      landed={
        landed[selected.number] && landed[selected.number]!.commit === selected.head.sha ? (
          <LandResult outcome={landed[selected.number]!} repo={repo} pullUrl={selected.url} />
        ) : null
      }
      record={
        selected.mergeable !== "mergeable" || landed[selected.number] ? (
          <RecordSection source={source} pr={selected.number} />
        ) : null
      }
    />
  ) : null;

  // One polite announcement for the open pull request's run.
  const announcement =
    selected && selectedRun
      ? selectedRun.status === "running"
        ? `Running checks for pull request ${selected.number}.`
        : selectedRun.status === "done"
          ? `Pull request ${selected.number} is ${selectedRun.result.verdict}.`
          : `The run for pull request ${selected.number} stopped. Nothing was pushed.`
      : "";

  return (
    <main
      id="main"
      tabIndex={-1}
      aria-label="Merge Desk"
      className="relative flex min-h-0 flex-1 outline-none"
    >
      <p role="status" className="sr-only">
        {announcement}
      </p>
      <div className="flex w-full min-w-0 flex-col border-hair bg-surface md:w-[360px] md:shrink-0 md:border-r">
        {query.isPending ? (
          <ListSkeleton />
        ) : query.isError ? (
          <div role="alert" className="space-y-3 px-4 py-5 text-[13px]">
            <p className="font-semibold">Couldn&apos;t load pull requests.</p>
            <p className="text-muted">{query.error.message}</p>
            <Button size="sm" onClick={() => void query.refetch()}>
              Try again
            </Button>
          </div>
        ) : (
          <PrList
            pulls={pulls}
            selected={state.selected}
            rowState={rowState}
            chosen={chosen}
            updatedAt={query.dataUpdatedAt}
            refreshing={query.isFetching}
            onRefresh={() => void query.refetch()}
            onOpen={open}
          />
        )}
      </div>

      {wide ? (
        <div className="relative min-w-0 flex-1 overflow-y-auto">
          {detail ?? (
            <div className="flex h-full flex-col items-start justify-center gap-3 px-8 text-[13px] text-muted">
              <GitMerge aria-hidden className="size-6" />
              <p className="max-w-sm">
                Open a pull request to see what each side meant and how the conflict could be
                resolved.
              </p>
              <p className="flex items-center gap-1.5">
                <Kbd>J</Kbd>
                <Kbd>K</Kbd> to move, <Kbd>Enter</Kbd> to open
              </p>
            </div>
          )}
        </div>
      ) : (
        <Sheet
          open={selected !== null}
          onOpenChange={(isOpen) => {
            if (isOpen) return;
            linkTo(null);
            dispatch({ type: "select", pr: null });
          }}
        >
          <SheetContent
            aria-describedby={undefined}
            backLabel="Pull requests"
            backName="Back to pull requests"
            onCloseAutoFocus={(event) => {
              // Back to the row that opened it, not the top of the page.
              event.preventDefault();
              document
                .querySelector<HTMLButtonElement>(`[data-pr="${lastOpened.current}"]`)
                ?.focus();
            }}
          >
            <SheetTitle asChild>
              <span className="sr-only">
                {selected ? `Pull request #${selected.number}` : "Pull request"}
              </span>
            </SheetTitle>
            <div
              data-sheet-scroll
              className="relative min-h-0 flex-1 overflow-y-auto pb-[env(safe-area-inset-bottom)]"
            >
              {detail}
            </div>
          </SheetContent>
        </Sheet>
      )}
    </main>
  );
}
