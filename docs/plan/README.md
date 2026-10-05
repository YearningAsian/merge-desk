# Merge Desk plan

**Idea:** a developer on a small team opens a conflicting pull request, sees both sides' intents and resolution options, then watches a model propose a merge. Land unlocks only after parsing, a deterministic choice-honored check and the selected tests pass in a scratch runner. These checks report what was verified, without claiming semantic correctness.

**Canonical planning docs (event requirement):** approved [`devpost/scope.md`](../../devpost/scope.md), [`devpost/prd.md`](../../devpost/prd.md) and [`devpost/spec.md`](../../devpost/spec.md), each with an HTML companion. The files below summarize that plan; where they differ, `devpost/` wins.

This is a hackathon-sized project, so the plan set is collapsed (workspace rule for small projects):

| Doc | What it holds |
|---|---|
| [00-overview.md](00-overview.md) | Problem, users, competitors, the wedge, risks |
| [09-roadmap.md](09-roadmap.md) | Phases and gates; maps to the rows in [../../PLAN.md](../../PLAN.md) |

Read in this order: this file, `00-overview.md`, `09-roadmap.md`, then `PLAN.md` for live status. Verified versions and library responsibilities live in [../stack.md](../stack.md); architecture decisions live in [../adr/0001-stack.md](../adr/0001-stack.md). Task-level verification slices live in [../IMPLEMENTATION.md](../IMPLEMENTATION.md). The app is still awaiting its scaffold.
