import Link from "next/link";
import { ArrowRight, ExternalLink } from "lucide-react";
import { STEP_LABELS, type StepEvent, type StepId } from "@/core/events";
import type { Option } from "@/core/honor";
import { OPTION_LABELS } from "@/core/options";
import { Recording, recordedAnalysis, recordedResult, type RecordedRun } from "@/core/recording";
import { GateReplay } from "@/ui/GateReplay";
import { Badge } from "@/ui/primitives/badge";
import { cn } from "@/ui/utils";
import facts from "../../docs/FACTS.json";
import clean from "../../demo/recordings/clean.json";
import held from "../../demo/recordings/held.json";
import drop from "../../demo/recordings/drop.json";

// Everything shown here comes from the recorded runs and docs/FACTS.json at
// build time, so the page can't say more than the runs did.
const recordings = [clean, held, drop].map((item) => Recording.parse(item));
const recording = recordings[0]!;
const pull = recording.pull;
const analysis = recordedAnalysis(recording);
const { metrics, demo } = facts;
const day = new Intl.DateTimeFormat("en-US", { dateStyle: "long", timeZone: "UTC" });
const capturedOn = day.format(new Date(recording.capturedAt));
const runner = recording.runner === "sandbox" ? "a Vercel Sandbox" : "a scratch copy";

const runOf = (option: Option, steered = false) =>
  recording.runs.find((run) => run.option === option && Boolean(run.steer) === steered)!;
const stepEvents = (run: RecordedRun) =>
  run.events.filter((event): event is StepEvent => "step" in event);
const finalStep = (run: RecordedRun, id: StepId) =>
  stepEvents(run).findLast((event) => event.step === id && event.state !== "running");
const short = (sha: string) => sha.slice(0, 7);

const landed = runOf("combine");
const landedResult = recordedResult(landed);
const land = landed.land!;
const recommended = analysis.options.find((option) => option.recommended);

const CHECKS = ["parse", "honor", "tests"] as const satisfies readonly StepId[];
const checksOf = (run: RecordedRun) =>
  CHECKS.map((id) => {
    const event = finalStep(run, id);
    return {
      id,
      label: STEP_LABELS[id],
      state: event?.state ?? "not_run",
      lines: (event?.detail ?? "").split("\n").filter(Boolean),
    };
  });

// Tailwind reads class names from source, so each stop spells its own.
const PICKS = [
  {
    option: "keep_ours",
    id: "pick-ours",
    stop: "Keep ours",
    show: "group-has-[#pick-ours:checked]/pick:block",
  },
  {
    option: "combine",
    id: "pick-combine",
    stop: "Combine",
    show: "group-has-[#pick-combine:checked]/pick:block",
  },
  {
    option: "keep_theirs",
    id: "pick-theirs",
    stop: "Keep theirs",
    show: "group-has-[#pick-theirs:checked]/pick:block",
  },
] as const;
const picks = PICKS.map((pick) => {
  const run = runOf(pick.option);
  return { ...pick, verdict: recordedResult(run).verdict, checks: checksOf(run) };
});

const caught = runOf("keep_ours", true);
const caughtChecks = checksOf(caught);

const DISPLAY = "text-[clamp(34px,5.2vw,80px)] leading-[1.02] font-bold tracking-[-0.03em]";
const H2 = "text-[clamp(28px,2.8vw,40px)] leading-[1.1] font-bold tracking-[-0.02em]";
const FRAME = "mx-auto w-full max-w-[1400px] px-4 sm:px-8 lg:px-12";
const PRIMARY =
  "inline-flex h-12 items-center gap-2 rounded-desk bg-ink px-5 text-[16px] font-semibold text-white transition-[background-color,transform] duration-150 hover:bg-ink/85 active:scale-[0.98]";
const LINK = "underline decoration-1 underline-offset-4 hover:decoration-2";

function Motif({ className }: { className?: string }) {
  return (
    <div aria-hidden className={cn("flex items-stretch gap-1", className)}>
      <div className="flex-1 bg-ours" />
      <div className="aspect-square h-full shrink-0 rounded-full bg-ink" />
      <div className="flex-1 bg-theirs" />
    </div>
  );
}

const TONE = {
  passed: "ok",
  failed: "stop",
  not_run: "wait",
  queued: "neutral",
  running: "wait",
} as const;

function CheckRows({ checks }: { checks: ReturnType<typeof checksOf> }) {
  return (
    <ul className="divide-y divide-hair">
      {checks.map((check) => (
        <li key={check.id} className="py-2.5">
          <div className="flex items-center gap-2">
            <span className="flex-1 text-[14px] font-medium">{check.label}</span>
            <Badge tone={TONE[check.state]}>{check.state.replace("_", " ")}</Badge>
          </div>
          {check.lines.map((line) => (
            <p key={line} className="mt-1 text-[13px] text-muted">
              {line}
            </p>
          ))}
        </li>
      ))}
    </ul>
  );
}

function Branches() {
  return (
    <p className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[13px] text-muted">
      <Badge tone="ours">ours</Badge>
      <code className="font-mono text-[12.5px] text-ours-text">{pull.head.ref}</code>
      into
      <Badge tone="theirs">theirs</Badge>
      <code className="font-mono text-[12.5px] text-theirs-text">{pull.base.ref}</code>
    </p>
  );
}

function Intents() {
  return (
    <dl className="grid gap-1.5 text-[13px]">
      <div className="rounded-[6px] bg-ours-wash px-3 py-2">
        <dt className="font-mono text-[12px] font-semibold text-ours-text">ours</dt>
        <dd>{analysis.intents.ours}</dd>
      </div>
      <div className="rounded-[6px] bg-theirs-wash px-3 py-2">
        <dt className="font-mono text-[12px] font-semibold text-theirs-text">theirs</dt>
        <dd>{analysis.intents.theirs}</dd>
      </div>
    </dl>
  );
}

export default function Home() {
  return (
    <main
      id="main"
      tabIndex={-1}
      aria-labelledby="home-title"
      className="text-[16px] leading-[1.55] outline-none"
    >
      <section className="grid gap-3 px-4 py-3 sm:px-8 lg:min-h-dvh lg:grid-cols-2 lg:px-12">
        <div className="flex flex-col overflow-hidden rounded-desk bg-surface">
          <Motif className="h-12 sm:h-14" />
          <div className="flex flex-1 flex-col justify-center gap-7 px-5 py-12 sm:px-12 lg:py-16">
            <p className="text-[20px] font-bold">Merge Desk</p>
            <h1 id="home-title" className={cn(DISPLAY, "max-w-[12ch]")}>
              AI merges that wait for proof.
            </h1>
            <p className="max-w-[40ch] text-[20px] leading-[1.45]">
              Gemini proposes how to resolve a pull request&apos;s merge conflict. Nothing lands
              until the result parses, keeps what each side chose to keep, and passes the
              repository&apos;s real tests.
            </p>
            <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
              <Link href="/demo" className={PRIMARY}>
                Try the demo <ArrowRight aria-hidden className="size-4" />
              </Link>
              <span>No account, and it writes nothing.</span>
            </div>
          </div>
          <nav
            aria-label="More ways in"
            className="flex flex-wrap gap-x-7 gap-y-2 px-5 pb-7 text-[16px] sm:px-12"
          >
            <Link href="/judge" className={LINK}>
              Judge&apos;s guide
            </Link>
            <a href="#how" className={LINK}>
              How it works
            </a>
            <Link href="/live" className={LINK}>
              Sign in
            </Link>
            <a href={demo.repoUrl} className={LINK}>
              Source
            </a>
          </nav>
        </div>

        <figure className="flex flex-col justify-center gap-4 rounded-desk bg-ink p-3 sm:p-8 lg:p-12">
          <div data-ui className="space-y-4 rounded-desk bg-surface p-4 text-ink sm:p-5">
            <div>
              <p className="text-[15px] font-semibold">
                {pull.title} <span className="font-normal text-muted">#{pull.number}</span>
              </p>
              <Branches />
            </div>
            <Intents />
            {recommended ? (
              <p className="flex flex-wrap items-center gap-2 text-[13px]">
                <span className="font-semibold">{recommended.label}</span>
                <Badge tone="outline">Recommended</Badge>
                <span className="text-muted">by Gemini ({analysis.model})</span>
              </p>
            ) : null}
            <GateReplay
              events={stepEvents(landed).map((event) => ({ ...event, log: undefined }))}
              verdictAt={landedResult.t}
              verdict={landedResult.verdict}
              after={`Landed on ${land.branch} as ${short(land.commit)}`}
            />
          </div>
          <figcaption className="text-[15px] text-white">
            A real run, recorded {capturedOn}: Gemini proposed the merge and {runner} merged it and
            ran the tests. Played back at its original pace.
          </figcaption>
        </figure>
      </section>

      <section
        aria-labelledby="pick-title"
        className="group/pick mt-24 bg-ink text-white transition-colors duration-200 has-[#pick-ours:checked]:bg-ours has-[#pick-theirs:checked]:bg-theirs has-[#pick-theirs:checked]:text-ink lg:mt-40"
      >
        <div className={cn(FRAME, "py-20 lg:py-28")}>
          <h2 id="pick-title" className={H2}>
            Pick a resolution. The gate answers.
          </h2>
          <p className="mt-4 max-w-[54ch]">
            The same conflict, each option Gemini offered, each run for real. Choose one to see what
            the checks recorded.
          </p>
          <fieldset className="mt-12 lg:mt-16">
            <legend className="sr-only">Resolution for pull request #{pull.number}</legend>
            <div className="relative grid grid-cols-3">
              <div
                aria-hidden
                className="absolute inset-x-[16.667%] top-[22px] flex h-5 overflow-hidden rounded-full border-4 border-white sm:top-[28px] sm:h-6"
              >
                <div className="flex-1 bg-ours" />
                <div className="flex-1 bg-theirs" />
              </div>
              <div
                aria-hidden
                className="absolute top-[6px] left-1/2 size-11 -translate-x-1/2 rounded-full border-4 border-white bg-ink transition-[left] duration-200 group-has-[#pick-ours:checked]/pick:left-[16.667%] group-has-[#pick-theirs:checked]/pick:left-[83.333%] sm:top-[10px] sm:size-14"
              />
              {picks.map((pick) => (
                <label
                  key={pick.id}
                  className="relative flex cursor-pointer flex-col items-center gap-2 rounded-desk pt-16 pb-2 text-center text-[clamp(20px,2.6vw,40px)] leading-tight font-medium transition-transform duration-150 select-none has-[:checked]:font-bold has-[:checked]:underline has-[:checked]:decoration-4 has-[:checked]:underline-offset-8 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-4 has-[:focus-visible]:outline-current hover:underline hover:decoration-2 hover:underline-offset-8 active:scale-[0.98] sm:pt-24"
                >
                  <input
                    type="radio"
                    name="pick"
                    id={pick.id}
                    defaultChecked={pick.option === "combine"}
                    className="sr-only"
                  />
                  {pick.stop}
                </label>
              ))}
            </div>
          </fieldset>
          {picks.map((pick) => (
            <div key={pick.id} className={cn("mt-12 hidden lg:mt-16", pick.show)}>
              <div className="grid gap-8 lg:grid-cols-12 lg:items-start">
                <p className="text-[clamp(56px,9vw,144px)] leading-none font-bold tracking-[-0.04em] lg:col-span-5">
                  {pick.verdict}
                </p>
                <div className="rounded-desk bg-surface p-4 text-ink sm:p-5 lg:col-span-7" data-ui>
                  <p className="text-[14px] font-semibold">
                    {OPTION_LABELS[pick.option]}: what the checks recorded
                  </p>
                  <CheckRows checks={pick.checks} />
                </div>
              </div>
            </div>
          ))}
          <p className="mt-10 text-[16px]">
            <Link href={`/demo?pr=${pull.number}`} className={LINK}>
              Run these yourself in the demo
            </Link>
          </p>
        </div>
      </section>

      <section
        id="how"
        aria-labelledby="how-title"
        className={cn(FRAME, "scroll-mt-6 py-28 lg:py-40")}
      >
        <div className="grid gap-x-2.5 gap-y-4 lg:grid-cols-12 lg:items-end">
          <h2
            id="how-title"
            className={cn(H2, "max-w-[16ch] lg:col-span-7 lg:row-start-1 lg:self-start")}
          >
            Proposed, checked, landed.
          </h2>

          <div className="lg:col-span-3 lg:row-start-2">
            <div className="flex flex-col justify-end rounded-desk bg-ours-wash p-3 lg:min-h-[28vh]">
              <div data-ui className="space-y-3 rounded-desk bg-surface p-3">
                <Intents />
                <ul className="space-y-1 text-[13px]">
                  {analysis.options.map((option) => (
                    <li key={option.kind} className="flex items-center gap-2">
                      {option.label}
                      {option.recommended ? <Badge tone="outline">Recommended</Badge> : null}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
            <h3 className="mt-4 text-[20px] font-semibold">Proposed</h3>
            <p className="mt-1">
              Gemini reads both branches, states what each side meant in one sentence, and offers
              ways to resolve the conflict, each naming what it keeps and what it drops.
            </p>
          </div>

          <div className="lg:col-span-4 lg:row-start-2">
            <div className="flex flex-col justify-end rounded-desk bg-stop-wash p-3 lg:min-h-[38vh]">
              <div data-ui className="space-y-2 rounded-desk bg-surface p-3">
                <p className="text-[13px]">
                  <span className="font-semibold">{OPTION_LABELS[caught.option]}</span>, steered:{" "}
                  <q>{caught.steer}</q>
                </p>
                <CheckRows checks={caughtChecks} />
                <Badge tone="stop" className="text-[13px] leading-6">
                  {recordedResult(caught).verdict}
                </Badge>
              </div>
            </div>
            <h3 className="mt-4 text-[20px] font-semibold">Checked</h3>
            <p className="mt-1">
              In a fresh sandbox with its network off, the merge has to parse, keep exactly what the
              chosen option says, and pass the real tests. This retry passed the tests and was still
              held: it brought back the retry its option had dropped.
            </p>
          </div>

          <div className="lg:col-span-5 lg:row-span-2 lg:row-start-1">
            <div className="flex flex-col justify-end rounded-desk bg-ok-wash p-3 lg:min-h-[48vh]">
              <div data-ui className="space-y-3 rounded-desk bg-surface p-4">
                <div className="flex items-center gap-2">
                  <Badge tone="ok" className="text-[13px] leading-6">
                    LANDED
                  </Badge>
                  <span className="text-[13px] text-muted">in {(land.ms / 1000).toFixed(1)} s</span>
                </div>
                <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-[13px]">
                  <dt className="text-muted">Head</dt>
                  <dd>
                    <code className="font-mono">{short(land.entry?.head ?? pull.head.sha)}</code>{" "}
                    unchanged since the run
                  </dd>
                  <dt className="text-muted">Base</dt>
                  <dd>
                    <code className="font-mono">{short(land.entry?.base ?? pull.base.sha)}</code>{" "}
                    unchanged since the run
                  </dd>
                  <dt className="text-muted">Commit</dt>
                  <dd>
                    <code className="font-mono">{short(land.commit)}</code> added to{" "}
                    <code className="font-mono text-ours-text">{land.branch}</code>
                  </dd>
                  <dt className="text-muted">Record</dt>
                  <dd>
                    {land.entry
                      ? `${land.entry.action} by ${land.entry.who}, ${OPTION_LABELS[land.entry.option]}`
                      : "written"}
                  </dd>
                </dl>
                {land.entry ? (
                  <ul className="flex flex-wrap gap-1.5" aria-label="Checks recorded with the Land">
                    {land.entry.checks.map((check) => (
                      <li key={check.step}>
                        <Badge tone={check.state === "passed" ? "ok" : "stop"}>
                          {STEP_LABELS[check.step]}
                        </Badge>
                      </li>
                    ))}
                  </ul>
                ) : null}
                {land.entry?.reason ? (
                  <p className="rounded-[6px] bg-bg px-3 py-2 text-[13px]">
                    <span className="font-semibold">Why: </span>
                    {land.entry.reason}
                  </p>
                ) : null}
              </div>
            </div>
            <h3 className="mt-4 text-[20px] font-semibold">Landed</h3>
            <p className="mt-1">
              Land rechecks that neither branch moved, then adds the merge commit to the pull
              request&apos;s own branch. Never its base, never{" "}
              <code className="font-mono">main</code>, never a force push. Every decision goes into
              one comment on the pull request.
            </p>
          </div>
        </div>
      </section>

      <section id="proof" aria-labelledby="proof-title" className={cn(FRAME, "pb-28 lg:pb-40")}>
        <div className="grid grid-cols-2 gap-1.5 lg:grid-cols-4 lg:gap-2">
          <div className="col-span-2 flex min-h-36 flex-col justify-between gap-6 rounded-desk bg-ink p-5 text-white lg:p-8">
            <h2 id="proof-title" className={H2}>
              Why merges need a gate
            </h2>
            <p className="max-w-[44ch]">
              Conflicts take reasoning, and conflicted code breaks more often. So the model only
              proposes.
            </p>
          </div>
          {[
            [metrics.studyProjects, "open source projects in the merge conflict study"],
            [
              `${metrics.studyConflictsNeedingLogicPct}%`,
              "of their conflicts needed reasoning about program logic",
            ],
            [
              `${metrics.studyBugLikelihoodMultiplier}x`,
              "as likely to have a bug, for code tied to a conflict",
            ],
            [
              metrics.demoRecordedRuns,
              "real runs recorded for the demo, Gemini and sandbox included",
            ],
            [metrics.demoRecordedHeld, "of those runs HELD, each with its reason"],
            [metrics.demoRecordedLands, "real Lands on demo pull requests, each reset afterwards"],
          ].map(([value, label]) => (
            <div
              key={String(label)}
              className="flex aspect-[3/2] flex-col justify-between rounded-desk bg-surface p-4 lg:p-6"
            >
              <p className="text-[clamp(32px,3.6vw,56px)] leading-none font-bold tracking-[-0.03em] tabular-nums">
                {value}
              </p>
              <p className="text-[15px] leading-snug lg:text-[16px]">{label}</p>
            </div>
          ))}
        </div>
        <p className="mt-6 max-w-[90ch] text-[15px]">
          Study:{" "}
          <a href="https://doi.org/10.1007/s10664-019-09735-4" className={LINK}>
            Brindescu, Ahmed, Jensen and Sarma, Empirical Software Engineering, 2019
          </a>
          . Our runs: every number comes from the recordings and is served with the command that
          measured it at{" "}
          <a href="/api/stats" className={LINK}>
            /api/stats
          </a>
          .
        </p>
      </section>

      <section aria-labelledby="open-title" className="bg-ink text-white">
        <div className={cn(FRAME, "grid gap-12 py-24 md:grid-cols-12 md:items-center lg:py-32")}>
          <div className="md:col-span-5 md:self-end">
            <h2 id="open-title" className={DISPLAY}>
              Open a conflict.
            </h2>
            <p className="mt-6 max-w-[40ch]">
              The demo replays the real runs on three pull requests, at their original pace. No
              account, and nothing is written to GitHub.
            </p>
          </div>
          <div
            data-ui
            className="rounded-desk bg-surface p-2 text-ink md:col-span-7 lg:col-span-6 lg:col-start-7"
          >
            <p className="px-3 pt-2 pb-1 text-[13px] font-medium text-muted">
              Needs resolution {recordings.length}
            </p>
            <ul>
              {recordings.map(({ pull: item }) => (
                <li key={item.number}>
                  <Link
                    href={`/demo?pr=${item.number}`}
                    className="block rounded-[6px] px-3 py-3 transition-colors duration-150 hover:bg-bg active:bg-ink/[0.06]"
                  >
                    <span className="block text-[15px] font-medium">{item.title}</span>
                    <span className="mt-1 flex flex-wrap items-center gap-1.5 text-[13px] text-muted">
                      #{item.number}
                      <code className="font-mono text-ours-text">{item.head.ref}</code>
                      into
                      <code className="font-mono text-theirs-text">{item.base.ref}</code>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
            <div className="p-3">
              <Link href="/demo" className={cn(PRIMARY, "w-full justify-center")}>
                Open the demo <ArrowRight aria-hidden className="size-4" />
              </Link>
            </div>
          </div>
        </div>
      </section>

      <footer className={cn(FRAME, "py-16 lg:py-24")}>
        <Motif className="h-[clamp(72px,16vw,220px)]" />
        <div className="mt-14 grid gap-8 text-[15px] sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <h2 className="font-semibold">Try it</h2>
            <ul className="mt-2 space-y-1.5">
              <li>
                <Link href="/demo" className={LINK}>
                  Demo
                </Link>
              </li>
              <li>
                <Link href="/judge" className={LINK}>
                  Judge&apos;s guide
                </Link>
              </li>
              <li>
                <Link href="/live" className={LINK}>
                  Live mode (owner only)
                </Link>
              </li>
            </ul>
          </div>
          <div>
            <h2 className="font-semibold">Check it</h2>
            <ul className="mt-2 space-y-1.5">
              <li>
                <a href="/api/health" className={LINK}>
                  /api/health
                </a>
              </li>
              <li>
                <a href="/api/stats" className={LINK}>
                  /api/stats
                </a>
              </li>
            </ul>
          </div>
          <div>
            <h2 className="font-semibold">Read it</h2>
            <ul className="mt-2 space-y-1.5">
              <li>
                <a href={demo.repoUrl} className={cn(LINK, "inline-flex items-center gap-1")}>
                  Source on GitHub <ExternalLink aria-hidden className="size-3.5" />
                </a>
              </li>
              <li>MIT license</li>
            </ul>
          </div>
          <div>
            <h2 className="font-semibold">Made for</h2>
            <p className="mt-2">Build With AI: Basics, on Devpost, 2026.</p>
          </div>
        </div>
        <div className="mt-14 flex flex-wrap items-center justify-between gap-4 text-[15px]">
          <p className="font-semibold">Merge Desk</p>
          <Link href="/demo" className={cn(PRIMARY, "h-11 text-[15px]")}>
            Try the demo
          </Link>
        </div>
      </footer>
    </main>
  );
}
