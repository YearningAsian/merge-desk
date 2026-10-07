# Devpost draft: Merge Desk

> Agent draft at the learner's direction (PLAN, rules re-checked 2026-10-04: no rule restricts AI-written descriptions). Read it, change anything that doesn't sound like you, then paste.
> Numbers come from `docs/FACTS.json` (as of its `asOf`). Re-run `npm run facts` and `check_claims.py --strict` on submit day. Delete any line whose integration production `/api/health` does not report `true`.

## Project name

Merge Desk

## Elevator pitch (Devpost "tagline", 200 characters max)

AI-proposed merge conflict resolutions that land only when both sides' intent survives and the tests pass.

## Who it's for

A developer on a small team whose pull request just went red with a conflict because a teammate merged first. Instead of raw conflict markers, they see what each side meant, watch a proposed merge get checked in front of them, and land it only when the checks pass.

## Inspiration

Resolving merge conflicts is a headache. I love working with teammates but hate dealing with merge conflicts and spending lots of time trying to fix them. The research backs the feeling: in a study of 143 open source projects, 75.23% of merge conflicts needed a developer to reason about program logic, and code tied to a merge conflict was 2 times as likely to have a bug (Brindescu, Ahmed, Jensen and Sarma, Empirical Software Engineering, 2019).

AI merge tools already exist, but they write the model's answer straight into your file and leave you to check it. A merge that compiles but quietly drops your teammate's change looks exactly like a good one. I wanted a tool where the AI proposes and something I can see decides.

## What it does

1. **See the conflict as two intentions.** Open a pull request that can't merge. Each side appears as one plain-language intent ("ours renames `fetchUser`", "theirs adds a retry on 429") next to a side-by-side diff, with the commits and authors behind it.
2. **Choose how to resolve it.** Gemini reads both sides and offers options (keep ours, combine, keep theirs), each saying what it keeps, what it drops and why. Dropping someone's work needs a hold-to-confirm and stays recoverable.
3. **Watch the checks.** The proposed merge is written into a fresh cloud sandbox with its network switched off. Live on screen: it parses, a deterministic check confirms the chosen option was honored line by line, and the real tests run.
4. **HELD or VERIFIED.** If anything fails, the merge is HELD with the reason shown and nothing is pushed. You can steer the model with one line and try again, pick another option, or discard.
5. **Land.** Only a VERIFIED merge can land. Land re-checks that nobody pushed since the run, then adds the checked merge commit to the pull request's own branch (never `main`, never a force push), and every decision is recorded in one comment on the pull request.

The model never decides. Its answer is validated against a schema and then has to survive the same checks a person's merge would.

## How we built it

- **Next.js 16 and React 19 on Vercel**, with owned shadcn/Radix components, TanStack Query and Pierre Diffs for the code views. It works on a phone (full-height sheet, actions pinned within thumb reach) and on a desktop.
- **Gemini** (Google GenAI Interactions API, `gemini-3.5-flash-lite`) reads both sides and proposes the merge with structured output; every answer is validated before use.
- **Vercel Sandbox** runs each merge in a fresh microVM: clone at the exact commits, network set to deny-all before any candidate code, tests run as a separate non-root user against a read-only checkout, and the sandbox stops afterwards.
- **A GitHub App** (contents and pull requests only) reads pull requests and writes the merge commit. The branch update is atomic on the expected head, so it can only move forward.
- **Proof you can check:** `/judge` walks through three real pull requests; `/demo` replays real recorded runs with no sign-in; `/api/health` and `/api/stats` are public.
- **The app's own tests in the sandbox:** for pull requests into `main`, the sandbox restores a trusted dependency snapshot of `main` and runs the app's real unit tests; a merge that changes dependencies or brings its own `node_modules` isn't tested and is held.
- **Engineering:** CI (format, lint, types, unit tests, build, em-dash and secret scans), Playwright and axe end-to-end checks on desktop and phone, a scheduled production probe, and separate-model adversarial review rounds on every path that writes to GitHub or spends model or sandbox budget.

## What we used vs what we built

Used: Next.js, React, Tailwind, shadcn/ui and Radix, TanStack Query, Pierre Diffs, Octokit, iron-session, Zod, the Google GenAI SDK, the Vercel Sandbox SDK, Vitest, Playwright and axe. Planning followed the Devpost Learn skill pack (`devpost/scope.md`, `prd.md`, `spec.md`, `checklist.md`). Built with AI coding agents (Claude Code and Codex) under the project's own review rules. Pre-existing work incorporated: a hackathon planning kit's templates (PLAN, FACTS and review structure) and workspace agent skills. Everything in `src/`, `scripts/`, `tests/` and `demo/` was written for this project during the submission period.

## Challenges we ran into

- **The sandbox SDK reported a missing exit code as 0.** A killed test command could have looked like a pass. Merge Desk now reads the raw exit code, and a missing one means held.
- **GitHub comments have no compare-and-swap.** Two writes to the decision record could race, so writes take a lock stored as a Git ref per pull request, shared by every server. A write GitHub doesn't confirm keeps its lock for a human instead of guessing.
- **The model I planned on was overloaded.** `gemini-3.8-flash` answered 503 "high demand" to analysis-sized requests on the free tier. I measured the alternatives and moved to `gemini-3.5-flash-lite`, the most cost-effective model that answered reliably within the deadline.
- **Dogfooding found a real bug.** I pointed Merge Desk at a real conflict between two of its own pull requests. It said there was no conflict, while GitHub said there was. GitHub's `base.sha` on a pull request is the base from when it was opened, not where the base branch is now, so Merge Desk had been merging a stale base, and its "base moved since the run" guard could never fire. Every decision now reads the base branch's current tip, and the next run found the conflict.
- **Running the app's own tests in a locked-down sandbox.** Its dependencies come from a trusted snapshot of `main`, installed outside the checkout and owned by root. A review round caught that `npm run` would read a `.npmrc` or a `node_modules` folder planted in the pull request and could fake a pass, so the trusted Vitest now runs by absolute path, never through npm.
- **Gemini didn't make the mistake I wanted to demo.** In the recorded runs it never dropped a side on its own, so every recorded HELD came from the real tests. Steering the model with one line showed the deterministic check catching a missing or leaked change for real.

## Accomplishments that we're proud of

- The whole journey works on production, on a phone and a desktop: analyze, run, HELD or VERIFIED, and a real Land on a demo pull request.
- 15 recorded runs from real sandboxes and real Gemini answers: 3 VERIFIED, 12 HELD, 6 of them steered retries, and 3 real Lands (each reset afterwards). Each run took between 10.3 and 12.2 seconds from start to verdict.
- Merge Desk resolved a real conflict in its own repository: Gemini proposed combining both sides, the deterministic check confirmed both were kept, and the app's own unit test suite passed in the sandbox: VERIFIED.
- Nothing displays as success unless GitHub confirmed it: an unconfirmed write shows UNKNOWN, and a refusal says why.

## What we learned

- Where the problem really is: an AI merge is easy to produce and hard to trust. The useful part is the evidence around it, shown before anything lands.
- Building with agents works best with rules they can't talk their way around: numbers only from a measured file, claims only for what production health reports, and a different model reviewing anything that writes.

## What's next

- Many repositories and any GitHub user (live mode is limited to my account and this repository on purpose).
- A git merge driver for the terminal that shares the same checks.
- A replay test over real historical merges to measure how often an unchecked AI merge drops an intent.

## Try it

- Live: https://merge-desk-swart.vercel.app (judges: start at `/judge`; `/demo` needs no sign-in)
- Code: https://github.com/YearningAsian/merge-desk
- Health: `curl https://merge-desk-swart.vercel.app/api/health`
- Video: TODO after upload (under 3 minutes)

## Built with

nextjs, react, typescript, tailwindcss, gemini, vercel, vercel-sandbox, github-api, octokit, zod, vitest, playwright
