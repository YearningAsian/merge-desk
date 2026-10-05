# Implementation detail (verification slices per PLAN row)

> Companion to [../PLAN.md](../PLAN.md); row numbers match. The app is not runnable yet; every checkbox below is planned work.
> Build behavior from the approved [PRD](../devpost/prd.md) and [spec](../devpost/spec.md). One PR per row when possible. Failing test first for rules and irreversible transitions.
> Side-effect PRs need a clean adversarial round (different model) before merge.

**Goal:** a visible merge proposal that lands only after parsing, a deterministic check against the selected option and actual tests pass. These checks do not prove semantic correctness.

**Architecture:**

- Next.js App Router serves UI and API routes on Vercel. Verified versions, compatibility holds and library responsibilities live in [stack.md](stack.md) and [adr/0001-stack.md](adr/0001-stack.md).
- Public demo mode loads repository recordings. Learner-only live mode uses GitHub App authorization and an iron-session sealed cookie; every live route checks login and repository allowlists.
- Gemini proposes structured data through the official Google SDK's Interactions API (`store: false`); Zod validates inputs, model responses, stream events and recordings.
- Vercel Sandbox prepares the merge with trusted dependencies; deny-all networking is set before any candidate code, including parsing and tests, executes. Changed manifests or lockfiles hold until a trusted snapshot is prepared. A local runner is a trusted manual recording fallback only, unavailable on the public deployment and without cloud network isolation.
- Live requests have a 210-second overall deadline under a 240-second function duration; each sandbox is capped at 120 seconds and tests at 30 seconds. Retries and cleanup share the overall deadline.
- Signed analysis and run results live in browser memory; GitHub holds one decision comment per pull request. No database, native app or background queue is required.
- Land creates a merge commit on the original pull request's head branch, with unchanged-head/base and file/branch guards. It never writes to the base or force-pushes.

**Allowed result status words:** PROPOSED | HELD | VERIFYING | VERIFIED | LANDED | REFUSED | UNKNOWN. Step states remain queued, running, passed, failed and not run.

## Review focus for this project

1. Replaying or double-submitting Land cannot apply an effect twice; a changed head or base refuses the result.
2. A model, GitHub or sandbox timeout never reports success; failed or incomplete checks hold the merge.
3. Model output cannot choose paths, commands or permissions outside the validated contract. Workflow changes, fork heads and protected/base branches are refused.
4. Server credentials never reach the browser, logs or test sandbox. Demo replay cannot call a live mutation.
5. Live routes require session, origin/CSRF protection and repository allowlists. Tagged Sandbox accounting gates a non-atomic usage throttle; refuse work if accounting fails. Verify account quotas/pause settings without promising a strict daily run or dollar cap.
6. Drop evidence matches the chosen option; branch and commit references remain recoverable. A deterministic line match is never described as proof of semantic correctness.

### Row 1.2: Scaffold and UI foundations

- [ ] Scaffold the versions and compatibility holds in `docs/stack.md`; commit the lockfile and declare Node requirements.
- [ ] Add only the owned shadcn/ui components needed by the approved flow, Radix primitives, Lucide icons, TanStack Query for pull request data and Pierre Diffs for read-only views.
- [ ] Apply `docs/design/BRAND.md`: system fonts, neutral surfaces, compact desktop layout, comfortable phone actions and at most 150 ms state transitions with reduced-motion support.
- [ ] Configure lint, typecheck, unit tests and build; keep `playground/` separate from the app's checks as the spec requires.

### Row 1.3: Env contract + health/stats/judge

**Files:** `src/server/env.ts`, `tests/env.test.ts`, `src/app/api/{health,stats}/route.ts`, `src/app/judge/page.tsx`, `.env.example`

- [ ] Describe integration requirements without logging secrets; missing allowlist variables must never widen access.
- [ ] `/api/health` reports booleans for the stated integration checks; `/api/stats` returns FACTS. Health copy distinguishes configuration from successful live verification.
- [ ] `/judge` points to labelled recorded scenarios; demo startup needs no credentials.

### Row 1.6: GitHub, Gemini and runner smoke checks

**Files:** `src/server/github/**`, `src/server/gemini/**`, `src/server/runner/**`, `tests/{github,llm,runner}.live.test.ts`

- [ ] Live tests skip when credentials are absent and never print tokens or private keys.
- [ ] Verify installation-token access to this repository and decision-comment calls; use only disposable test refs for any write check.
- [ ] Make one Gemini Interactions request with `store: false`; validate the actual structured response against the shared schema.
- [ ] Prepare a real seeded conflict in Sandbox; set deny-all before candidate code, then run parsing and the selected tests. Verify disposal on success, failure and detected disconnect.
- [ ] Prepare dependency snapshots only from trusted revisions and reviewed installation policy; key reuse by image, manifests, lockfile and policy. Dependency changes hold instead of running candidate install scripts online.
- [ ] Measure the test step, sandbox and whole request against their separate deadlines. Verify complete paginated usage accounting and actual provider quotas/pause settings; list/count races and delayed spend checks remain documented limits.

### Row 2.1: Pure domain rules

**Files:** `src/core/**`, `tests/*.test.ts`

- [ ] Test allowed statuses and illegal transitions without I/O.
- [ ] Cover combine, keep-ours and keep-theirs: required lines, dropped-side leakage, consistent renames, unchanged regions and ambiguous evidence that holds the run.
- [ ] Test parse failure, test failure and not-run checks; none can unlock Land. Show the precise evidence and limitation of each check.

### Row 2.2: Signed state and decision records

- [ ] Validate and sign analysis/run envelopes; reject tampering, expired results and results bound to a different user, repository, pull request, head/base revisions or choice.
- [ ] Keep one marked GitHub comment per pull request; record actor, option, reason and check results for holds, lands, drops and discards.
- [ ] Record dropped branch names and commit IDs; never delete those refs or commits.

### Rows 2.3-2.4: API + desk flow

- [ ] Implement analyze, run, land and discard contracts from the spec. Failed mutations return a plain reason; ambiguous external outcomes return UNKNOWN.
- [ ] Stream schema-valid NDJSON events to the live source; recorded source replays the same event shape without live mutations.
- [ ] Verify stale-head/base guards and fast-forward-only PR-head updates; base/default branches, forks and workflow-file changes must be refused before writes. Mutations never retry Land automatically or optimistically show VERIFIED/LANDED.
- [ ] Playwright covers public held/verified/drop recordings, reset, stale revisions, the signed-out live state, keyboard navigation, sheet focus management, confirmation cancellation and reduced motion. Axe scans representative sheet/result states; manually review keyboard and screen-reader behavior. Check phone and desktop layouts.
- [ ] Keep logs collapsed and code read-only; a held result offers another option, steer-and-retry, discard and patch download.

### Row 2.5: Working checkpoint and recordings

- [ ] Follow PRD build priority: held, verified, chosen drop, options, then remaining behavior.
- [ ] Run actual live held and verified cases twice; capture the chosen-drop path with recovery references.
- [ ] Capture real events and output into `demo/recordings/*.json`; `npm run recordings:check` validates every recording in CI. No fabricated pass results.

### Row 2.6: Deploy + probe

- [ ] Dedicated Vercel project, host environment contract and production GitHub App callback configured.
- [ ] `probe.yml` repository variables: `PROBE_BASE_URLS`, `PROBE_REQUIRE` (exactly the claimed integrations), `PROBE_BRAND`.
- [ ] After deploy, inspect `/api/health` and walk `/judge`; run a meaningful live verification with the learner account before claiming live support.

### Row 2.8: FACTS

- [ ] A script writes measured numbers into `docs/FACTS.json`; its command goes in `provenance`.
- [ ] `tests/facts.test.ts` verifies the claims contract. Publish only actual measurements.

Replay evaluation, CLI merge driver and native app work remain deferred by the PRD. Do not add their implementation slices until they become authorized current work.
