# 09: Roadmap

Phases follow the zero-to-ship workflow alongside the event's Devpost Learn skill pack. The approved [PRD](../../devpost/prd.md) and [spec](../../devpost/spec.md) determine scope. Row-level status lives in [../../PLAN.md](../../PLAN.md); this file is the shape, not a completion report.

| Phase | Outcome | Gate |
|---|---|---|
| 0 Ideate | Scope, PRD, spec and brand aligned | Event details known; canonical planning docs approved |
| 1 Scaffold | Verified stack, Next.js app, env contract, `/api/health`, `/api/stats`, `/judge` stub, CI green; GitHub App, Gemini structured response and sandbox smoke checks | CI green and row 1.6 green |
| 2 Build | Pure choice-honored checker; sandbox pipeline; signed run results and GitHub decision comment; responsive desk with public replay and learner-only live modes | Held result, verified landing and chosen-drop path work; real recordings captured for `/demo` |
| 3 Harden | Feature freeze; adversarial review sweep by a different model; live abuse checks; truth sweep; claims dry run | Clean round and abuse checks pass |
| 4 Assets | Stills, real-footage demo video, gallery, poster | Video uploaded, 3+ gallery images |
| 5 Submit | FACTS locked, writeup in the team's voice, claims audit, every portal submitted | User confirms each portal |

## Build priority

Follow `prd.md > Build Priority`: held flow, verified landing, chosen-drop checks, resolution options, then the remaining product behavior. UI libraries support this flow; they do not add new features. Stack details live in [../stack.md](../stack.md) and [../adr/0001-stack.md](../adr/0001-stack.md).

## Deferred work (only after the approved web flow works)

1. **Replay eval** on real historical merges from a public repository: compare unchecked proposals with gated results. Any measured claim needs provenance in `docs/FACTS.json`; an evaluation is not required for the core flow.
2. **Git merge driver** (`merge-desk driver %O %A %B %P`) sharing the same core, exiting non-zero to keep conflict markers whenever verification fails.
3. **Expo React Native app and downloadable Android APK**, sharing the web backend, after the full web app works end to end. Store releases remain cut.
4. **Additional model providers, repositories and dashboard features** remain Later. A reviewed scope change is needed before adding them to current work.

## Settled decisions and build checks

- Event: Build With AI: Basics; deadline and submission details live in `PLAN.md`.
- Team: YearningAsian, solo. License: MIT. Model provider: Gemini.
- Architecture: Next.js on Vercel; GitHub App installed on one repository; Vercel Sandbox with trusted dependencies and a manual local recording fallback; no database. Changed head or base revisions require a new run.
- Still to verify during build: deny-all before candidate code, trusted snapshot reuse, provider structured output, actual account quotas/pause controls, non-atomic usage accounting and request timing within the documented deadlines. Production callback URL is decided at deploy. See `devpost/spec.md > Decisions and Open Issues` for the current investigation list.
