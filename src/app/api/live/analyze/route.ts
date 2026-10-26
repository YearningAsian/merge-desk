import { z } from "zod";
import type { AnalyzeEvent } from "@/core/events";
import { ModelChoice } from "@/core/models";
import { requireEnv } from "@/server/env";
import { geminiAnalyst } from "@/server/gemini/analyze";
import { readKeys } from "@/server/keys";
import { ModelChoiceError, planModel, type ModelPlan } from "@/server/llm/client";
import { openRepo } from "@/server/github/access";
import { BaseBranchError, readPull } from "@/server/github/prs";
import { analyzePipeline, signAnalysis } from "@/server/pipeline/analyze";
import { liveRunner, usesSandbox } from "@/server/runner";
import { guardLive } from "@/server/session";
import { admitLiveWork } from "@/server/throttle";

export const runtime = "nodejs";
export const maxDuration = 240;

const DEADLINE_MS = 210_000;
// The model is optional and must be a Settings choice (Gemini, or a provider
// whose key the signed-in person saved).
const Body = z.object({
  repo: z.string().max(200),
  pr: z.number().int().positive(),
  model: ModelChoice.optional(),
});

const refuse = (status: number, error: string) =>
  Response.json({ error }, { status, headers: { "cache-control": "no-store" } });

// Reads both sides of a conflicting pull request and streams the analysis
// as newline-delimited JSON. The final event carries the analysis signed for
// this user, repository, pull request and exact head and base commits.
export async function POST(request: Request) {
  const guard = await guardLive(request, { mutating: true });
  if (!guard.ok) return guard.response;
  const body = Body.safeParse(await request.json().catch(() => null));
  if (!body.success)
    return refuse(400, "Send the repository and pull request number (and a known model).");
  const repo = body.data.repo;

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
    const admission = await admitLiveWork({ login: guard.login, signal: request.signal });
    if (!admission.ok) return refuse(admission.status, admission.reason);
  }

  // Push access to this repository, asked of GitHub before anything is read.
  // contents:read for the base branch's ref (readPull reads its tip).
  const access = await openRepo(guard, repo, { pull_requests: "read", contents: "read" });
  if (!access.ok) return refuse(access.status, access.error);
  const octokit = access.octokit;

  let pull;
  try {
    pull = await readPull(octokit, repo, body.data.pr);
  } catch (error) {
    if (error instanceof BaseBranchError) return refuse(409, error.message);
    const status = (error as { status?: number }).status;
    return status === 404
      ? refuse(404, `Pull request #${body.data.pr} wasn't found.`)
      : refuse(503, "GitHub isn't reachable right now. Try again.");
  }
  if (pull.data.state !== "open") return refuse(409, "This pull request is closed.");
  if (pull.summary.fork) return refuse(409, "Pull requests from forks aren't supported.");

  const secret = requireEnv("SESSION_SECRET");
  const client = plan();
  const controller = new AbortController();
  const deadline = setTimeout(() => controller.abort(), DEADLINE_MS);
  request.signal.addEventListener("abort", () => controller.abort(), { once: true });

  const events = analyzePipeline({
    runner: liveRunner(repo, controller.signal, { login: guard.login }),
    analyst: geminiAnalyst(client),
    model: client.model,
    signal: controller.signal,
    repo,
    pr: pull.summary.number,
    revisions: { head: pull.summary.head.sha, base: pull.summary.base.sha },
    branches: { ours: pull.summary.head.ref, theirs: pull.summary.base.ref },
  });

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(sink) {
      const started = Date.now();
      let ended = false;
      const send = (event: AnalyzeEvent) => {
        if ("type" in event) ended = true;
        sink.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      };
      const stop = (reason: string) =>
        send({ t: Date.now() - started, type: "analysis", ok: false, reason });
      try {
        for await (const event of events) {
          if (controller.signal.aborted) break;
          if ("type" in event && event.ok)
            send({ ...event, token: signAnalysis(event.analysis, { user: guard.login, secret }) });
          else send(event);
        }
        if (!ended) stop(`Stopped after ${DEADLINE_MS / 1000} s. Nothing was changed.`);
      } catch {
        if (!ended) stop("The analysis stopped unexpectedly. Nothing was changed.");
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
