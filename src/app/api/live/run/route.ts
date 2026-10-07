import { z } from "zod";
import type { Analysis, RunEvent } from "@/core/events";
import { ModelChoice } from "@/core/models";
import { OptionKind } from "@/core/options";
import type { RunCheck, RunRecord } from "@/core/run";
import { CODE_ALLOWED_REPOS, requireEnv } from "@/server/env";
import { readKeys } from "@/server/keys";
import { ModelChoiceError, planModel, type ModelPlan } from "@/server/llm/client";
import { geminiProposer } from "@/server/gemini/propose";
import { installationOctokit } from "@/server/github/app";
import { readPull } from "@/server/github/prs";
import { verifyAnalysis } from "@/server/pipeline/analyze";
import { runPipeline, signLandableRun } from "@/server/pipeline/run";
import { liveRunner, usesSandbox } from "@/server/runner";
import type { AppliedProposal } from "@/server/runner/types";
import { guardLive } from "@/server/session";
import { admitLiveWork } from "@/server/throttle";

export const runtime = "nodejs";
export const maxDuration = 240;

const REPO = CODE_ALLOWED_REPOS[0];
const DEADLINE_MS = 210_000;

// The browser sends back the analysis this server signed, the option chosen
// on it, and optionally a one-line steer and a model from the Settings list.
const Body = z.object({
  pr: z.number().int().positive(),
  token: z.string().min(1).max(2_000_000),
  option: OptionKind,
  steer: z.string().trim().max(200).optional(),
  model: ModelChoice.optional(),
});

const refuse = (status: number, error: string) =>
  Response.json({ error }, { status, headers: { "cache-control": "no-store" } });

// Runs the chosen option on a scratch copy and streams every step as
// newline-delimited JSON. The pull request is re-read first: if its head or
// base moved since the analysis, nothing runs. The final event is HELD or
// VERIFIED with the run signed for Land. Nothing here writes to GitHub, and
// nothing is retried by the browser.
export async function POST(request: Request) {
  const guard = await guardLive(request, { mutating: true });
  if (!guard.ok) return guard.response;
  const body = Body.safeParse(await request.json().catch(() => null));
  if (!body.success) return refuse(400, "Send the signed analysis and the option to run.");
  const secret = requireEnv("SESSION_SECRET");

  let analysis: Analysis;
  try {
    analysis = verifyAnalysis(
      body.data.token,
      { user: guard.login, repo: REPO, pr: body.data.pr },
      { secret },
    );
  } catch {
    return refuse(
      403,
      "This analysis can't be used: it expired or belongs elsewhere. Analyze again.",
    );
  }
  const chosen = analysis.options.find((option) => option.kind === body.data.option);
  if (!chosen) return refuse(400, "That option wasn't offered for this analysis.");

  // Before any sandbox boots: a choice that needs a key nobody saved stops here.
  let plan: ModelPlan;
  try {
    plan = planModel(body.data.model, await readKeys(request.headers.get("cookie"), guard));
  } catch (error) {
    if (error instanceof ModelChoiceError) return refuse(400, error.message);
    throw error;
  }

  // Every live analysis or run boots a sandbox; the day's count gates it.
  if (usesSandbox()) {
    const admission = await admitLiveWork({ signal: request.signal });
    if (!admission.ok) return refuse(admission.status, admission.reason);
  }

  let octokit;
  try {
    // contents:read for the base branch's ref (readPull reads its tip).
    octokit = await installationOctokit(REPO, { pull_requests: "read", contents: "read" });
  } catch (error) {
    return (error as { status?: number }).status === 404
      ? refuse(503, "GitHub can't see the repository: is the Merge Desk app installed on it?")
      : refuse(503, "GitHub isn't reachable right now. Try again.");
  }

  const client = plan();
  const controller = new AbortController();
  const deadline = setTimeout(() => controller.abort(), DEADLINE_MS);
  request.signal.addEventListener("abort", () => controller.abort(), { once: true });
  const { revisions } = analysis;
  let applied: AppliedProposal | undefined;

  const events = runPipeline({
    runner: liveRunner(REPO, controller.signal),
    proposer: geminiProposer(client, analysis),
    signal: controller.signal,
    revisions,
    option: chosen.kind,
    intents: analysis.intents,
    conflictedPaths: analysis.files.map((file) => file.path),
    steer: body.data.steer || undefined,
    onApplied: (value) => {
      applied = value;
    },
    checkRevisions: async () => {
      try {
        const pull = await readPull(octokit, REPO, body.data.pr);
        if (pull.data.state !== "open") return { ok: false, detail: "The pull request is closed." };
        const same =
          pull.summary.head.sha === revisions.head && pull.summary.base.sha === revisions.base;
        return same
          ? {
              ok: true,
              detail: `head ${revisions.head.slice(0, 7)} · base ${revisions.base.slice(0, 7)}`,
            }
          : { ok: false, detail: "The pull request changed since the analysis. Analyze again." };
      } catch {
        return { ok: false, detail: "Couldn't re-read the pull request from GitHub." };
      }
    },
  });

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(sink) {
      const started = Date.now();
      const checks = new Map<RunCheck["step"], RunCheck>();
      let ended = false;
      const send = (event: RunEvent) => {
        if ("type" in event) ended = true;
        sink.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      };
      // A stop the pipeline didn't reach is a hold, never a pass.
      const stop = (reason: string) =>
        send({
          t: Date.now() - started,
          type: "result",
          verdict: "HELD",
          failed: [],
          summary: [reason],
        });
      try {
        for await (const event of events) {
          if (controller.signal.aborted) break;
          if (!("type" in event)) {
            checks.set(event.step, {
              step: event.step,
              state: event.state,
              ...(event.detail ? { detail: event.detail } : {}),
            });
            send(event);
            continue;
          }
          const record: RunRecord = {
            v: 1,
            repo: REPO,
            pr: body.data.pr,
            verdict: event.verdict,
            option: chosen.kind,
            drops: chosen.drops,
            revisions,
            tree: applied?.tree ?? null,
            changes: applied?.changes ?? null,
            changesNote: applied ? applied.changesNote : "the merge was never written",
            description: event.description ?? null,
            reason: chosen.reason,
            summary: event.summary,
            checks: [...checks.values()],
            analysisModel: analysis.model,
            proposeModel: client.model,
            steer: body.data.steer || null,
            finishedAt: new Date().toISOString(),
          };
          send({ ...event, token: signLandableRun(record, { user: guard.login, secret }) });
        }
        if (!ended) stop(`Stopped after ${DEADLINE_MS / 1000} s. Nothing was pushed.`);
      } catch {
        if (!ended) stop("The run stopped unexpectedly. Nothing was pushed.");
      } finally {
        clearTimeout(deadline);
        sink.close();
      }
    },
    cancel() {
      controller.abort();
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "application/x-ndjson; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });
}
