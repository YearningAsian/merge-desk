"use client";

import type { Analysis } from "@/core/events";
import { analysisSteps } from "@/ui/Analysis";
import { CopyButton } from "@/ui/primitives/copy-button";
import { reproduceCommands } from "@/ui/resolution";
import type { Steps as StepMap } from "@/ui/state";
import { Steps } from "@/ui/Steps";

// Folded by default: the exact commits everything here is bound to, what
// each analysis step did and how long it took (with its raw log), commands
// that recreate the same conflict in a local clone, and the latest run's
// event log to copy (its signed token left out).

const seconds = (ms: number) => (ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`);

function Heading({ children }: { children: React.ReactNode }) {
  return <h4 className="text-[12px] font-semibold text-muted">{children}</h4>;
}

export function DevDetails({
  analysis,
  steps,
  runLog,
}: {
  analysis: Analysis;
  steps: StepMap;
  runLog?: string | null;
}) {
  const { head, base } = analysis.revisions;
  const commands = reproduceCommands(analysis.revisions);
  const total = Math.max(0, ...Object.values(steps).map((step) => step?.t ?? 0));
  return (
    <div className="space-y-5 text-[13px]">
      <div>
        <Heading>Bound to these commits</Heading>
        <p className="mt-1 text-muted">
          The options, and any run made from them, use exactly these commits. If either branch
          moves, the desk asks for a fresh analysis.
        </p>
        <dl className="mt-2 grid grid-cols-[auto_minmax(0,1fr)] items-baseline gap-x-3 gap-y-1 font-mono text-[12px]">
          <dt className="font-semibold text-ours-text">ours</dt>
          <dd className="min-w-0">
            <CopyButton text={head} label="Copy ours commit ID" className="text-left break-all">
              {head}
            </CopyButton>
          </dd>
          <dt className="font-semibold text-theirs-text">theirs</dt>
          <dd className="min-w-0">
            <CopyButton text={base} label="Copy theirs commit ID" className="text-left break-all">
              {base}
            </CopyButton>
          </dd>
        </dl>
      </div>

      <div>
        <Heading>
          Analysis steps <span className="font-mono font-normal">{seconds(total)}</span>
        </Heading>
        <Steps label="Analysis steps" steps={analysisSteps(steps)} />
      </div>

      {runLog ? (
        <div className="flex items-center gap-2">
          <Heading>Run log</Heading>
          <span className="text-[12px] text-muted">
            every event of the latest run, as JSON lines
          </span>
          <CopyButton text={runLog} label="Copy run log" className="ml-auto text-[12px] text-muted">
            Copy
          </CopyButton>
        </div>
      ) : null}

      {commands ? (
        <div>
          <div className="flex items-center gap-2">
            <Heading>Reproduce locally</Heading>
            <CopyButton
              text={commands}
              label="Copy commands"
              className="ml-auto text-[12px] text-muted"
            >
              Copy
            </CopyButton>
          </div>
          <pre className="mt-1.5 rounded-[6px] border border-hair bg-bg p-3 font-mono text-[12px] leading-relaxed break-all whitespace-pre-wrap">
            {commands}
          </pre>
        </div>
      ) : null}
    </div>
  );
}
