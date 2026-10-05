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
**Deadline:** 2026-10-26 17:00 EDT. One portal: Devpost.
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
| 2.2 | Signed analysis/result state + GitHub decision comment | `src/server/{sign,session}.ts`, `src/server/github/**` | B | 🟡 | 1.6 | 2026-10-05: `sign.ts` done (HMAC, HKDF key, scope + expiry, tests); iron-session sign-in with the login allowlist done in slice 3 (5de56aa); decision comment built on `feat/land` (slice 5): one sealed Merge Desk comment per PR, only the App's own, serialized and read back. Adversarial review: round 1 (91c4407) 2 high, 2 medium, 2 low, fixed in 5b3cbdc; round 2 clean with 1 medium, 3 low (fixed in 41c72a3, L3 accepted); round 3 (41c72a3) CLEAN, 0/0/0. Reviewer: a fresh Claude Sonnet 5.5 agent (author Claude Opus 5.5); no other model family's CLI is installed, so it is a different model of the same family. Files: `.review/round-{1,2,3}.md`. Bind user/repo/PR/head/base/expiry; no branch lease or DB. Usage throttle is not an atomic budget cap |
| 2.3 | API routes: analyze, run, land, record (explicit failure shapes) | `src/app/api/**` | B | 🟡 | 2.1 | 2026-10-05 slice 2 done (0f6de97): analyze/run pipelines with Gemini and the sandbox runner, bounded retries; `/api/live/prs` and streamed `/api/live/analyze` done in slice 3 (5de56aa); run, land and record in slices 4 and 5. `/api/live/run` done in slice 4 (signed run record with the changed files and tree id); `/api/live/{land,record}` built on `feat/land` (guards unit-tested before any real Land; tree id must match the checked merge; force: false; UNKNOWN never shown as LANDED); review round 3 CLEAN. Waiting for the learner: push the branch and open the PR, then the first real Land on a `[Demo]` PR with the learner watching. Node streams, trusted snapshot/deny-all runner, request deadlines; review before merge |
| 2.4 | Desk UI: PR list, intents, options, checks, read-only diff, inline drops and Land | `src/app/**`, `src/ui/**` | A | 🟡 | 2.3 | 2026-10-05 slice 3 done (5de56aa): sign-in, PR list (30 s live refresh, `?pr=` links), color-coded analysis, resolution slider with a reason per option, folded Details for developers; Playwright + axe at 1440 and 390 px. Second feedback round done (ab00e1b): smooth reveals, Settings with model choice, keys without clicking. Slice 4 done: live run steps, HELD/VERIFIED results, hold-to-confirm drops, steer and retry; live runs on all three demo PRs pushed nothing. Land in slice 5. shadcn/Radix + Query + Pierre; public recorded demo, learner-only live; phone/keyboard/axe checks |
| 2.5 | **Checkpoint:** Beat A held + Beat B lands twice locally; chosen drop works; capture real recordings | `demo/recordings/**` | both | ⬜ | 2.4 | PRD priority: held → verified → chosen drop → options → rest; validate recording schemas |
| 2.6 | Deploy to Vercel + env + probe | `.github/workflows/probe.yml` | B | ⬜ | 2.5 | |
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
| | | yes/no | `.review/round-N.md` | |

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

Current task (2026-10-05): Codex (GPT-6), independent different-family round 4 of `main...266edda` (PLAN 2.2), NOT CLEAN: 2 high (cross-instance loss of a confirmed decision; tests can run altered bytes while the earlier tree is signed), 4 medium (ancestry-preserving changed head; cumulative Land deadline; visible record edit; silent history truncation). Earlier rounds reviewed after independent findings; round 1 H1 and round 2 M1 reopened. Report: `.review/round-4-codex.md`. Verification: 198 unit tests, 12 browser tests and build pass; typecheck passes; lint has no errors and one existing warning in `.review/run-check.mts`. No product fixes: stop condition reached because permanent record coordination/history and source integrity need a consequential design decision. Waiting for learner direction; no push, PR or real Land. `.github/workflows/probe.yml` remains untouched, untracked and parked for slice 6.

_Last updated: 2026-10-05, independent slice 5 review round 4 NOT CLEAN; stopped before product changes or push (Codex, GPT-6)_
