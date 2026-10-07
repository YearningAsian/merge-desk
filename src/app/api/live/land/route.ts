import { z } from "zod";
import type { RunRecord } from "@/core/run";
import { CODE_ALLOWED_REPOS, requireEnv } from "@/server/env";
import { appIdentity, installationOctokit, splitRepo } from "@/server/github/app";
import { upsertRecord } from "@/server/github/comment";
import { LandError, landMerge } from "@/server/github/land";
import { readPull } from "@/server/github/prs";
import { withDeadline } from "@/server/deadline";
import { checkLand } from "@/server/guard";
import { verifyRun } from "@/server/pipeline/run";
import { recordSeal } from "@/server/sign";
import { deskLink, entryFor } from "@/server/record";
import { guardLive } from "@/server/session";
import { keepAlive } from "@/server/keep-alive";

export const runtime = "nodejs";
// The answer comes by REQUEST_MS; the function lives on (keepAlive) while a
// record write already sent finishes under its own budget and its lock is
// released: 55 s + lock wait + RECORD_BUDGET_MS + release, inside 120 s.
export const maxDuration = 120;

const REPO = CODE_ALLOWED_REPOS[0];
const Body = z.object({ pr: z.number().int().positive(), token: z.string().min(1).max(4_000_000) });

type Outcome = "LANDED" | "REFUSED" | "UNKNOWN";
const answer = (status: number, outcome: Outcome, body: Record<string, unknown>) =>
  Response.json({ outcome, ...body }, { status, headers: { "cache-control": "no-store" } });
const refused = (status: number, reason: string) => answer(status, "REFUSED", { reason });

// Budget for the optional work after the branch moved, before the answer.
const AFTER_LAND_MS = 15_000;
const REQUEST_MS = 55_000;
const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
type Progress = { attempted: boolean; commit?: string; branch?: string };

export async function POST(request: Request) {
  const controller = new AbortController();
  const signal = AbortSignal.any([controller.signal, request.signal]);
  const started = Date.now();
  const progress: Progress = { attempted: false };
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<Response>((resolve) => {
    timer = setTimeout(() => {
      controller.abort();
      if (progress.commit)
        resolve(
          answer(200, "LANDED", {
            commit: progress.commit,
            branch: progress.branch,
            mergeable: "checking",
            record: {
              ok: false,
              reason: "The record update was not confirmed before the request deadline.",
            },
          }),
        );
      else if (progress.attempted)
        resolve(
          answer(502, "UNKNOWN", {
            reason:
              "GitHub didn't confirm the branch update before the request deadline. Check the pull request before trying again.",
          }),
        );
      else resolve(refused(503, "Land stopped before the branch update. Nothing was pushed."));
    }, REQUEST_MS);
  });
  const work = performLand(request, signal, progress, started);
  keepAlive(work); // its tail may still be releasing the record lock
  try {
    return await Promise.race([work, timeout]);
  } finally {
    clearTimeout(timer);
    controller.abort(); // No optional background task may initiate a late write.
  }
}

// Lands a verified run on the pull request's own branch, then records it.
// Every refusal says why; anything GitHub doesn't confirm is UNKNOWN, never
// LANDED. Never retried by the browser.
async function performLand(
  request: Request,
  signal: AbortSignal,
  progress: Progress,
  started: number,
) {
  const guard = await guardLive(request, { mutating: true });
  if (!guard.ok) return guard.response;
  const body = Body.safeParse(await request.json().catch(() => null));
  if (!body.success) return refused(400, "Send the signed run to land.");
  const { pr, token } = body.data;

  let run: RunRecord;
  try {
    run = verifyRun(
      token,
      { user: guard.login, repo: REPO, pr },
      { secret: requireEnv("SESSION_SECRET") },
    );
  } catch {
    return refused(
      403,
      "This run can't land: it expired (15 minutes) or belongs elsewhere. Run it again.",
    );
  }

  let octokit;
  let pull;
  let defaultBranch: string;
  let repositoryId: string;
  try {
    signal.throwIfAborted();
    octokit = await installationOctokit(REPO, { contents: "write", pull_requests: "write" });
    const { owner, name } = splitRepo(REPO);
    signal.throwIfAborted();
    const repository = (await octokit.repos.get({ owner, repo: name, request: { signal } })).data;
    defaultBranch = repository.default_branch;
    repositoryId = repository.node_id;
    pull = await readPull(octokit, REPO, pr);
    signal.throwIfAborted();
  } catch {
    return refused(503, "GitHub isn't reachable right now. Nothing was pushed.");
  }

  const check = checkLand({
    login: guard.login,
    repo: REPO,
    defaultBranch,
    pull: { state: pull.data.state, head: pull.summary.head, base: pull.summary.base },
    record: run,
  });
  if (!check.ok) return refused(409, check.reason);

  const refs = { head: pull.summary.head.ref, base: pull.summary.base.ref };
  progress.branch = refs.head;
  let commit: string;
  try {
    const [user, app] = await Promise.all([
      octokit.users.getByUsername({ username: guard.login, request: { signal } }),
      appIdentity(),
    ]);
    signal.throwIfAborted();
    ({ commit } = await landMerge(octokit, {
      repo: REPO,
      repositoryId,
      record: run,
      refs,
      login: guard.login,
      author: {
        name: guard.login,
        email: `${user.data.id}+${guard.login}@users.noreply.github.com`,
      },
      committer: { name: app.botName, email: app.botEmail },
      signal,
      onRefUpdate: () => {
        progress.attempted = true;
      },
    }));
    progress.commit = commit;
  } catch (error) {
    if (error instanceof LandError)
      return answer(error.outcome === "UNKNOWN" ? 502 : 409, error.outcome, {
        reason: error.message,
      });
    if (progress.attempted)
      return answer(502, "UNKNOWN", {
        reason:
          "GitHub didn't confirm the branch update. Check the pull request before trying again.",
      });
    return refused(
      503,
      "GitHub refused or didn't answer before the branch moved. Nothing was pushed.",
    );
  }

  // The branch moved. Ask GitHub what it now thinks (it may still be working
  // it out) and record the decision. Neither can undo the Land, and both get
  // a time budget, so the LANDED answer always arrives before the function's
  // limit (a timeout here must never read as UNKNOWN).
  const afterLand = async () => {
    let mergeable: "mergeable" | "conflicting" | "checking" = "checking";
    for (let attempt = 0; attempt < 5; attempt += 1) {
      try {
        signal.throwIfAborted();
        const after = await readPull(octokit, REPO, pr);
        // Right after the push GitHub can still answer for the old head.
        if (after.summary.head.sha === commit && after.summary.mergeable !== "checking") {
          mergeable = after.summary.mergeable;
          break;
        }
      } catch {
        break;
      }
      await pause(1_000);
    }
    let record: { ok: boolean; reason?: string };
    try {
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
          action: run.drops ? "dropped" : "landed",
          who: guard.login,
          refs,
          commit,
        }),
      });
      record = result.ok ? { ok: true } : { ok: false, reason: result.reason };
    } catch {
      record = {
        ok: false,
        reason: "The record update wasn't confirmed. Check the pull request before trying again.",
      };
    }
    return { mergeable, record };
  };
  const tail = afterLand();
  keepAlive(tail);
  const { mergeable, record } = await withDeadline(
    tail,
    Math.max(0, Math.min(AFTER_LAND_MS, REQUEST_MS - (Date.now() - started))),
    {
      mergeable: "checking" as const,
      record: {
        ok: false,
        reason: "the record update took too long; it may still appear on the pull request",
      },
    },
  );

  return answer(200, "LANDED", { commit, branch: refs.head, mergeable, record });
}
