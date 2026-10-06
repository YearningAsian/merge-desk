# PLAN: living status dashboard

> Single source of truth for who is working on what. Row numbers match the zero-to-ship phases (0 Ideate ... 5 Submit).
> Update on every task change. **Never bundle a status change with code.**
> Status commit: `status: <row> <emoji> <note>` (for example `status: 2.3 🟡 claimed by A 14:05`).

**Project:** Merge Desk. An AI-proposed merge conflict resolution does not land until both sides' intent survives and the tests pass.

**Team:**
- **A (product / frontend / AI / demo / submission):** YearningAsian
- **B (backend / GitHub rails / CI / deploy):** YearningAsian (solo; both owner columns are the same person)

**Event:** Build With AI: Basics (Devpost Learn, online). Rules: https://learn-ai-basics.devpost.com/rules
**Coding may start:** submission period opened 2026-09-22 10:00 ET. New projects only, started from an empty folder during the period (this repo: 2026-10-04).
**Deadline:** October 26, 2026, 4:00 p.m. Central (17:00 EDT). One portal: Devpost. Free judge access through October 30, 2026, 4:00 p.m. Central.
**Target submit:** 2026-10-26 15:30 EDT (deadline minus 90 min).
**Repo:** https://github.com/YearningAsian/merge-desk (public)

**Legend:** ✅ done · 🟡 in progress · ⬜ not started · ⛔ blocked · ✂️ cut
**Stale lock TTL: 4 hours.** A 🟡 row without a fresh timestamp in Notes is claimable.

---

## Context

> **Canonical scope:** [`devpost/scope.md`](devpost/scope.md) (approved 2026-10-04 via the event's `2-scope`). Where this section differs, scope wins.

- **The problem:** about 1 in 5 merges in 143 open source projects caused a conflict; in 75.23% of those a developer had to reason about program logic to resolve it, and code associated with a merge conflict was twice as likely to have a bug ([Brindescu, Ahmed, Jensen, Sarma, *Empirical Software Engineering* 2019](https://doi.org/10.1007/s10664-019-09735-4)). Coding agents now open many parallel PRs against the same files, so conflicts arrive faster than reviewers.
- **The gap:** AI merge drivers already exist, but they write the model's output straight into the file and ask you to review it by hand. Nothing checks that the merged code still does what *each* branch meant to do. A resolution that compiles and quietly drops one side's change looks exactly like a good one.
- **Our mechanic:** a visible verification gate. Gemini proposes a resolution, then parsing, a deterministic choice-honored check and the selected sandbox tests must pass before Land adds a merge commit to the original PR's head branch. Chosen drops are checked against the selected option. These checks provide bounded evidence, not semantic proof. It never pushes to the base branch.
- **Beat A (held):** branch `rename` renames `fetchUser` to `getUser`; branch `retry` adds a retry on HTTP 429 inside `fetchUser`. A naive resolution keeps the rename and drops the retry. Merge Desk shows "theirs: retry on 429, MISSING", the intent check fails, the resolution is HELD and nothing is pushed.
- **Beat B (lands):** the verified resolution (`getUser` with the retry) passes the live checks (parses, choice honored, tests pass); Land commits it to the PR's own branch after rechecking head/base SHAs, and the PR turns mergeable.
- **Who it's for:** a developer on a small team whose PR just went red because a teammate merged first (scope). First user: the learner, on this repo.
- **Who pays (hypothesis):** small teams and teams running coding agents, per active repository.

**Tracks we enter:**
- General: the single judged pool (1st $1,250, 2nd $750, 3rd $500). No sponsor tracks.
- Sponsors: none at this event. Model provider chosen: Gemini.
- Tool prizes: none.

**Rules that bite (quoted from the rules page, 2026-10-04):**
- Must be built with the **Devpost Learn Skill Pack** (`npx skills add challengepost/learn-ai-basics --all -y`) and a SKILL.md coding agent. Its six skills (1-start ... 6-ship) are the required build process; where they conflict with the zero-to-ship kit, the skill pack wins.
- Public repo with source, assets, instructions **and the planning documents `scope.md`, `prd.md`, `spec.md`** (the pack writes them to `devpost/`), plus an **open source license file** (MIT).
- Demo video **less than three (3) minutes**, showing the project working end-to-end, on YouTube or Vimeo.
- **Judging Stage One is pass/fail:** the project fits the theme and "was built using the Devpost Learn skill pack, as evidenced by the planning documents in the repository." Missing `scope.md`/`prd.md`/`spec.md` means not judged.
- Text description: what it does, who it's for, what you learned. **No rule restricts AI-written descriptions or video scripts** (rules and overview re-checked 2026-10-04). The learner has directed the agent to draft them; the skill pack's `6-ship` learner-written guidance is curriculum advice, not an eligibility rule, and is overridden by that instruction.
- Video: "must not include third party trademarks, or copyrighted music or other material" without permission. Keep third-party logos (including GitHub's) out of frame where possible; no copyrighted music.
- License "should be detectable and visible at the top of the repository page (in the About section)".
- "Projects must be newly created during the Submission Period"; AI coding assistants allowed; "must disclose any other pre-existing code or work incorporated" (here: the hackathon kit's planning templates and the workspace agent skills).

---

## Judged criteria and the surfaces that answer them

| Criterion (quote the rules) | Surface that answers it | Owner |
|---|---|---|
| Design: "a complete, coherent product experience, not just a technical proof of concept" | Desk conflict view: two intents side by side, Beat A held, Beat B lands, one coherent flow | A |
| Potential Impact: "a credible, specific case for solving a real problem for a real audience, and does the solution actually address that problem based on what's demonstrated" | Hook study + reviewers of agent-written PRs as the audience; the replay eval number | A |
| Innovation/Idea: "how creative and novel ... does the project differ from existing concepts" | Intent check + CI gate vs AI merge drivers that write output unchecked | A |
| Presentation: "does the video clearly demonstrate the project working end-to-end? Does the pitch communicate what problem is solved, who it's for, and why it matters?" | Under-3-minute video, real UI, Beat A then Beat B, problem/audience/why stated | A |
| Not a judged criterion (Stage Two judges the four above, equally weighted; rechecked 2026-10-05). Still worth it: can a judge verify it | `/judge` + public `/api/health` + `/api/stats` + the demo repo's PR history | A |

**Potential later headline:** "Of N real historical conflict hunks, an unchecked AI resolution dropped an intent in X; Merge Desk held all X." Replay evaluation is deferred by the PRD. Do not use this claim unless row 2.9 is later built and measured into `docs/FACTS.json`. The core demo's proof is actual check output and PR history. Never type a measured number from memory.

---

## Status dashboard

### Phase 0: Ideate

| # | Row | File(s) | Owner | Status | Notes |
|---|---|---|---|---|---|
| 0.1 | Rules, deadlines, portals, criteria read | `PLAN.md` header | A | ✅ | Build With AI: Basics, Devpost, due 2026-10-26 17:00 EDT |
| 0.2 | Scope approved through the event's skill pack (`1-start`, `2-scope`) | `devpost/scope.md`, `devpost/scope.html` | A | ✅ | Approved 2026-10-04 |
| 0.3 | Brand direction | `docs/design/BRAND.md` | A | ✅ | |
| 0.4 | H-rows listed and assigned | below | A | ✅ | |
| 0.5 | PRD approved (`3-prd`) | `devpost/prd.md`, `devpost/prd.html` | A | ✅ | Approved 2026-10-04 with changes: demo mode (recorded real runs, public) + live mode (learner only); recoverable drops now; never a fake pass; build priority held → verified → chosen drop → options → rest |
| 0.6 | Spec approved (`4-spec`) | `devpost/spec.md`, `devpost/spec.html` | A | ✅ | Approved 2026-10-04: one repo, demo PRs into `demo/base`, Vercel Sandbox runner + local fallback, GitHub App (contents + PRs only), Gemini 3.8 Flash |
| 0.7 | Stack and UI/UX documentation review | `devpost/spec.*`, `docs/stack.md`, `docs/adr/0001-stack.md` | A | ✅ | Completed 2026-10-04: stable pins/peer review, UI libraries, service API and docs sync; HTML/links/JS/hygiene checks passed. Browser rendering and app install/build/integrations remain unverified |
| 0.8 | Firecrawl workflow and Taste audit follow-up | `devpost/spec.*`, `docs/design/BRAND.md`, `docs/stack.md` | A | ✅ | Done 2026-10-05 (afca038): five dark text roles incl. new `--stop-text` (all >= 4.5:1 on surfaces and washes), 3:1 control border, ink focus, skip link and main landmark; HTML balanced, em-dash clean |

### Phase 1: Scaffold

| # | Row | File(s) | Owner | Status | Deps | Notes |
|---|---|---|---|---|---|---|
| 1.1 | Repo, `.gitignore`, `.env.example`, README stub | root | A | ✅ | 0.2 | Done 2026-10-05: `.env.example`, README run instructions, presence-only `scripts/env-check.mjs` |
| 1.2 | Stack check (workspace STACK.md protocol) + Next.js scaffold | `docs/stack.md`, `docs/adr/0001-stack.md`, `src/**` | A | ✅ | 1.1 | Done 2026-10-05 (1d4cb50): pins rechecked (no changes), Next 16 scaffold, lockfile via npm 12.2.0; format/lint/typecheck/test/build pass; `tsx` added for scripts |
| 1.3 | Env contract, `/api/health`, `/api/stats`, `/judge` stub | `src/server/env.ts`, `src/app/**` | A | 🟡 | 1.2 | 2026-10-05: env contract and `/api/health` (booleans) done; `/api/stats` and `/judge` land in slice 7 |
| 1.4 | CI green (lint, typecheck, test, build, hygiene, secrets) | `.github/workflows/ci.yml` | B | ✅ | 1.2 | Green 2026-10-05 on 94e0889 (run 37276584816): format, lint, typecheck, unit + playground tests, build, em dash, gitleaks. Follow-up: Actions v4 use deprecated Node 20 |
| 1.5 | Accounts + keys (each person signs up; keys never in chat/git) | `.env.local` | A | ✅ | | 2026-10-05: all required names present (env-check); GitHub App key rotated (A confirmed); Vercel linked, OIDC pulled to `.env.development.local` |
| 1.6 | **Gate:** GitHub App round trip on a disposable demo ref, one schema-valid Gemini Interactions call, sandbox merge/deny-all/tests/disposal smoke check | `tests/{github,llm,runner}.live.test.ts` | B | 🟡 | 1.3, 1.5 | 2026-10-05 slice 2 (0f6de97): `npm run test:live` passes one schema-valid Gemini call and a sandbox create/merge/deny-all/tests/stop round (6.0 to 9.7 s; tests 0.6 to 1.2 s; Node v24.19.0). Default model `gemini-3.5-flash-lite` (learner, 79bbfe2). Rotated GitHub App key confirmed by A. GitHub App read round trip live 2026-10-05 (5de56aa): installation found, three demo PRs listed as conflicting, live analysis of #3. Write round trip comes with slice 5 Land |

### Phase 2: Build

| # | Row | File(s) | Owner | Status | Deps | Notes |
|---|---|---|---|---|---|---|
| 2.1 | Pure conflict/line-change logic, choices, evidence and schemas | `src/core/**` | B | ✅ | 1.3 | Done 2026-10-05: gate core, scope guard, events, demo and analysis schemas, `core/options.ts` (keeps/drops from git, older side) |
| 2.2 | Signed analysis/result state + GitHub decision comment | `src/server/{sign,session}.ts`, `src/server/github/**` | B | ✅ | 1.6 | Done 2026-10-06: PR #4 merged (5f4285b) after green CI on exact head fe0c503 and separate-model review (`.review/`, local). Real #1 VERIFIED/LANDED twice, #2 HELD and discarded on one App comment, replay and tamper refused. Hosted decision writes refuse until the slice 6 shared lock |
| 2.3 | API routes: analyze, run, land, record (explicit failure shapes) | `src/app/api/**` | B | 🟡 | 2.1 | Slices 2-5 routes merged (PR #4). 2026-10-06 slice 6 in PR #5: shared lock ref `refs/merge-desk/locks/pr-<n>` for hosted decision writes (live-tested on GitHub), daily throttle from tagged sandboxes (refuses at the cap or when it can't count; live count of stopped sandboxes still to run), `/api/stats`; review rounds 6.1-6.3 ending CLEAN |
| 2.4 | Desk UI: PR list, intents, options, checks, read-only diff, inline drops and Land | `src/app/**`, `src/ui/**` | A | 🟡 | 2.3 | 2026-10-05 slice 3 done (5de56aa): sign-in, PR list (30 s live refresh, `?pr=` links), color-coded analysis, resolution slider with a reason per option, folded Details for developers; Playwright + axe at 1440 and 390 px. Second feedback round done (ab00e1b): smooth reveals, Settings with model choice, keys without clicking. Slice 4 done: live run steps, HELD/VERIFIED results, hold-to-confirm drops, steer and retry; live runs on all three demo PRs pushed nothing. Land in slice 5. shadcn/Radix + Query + Pierre; public recorded demo, learner-only live; phone/keyboard/axe checks |
| 2.5 | **Checkpoint:** Beat A held + Beat B lands twice locally; chosen drop works; capture real recordings | `demo/recordings/**` | both | ⬜ | 2.4 | PRD priority: held → verified → chosen drop → options → rest; validate recording schemas |
| 2.6 | Deploy to Vercel + env + probe | `.github/workflows/probe.yml` | B | 🟡 | 2.5 | 2026-10-06 21:38Z: `main` a43bcc9 deployed to production https://merge-desk-swart.vercel.app (CLI from a clean worktree; learner go after merging #5). Health: github, gemini, sandbox, throttle true; recordings false (slice 7). Stats 200, signed-out `/api/live/prs` 401, `/` and `/live` 390 px no overflow. Probe variable set; dispatched run 37535364896 green. Throttle live test: a stopped sandbox stays counted. Waiting: learner's phone check (held and verified runs, Land) and the run timings in production logs |
| 2.7 | `/judge` itinerary against production | `src/app/judge/**` | A | ⬜ | 2.6 | |
| 2.8 | FACTS measured with provenance | `docs/FACTS.json` | A | ⬜ | 2.5 | |
| 2.9 | Later: replay eval on real historical merges (unchecked AI vs gated) | `eval/**` | A | ⬜ | 2.1 | Deferred by approved PRD; no measured headline until this is actually built |
| 2.10 | Later: git merge driver sharing the pure core | `cli/**` | B | ⬜ | 2.1 | Deferred by approved PRD; outside this web POC |

### Phase 3: Freeze and harden

| # | Row | File(s) | Owner | Status | Notes |
|---|---|---|---|---|---|
| 3.1 | Feature freeze declared; unfinished depth ✂️ and removed | `PLAN.md` | A | ⬜ | |
| 3.2 | Final adversarial sweep, different model | `.review/` | B | ⬜ | Until clean round |
| 3.3 | Live abuse checks on production (replay land, double land, forged PR number, oversized file, prompt injection in code comments) | n/a | B | ⬜ | |
| 3.4 | Truth sweep: PLAN = code = live site | `PLAN.md` | A | ⬜ | |
| 3.5 | Claims dry run (`check_claims.py`) | n/a | A | ⬜ | |

### Phase 4: Assets

| # | Row | File(s) | Owner | Status | Notes |
|---|---|---|---|---|---|
| 4.1 | Stills of every judge page (phone + desktop) | `docs/stills/raw/` | A | ⬜ | |
| 4.2 | Brand kit: thumbnail, B-roll, poster | `docs/stills/generated/`, `docs/presentation/` | A | ⬜ | |
| 4.3 | Video footage captured (real UI) | `docs/video/raw/` | A | ⬜ | |
| 4.4 | Video edited and uploaded | `docs/video/EDIT.md` | A | ⬜ | Link in FACTS `demo.videoUrl` |
| 4.5 | Gallery (3-6 images) with captions | `docs/stills/GALLERY.md` | A | ⬜ | |

### Phase 5: Submit

| # | Row | File(s) | Owner | Status | Notes |
|---|---|---|---|---|---|
| 5.1 | FACTS locked (rerun provenance commands) | `docs/FACTS.json` | A | ⬜ | |
| 5.2 | Writeup drafted, rewritten in the team's voice | `docs/submission-draft.md` | A | ⬜ | |
| 5.3 | Claims audit clean (`check_claims.py --strict` + review in claims mode) | n/a | B | ⬜ | |
| 5.4 | **H:** every portal submitted and reload-verified | n/a | A | ⬜ | |
| 5.5 | Pitch rehearsed; expo pack ready | `docs/pitch.md` | both | ⬜ | |

---

## Human-only rows (agents cannot do these)

| # | Step | Who | Unlocks |
|---|---|---|---|
| H1 | Register on Devpost for Build With AI: Basics | A | 5.4 |
| H2 | ✅ Gemini API key in `.env.local` (free tier); Vercel env pending (H4) | A | 1.6 |
| H3 | GitHub App `merge-desk-yearningasian` (contents + pull requests read/write; no checks, no workflows), ✅ installed on `merge-desk` only (A, 2026-10-05); App ID, Client ID, client secret in `.env.local` ✅; private key rotated and confirmed by A (2026-10-05) | A | 1.6 |
| H4 | Vercel project linked to this repo; env vars added; production callback URL added to the GitHub App | A | 2.6 |
| H6 | ✅ Unused empty `merge-desk-playground` repo is gone (GitHub reports it does not exist, checked 2026-10-05) | A | none |
| H5 | Final submit click on every portal | A | being judged |

---

## Open pull requests

| PR | Row | Side-effect path? | Review rounds | State |
|---|---|---|---|---|
| [#4](https://github.com/YearningAsian/merge-desk/pull/4) | 2.2 | yes | Original Sonnet 1-3; Codex 4; final fresh Sonnet 1-2 | Merged 2026-10-06 (5f4285b); main CI green |
| [#5](https://github.com/YearningAsian/merge-desk/pull/5) | 2.3, 2.6 | yes | Fresh Sonnet 6.1 (0H 4M 3L), 6.2 (0H 1M 2L), 6.3 CLEAN; Codex not installed here | Merged by the learner 2026-10-06 (daa6731); main CI green; M2 closed by the live throttle test (a43bcc9) |

Merge rule: CI green on the merged result, and a clean adversarial round for side-effect paths (anything that writes to GitHub or spends LLM budget). After every production deploy: `curl /api/health` and walk `/judge`.

---

## Shared contracts

| Contract | Owner | Consumers | Definition |
|---|---|---|---|
| `GET /api/health` | B | judges, probe | `{ ok, at, integrations: Record<string, boolean> }` |
| `GET /api/stats` | A | `/judge`, writeup | contents of `docs/FACTS.json` |
| Status vocabulary | B | UI, copy | PROPOSED, HELD, VERIFYING, VERIFIED, LANDED, REFUSED, UNKNOWN. Never "safe", "correct" or "bug-free": say what was verified. |
| GitHub writes | B | Land/record | Land adds a merge commit only to the PR's own head branch after head/base guards; never the base/default branch or force-push. Holds/discards update only the decision comment. Demo replay performs no writes. |

Contract changes: tell the other lane before committing; mark the commit `⚠️ CONTRACT`.

---

## Decisions

- **D1 Honesty:** "verified" lists the actual parse, choice-honored evidence and test results; it is not a semantic correctness claim. A held resolution says why.
- **D2 Vocabulary:** only the status words above, everywhere.
- **D3 Demo data:** the demo repository is ours and labelled as a demo; the replay eval uses real public history.
- **D4 Wired-or-cut:** if production `/api/health` says false, the UI, README, video and writeup do not mention it.
- **D5 The model proposes, code decides:** the LLM's self-report never unlocks a merge. Only the deterministic checks, real sandbox tests and current GitHub guards do.

Historical STOP 1 checkpoint (2026-10-05): STOP 1 after authorized round 4 repairs, Codex (GPT-6). Original independent scope `main...266edda` includes 91c4407, 5b3cbdc, 41c72a3; 266edda is PLAN-only, no discrepancy. Findings formed before prior review files: 2 high, 4 medium; affected follow-up added M5 (medium), then closed all high/medium in fix `e1212e7`. Fresh isolated GPT-6 follow-up found and rechecked the final ambiguous-write lock repair. Claude CLI is signed out, so repair follow-up is same-model; separate-model review before merge remains outstanding. One low remains: authorized editor replay of an older valid same-PR record (not accepted on learner's behalf). Report: `.review/round-4-codex.md` has complete a–j results, prior-round fix assessment, commands and limits. Final verification: 250 unit tests / 29 files, 12 browser tests and production build pass; typecheck passes; lint 0 errors / 1 existing ignored scratch warning. Record writes are limited to loopback development/test on a shared local lock filesystem; ambiguous dispatched writes retain their lock for human reconciliation. Production Land/record refuse until shared coordination is configured. Live Sandbox protection and real Land remain unverified; literal base-race, whole-PR workflow and daily-admission gaps are explicit. Waiting for learner's **continue**; no push, PR, Land/reset, merge or deploy. `probe.yml` is untouched, untracked, unstaged and reserved for slice 6.

_Last updated: 2026-10-06, slice 6 deployed to production; waiting on the learner's phone check (Claude Opus 5.5)_

Round 4 repair task claimed (2026-10-05, Codex GPT-6): resume Step 1 only, failing regression tests before fixes, independent affected-boundary follow-up and read-only eligibility assessment. Original review scope remains `main...266edda`; no scope discrepancy found. Keep all later learner approval gates, the fixed login/repository allowlists, and parked `probe.yml`. No push, PR, live Land/reset, merge or deploy in this task.

Read-only readiness assessment (2026-10-05): six local Devpost Learn skills, challengepost lock (a0ef8d4), substantive approved scope/prd/spec committed October 4 support historical Skill Pack use; they do not independently prove every earlier invocation or an initially empty folder. Earliest reachable commit and public repository creation fall within September 22–October 26. Planning templates/workspace skills are disclosed here; final incorporated-work inventory remains incomplete. Public GitHub repository and detectable MIT license verified. Local gate, desk fixtures and build work; fresh Node 24 installation and real authenticated Land remain unverified. Recordings, final assets, accurate README/pitch/submission copy, API/material permissions and a public YouTube/Vimeo demo under three minutes remain gaps. Read-only production health at 2026-10-05T20:46:46.381Z reports all four integrations false; /demo, /judge and /api/stats return 404 despite a published homepage URL. Plan free public replay testing without keys/sign-in through October 30; if a private testing surface is offered, provide testing credentials without widening the fixed repository/login allowlists or sharing learner credentials. Judge-access adequacy and availability are not yet verified. No unrelated submission work performed. Official rules: https://learn-ai-basics.devpost.com/rules .

Historical sequence, superseded by the later explicit closure authorization: await **continue** for Step 2 push/PR; Step 3 branch inventory and learner clicks only after STOP 2; Step 4 API verification/reset/replay only after learner says **landed**; Step 5 merge only after STOP 3 go. No deployment before the later slice 6 gate.

STOP 2 repair claimed (2026-10-05, Codex GPT-6, PLAN 2.2): learner authorized proceeding after bot-user GET returned 401 and Land/record returned 503. Investigate the App JWT used for the public bot lookup, add a failing regression before the smallest fix, rerun required checks and independently review the affected boundary. Preserve all existing branch snapshots and later approval gates. No human Land clicks, reset, merge, deployment, settings changes or probe.yml changes.

STOP 2 repair verified (2026-10-05, Codex GPT-6): M6 medium authentication bug closed in `1c8e4c0283c1d6461402bc46fc16dd777bffcbed`; App metadata retains JWT auth, public bot lookup uses a separate unauthenticated client. Regression RED 3/3, GREEN 3/3; full unit 253/30 files, browser 12/12 and fresh production build pass, typecheck pass, lint 0 errors/1 existing ignored scratch warning. One read-only unauthenticated real bot lookup returned 200. Fresh isolated GPT-6 affected-boundary review clean (0 all), targeted 3/3 independently rerun; separate-model-before-merge gate still outstanding. Full evidence appended to `.review/round-4-codex.md`. Update existing PR #4/CI, disclose authorized feat/land advancement, preserve original all-branch baseline and capture a new snapshot. Stay at STOP 2 for original learner #1/#2 observations; no Step 4 from the reported REFUSED #3 attempt. Probe remains untouched. Earlier readiness gaps and round 4 policy limits remain open.

Slice 5 closure claimed (2026-10-05, Codex GPT-6, PLAN 2.2): learner explicitly superseded STOP 2/STOP 3/manual-click and merge-go gates. Authorized original #1/#2 automated flows, evidence-preserving demo resets (including demo/base after #3 merge), repeatability/replay/tamper checks, focused readiness/historical-result UI fixes, named-file commits/pushes, independent review, full checks and exact-reviewed-head conditional merge of #4 using existing permitted administrator authority. No ruleset changes or bypass of failed/missing requirements, no main force-push or app main-merge capability. Bounded diagnosis replaces automatic two-failure stop; ambiguous writes must be reconciled before retry. Preserve every earlier baseline, secrets, allowlists, Land guards and probe.yml. Production deployment still needs separate learner go. Work this row through completion; report evidence gaps honestly.

Current task (2026-10-06, Claude Opus 5.5): slice 6 on a branch from main with a PR. Order agreed with the learner: (1) shared decision-record lock as a GitHub ref under `refs/merge-desk/locks/`, with one live test that GitHub accepts the name; (2) daily live-run throttle counted from tagged `Sandbox.list`, refusing when the count can't be read; (3) `/api/stats`, phone layout, probe workflow; (4) separate-model review, then ask the learner before the production deploy (env vars only apply on a new deployment; the throttle must be confirmed on production before the URL is shared).

Remaining readiness gaps: final pre-existing-work/attribution disclosure, authorized final materials, final English submission copy, public real recordings/judge testing and a public YouTube/Vimeo demonstration under three minutes. Historical Skill Pack/October 4 planning commits support actual use without proving every invocation or initially empty folder. Clean Node 24 CI install and real demo end-to-end functionality now have evidence. Production still reports every integration false and public demo/judge paths are absent. Plan free unrestricted judge testing through October 30, 2026, 4 p.m. Central, preserving live repository/login allowlists and owner credentials. Submit by October 26, 2026, 4 p.m. Central. Slice 6 must add fail-closed usage admission/shared coordination, verify hosted identity/timeouts and parked probe safeguards; deployment requires separate learner go.
