# Merge Desk

AI merges that wait for proof.

Merge Desk shows a merge conflict as two intentions side by side ("ours renames `fetchUser`", "theirs adds a retry on 429"), asks Gemini to propose a resolution, and runs visible checks before anything lands. The result must parse, pass a deterministic check against the user's chosen option, and pass the selected test suite in a sandbox. A proposal that loses a required change or fails a check is held, with the reason shown. These checks report specific evidence; they do not prove semantic correctness.

## Status

Built and verified locally: the live desk analyzes conflicts, runs proposed merges through parsing, choice-honored checks and real tests, and can Land the checked merge commit on a permitted `demo/*` PR branch. Real GitHub checks exercised Land, HELD, Discard, reset, replay refusal and signature-tamper refusal. The desk separates file conflicts from GitHub merge readiness and labels historical Land results. See [PLAN.md](PLAN.md), [devpost/checklist.md](devpost/checklist.md) and the [review record](.review/round-4-codex.md) for evidence and limits.

Production is deployed at https://merge-desk-swart.vercel.app (from `main`, deliberately: pushes never deploy it). Live mode there is sign-in only, for the allowlisted account on this repository; `/api/health` reports the GitHub App, Gemini, the sandbox credential and the daily usage throttle as configured, and a probe checks it every 30 minutes. Live work is refused once the day's sandbox count reaches `DAILY_LIVE_RUN_CAP` or when it can't be counted; that is a usage throttle, not a hard spending limit. Decision-record writes coordinate through one lock ref per pull request in this repository (`refs/merge-desk/locks/pr-<number>`), so the laptop and hosted servers share it; an unconfirmed write keeps its lock for a human to reconcile ([docs/record-reconciliation.md](docs/record-reconciliation.md)). Demo mode (`/demo`) and the judge's guide (`/judge`) are live there too, open to anyone without signing in; the submission video remains future work.

## Try the demo

Open `/demo`, or `/judge` for a short guided tour. No sign-in and no keys: the desk replays real runs recorded from the three seeded demo pull requests (#1 verified, #2 held, #6 a chosen drop), with Gemini's actual answers, the sandbox's actual checks and test output, at their original pace. Every option each analysis offered was recorded, so the slider never lands on something the demo can't play. Demo mode sends no requests and writes nothing; **Reset** starts it over. Landing and steering need live mode.

The recordings live in [`demo/recordings/`](demo/recordings) and carry no signatures, so they can't authorize anything. `npm run record` re-captures them through the same pipeline live mode uses (it needs the live configuration, and every sandbox boot counts against the daily throttle); `npm run recordings:check` validates them; `npm run facts` re-measures the demo numbers in [`docs/FACTS.json`](docs/FACTS.json), and a unit test fails if the two disagree.

## Local workflow

1. Pick a conflicting pull request on `YearningAsian/merge-desk`.
2. Read the two intents, visual diff and resolution options. Each option states what it keeps and drops; a drop needs confirmation and remains recoverable through the recorded branch and commits.
3. Watch Gemini propose a merge on a scratch copy. A fresh runner checks parsing, whether the choice was honored, and actual test output. Cloud candidate code runs with the network disabled; dependency changes hold until a trusted snapshot is prepared.
4. If every check passes, Land rechecks the reviewed head and base and adds the checked merge commit to the pull request's own permitted branch. The update atomically requires the expected head. A base change after the final read remains a documented race. Held runs push no code; retry, choose another option, discard or download the attempt as a patch.
5. Merge Desk never writes to the base branch or force-pushes. Attempts update one sealed decision comment on the pull request; a failed or unconfirmed record update is reported separately. Review checks and merge readiness, then use **Review and merge on GitHub** for the actual PR merge. The app does not merge into `main`.

The public `/demo` and `/judge` views replay recorded real runs with no sign-in or writes. `/live` uses GitHub App sign-in, accepts only the learner's account, and operates only on this repository. Seeded demo pull requests target `demo/base`, never `main`. The submission video will show real live runs, including a held result and a verified merge landing.

## Stack

Next.js App Router and React on Vercel, TypeScript and Tailwind CSS; owned shadcn/ui components with Radix primitives, Lucide icons, TanStack Query for pull request data and Pierre Diffs for read-only code views. GitHub App access uses Octokit and iron-session; Gemini uses the official Google SDK; verification uses Vercel Sandbox with a trusted manual local recording fallback. GitHub comments and repository recordings hold the durable records; no database is required.

Verified versions, compatibility holds and dependency responsibilities are in [docs/stack.md](docs/stack.md); the architecture decision is in [docs/adr/0001-stack.md](docs/adr/0001-stack.md). The interface uses system fonts, neutral surfaces, keyboard navigation and reduced-motion support.

## Run it

Use the Node version in `.nvmrc`, the npm version in `package.json`, and git. Install from the committed lockfile:

```bash
npm ci
npm run format:check
npm run lint
npm run typecheck
npm test
npm run recordings:check
npm run test:playground
npm run build
npx playwright install chromium
npm run e2e
npm run dev             # http://localhost:3000/demo needs no keys; /live needs configuration
```

Unit and browser suites use fixtures and need no service credentials. The browser suite normally builds and serves the app on port 3100; leave that port free for a fresh build. `npm run test:live` separately exercises real configured services and consumes quota.

Authenticated live mode requires the owner's GitHub App, Gemini and Sandbox configuration. Follow the [configuration contract](devpost/spec.md#configuration), keep credentials in local or host environment settings, and check presence with `npm run env:check`. The supported live account and repository remain `YearningAsian` and `YearningAsian/merge-desk`. Installing the source does not grant another account live access.

An unconfirmed decision write retains its local lock. Follow the [operator reconciliation procedure](docs/record-reconciliation.md); do not retry an ambiguous write or clear a lock before its remote outcome is settled.

### Run the gate on a seeded conflict

The `[Demo]` pull requests (label `demo`) are seeded conflicts on `demo/*` branches. They target `demo/base`, never `main`. `npm run gate` merges real branches in a temporary folder, writes a hand-written candidate merge, and checks parsing, whether the chosen option was honored, and the real tests. These manual candidate examples need no AI call; `npm run gate -- clean --ai` uses the configured Gemini client and runner.

```bash
git fetch origin "+refs/heads/demo/*:refs/heads/demo/*"
npm run gate -- clean --candidate drop-theirs   # HELD: theirs: retry on 429, MISSING
npm run gate -- clean --candidate combined      # VERIFIED
npm run gate -- held --candidate combined       # HELD: a real test fails
npm run gate -- drop --candidate keep-ours --option keep_ours   # VERIFIED, theirs dropped as chosen
```

The local runner is for trusted manual runs on your own machine; it has no network isolation. Gate runs push nothing. `npm run demo:reset -- --yes` is an operator tool, never invoked by Merge Desk; it rebuilds validated `demo/*` branches from their `demo-seed/*` tags. Resetting branches does not reopen a PR GitHub already merged. PR #3 is preserved as historical Land and GitHub-merge evidence; #1 and #2 remain the original open fixtures, and #6 reopened the drop scenario for the demo recordings.
