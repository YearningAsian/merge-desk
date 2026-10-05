# 00: Overview

## Problem

- About 1 in 5 merges in 143 open source projects caused a conflict. In 75.23% of those cases a developer had to reason about program logic to resolve it, and code associated with a merge conflict was twice as likely to have a bug. ([Brindescu, Ahmed, Jensen, Sarma, *Empirical Software Engineering*, 2019](https://doi.org/10.1007/s10664-019-09735-4))
- Coding agents open many parallel pull requests against the same files. Conflicts now arrive faster than a reviewer can read them, and the reviewer did not write either side.

## Users

| Persona | Moment | What they need |
|---|---|---|
| Developer on a small team (first user) | A teammate merges first and their pull request conflicts | See both sides' intentions, choose a resolution and inspect the checks before landing |
| Reviewer of agent-written PRs | Two agent PRs touch the same function | See required changes and any intentional drops, with evidence and test output |
| Maintainer of a busy repo | A long-lived branch falls behind `main` | A resolution they can inspect in one screen, checked against the selected test suite |
| Platform / dev-productivity team | Rolling out coding agents | A policy: no AI merge lands without a recorded verification |

## Existing approaches and the gap

- **Manual resolution in the editor.** Accurate when the person understands both sides; slow, and the reviewer often wrote neither side.
- **Structured / semi-structured merge tools.** Resolve some syntactic conflicts by understanding the language's structure; they cannot reconcile two changes of intent.
- **AI merge drivers** (plug into git as a merge driver, send base/ours/theirs to a model, write the answer back, several model providers, caching, whitespace-only shortcuts). Fast, but the model's output goes straight into the file and the tools themselves advise reviewing every result by hand. Nothing checks that each side's change survived.

**Merge Desk's wedge:** **the merge waits for proof.** The UI shows the sides' intentions, the available choices and what each choice drops. Before Land unlocks, (1) the result parses, (2) a deterministic line-change check confirms the selected option was honored, and (3) the selected test suite actually passes in a scratch runner. Cloud candidate code runs with the network disabled and dependencies come from trusted snapshots. These checks do not prove semantic correctness; the UI names their scope and evidence. The model proposes; code and tests decide.

## The signature moment

- **Beat A, held:** `rename` renames `fetchUser` to `getUser`; `retry` adds a retry on HTTP 429 inside `fetchUser`. A naive resolution keeps the rename and drops the retry. Merge Desk shows "theirs: retry on 429, MISSING" and holds it. Nothing is pushed.
- **Beat B, lands:** the verified resolution keeps both, passes the choice-honored check and the sandbox tests. Land adds a merge commit on the pull request's own head branch, and the original PR becomes mergeable. It never merges into the base branch or overwrites history.
- **Chosen drop:** the user confirms what will be lost; checks run against that choice, and the decision records the dropped branch and commits so the work remains recoverable.

The public demo replays real recordings and writes nothing. Live mode uses GitHub App sign-in, accepts only YearningAsian and operates only on `YearningAsian/merge-desk`. Seeded demo pull requests target `demo/base`, never `main`. See [../../devpost/spec.md](../../devpost/spec.md) for the three scenarios and safeguards, and [../stack.md](../stack.md) for dependencies.

## Business model (hypothesis)

Per active repository, sold to teams running coding agents at volume; the buyer is the platform or developer-productivity lead. Not validated; no pricing claims in public copy.

## Risks

| Risk | Mitigation |
|---|---|
| Required lines are present but behavior is broken | Deterministic checks and actual tests are separate gates; ambiguous evidence holds the run; the UI says what was checked, never "correct" |
| Prompt injection inside code or comments steers the model | Model output is schema-validated data; only deterministic checks and tests can unlock Land; server guards restrict every write |
| GitHub access or public traffic is abused | Public demo is static and writes nothing; live mode checks the learner login and repository allowlists; GitHub App permissions and a `main` ruleset constrain writes |
| Large files, dependencies or many conflicts exceed the run budget | Input caps, trusted dependency snapshots and explicit timeouts; changed dependency manifests and unsupported or incomplete checks hold the merge |
| Model or sandbox cost | Recorded public demo, bounded calls, a non-atomic server-side usage throttle and verified account quotas/pause settings; alerts and delayed pause checks do not guarantee a hard budget ceiling |
| Looks like a reskin of a model | The verifier and the gate are the work; the AI disclosure says exactly which parts are model calls |
