---
doc: spec
status: approved
---

# Merge Desk — Technical Spec

## How This Works, In Plain Language

Merge Desk is one website with two ways in, and everything lives in **one repository**: `YearningAsian/merge-desk`.

- **Demo mode** (anyone, no sign-in) plays back recordings of real runs. The recordings are plain files saved in this repository, so the demo is fast, free, and cannot break or write anything.
- **Live mode** (only YearningAsian, after "Sign in with GitHub") does the real thing, only on `merge-desk`.

Inside `merge-desk`, the three demo conflicts are real pull requests on clearly labelled **demo branches** (`demo/...`). They target a separate branch, `demo/base`, never `main`, so nothing in the demo can reach the real project. The dogfood moment uses two real feature branches of this build.

When you open a conflicting pull request in live mode, the website asks GitHub for it, then starts a **sandbox**: a throwaway Linux computer in the cloud that exists only for this run. The sandbox downloads the repository, does the real `git merge`, and finds the conflicts. Merge Desk sends the conflicting code to **Gemini** (Google's model), which describes what each side meant and suggests options with a recommendation. When you pick one, a fresh sandbox writes Gemini's proposed merge, then three checks run:

1. **It parses:** the code is still valid code.
2. **Your choice was honored:** a small program (not the AI) compares the result line by line with each side's changes. For *combine both*, every change from both sides must be there. For a *drop*, only the dropped side's changes may be missing.
3. **The tests pass:** the right test suite runs in the sandbox with the internet switched off, because tests execute code from the pull request.

Each step streams to your screen as it happens. If all three pass, **Land** asks GitHub to add a merge commit on top of the pull request's own branch, but only if nobody pushed since the run started. It never touches `main` and never overwrites history. If anything fails, the merge is **held**: nothing is pushed, and you can download the attempt as a patch. Every decision is written into **one comment** on the pull request, updated in place. The sandbox is destroyed after every run, pass or fail.

**Why this shape:** no database to run (GitHub holds the record, the repository holds the recordings, a sealed cookie holds your session). The AI only ever proposes; git, the line-by-line check and the tests decide. Demo and live mode share every screen; only the data source differs.

## The Core Journey Through the System

PRD ref: `prd.md > The Core Journey`.

1. **Open Merge Desk** → `/live` checks your session cookie (or `/demo` needs none) → the server lists open pull requests on `merge-desk` via the GitHub API → the list shows conflicting ones first.
2. **Select a conflicting pull request** → the browser calls `POST /api/live/analyze` → the server re-reads the pull request and records the **start head commit** → a sandbox clones the repository at that commit and runs `git merge` with the base branch → conflicted files come back with their three versions (base, ours, theirs) and commit details → sandbox destroyed → the server computes each side's changes (deterministic) and asks Gemini for one-line intents and options (structured JSON, validated) → the browser shows **Analysis**.
3. **See the options** → shown from the same analysis: each option with what it keeps, drops and whose work; one Recommended with its reason.
4. **Choose and confirm** → drops need the inline confirm (Cmd/Ctrl+Enter or hold) → the browser calls `POST /api/live/run` with the signed analysis and the chosen option.
5. **Watch the agent** → the server streams steps: re-check the head commit is unchanged → Gemini proposes the merged files and a one-line description → a fresh sandbox clones at the start head, merges, writes the proposal, commits locally → parse check → choice-honored check → tests with network off → sandbox destroyed → result.
6. **Verified** → result card with the description and diff → **Land** (`POST /api/live/land`) → server re-runs the Land guards → creates the merge commit through the GitHub API and moves the branch forward only (refused if it moved) → the pull request shows as mergeable.
   **Held** → result card with the failed check, what was tried, the diff and a **Download patch** button → pick another option, steer and retry, or discard.
7. **Recorded** → the server updates the pull request's single Merge Desk comment with the entry.

In demo mode, steps 2 to 7 come from a recording file played back with its original timings; no request leaves the browser except to load the file.

## Stack

Versions verified against the npm registry and official pages on 2026-10-04 (workspace `STACK.md` Update Check Protocol).

| Piece | Version | Why | Docs |
|---|---|---|---|
| Node.js | 24 LTS (24.21.0) | Workspace standard; sandbox images ship Node 24 | https://nodejs.org/en/about/previous-releases |
| Next.js (App Router) | 16.3.x | Workspace standard; streaming route handlers; one-click Vercel deploy | https://nextjs.org/docs |
| React | 19.3.x | Comes with Next | https://react.dev |
| TypeScript | 6.0.x | **Not 7.0:** the ESLint TypeScript plugin supports `<6.1` | https://www.typescriptlang.org/docs/ |
| Tailwind CSS | 4.3.x | Workspace standard; fast dense styling | https://tailwindcss.com/docs |
| Zod | 4.6.x | Validates every model response and request body; makes the JSON schema sent to Gemini | https://zod.dev |
| `@google/genai` | 2.27.x | Official Gemini SDK, structured output | https://ai.google.dev/gemini-api/docs |
| Gemini model | `gemini-3.8-flash` | Latest stable Flash on the official models page; fast and cheap per call | https://ai.google.dev/gemini-api/docs/models |
| `@vercel/sandbox` | 3.5.x | Throwaway microVM per run; network policy; auth via Vercel OIDC | https://vercel.com/docs/vercel-sandbox |
| `@octokit/rest` + `@octokit/auth-app` | 22.x + latest | GitHub REST calls; GitHub App installation tokens | https://docs.github.com/en/rest |
| `diff` | 9.x | Line diffs for the diff view and the choice-honored check | https://github.com/kpdecker/jsdiff |
| Vitest | 5.0.x | Unit tests (core logic) | https://vitest.dev |
| Playwright | 1.63.x | End-to-end on demo mode; stills | https://playwright.dev |
| ESLint | 9.39.x | Workspace hold at 9 for Next projects | https://eslint.org/docs |

**Verify early in the build:** Gemini structured output (`responseJsonSchema`) on `gemini-3.8-flash`; Vercel Sandbox pricing and the plan's spend controls; the Vercel function maximum duration on this plan; `@octokit/auth-app` current major; that GitHub rejects workflow-file changes from the app on the Git Data API path (see *Land guards*).

## Where It Runs and How Someone Tries It

- **Hosting:** Vercel (learner has an account). Production URL decided at first deploy; it goes into the GitHub App's callback list.
- **Judges and visitors:** open `/demo` (or `/judge`, a short itinerary through the three demo pull requests). No sign-in, no keys, nothing written. The screen says **"Demo: recorded from a real run"** with **Reset**.
- **Live mode:** `/live`, "Sign in with GitHub", YearningAsian only. Phone and desktop.
- **Local:**
  - `npm ci && npm run dev`: demo mode works with no keys.
  - Live mode locally: fill `.env.local` (see *Configuration*), `npm run dev`. Sandbox auth comes from `vercel env pull` (OIDC token, about 12 hours).
  - **Fallback runner:** `npm run live:local` runs the same pipeline with the **local runner** (a temporary folder and local `git`/`npm` on the laptop) instead of the sandbox. Same code, different runner.
- **Required submission recording:** the video shows live mode on the phone and desktop, on `merge-desk`'s demo pull requests and on a real conflict between two of its own feature branches: one held merge, one verified merge landing.
- **Required repository:** this public repository, with `devpost/`, run instructions and `.env.example`. The README and the Devpost page say what judges can try themselves (demo mode), that the video shows live mode, and that pull requests labelled `demo` are seeded conflicts that never target `main`.

## Look and Feel

From `prd.md > Look and Feel`; no new design discovery.

- **Type:** system fonts only. `-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui` for text; `ui-monospace, "SF Mono", Menlo, Consolas` for code and states. No web fonts to load.
- **Density:** Linear/Xcode spacing. 13 to 14 px base, about 32 px list rows, 8 px radii, hairline borders. One primary action per view.
- **Color:** neutral surfaces; **ours blue `#2f6fed`**, **theirs orange `#d9711f`**; status colors ok `#1f8a4c`, stop `#c93c3c`, wait `#9a7d14`. Every status also shows its word. Diffs use GitHub-style green/red line washes.
- **Step list:** Vercel-style rows with state badges (queued, running, passed, failed, not run) and a collapsed raw log.
- **Motion:** state changes only, 150 ms or less, honoring reduced motion. No typing effects, no sparkle, no blur or translucency anywhere near code.
- **Land button** reads **"Land: push merge commit to `<branch>`"** with the line **"Does not merge into main"** (or the pull request's actual base) under it.
- **Demo pull requests** carry a `DEMO` badge in the list.
- **Phone:** one column; the detail opens as a full-height sheet; actions pinned at the bottom; hold-to-confirm with a visible progress ring (no haptics on the web).
- **Copy tone:** plain, short, factual. Never "safe" or "correct"; say what was checked.

## Components

### Mode and data source
Implements `prd.md > Demo mode and live mode`.
The desk UI takes a **data source** with one interface (`listPullRequests`, `analyze`, `run`, `land`, `discard`). `LiveSource` calls the API routes and reads their event streams. `RecordedSource` loads `demo/recordings/*.json` and replays events with their recorded timings. This is the only difference between modes. A `ModeBanner` shows "Demo: recorded from a real run" plus Reset in demo mode, and the signed-in account in live mode.

### Desk layout
Implements `prd.md > Screens and Layout`, `prd.md > Phone`.
`Desk` renders the left pull request list and the right detail (header, Analysis, Options, Run, Result) on one screen. Sections collapse and expand; the one needing attention is open. Below 768 px it becomes one column and the detail opens in a `Sheet`.

### Pull request list
Implements `prd.md > Pull request list`, `prd.md > States and Boundaries` (no conflicts, already mergeable).
Live: `GET /api/live/prs`. Server lists open pull requests on `merge-desk` and reads each one's `mergeable_state` (`dirty` means conflicting; `null` means GitHub is still computing, shown as "Checking"). The row shows title, number, author, branches and **files changed on both sides** (from the compare API); pull requests labelled `demo` show a DEMO badge. The exact conflicting-file count replaces it after analysis. J/K or Up/Down move, Enter opens. With no conflicting pull requests it shows "No conflicts. Every open pull request can merge." Opening an already-mergeable pull request shows that nothing needs resolving. Signed out, `/live` shows only the sign-in panel (the PRD's first-use state).

### Conflict analysis
Implements `prd.md > Conflict analysis`.
`pipeline/analyze` runs: read pull request → runner prepares the merge (clone at head, fetch base, `git merge --no-commit`, read stages `:1:` `:2:` `:3:` for each conflicted file, collect commit metadata per side) → `core/atoms` computes each side's changes → `gemini/analyze` returns one-line intents per side plus options. The response is validated with Zod; the server returns the analysis **signed with HMAC** so a later run can trust its head commit, files and options without re-asking the model.

### Resolution options
Implements `prd.md > Resolution options`.
Gemini proposes two or three options of kind `combine`, `keep_ours` or `keep_theirs`, one `recommended` with a reason. `core/options` validates them and fills in, from git data rather than the model, **what each option keeps and drops: commits, files and authors**. "Older side" means the side whose latest commit is older (labelled when one side's latest commit is older by more than a day).

### Drop confirmation
Implements `prd.md > Intentional drops`.
`DropConfirm` renders inline under the chosen option: commits and files lost and their authors. If an author isn't the signed-in user, it names them ("This drops work by @teammate"). If the dropped side is the **base branch's** change, it also says: "When this pull request merges, it will undo this change on `<base>`." Confirm with Cmd/Ctrl+Enter, or `HoldToConfirm` (800 ms) on phone. Asked once per run.

### Run pipeline and runners
Implements `prd.md > Live run and checks`.
`pipeline/run` emits a fixed step list; each step moves through queued, running, passed, failed or not run:
1. **Head unchanged:** re-read the pull request; if the head moved since analysis, stop ("Pull request changed; re-run").
2. **Propose merge:** `gemini/propose` returns merged contents for the conflicted files and a one-line description (Zod-validated). An optional steer instruction from the user is included on retries.
3. **Write on scratch copy:** a fresh runner clones at the start head, merges the base, writes the proposed files, `git add`, commits locally, and returns the changed file list plus contents.
4. **It parses:** `node --check` for `.js`/`.mjs`/`.cjs`; for `.ts`/`.tsx`, a syntax-only parse with the repository's own TypeScript. Unsupported file types show **not run** and hold.
5. **Choice honored:** `core/honor` (see *Choice-honored check*).
6. **Tests:** the sandbox's **network is switched to deny-all** first; then the test suite chosen by `server/guard.ts`, with a 30-second limit:
   - every file the merge changes is under `playground/` → `node --test playground/` (no dependencies, no install);
   - otherwise → `npm run test:core` (the app's unit tests, dependencies from the snapshot).
   Output is captured and shown. If the command can't run or exceeds the limit, the step shows **not run** or failed, and the merge is held.

Automatic retries: at most two, and only on a malformed model response or a parse failure. After that it waits for the user.

**Runner interface** (`server/runner/types.ts`): `prepareMerge`, `applyProposal`, `parseCheck`, `runTests`, `dispose`.
- `SandboxRunner`: a sandbox starts either from a git clone or from a snapshot, so dependencies work in two stages:
  - **Dependency snapshot (once per lockfile):** `Sandbox.create({ source: { type: "git", url } })`, `npm ci`, then `snapshot()`, remembered by lockfile hash. Runs whose changes are all under `playground/` skip it.
  - **Every run:** `Sandbox.create({ source: { type: "snapshot", snapshotId } or { type: "git", url, revision }, persistent: false, timeout: 120_000, resources: { vcpus: 2 } })`, then `git fetch` the start head and the base commit and check out the start head. If the lockfile differs from the snapshot's, `npm ci` runs as its own visible step, outside the 30-second test budget.
  - `dispose()` calls `stop()` in a `finally`, pass or fail.
- `LocalRunner`: `os.tmpdir()` working folder, local `git` and `npm` through `child_process` with the same 2-minute ceiling; folder deleted in a `finally`. No network isolation locally (documented).

### Choice-honored check
Implements `prd.md > Intentional drops`, `prd.md > Live run and checks`. Pure code in `src/core/honor.ts`; the model never grades itself.
For each conflicted file with base **B**, ours **O**, theirs **T**, result **R** (lines normalized for whitespace):
- **Each side's change:** lines added and removed relative to B, from `diff`.
- **Renames:** if a side consistently replaced one identifier with another inside its changed region (for example `fetchUser` to `getUser`), the other side's added lines are rewritten with that rename before checking.
- **Combine both:** every line either side added appears in R (after renames); no line a side removed reappears unless the other side added it.
- **Keep one side (a drop):** every line the kept side added appears in R; none of the dropped side's added lines appear in R (no leak).
- **Nothing else lost:** outside the conflict regions, R equals git's own merge result for that file.

The output names each side's intent with **present** or **MISSING**, plus the evidence lines, for example "theirs: retry on 429, MISSING (3 lines)". Ambiguous matches fail closed (held).

### Held merges
Implements `prd.md > Held merges`.
`HeldActions` shows the failed step in plain words, what was tried and its diff, then three actions in order: **pick a different option** (the options list returns with the recommendation recomputed from what failed), **steer and retry** (a one-line instruction added to the next propose call), **discard**. **Download patch** gives a `git apply`-able file of the attempt; no branch is created. Nothing is pushed.

### Landing
Implements `prd.md > Landing a merge`.
`POST /api/live/land` with the signed run result. **Land guards**, all enforced in `server/guard.ts` and `github/land.ts`, each refusing with a plain reason:
1. The session login is YearningAsian and the repository is `YearningAsian/merge-desk`.
2. The target is the pull request's **head branch**, which must live in this repository (**fork branches are refused**: "Can't land: this branch lives in a fork") and must not be `main`, the repository's default branch, or the pull request's base branch.
3. The merge must not add, change or delete anything under `.github/workflows/`. The app has no Workflows permission, so GitHub would reject it; Merge Desk holds it first ("This merge changes CI workflow files; resolve it locally or on GitHub").
4. Re-read the pull request: the head must still be the run's start head ("Pull request changed; re-run").

Then, with an installation token scoped to this repository and only the permissions the call needs: create blobs for the changed files, a tree based on the head's tree, and a **merge commit** with parents `[start head, base commit]` (author: the signed-in user's GitHub noreply address; committer: the app). Move `refs/heads/<head branch>` with `force: false`; GitHub refuses anything that isn't a fast-forward, which also catches a push between guard 4 and the update. Finally, update the decision record.

It never merges the pull request into its base and never force-pushes. A repository rule on `main` (see *Repository safeguards*) backs this up even if the code had a bug.

### Decision record
Implements `prd.md > Decision record`.
`server/github/comment.ts` keeps **one** comment per pull request, found by the marker `<!-- merge-desk:record -->` and updated in place (created only if missing). It shows a readable table plus a hidden JSON block listing entries: action (landed, dropped, held, discarded), who, when, option, the reason shown at the time, check results, and for drops the **dropped branch name and commit IDs**. Merge Desk never deletes branches or commits, so dropped work stays recoverable. Held and discarded entries update this comment only; they never push code.

### Demo scenarios inside the repository
Implements `prd.md > Demo mode and live mode`.
- **Code under test:** `playground/`, a tiny dependency-free module (`src/api.js`, `src/billing.js`) with `node:test` tests that finish in a couple of seconds. It is excluded from the app's ESLint, TypeScript and Vitest configs.
- **Branches:** `demo/base` (the demo pull requests' base) and one pair per scenario: `demo/clean/rename` + `demo/clean/retry`, `demo/held/signature` + `demo/held/caller`, `demo/drop/fix-a` + `demo/drop/fix-b`. Each scenario's first branch is merged into `demo/base`; the second stays open as the conflicting pull request.
- **Pull requests:** titled `[Demo] ...`, labelled `demo`, **base `demo/base`, never `main`**.
- **Seeds:** tags `demo-seed/<scenario>/<side>` mark the original commits, so the starting state can always be rebuilt.
- **Reset:** `npm run demo:reset` (`scripts/demo-reset.mjs`), run by a person, never by Merge Desk. It:
  - refuses to touch any ref outside `refs/heads/demo/*`; the prefix check runs before any write;
  - shows what it will change and needs `--yes`;
  - recreates the demo branches from the seed tags, then reopens or updates the three pull requests with `gh`.
  It is the only thing that rewrites branches, and only demo ones.
- **CI:** the CI workflow runs only for pull requests into `main` (`on: pull_request: branches: [main]`), so demo pull requests don't trigger it.

### Repository safeguards
- **Ruleset on `main`:** block force pushes, block deletion, and restrict updates to people with the repository **admin** role (bypass list). YearningAsian keeps pushing normally; the GitHub App, which is not on the bypass list, cannot write to `main` even by mistake. Applied with the GitHub CLI when the app first gets write access.
- **App installed only on `merge-desk`**, with no Workflows permission.
- **Code allowlists:** `ALLOWED_LOGINS = [YearningAsian]`, `ALLOWED_REPOS = [YearningAsian/merge-desk]`, checked on every live route, not only in the UI.

### Sign-in and guards
Implements `prd.md > States and Boundaries` (Permissions).
"Sign in with GitHub" uses the **GitHub App's user authorization**: `/api/auth/github` redirects to GitHub with a random `state`; `/api/auth/callback` exchanges the code, calls `GET /user`, and **refuses any login other than `YearningAsian`**. The user token is used once and discarded. The session is a sealed, HTTP-only, `SameSite=Lax` cookie holding the login and an expiry (8 hours). Every `/api/live/*` route checks the session **and** the repository allowlist.

### Engineering support
From the hackathon kit: `GET /api/health` (booleans only: GitHub App configured, Gemini configured, sandbox available, recordings present), `GET /api/stats` (`docs/FACTS.json`), `/judge`, CI (lint, typecheck, unit tests, build, em-dash check, secret scan) and a production probe.

## Data Model

| Data | Where it lives | How it changes | When you leave and come back |
|---|---|---|---|
| Session | Sealed HTTP-only cookie: `{ login, exp }` | Set at sign-in; cleared at sign-out or expiry | Still signed in for 8 hours |
| Pull request list | Fetched from GitHub on open and on window focus | Never stored | Re-fetched |
| Analysis | Returned to the browser, HMAC-signed by the server | Replaced on each analysis | Lost on reload; re-analyze (one sandbox run) |
| Run events | Streamed to the browser (newline-delimited JSON) | Appended per step | A run in progress is lost on reload; its sandbox stops at the timeout; nothing was pushed |
| Run result | In the browser; signed by the server for Land | Per run | Lost on reload |
| Decision record | One GitHub comment on the pull request | Updated in place on land, drop, hold and discard | Permanent, visible on GitHub |
| Demo recordings | `demo/recordings/*.json` in this repository | Re-captured from live runs when the flow changes | Static |
| Demo branches | `demo/*` branches, `demo-seed/*` tags | Land adds merge commits; `demo:reset` rebuilds them | Reset to the seed at any time |
| UI state (selection, open sections) | Browser memory | User actions | Reset on reload |

**Event shape** (shared by live streams and recordings): `{ t: msSinceStart, step: StepId, state: "queued" | "running" | "passed" | "failed" | "not_run", detail?: string, log?: string }`.
**Recording file:** `{ scenario, capturedAt, source: { repo, pr, headSha }, analysis, option, events[], result }`. `npm run recordings:check` validates every file against the schema in CI.

## File Structure

```text
merge-desk/
├── src/
│   ├── app/
│   │   ├── layout.tsx, globals.css   # system fonts, Tailwind tokens
│   │   ├── page.tsx                  # home: what it is; Try the demo; Sign in
│   │   ├── demo/page.tsx             # Desk + RecordedSource + "Demo: recorded" banner + Reset
│   │   ├── live/page.tsx             # Desk + LiveSource; redirects to sign-in without a session
│   │   ├── judge/page.tsx            # itinerary for judges (demo mode)
│   │   └── api/
│   │       ├── auth/github/route.ts      # start GitHub App sign-in
│   │       ├── auth/callback/route.ts    # exchange code, allowlist login, set session
│   │       ├── auth/signout/route.ts
│   │       ├── live/prs/route.ts         # GET open pull requests on merge-desk
│   │       ├── live/analyze/route.ts     # POST, streams analysis events
│   │       ├── live/run/route.ts         # POST, streams run events
│   │       ├── live/land/route.ts        # POST, Land guards + fast-forward merge commit
│   │       ├── live/record/route.ts      # POST, discard/hold entries
│   │       ├── health/route.ts
│   │       └── stats/route.ts
│   ├── core/                         # pure logic, no I/O, unit-tested
│   │   ├── events.ts                 # step ids, event + recording schemas (Zod)
│   │   ├── conflicts.ts              # three versions + conflict regions per file
│   │   ├── atoms.ts                  # each side's added/removed lines; rename detection
│   │   ├── honor.ts                  # choice-honored check
│   │   ├── options.ts                # validate model options; keeps/drops from git data; older side
│   │   └── record.ts                 # decision-record comment render/parse
│   ├── server/
│   │   ├── env.ts                    # INTEGRATIONS, requireEnv, integrationStatus
│   │   ├── session.ts                # sealed cookie
│   │   ├── guard.ts                  # allowlists, Land guards, test-suite choice
│   │   ├── sign.ts                   # HMAC sign/verify for analysis and run results
│   │   ├── github/app.ts             # app JWT, installation tokens
│   │   ├── github/prs.ts             # list, mergeability, compare, head re-check
│   │   ├── github/land.ts            # blobs, tree, merge commit, ref update (force: false)
│   │   ├── github/comment.ts         # single decision-record comment upsert
│   │   ├── gemini/client.ts          # SDK client, model id, timeouts
│   │   ├── gemini/analyze.ts         # intents + options (structured)
│   │   ├── gemini/propose.ts         # merged files + description (structured)
│   │   ├── runner/types.ts           # Runner interface
│   │   ├── runner/sandbox.ts         # Vercel Sandbox runner
│   │   ├── runner/local.ts           # laptop runner (fallback)
│   │   ├── pipeline/analyze.ts       # read → prepare → atoms → model → signed analysis
│   │   └── pipeline/run.ts           # head check → propose → write → parse → honor → tests
│   └── ui/
│       ├── Desk.tsx, PrList.tsx, Analysis.tsx, Options.tsx, DropConfirm.tsx
│       ├── RunSteps.tsx, Result.tsx, HeldActions.tsx, DiffView.tsx
│       ├── Sheet.tsx, HoldToConfirm.tsx, ModeBanner.tsx
│       └── sources/{types,live,recorded}.ts   # the only difference between modes
├── playground/                       # demo code under test; no dependencies
│   ├── package.json                  # "type": "module", "test": "node --test"
│   ├── src/api.js, src/billing.js
│   └── test/*.test.js
├── demo/recordings/                  # clean.json, held.json, drop.json (captured from live)
├── tests/                            # core unit tests; server tests with fakes; e2e on /demo
├── scripts/
│   ├── demo-reset.mjs                # rebuilds demo/* only, from demo-seed/* tags
│   ├── check-recordings.mjs
│   └── check-em-dash.py
├── devpost/                          # scope, prd, spec (+ html), checklist, app map
├── docs/                             # FACTS, pitch, brand, stack, adr
├── .github/workflows/ci.yml          # pull requests into main only
├── .env.example
└── package.json                      # dev, build, lint, typecheck, test, test:core, e2e, live:local, demo:reset, recordings:check
```

## Configuration

Server-only environment variables (`.env.example` lists names with placeholders):
`GITHUB_APP_ID`, `GITHUB_APP_CLIENT_ID`, `GITHUB_APP_CLIENT_SECRET`, `GITHUB_APP_PRIVATE_KEY`, `GEMINI_API_KEY`, `SESSION_SECRET` (32+ random bytes, also used for HMAC), `ALLOWED_LOGINS=YearningAsian`, `ALLOWED_REPOS=YearningAsian/merge-desk`, `RUNNER=sandbox|local`, `DAILY_LIVE_RUN_CAP=30`. Vercel Sandbox authenticates with the deployment's OIDC token (no key). Nothing secret is ever sent to the browser or into a sandbox. The allowlists are also defaults in code, so an empty variable can never widen access.

## External Services and Dependencies

### GitHub App (learner registers it)
Settings to enter at **GitHub → Settings → Developer settings → GitHub Apps → New GitHub App**:
- **Name:** `merge-desk-yearningasian` (must be unique on GitHub).
- **Homepage URL:** `https://github.com/YearningAsian/merge-desk`
- **Callback URLs:** `http://localhost:3000/api/auth/callback` now; add `https://<production-domain>/api/auth/callback` after the first deploy.
- **Expire user authorization tokens:** on. **Request user authorization (OAuth) during installation:** off. **Enable Device Flow:** off.
- **Webhook:** uncheck **Active** (none needed).
- **Repository permissions:** Contents **Read and write**; Pull requests **Read and write**; Metadata **Read-only** (required, set automatically). Everything else **No access**. Checks is not needed. **Workflows is deliberately not granted.** **Account permissions:** none.
- **Where can this GitHub App be installed:** **Only on this account**.
- After creating: note the **App ID** and **Client ID**, generate a **client secret** and a **private key** (`.pem`), then **Install App → Only select repositories → `merge-desk`**. Put the values in `.env.local` and Vercel env; never in chat or git.

Calls (installation token for `merge-desk`, minted per run with only the permissions the call needs):
- `GET /repos/{o}/{r}/pulls?state=open`, `GET /repos/{o}/{r}/pulls/{n}` (head, base, `mergeable_state`, labels, head repository)
- `GET /repos/{o}/{r}/compare/{base}...{head}` (files changed on both sides, commits)
- `POST /repos/{o}/{r}/git/blobs`, `POST /git/trees`, `POST /git/commits` (parents `[head, base]`), `PATCH /git/refs/heads/{branch}` with `force: false`
- `GET/POST /repos/{o}/{r}/issues/{n}/comments`, `PATCH /repos/{o}/{r}/issues/comments/{id}`
- Sign-in: `https://github.com/login/oauth/authorize`, `POST https://github.com/login/oauth/access_token`, `GET /user`
- Ruleset setup (one time, YearningAsian's own CLI auth, not the app): `POST /repos/{o}/{r}/rulesets`
Docs: https://docs.github.com/en/apps/creating-github-apps , https://docs.github.com/en/rest/git , https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets . Rate limits: installation tokens have their own hourly limit (verify the current number); this app makes tens of calls per run.

### Gemini API
`models.generateContent` with model `gemini-3.8-flash`, `responseMimeType: "application/json"` and a JSON schema made from the Zod schema; 30-second timeout per call. Two calls per run (analyze, propose); a retry adds one. Key server-side only. Cost: per-token Flash pricing (verify current price); set a budget alert or quota cap in Google AI Studio / Cloud. Docs: https://ai.google.dev/gemini-api/docs/structured-output

### Vercel Sandbox
`Sandbox.create({ source: { type: "snapshot", snapshotId } | { type: "git", url: "https://github.com/YearningAsian/merge-desk.git", revision: <start head> }, persistent: false, timeout: 120_000, resources: { vcpus: 2 } })`; `snapshot()` once per lockfile; `runCommand` for `git`, parse and tests; `sandbox.update({ networkPolicy: "deny-all" })` before tests; `stop()` in `finally`. The public repository clones without a token. Limits (Hobby): 10 concurrent, 45-minute sessions. Cost: per active CPU and memory time (verify pricing); spend cap set in the Vercel dashboard. Docs: https://vercel.com/docs/vercel-sandbox

### Spending guards
- Per run: 2-minute sandbox timeout, 30-second test limit, teardown in `finally`, at most two automatic retries.
- Per day: `DAILY_LIVE_RUN_CAP` (default 30) counted from sandboxes tagged `app=merge-desk` created today (verify `Sandbox.list` tag filtering early; if it doesn't work, count in the session cookie, since live mode has one user).
- Account level (learner): Vercel spend cap; Gemini budget alert or quota.

## Important Failure Modes

- **Sandbox slow or unavailable** → the step fails with "Sandbox didn't start: <reason>", nothing is pushed, Retry is offered. For recording day: `npm run live:local` uses the laptop runner.
- **Model returns something invalid or unexpected** (bad JSON, files outside the conflict, instructions planted in code comments) → Zod validation fails or `core/honor` fails → failed step → held. The model's output is data only and cannot unlock anything.
- **Pull request changed during review or before Land** → "Pull request changed; re-run". Land's fast-forward-only update is the final guard.
- **A Land guard trips** (fork branch, protected or base branch, CI workflow files) → Land is refused with the reason; nothing is written.
- **GitHub still computing mergeability** (`mergeable_state` null) → row shows "Checking" and refreshes.
- **Tests can't run** (missing command, over 30 s) → **not run** or failed, held. A pass is never shown without a real exit code 0.

## What Was Simplified and Why

- **One repository** instead of a separate demo repository (learner's choice): demo conflicts live on `demo/*` branches against `demo/base`, fenced off from `main` by branch naming, the reset script's prefix check and the `main` ruleset.
- **No database** instead of a run history store: GitHub holds the decision record; recordings are static files; the session is a cookie.
- **Sandbox holds no GitHub token** instead of a scoped token inside it: the repository is public, so cloning needs none, and Land pushes from the server. If it ever goes private, a read-only token is used only for the clone and removed from the remote config before tests.
- **Two sandbox boots per pull request** (analysis, then run) instead of keeping one alive between your decisions: the sandbox is torn down after every run, as agreed.
- **Files changed on both sides** in the list instead of an exact conflict count: GitHub's API doesn't report conflicting files; the exact count appears after analysis.
- **JavaScript and TypeScript only** for the parse check; other files show "not run" and hold.
- **Patch download** for held merges instead of a scratch branch: held merges push nothing.
- **No Workflows permission:** merges that touch CI workflow files are held instead of landed.
- **Single-user live mode** instead of accounts: the allowlist has one login.
- **No webhooks**: the list refreshes on open and focus.

## Decisions and Open Issues

**Learner decisions (2026-10-04):**
- Approach: Next.js on Vercel, no database, demo mode from recordings, live mode in a sandbox.
- **Cloud sandbox** for live runs, because the phone needs live mode for the video. Hard spend cap, 2-minute per-run timeout, teardown after every run. **Laptop fallback** with one command, same code.
- **GitHub App** (not an OAuth app), installed only on `merge-desk`, minimum permissions (Contents and Pull requests read and write; Checks dropped); sign-in restricted to YearningAsian. The GitHub App costs one extra secret (the private key) and `@octokit/auth-app` over an OAuth app; no fallback needed.
- **One repository:** demo pull requests live inside `merge-desk`, with safeguards (see *Demo scenarios inside the repository*, *Repository safeguards*). Dogfooding on its own feature branches, with unit tests under 30 seconds. Live mode runs only on `merge-desk`, enforced in code.
- **Held merges download as a patch;** no branch is created.
- **Safeguards:** Land checks the start head and never force-pushes; the Land button says what it does; one decision-record comment per pull request, updated in place; secrets server-side; the model proposes, git and the checks decide; recordings captured from live runs, stored in the repository, labelled on screen.

**Implementation details derived from those decisions (agent):**
- Land pushes through GitHub's Git Data API from the server with a fast-forward-only ref update, so the sandbox needs no token.
- Land guards refuse fork branches, protected or base branches, and CI workflow changes before any write.
- Demo pull requests target `demo/base`; the reset script can only touch `demo/*`; CI runs only for pull requests into `main`; a ruleset on `main` keeps the app out of it.
- Analysis and run results are HMAC-signed so the browser can't alter the head commit, files or option between steps.
- Tests run with the sandbox network set to deny-all; the suite is chosen by which files the merge changes.
- The commit author is the signed-in user; the committer is the app.

**Assumptions to confirm (flagged):**
1. **Held and discarded entries update the decision-record comment.** That is a write to GitHub, but never code.
2. **Demo scenarios:** *clean* (rename versus retry, combine both, verified); *held* (a signature change on one side and a new call site on the other: git merges the text, but the tests fail); *drop* (both sides fix the same bug differently; keep the newer fix).
3. **"Older side"** is the side whose latest commit is older (from `prd.md > Open Questions`).
4. **The dogfood conflict** is two real feature branches from this build that edit the same file.
5. **Dropping the base branch's side** is allowed with an explicit warning that merging the pull request will undo that change.
6. **The empty `merge-desk-playground` repository** created earlier is no longer used and can be deleted.

**One useful unknown:** can a cloud sandbox clone, merge and run the tests fast enough to watch? *Investigation:* the first build slice runs the *held* demo scenario through `SandboxRunner` and prints the time for each step. *Evidence needed:* the test step under 30 seconds and the whole run under 2 minutes. If not, use the dependency snapshot, fewer vCPUs or the local runner for recording.

**Open, check early in the build:** Gemini structured output on `gemini-3.8-flash`; Vercel Sandbox pricing and spend controls; the function maximum duration (runs stream for up to about 2 minutes); `Sandbox.list` tag filtering for the daily cap; that the Git Data API path rejects workflow-file changes without the Workflows permission (Merge Desk holds them first either way); the production domain for the GitHub App callback.
