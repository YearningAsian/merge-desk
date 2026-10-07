import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, ExternalLink } from "lucide-react";
import { Recording, recordedAnalysis } from "@/core/recording";
import facts from "../../../docs/FACTS.json";
import clean from "../../../demo/recordings/clean.json";
import held from "../../../demo/recordings/held.json";
import drop from "../../../demo/recordings/drop.json";

export const metadata: Metadata = {
  title: "Judge's guide | Merge Desk",
  description:
    "Try Merge Desk without signing in: a held merge, a verified merge and a chosen drop.",
};

// The judge itinerary. Pull request numbers, dates and the model come from
// the recordings, and every number from docs/FACTS.json, at build time.
const [cleanRun, heldRun, dropRun] = [clean, held, drop].map((item) => Recording.parse(item));
const day = new Intl.DateTimeFormat("en-US", { dateStyle: "long", timeZone: "UTC" });
const capturedOn = day.format(new Date(heldRun!.capturedAt));
const model = recordedAnalysis(heldRun!).model;
const inSandbox = [cleanRun, heldRun, dropRun].every((item) => item!.runner === "sandbox");
const steerLine = heldRun!.runs.find((run) => run.option === "combine" && run.steer)!.steer;
const { metrics, demo } = facts;
const REPO_URL = demo.repoUrl;

const stops = [
  {
    title: "A held merge",
    recording: heldRun!,
    steps: [
      "Press Run checks on the recommended option, Combine both.",
      "Gemini's merge parses and keeps what both sides changed, but the repository's real tests fail: code outside the conflicted file still calls the old signature. The result is HELD, with the failing check and the tests' own output. Nothing is pushed, and the hold is written to the pull request's decision record.",
      `Steer and retry with the recorded line, "${steerLine}". This time Gemini's merge leaves out lines from both sides, and the choice-honored check catches it: ours and theirs MISSING, HELD again.`,
      "The other options on the slider are held too.",
    ],
  },
  {
    title: "A verified merge",
    recording: cleanRun!,
    steps: [
      "Run Combine both. It parses, both branches' changes are present, and the tests pass: VERIFIED.",
      "Press Land. This replays a real Land: the merge commit went onto the pull request's own branch, never its base, the decision record gained an entry, and GitHub then reported the pull request could merge. The branch was reset afterwards so the demo can start over.",
    ],
  },
  {
    title: "A chosen drop",
    recording: dropRun!,
    steps: [
      "Move the slider to Keep ours, drop theirs. Merge Desk names whose work is dropped and asks you to hold the button (or press Ctrl+Enter) to confirm.",
      'The run is VERIFIED with theirs "dropped as chosen". Land it, and the decision record lists the dropped commits so the work can be recovered.',
      "Gemini recommended combining here, and that verifies too: each option is checked against what it says it keeps.",
    ],
  },
];

function Code({ children }: { children: React.ReactNode }) {
  return <code className="font-mono text-[12.5px]">{children}</code>;
}

const linkStyle = "underline underline-offset-2 hover:text-ink";

// The demo opens beside the guide, so a judge can follow the steps while
// trying them. Described, not renamed, for screen readers.
const NEW_TAB = { target: "_blank", rel: "noopener", "aria-describedby": "new-tab-note" } as const;

export default function JudgePage() {
  return (
    <main
      id="main"
      tabIndex={-1}
      aria-labelledby="judge-title"
      className="mx-auto max-w-2xl space-y-10 px-4 py-12 text-[14px] leading-relaxed outline-none"
    >
      <header className="space-y-3">
        <p className="font-mono text-xs font-semibold tracking-widest text-muted uppercase">
          <Link href="/" className="hover:text-ink">
            Merge Desk
          </Link>{" "}
          · Judge&apos;s guide
        </p>
        <h1 id="judge-title" className="text-3xl font-bold tracking-tight text-balance">
          Try it without signing in
        </h1>
        <p className="text-muted">
          Merge Desk resolves a pull request&apos;s merge conflict with Gemini, then refuses to land
          the result until it parses, keeps what each side chose to keep, and passes the
          repository&apos;s real tests. The demo replays real runs on three conflicting pull
          requests. Open each one below; the analysis and every check play back at their original
          pace.
        </p>
        <Link
          href="/demo"
          {...NEW_TAB}
          className="inline-flex h-11 items-center gap-2 rounded-desk bg-ink px-4 text-[14px] font-medium text-white hover:bg-ink/90"
        >
          Open the demo <ArrowRight aria-hidden className="size-4" />
        </Link>
        <p id="new-tab-note" className="text-[12.5px] text-muted">
          Demo links open in a new tab, so this guide stays open.
        </p>
      </header>

      <ol className="space-y-8">
        {stops.map((stop, index) => (
          <li key={stop.title} className="space-y-2">
            <h2 className="flex flex-wrap items-baseline gap-x-2 text-[17px] font-semibold tracking-tight">
              <span className="font-mono text-[13px] text-muted">{index + 1}.</span>
              {stop.title}
            </h2>
            <p>
              <Link
                href={`/demo?pr=${stop.recording.source.pr}`}
                {...NEW_TAB}
                className={`inline-flex items-center gap-1 ${linkStyle}`}
              >
                {stop.recording.pull.title} <ExternalLink aria-hidden className="size-3.5" />
              </Link>{" "}
              <span className="text-muted">(#{stop.recording.source.pr})</span>
            </p>
            <ul className="list-disc space-y-1.5 pl-5 text-ink/90">
              {stop.steps.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ul>
          </li>
        ))}
        <li className="space-y-2">
          <h2 className="flex flex-wrap items-baseline gap-x-2 text-[17px] font-semibold tracking-tight">
            <span className="font-mono text-[13px] text-muted">{stops.length + 1}.</span>
            Start over
          </h2>
          <p className="text-ink/90">
            Press Reset in the demo banner. Every pull request starts again.
          </p>
        </li>
      </ol>

      <section aria-labelledby="real-title" className="space-y-3">
        <h2 id="real-title" className="text-[17px] font-semibold tracking-tight">
          What is real here
        </h2>
        <ul className="list-disc space-y-1.5 pl-5 text-ink/90">
          <li>
            Every step was recorded on {capturedOn} from real runs on these pull requests: Gemini (
            <Code>{model}</Code>) proposed each resolution, and{" "}
            {inSandbox ? "a Vercel Sandbox" : "a scratch copy on the developer's laptop"} merged the
            branches with git, applied the proposal and ran the tests with <Code>node --test</Code>.
            That is {metrics.demoRecordedRuns} recorded runs ({metrics.demoRecordedSteered} of them
            steered retries), {metrics.demoRecordedVerified} VERIFIED and {metrics.demoRecordedHeld}{" "}
            HELD, each taking {metrics.demoRunSecondsMin} to {metrics.demoRunSecondsMax} seconds
            from start to verdict.
          </li>
          <li>
            Every verified run was landed for real: {metrics.demoRecordedLands} Lands on the demo
            pull requests&apos; own branches, each recorded on the pull request and then reset so
            the conflict is back. Holds and discards were written to the same decision records.
          </li>
          <li>
            The demo itself sends no requests and writes nothing. Live mode runs the same pipeline
            on real pull requests; it accepts only the owner&apos;s GitHub account.
          </li>
          <li>
            VERIFIED means exactly those checks passed. It is evidence, not a proof that a merge is
            correct.
          </li>
        </ul>
      </section>

      <section aria-labelledby="check-title" className="space-y-3">
        <h2 id="check-title" className="text-[17px] font-semibold tracking-tight">
          Check it yourself
        </h2>
        <ul className="space-y-1.5">
          <li>
            <a href="/api/health" className={linkStyle}>
              /api/health
            </a>
            <span className="text-muted">
              : whether each integration is configured on this server
            </span>
          </li>
          <li>
            <a href="/api/stats" className={linkStyle}>
              /api/stats
            </a>
            <span className="text-muted">
              : every number above and the command that measured it
            </span>
          </li>
          <li>
            <a
              href={REPO_URL}
              target="_blank"
              rel="noreferrer"
              className={`inline-flex items-center gap-1 ${linkStyle}`}
            >
              Source on GitHub <ExternalLink aria-hidden className="size-3.5" />
            </a>
            <span className="text-muted">
              : pull requests labelled <Code>demo</Code> are seeded conflicts that target{" "}
              <Code>demo/base</Code>, never <Code>main</Code>
            </span>
          </li>
        </ul>
      </section>
    </main>
  );
}
