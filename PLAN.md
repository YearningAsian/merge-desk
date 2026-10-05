# PLAN: living status dashboard

> Single source of truth for who is working on what. Row numbers match the zero-to-ship phases (0 Ideate ... 5 Submit).
> Update on every task change. **Never bundle a status change with code.**
> Status commit: `status: <row> <emoji> <note>` (for example `status: 2.3 🟡 claimed by A 14:05`).

**Project:** Merge Desk. An AI-proposed merge conflict resolution does not land until both sides' intent survives and the tests pass.

**Team:**
- **A (product / frontend / AI / demo / submission):** YearningAsian
- **B (backend / GitHub rails / CI / deploy):** <!-- teammate or solo: pending answer -->

**Event:** <!-- pending: name, venue, dates -->
**Coding may start:** <!-- from the rules -->
**Deadline:** <!-- hard time + timezone. Every portal -->
**Target submit:** <!-- deadline minus 90 min -->
**Repo:** https://github.com/YearningAsian/merge-desk (public)

**Legend:** ✅ done · 🟡 in progress · ⬜ not started · ⛔ blocked · ✂️ cut
**Stale lock TTL: 4 hours.** A 🟡 row without a fresh timestamp in Notes is claimable.

---

## Context

- **The problem:** about 1 in 5 merges in 143 open source projects caused a conflict; in 75.23% of those a developer had to reason about program logic to resolve it, and code associated with a merge conflict was twice as likely to have a bug ([Brindescu, Ahmed, Jensen, Sarma, *Empirical Software Engineering* 2019](https://doi.org/10.1007/s10664-019-09735-4)). Coding agents now open many parallel PRs against the same files, so conflicts arrive faster than reviewers.
- **The gap:** AI merge drivers already exist, but they write the model's output straight into the file and ask you to review it by hand. Nothing checks that the merged code still does what *each* branch meant to do. A resolution that compiles and quietly drops one side's change looks exactly like a good one.
- **Our mechanic:** a GitHub gate. Merge Desk proposes a resolution per conflict hunk, verifies it (parses, both sides' intents present, CI green on a resolution branch), and only then unlocks a follow-up PR that makes the original PR mergeable. It never pushes to the base branch.
- **Beat A (held):** branch `rename` renames `fetchUser` to `getUser`; branch `retry` adds a retry on HTTP 429 inside `fetchUser`. A naive resolution keeps the rename and drops the retry. Merge Desk shows "theirs: retry on 429, MISSING", the intent check fails, the resolution is HELD and nothing is pushed.
- **Beat B (lands):** the verified resolution (`getUser` with the retry) passes the intent check, CI goes green on `merge-desk/resolve-<pr>`, Merge unlocks, and the original PR turns mergeable.
- **Who pays:** teams running coding agents at volume (platform and developer-productivity teams), per active repository.

**Tracks we enter:**
- General: <!-- pending event -->
- Sponsors (max N per rules): <!-- pending event; candidates: GitHub, the LLM provider we use, Vercel -->
- MLH / tool prizes (only if really wired): <!-- pending -->

**Rules that bite:** <!-- pending: AI disclosure, video length, expo attendance, repo public, frameworks credited -->

---

## Judged criteria and the surfaces that answer them

| Criterion (quote the rules) | Surface that answers it | Owner |
|---|---|---|
| <!-- pending event criteria --> | Desk conflict view: two intents side by side, Beat A held, Beat B lands | A |
| Technical depth | Deterministic intent verifier + CI gate on a real public repo; replay eval on real historical merges | B |
| Execution: can a judge verify it | `/judge` + public `/api/health` + `/api/stats` + the demo repo's PR history | A |

**Headline number:** "Of N real historical conflict hunks, an unchecked AI resolution dropped an intent in X; Merge Desk held all X." Placeholder until the replay eval (row 2.9) writes it to `docs/FACTS.json`. Never type a number from memory.

---

## Status dashboard

### Phase 0: Ideate

| # | Row | File(s) | Owner | Status | Notes |
|---|---|---|---|---|---|
| 0.1 | Rules, deadlines, portals, criteria read | `PLAN.md` header | A | ⛔ | Waiting on event name + deadline |
| 0.2 | Wedge card approved (signature moment, Beat A/B, tracks) | `PLAN.md` Context | A | 🟡 | Shape approved 2026-10-04 (web desk + GitHub gate). Tracks pending event |
| 0.3 | Brand direction | `docs/design/BRAND.md` | A | ✅ | |
| 0.4 | H-rows listed and assigned | below | A | ✅ | |

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
| H1 | Event registration; tell the agent the event name, deadline, portals | A | 0.1 |
| H2 | LLM key (OpenAI or Gemini) into `.env.local` and Vercel env | A | 1.6 |
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
| Branch namespace | B | GitHub writes | Only `merge-desk/*` branches are ever created or pushed. Never force-push, never write to a base branch. |

Contract changes: tell the other lane before committing; mark the commit `⚠️ CONTRACT`.

---

## Decisions

- **D1 Honesty:** "verified" always lists what was checked (parses, intents present, CI result). A held resolution says why.
- **D2 Vocabulary:** only the status words above, everywhere.
- **D3 Demo data:** the demo repository is ours and labelled as a demo; the replay eval uses real public history.
- **D4 Wired-or-cut:** if production `/api/health` says false, the UI, README, video and writeup do not mention it.
- **D5 The model proposes, code decides:** the LLM's self-report never unlocks a merge. Only the deterministic verifier and CI do.

_Last updated: 2026-10-04, Phase 0 (agent)_
