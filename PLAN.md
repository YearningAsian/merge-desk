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
- **Our mechanic:** a GitHub gate. Merge Desk proposes a resolution per conflict hunk, verifies it (parses, both sides' intents present, CI green on a resolution branch), and only then unlocks a follow-up PR that makes the original PR mergeable. It never pushes to the base branch.
- **Beat A (held):** branch `rename` renames `fetchUser` to `getUser`; branch `retry` adds a retry on HTTP 429 inside `fetchUser`. A naive resolution keeps the rename and drops the retry. Merge Desk shows "theirs: retry on 429, MISSING", the intent check fails, the resolution is HELD and nothing is pushed.
- **Beat B (lands):** the verified resolution (`getUser` with the retry) passes the live checks (parses, both intents present, tests pass); Land commits it to the PR's own branch and the PR turns mergeable.
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
| Execution: can a judge verify it | `/judge` + public `/api/health` + `/api/stats` + the demo repo's PR history | A |

**Headline number:** "Of N real historical conflict hunks, an unchecked AI resolution dropped an intent in X; Merge Desk held all X." Placeholder until the replay eval (row 2.9) writes it to `docs/FACTS.json`. Never type a number from memory.

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
| 0.6 | Spec approved (`4-spec`) | `devpost/spec.md`, `devpost/spec.html` | A | ⬜ | Gates all code (`5-build` builds from it) |

### Phase 1: Scaffold

| # | Row | File(s) | Owner | Status | Deps | Notes |
|---|---|---|---|---|---|---|
| 1.1 | Repo, `.gitignore`, `.env.example`, README stub | root | A | 🟡 | 0.2 | Repo public; `.env.example` with scaffold |
| 1.2 | Stack check (workspace STACK.md protocol) + Next.js scaffold | `docs/stack.md`, `docs/adr/0001-stack.md`, `src/**` | A | ⬜ | 1.1 | |
| 1.3 | Env contract, `/api/health`, `/api/stats`, `/judge` stub | `src/server/env.ts`, `src/app/**` | A | ⬜ | 1.2 | |
| 1.4 | CI green (lint, typecheck, test, build, hygiene, secrets) | `.github/workflows/ci.yml` | B | ⬜ | 1.2 | Workflows held back until the app exists |
| 1.5 | Accounts + keys (each person signs up; keys never in chat/git) | `.env.local` | A | ⬜ | | See H-rows |
| 1.6 | **Gate:** live GitHub round trip from a test: create a `merge-desk/*` branch, commit a tree, read its check runs on the demo repo; one live LLM call returning a schema-valid proposal | `tests/github.live.test.ts`, `tests/llm.live.test.ts` | B | ⬜ | 1.3, 1.5 | No desk UI before this |

### Phase 2: Build

| # | Row | File(s) | Owner | Status | Deps | Notes |
|---|---|---|---|---|---|---|
| 2.1 | Resolver core (pure): parse diff3 hunks; deterministic strategies first (identical, one side only, whitespace); intent verifier | `src/core/**` | B | ⬜ | 1.3 | Table tests incl. the rename-vs-retry case |
| 2.2 | State in GitHub: resolution branch = lease (ref create is atomic); PR comment = record | `src/server/github/**` | B | ⬜ | 1.6 | No DB unless caps need one |
| 2.3 | API routes: propose, verify, land, status (explicit failure shapes) | `src/app/api/**` | B | ⬜ | 2.1 | Review round before merge |
| 2.4 | Desk UI: PR list, conflict view (intents side by side), checks, Land | `src/app/**` | A | ⬜ | 2.3 | No login for judges on the demo repo |
| 2.5 | **Checkpoint:** Beat A held + Beat B lands, twice on localhost | n/a | both | ⬜ | 2.4 | If red, stop and fix |
| 2.6 | Deploy to Vercel + env + probe | `.github/workflows/probe.yml` | B | ⬜ | 2.5 | |
| 2.7 | `/judge` itinerary against production | `src/app/judge/**` | A | ⬜ | 2.6 | |
| 2.8 | FACTS measured with provenance | `docs/FACTS.json` | A | ⬜ | 2.5 | |
| 2.9 | Depth: replay eval on real historical merges of a public repo (unchecked AI vs gated) | `eval/**` | A | ⬜ | 2.1 | Produces the headline number |
| 2.10 | Depth: `merge-desk` git merge driver (`%O %A %B %P`), same core, exits non-zero to keep markers when unverified | `cli/**` | B | ⬜ | 2.1 | ✂️ if behind |

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
| H2 | Gemini API key into `.env.local` and Vercel env | A | 1.6 |
| H3 | Fine-grained GitHub token scoped to the demo repo only (contents, pull requests: read/write; checks, actions: read) | A | 1.6 |
| H4 | Vercel project linked to this repo | A | 2.6 |
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
| GitHub writes | B | Land | Only a merge commit on the PR's own head branch (what GitHub's web conflict editor does) and scratch `merge-desk/*` branches. Never the base branch, never a force-push. Held merges write nothing. |

Contract changes: tell the other lane before committing; mark the commit `⚠️ CONTRACT`.

---

## Decisions

- **D1 Honesty:** "verified" always lists what was checked (parses, intents present, CI result). A held resolution says why.
- **D2 Vocabulary:** only the status words above, everywhere.
- **D3 Demo data:** the demo repository is ours and labelled as a demo; the replay eval uses real public history.
- **D4 Wired-or-cut:** if production `/api/health` says false, the UI, README, video and writeup do not mention it.
- **D5 The model proposes, code decides:** the LLM's self-report never unlocks a merge. Only the deterministic verifier and CI do.

_Last updated: 2026-10-04, Phase 0 event rules recorded (agent)_
