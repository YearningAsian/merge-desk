# Merge Desk

AI merges that wait for proof.

Merge Desk shows a merge conflict as two intentions side by side ("ours renames `fetchUser`", "theirs adds a retry on 429"), asks Gemini to propose a resolution, and runs visible checks before anything lands. The result must parse, pass a deterministic check against the user's chosen option, and pass the selected test suite in a sandbox. A proposal that loses a required change or fails a check is held, with the reason shown. These checks report specific evidence; they do not prove semantic correctness.

## Status

Building. What runs today: the checks themselves, on a laptop, against three seeded demo conflicts in this repository. There is no web desk, AI call or deployment yet. See [PLAN.md](PLAN.md) for the live status board, [devpost/checklist.md](devpost/checklist.md) for the build order and [devpost/spec.md](devpost/spec.md) for the technical blueprint.

## How it will work

1. Pick a conflicting pull request on `YearningAsian/merge-desk`.
2. Read the two intents, visual diff and resolution options. Each option states what it keeps and drops; a drop needs confirmation and remains recoverable through the recorded branch and commits.
3. Watch Gemini propose a merge on a scratch copy. A fresh runner checks parsing, whether the choice was honored, and actual test output. Cloud candidate code runs with the network disabled; dependency changes hold until a trusted snapshot is prepared.
4. If every check passes, Land adds the checked merge commit to the pull request's own head branch, provided the reviewed head and base commits have not changed. Held runs push no code; retry, choose another option, discard or download the attempt as a patch.
5. Merge Desk never writes to the base branch or force-pushes. Every decision is recorded in one comment on the pull request.

The planned public `/demo` and `/judge` views replay recorded real runs with no sign-in or writes. `/live` uses GitHub App sign-in, accepts only the learner's account, and operates only on this repository. Seeded demo pull requests target `demo/base`, never `main`. The submission video will show real live runs, including a held result and a verified merge landing.

## Planned stack

Next.js App Router and React on Vercel, TypeScript and Tailwind CSS; owned shadcn/ui components with Radix primitives, Lucide icons, TanStack Query for pull request data and Pierre Diffs for read-only code views. GitHub App access uses Octokit and iron-session; Gemini uses the official Google SDK; verification uses Vercel Sandbox with a trusted manual local recording fallback. GitHub comments and repository recordings hold the durable records; no database is required.

Verified versions, compatibility holds and dependency responsibilities are in [docs/stack.md](docs/stack.md); the architecture decision is in [docs/adr/0001-stack.md](docs/adr/0001-stack.md). The interface uses system fonts, neutral surfaces, keyboard navigation and reduced-motion support.

## Run it

Requires Node.js 24 or newer and git.

```bash
npm ci
npm test                 # unit tests for the checks, the branch guard and the local runner
npm run test:playground  # the demo code's own test suite
npm run dev              # http://localhost:3000 (home page and /api/health only, for now)
```

### Run the gate on a seeded conflict

The `[Demo]` pull requests (label `demo`) are seeded conflicts on `demo/*` branches. They target `demo/base`, never `main`. `npm run gate` merges a pull request's real branches in a temporary folder, writes a hand-written candidate merge (no AI yet), and runs the three checks: it parses, the chosen option was honored, and the real tests pass.

```bash
git fetch origin "+refs/heads/demo/*:refs/heads/demo/*"
npm run gate -- clean --candidate drop-theirs   # HELD: theirs: retry on 429, MISSING
npm run gate -- clean --candidate combined      # VERIFIED
npm run gate -- held --candidate combined       # HELD: a real test fails
npm run gate -- drop --candidate keep-ours --option keep_ours   # VERIFIED, theirs dropped as chosen
```

The local runner is for trusted manual runs on your own machine; it has no network isolation. Nothing is pushed. `npm run demo:reset` (a person runs it, never Merge Desk) rebuilds the demo branches from their `demo-seed/*` tags and can only touch `demo/*` branches.
