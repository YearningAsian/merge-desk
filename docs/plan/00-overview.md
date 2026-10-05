# 00: Overview

## Problem

- About 1 in 5 merges in 143 open source projects caused a conflict. In 75.23% of those cases a developer had to reason about program logic to resolve it, and code associated with a merge conflict was twice as likely to have a bug. ([Brindescu, Ahmed, Jensen, Sarma, *Empirical Software Engineering*, 2019](https://doi.org/10.1007/s10664-019-09735-4))
- Coding agents open many parallel pull requests against the same files. Conflicts now arrive faster than a reviewer can read them, and the reviewer did not write either side.

## Users

| Persona | Moment | What they need |
|---|---|---|
| Reviewer of agent-written PRs | Two agent PRs touch the same function | See what each side meant, not just the markers; trust that neither change was dropped |
| Maintainer of a busy repo | A long-lived branch falls behind `main` | A resolution they can verify in one screen, gated by their own CI |
| Platform / dev-productivity team | Rolling out coding agents | A policy: no AI merge lands without a recorded verification |

## Existing approaches and the gap

- **Manual resolution in the editor.** Accurate when the person understands both sides; slow, and the reviewer often wrote neither side.
- **Structured / semi-structured merge tools.** Resolve some syntactic conflicts by understanding the language's structure; they cannot reconcile two changes of intent.
- **AI merge drivers** (plug into git as a merge driver, send base/ours/theirs to a model, write the answer back, several model providers, caching, whitespace-only shortcuts). Fast, but the model's output goes straight into the file and the tools themselves advise reviewing every result by hand. Nothing checks that each side's change survived.

**Merge Desk's wedge:** keep the good parts of AI merge drivers (git-native flow, deterministic shortcuts before any model call, provider choice, caching by content hash) and add the missing step: **the merge waits for proof.** Proof is (1) the result parses, (2) a deterministic check finds each side's intent in the result, (3) the repository's own CI passes on a resolution branch. The model proposes; code and CI decide.

## The signature moment

- **Beat A, held:** `rename` renames `fetchUser` to `getUser`; `retry` adds a retry on HTTP 429 inside `fetchUser`. A naive resolution keeps the rename and drops the retry. Merge Desk shows "theirs: retry on 429, MISSING" and holds it. Nothing is pushed.
- **Beat B, lands:** the verified resolution keeps both. CI goes green on `merge-desk/resolve-<pr>`, Merge unlocks, and the original PR becomes mergeable.

## Business model (hypothesis)

Per active repository, sold to teams running coding agents at volume; the buyer is the platform or developer-productivity lead. Not validated; no pricing claims in public copy.

## Risks

| Risk | Mitigation |
|---|---|
| Intent check is fooled (intent described loosely, or present but broken) | Intent check is one of three gates; CI is the backstop; the UI says what was checked, never "correct" |
| Prompt injection inside code or comments steers the model | The model's output is data; it cannot unlock anything; only `merge-desk/*` branches are writable |
| Writes to GitHub from a public demo can be abused | Demo repo only, fine-grained token scoped to it, atomic branch-as-lease per PR, rate limits before any model call |
| Large files or many hunks blow the latency budget | Deterministic strategies first; per-hunk calls; cache by content hash; size cap with an explicit REFUSED reason |
| Model cost | Hunk-level prompts, caching, daily cap |
| Looks like a reskin of a model | The verifier and the gate are the work; the AI disclosure says exactly which parts are model calls |
