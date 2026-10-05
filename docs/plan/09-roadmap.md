# 09: Roadmap

Phases follow the zero-to-ship workflow. Row-level status lives in [../../PLAN.md](../../PLAN.md); this file is the shape.

| Phase | Outcome | Gate |
|---|---|---|
| 0 Ideate | Wedge, beats, brand, plan | Event details known; wedge card approved |
| 1 Scaffold | Next.js app, env contract, `/api/health`, `/api/stats`, `/judge` stub, CI green; live GitHub round trip and one live model call from tests | CI green and row 1.6 green |
| 2 Build | Resolver core and intent verifier; GitHub-as-state (branch = lease); desk UI; Beat A held and Beat B lands on production; replay eval for the headline number | Both beats work on the production URL |
| 3 Harden | Feature freeze; adversarial review sweep by a different model; live abuse checks; truth sweep; claims dry run | Clean round and abuse checks pass |
| 4 Assets | Stills, real-footage demo video, gallery, poster | Video uploaded, 3+ gallery images |
| 5 Submit | FACTS locked, writeup in the team's voice, claims audit, every portal submitted | User confirms each portal |

## Depth candidates (only after Beat A and Beat B work on production)

1. **Replay eval** on real historical merges from a public repository: re-run each conflicting merge, compare an unchecked model resolution and the gated one against what the humans committed. Produces the headline number.
2. **Git merge driver** (`merge-desk driver %O %A %B %P`) sharing the same core, exiting non-zero to keep conflict markers whenever verification fails.
3. **Second model provider** with fallback order, only if a judged criterion rewards it.

## Open decisions

- Event, deadline, tracks (blocks Phase 0 gate).
- Model provider for the build (OpenAI or Gemini key on hand).
- Team: solo or with a teammate.
- License for the public repo.
