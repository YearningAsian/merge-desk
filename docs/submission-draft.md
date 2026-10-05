# Devpost draft (rewrite TODO(you) parts in your own voice before submitting)

> Numbers must match `docs/FACTS.json` on submit day. Delete any integration line production `/api/health` does not report `true`.
> Run `check_claims.py --strict` before pasting into the portal.

## Tagline

<!-- FACTS.tagline: concrete, who + what, ideally one measured number -->

## Who it's for

<!-- Two sentences: who it is for, and what they get. -->

## Inspiration

<!-- TODO(you): personal hook + sourced problem, in your own words. -->

## What it does

1. **Find / start.** <!-- -->
2. **Commit / hold.** <!-- -->
3. **Check at the critical moment.** <!-- -->
4. **Allow or reverse.** <!-- -->
5. **Afterward.** <!-- optional depth that is live -->

## How we built it

- **<!-- Sponsor -->:** <!-- the real sandbox calls; what was verified live, end to end -->
- **<!-- Data / state -->:** <!-- -->
- **<!-- AI -->:** <!-- what it reads vs what decides -->
- **Proof you can check:** `/api/health`, `/api/stats`, `/judge`
- **Engineering:** CI (lint, types, tests, build, secret scan), a production probe, and adversarial review rounds on every path that moves money or state.

## What we used vs what we built

<!-- Only if the rules ask (AI disclosure). Models, APIs, frameworks used; what the team wrote this weekend. -->

## Challenges we ran into

- <!-- a specific bug review or measurement found, and the fix -->
- <!-- a measurement that changed the story -->

## Accomplishments that we're proud of

- <!-- the end-to-end path on the live site -->
- <!-- fail-closed behavior under abuse -->
- <!-- measured numbers served from an open endpoint -->

## What we learned

- <!-- TODO(you): an insight about where the problem really is -->
- <!-- an insight about building with agents and review -->

## What's next

- <!-- what is not turned on yet and why; production access; distribution -->

## Try it

- Live: <!-- FACTS.demo.liveUrl --> (judges: start at `/judge`)
- `<!-- FACTS.demo.curlExample -->`
- Repo: <!-- FACTS.demo.repoUrl -->

## Built with

<!-- only tools that are live or genuinely used -->
