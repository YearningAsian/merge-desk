import { z } from "zod";
import type { RunRecord } from "@/core/run";
import { CODE_ALLOWED_REPOS, requireEnv } from "@/server/env";
import { appIdentity, installationOctokit } from "@/server/github/app";
import { readRecord, upsertRecord } from "@/server/github/comment";
import { readPull } from "@/server/github/prs";
import { verifyRun } from "@/server/pipeline/run";
import { recordSeal } from "@/server/sign";
import { deskLink, entryFor } from "@/server/record";
import { guardLive } from "@/server/session";
import { withDeadline } from "@/server/deadline";
import { keepAlive } from "@/server/keep-alive";

export const runtime = "nodejs";
export const maxDuration = 30;

const REPO = CODE_ALLOWED_REPOS[0];

const json = (status: number, body: Record<string, unknown>) =>
  Response.json(body, { status, headers: { "cache-control": "no-store" } });

// The decision record shown on the desk: read from the pull request's one
// Merge Desk comment.
export async function GET(request: Request) {
  const guard = await guardLive(request);
  if (!guard.ok) return guard.response;
  const pr = Number(new URL(request.url).searchParams.get("pr"));
  if (!Number.isInteger(pr) || pr <= 0)
    return json(400, { error: "Send the pull request number." });
  try {
    const octokit = await installationOctokit(REPO, { pull_requests: "read" });
    const app = await appIdentity();
    const seal = recordSeal(requireEnv("SESSION_SECRET"));
    const record = await readRecord(octokit, { repo: REPO, pr, appId: app.id, seal });
    return json(200, { entries: record.entries, note: record.note });
  } catch {
    return json(503, { error: "GitHub isn't reachable right now." });
  }
}

// Records a hold or a discard. Only a run this server signed for this user
// can be recorded, and a held entry needs a run that was actually held.
// Writes only the comment; never code.
const Body = z.object({
  pr: z.number().int().positive(),
  token: z.string().min(1).max(4_000_000),
  action: z.enum(["held", "discarded"]),
});

export async function POST(request: Request) {
  const controller = new AbortController();
  const signal = AbortSignal.any([controller.signal, request.signal]);
  const work = performRecord(request, signal);
  keepAlive(work); // after the deadline it may still be releasing the record lock
  try {
    return await withDeadline(
      work,
      25_000,
      json(503, {
        error: "The record update was not confirmed before the request deadline.",
      }),
    );
  } finally {
    controller.abort();
  }
}

async function performRecord(request: Request, signal: AbortSignal) {
  const guard = await guardLive(request, { mutating: true });
  if (!guard.ok) return guard.response;
  const body = Body.safeParse(await request.json().catch(() => null));
  if (!body.success) return json(400, { error: "Send the signed run and what to record." });
  const { pr, token, action } = body.data;

  let run: RunRecord;
  try {
    run = verifyRun(
      token,
      { user: guard.login, repo: REPO, pr },
      { secret: requireEnv("SESSION_SECRET") },
    );
  } catch {
    return json(403, { error: "This run can't be recorded: it expired or belongs elsewhere." });
  }
  if (action === "held" && run.verdict !== "HELD")
    return json(409, { error: "Only a held run can be recorded as held." });

  try {
    signal.throwIfAborted();
    // contents: write is for the record lock (a ref), never for code.
    const octokit = await installationOctokit(REPO, {
      contents: "write",
      pull_requests: "write",
    });
    signal.throwIfAborted();
    const pull = await readPull(octokit, REPO, pr);
    signal.throwIfAborted();
    const app = await appIdentity();
    signal.throwIfAborted();
    const result = await upsertRecord(octokit, {
      repo: REPO,
      pr,
      appId: app.id,
      deskUrl: deskLink(request, pr),
      seal: recordSeal(requireEnv("SESSION_SECRET")),
      signal,
      entry: entryFor(run, {
        action,
        who: guard.login,
        refs: { head: pull.summary.head.ref, base: pull.summary.base.ref },
      }),
    });
    return result.ok ? json(200, { entries: result.entries }) : json(409, { error: result.reason });
  } catch {
    return json(503, {
      error: "The record update wasn't confirmed. Check the pull request before trying again.",
    });
  }
}
