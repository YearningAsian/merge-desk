# Implementation detail (TDD steps per PLAN row)

> Companion to `../PLAN.md`; row numbers match. Filled during Phases 1-2 by the builder agent.
> One PR per row when possible. Failing test first for rules and irreversible transitions.
> Side-effect PRs need a clean adversarial round (different model) before merge.

**Goal:** AI-proposed merge conflict resolutions that land only when both sides' intent survives and the tests pass.

**Architecture:**
- One web app serves UI + API routes on <!-- host -->.
- <!-- DB / signed tokens --> holds durable state.
- <!-- offline jobs / ML --> write artifacts the app loads; nothing trains in the request path.
- Mobile / hardware only if it serves a demo beat.

**Allowed status words:** PROPOSED | HELD | VERIFYING | VERIFIED | LANDED | REFUSED | UNKNOWN

## Review focus for this project

<!-- Fill from the wedge. Defaults: -->
1. Double submit or replay cannot apply an effect twice.
2. Sponsor failure or timeout never reports success.
3. Missing or unreadable input makes no irreversible transition.
4. Client responses never include secrets or full card/identity data.
5. Unsigned mutating routes have caps.

---

### Row 1.3: Env contract + health/stats/judge

**Files:** `src/server/env.ts`, `tests/env.test.ts`, `src/app/api/{health,stats}/route.ts`, `src/app/judge/page.tsx`, `.env.example`

- [ ] Add each integration's keys to `INTEGRATIONS`.
- [ ] Failing test names the missing keys; then implement.
- [ ] `/api/health` returns booleans only; `/api/stats` returns FACTS.

### Row 1.6: First live sponsor call

**Files:** `src/server/<sponsor>/**`, `tests/<sponsor>.live.test.ts`

- [ ] Live test that skips without keys.
- [ ] Smallest real sandbox call for the demo mechanic.
- [ ] Assert the transition you will demo (e.g. authorize then capture, authorize then reverse).
- [ ] Status-only commit marking 1.6.

### Row 2.1: Domain rules

**Files:** `src/core/**`, `tests/*.test.ts`

- [ ] Allowed statuses and illegal transitions as pure functions.
- [ ] Table-driven tests: happy path + abuse cases.
- [ ] No I/O in `src/core`.

### Rows 2.3-2.4: API + UI demo path

- [ ] Mutating route returns `{ ok: false, reason }` when nothing happened, `UNKNOWN` when ambiguous.
- [ ] One UI path, no login, both beats reachable.
- [ ] Playwright smoke on localhost, then on production.

### Row 2.6: Deploy + probe

- [ ] Dedicated host project; env set on the host.
- [ ] `probe.yml` repository variables: `PROBE_BASE_URLS`, `PROBE_REQUIRE` (exactly the claimed integrations), `PROBE_BRAND`.
- [ ] Manual check after deploy: `curl /api/health`, walk `/judge`.

### Row 2.8: FACTS

- [ ] A script writes measured numbers into `docs/FACTS.json`; its command goes in `provenance`.
- [ ] `tests/facts.test.ts` green.

<!-- Add a section per depth row (2.9+) using the same shape: Files, then checkbox steps. -->
