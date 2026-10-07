import { ExternalLink } from "lucide-react";
import type { PullSummary } from "@/core/pulls";
import { Button } from "@/ui/primitives/button";

// File conflicts describe the tree. Merge readiness also depends on checks,
// reviews, repository rules and the viewer's authority. Never equate them.
// In demo mode this is the snapshot taken when the run was recorded.
export function PrStatus({
  pull,
  repo,
  recorded = false,
}: {
  pull: PullSummary;
  repo: string;
  recorded?: boolean;
}) {
  const readiness = pull.readiness?.checkedHead === pull.head.sha ? pull.readiness : undefined;
  const conflicts = { mergeable: "None", conflicting: "Present", checking: "Checking" }[
    pull.mergeable
  ];
  const merge = readiness
    ? {
        ready: "GitHub reports ready",
        blocked: "BLOCKED",
        checking: "Checking",
        unknown: "UNKNOWN",
      }[readiness.state]
    : "UNKNOWN";
  return (
    <section
      aria-label={recorded ? "GitHub snapshot when recorded" : "Current GitHub snapshot"}
      className="mb-4 space-y-3 border-y border-hair py-3 text-[13px]"
    >
      {recorded ? (
        <p className="text-[12.5px] text-muted">
          GitHub snapshot when this run was recorded. The pull request may have changed since.
        </p>
      ) : null}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
        <p>
          File conflicts: <strong>{conflicts}</strong>
        </p>
        <p>
          Merge readiness: <strong>{merge}</strong>
        </p>
        <Button
          asChild
          variant={pull.mergeable === "mergeable" ? "primary" : "outline"}
          className="h-11 md:ml-auto md:h-9"
        >
          <a href={pull.url} target="_blank" rel="noreferrer">
            {recorded ? "Open on GitHub" : "Review and merge on GitHub"}{" "}
            <ExternalLink aria-hidden className="size-3.5" />
          </a>
        </Button>
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-[12px]">
        <a
          href={`https://github.com/${pull.head.repo ?? repo}/commit/${pull.head.sha}`}
          target="_blank"
          rel="noreferrer"
          className="text-ours-text hover:underline"
        >
          Head {pull.head.sha.slice(0, 7)}
        </a>
        <a
          href={`https://github.com/${repo}/commit/${pull.base.sha}`}
          target="_blank"
          rel="noreferrer"
          className="text-theirs-text hover:underline"
        >
          Base {pull.base.sha.slice(0, 7)}
        </a>
      </div>
      {readiness?.reasons.length ? (
        <ul className="list-disc space-y-1 pl-4 text-muted">
          {readiness.reasons.map((reason) => (
            <li key={reason}>{reason}</li>
          ))}
        </ul>
      ) : null}
      {!readiness ? (
        <div className="space-y-1 text-muted">
          <p>Checks: UNKNOWN.</p>
          <p>
            Current checks, branch rules and merge permission were not verified. Review GitHub
            before merging.
          </p>
        </div>
      ) : null}
      {readiness ? (
        <div className="space-y-1 text-muted">
          <p>
            Checks: <span className="font-medium">{readiness.checks.state.toUpperCase()}</span>.
            Snapshot {new Date(readiness.checks.observedAt).toLocaleString()}.
          </p>
          {readiness.checks.items.length ? (
            <ul className="space-y-1">
              {readiness.checks.items.map((check, i) => (
                <li key={`${check.name}:${i}`} className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-[11.5px]">{check.state.toUpperCase()}</span>
                  {check.url ? (
                    <a
                      href={check.url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-ink hover:underline"
                    >
                      {check.name}
                    </a>
                  ) : (
                    <span>{check.name}</span>
                  )}
                </li>
              ))}
            </ul>
          ) : null}
          <p>
            GitHub rechecks rules and your merge permission when you merge. Merge Desk only lands on
            the PR branch.
          </p>
          <p>
            Check snapshots can be cached for up to 10 minutes. Open GitHub for the latest checks.
          </p>
        </div>
      ) : null}
    </section>
  );
}
