import { z } from "zod";
import type { AnalyzeEvent } from "@/core/events";
import { ModelId } from "@/core/models";
import { CODE_ALLOWED_REPOS, requireEnv } from "@/server/env";
import { geminiAnalyst } from "@/server/gemini/analyze";
import { GeminiClient } from "@/server/gemini/client";
import { installationOctokit } from "@/server/github/app";
import { readPull } from "@/server/github/prs";
import { analyzePipeline, signAnalysis } from "@/server/pipeline/analyze";
import { liveRunner } from "@/server/runner";
import { guardLive } from "@/server/session";

export const runtime = "nodejs";
export const maxDuration = 240;

const REPO = CODE_ALLOWED_REPOS[0];
const DEADLINE_MS = 210_000;
// The model is optional and must be one of the Settings choices.
const Body = z.object({ pr: z.number().int().positive(), model: ModelId.optional() });

const refuse = (status: number, error: string) =>
  Response.json({ error }, { status, headers: { "cache-control": "no-store" } });

// Reads both sides of a conflicting pull request and streams the analysis
// as newline-delimited JSON. The final event carries the analysis signed for
// this user, repository, pull request and exact head and base commits.
export async function POST(request: Request) {
  const guard = await guardLive(request, { mutating: true });
  if (!guard.ok) return guard.response;
  const body = Body.safeParse(await request.json().catch(() => null));
  if (!body.success) return refuse(400, "Send the pull request number (and a known model).");

  // A 404 here means the App has no installation on the repository (signing
  // in doesn't install it), not a missing pull request, so it is asked apart.
  let octokit;
  try {
    octokit = await installationOctokit(REPO, { pull_requests: "read" });
  } catch (error) {
    const status = (error as { status?: number }).status;
    return status === 404
      ? refuse(503, "GitHub can't see the repository: is the Merge Desk app installed on it?")
      : refuse(503, "GitHub isn't reachable right now. Try again.");
  }
  let pull;
  try {
    pull = await readPull(octokit, REPO, body.data.pr);
  } catch (error) {
    const status = (error as { status?: number }).status;
    return status === 404
      ? refuse(404, `Pull request #${body.data.pr} wasn't found.`)
      : refuse(503, "GitHub isn't reachable right now. Try again.");
  }
  if (pull.data.state !== "open") return refuse(409, "This pull request is closed.");
  if (pull.summary.fork) return refuse(409, "Pull requests from forks aren't supported.");

  const secret = requireEnv("SESSION_SECRET");
  const client = GeminiClient.fromEnv(process.env, body.data.model);
  const controller = new AbortController();
  const deadline = setTimeout(() => controller.abort(), DEADLINE_MS);
  request.signal.addEventListener("abort", () => controller.abort(), { once: true });

  const events = analyzePipeline({
    runner: liveRunner(REPO, controller.signal),
    analyst: geminiAnalyst(client),
    model: client.model,
    repo: REPO,
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
