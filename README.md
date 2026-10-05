# Merge Desk

AI merges that wait for proof.

Merge Desk shows a merge conflict as two intentions side by side ("ours renames `fetchUser`", "theirs adds a retry on 429"), asks a model to propose a resolution, and lands it only when both intentions are still present and CI is green on a resolution branch. A resolution that quietly drops one side's change is held, with the missing intent named.

## Status

Planning (Phase 0). Nothing is deployed yet. See [PLAN.md](PLAN.md) for the live status board and [docs/plan/](docs/plan/README.md) for the product plan.

## How it will work

1. Pick a pull request with a conflict.
2. Each conflict hunk is shown as base, ours and theirs, with each side's intent in one line.
3. Simple cases (identical edits, one side unchanged, whitespace only) resolve without a model.
4. Otherwise a model proposes a merge. A deterministic checker confirms it parses and that each side's intent is still in the result.
5. The resolution is pushed to a `merge-desk/resolve-<pr>` branch. Merge unlocks only when CI on that branch passes.
6. Merge Desk never writes to a base branch and never force-pushes.

## Run it

Not runnable yet. Setup instructions land with the scaffold (PLAN row 1.2).
