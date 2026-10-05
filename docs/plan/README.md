# Merge Desk plan

**Idea:** developers reviewing pull requests from coding agents hit merge conflicts faster than they can reason about them. Merge Desk shows each conflict as two intents side by side, has a model propose a resolution, and lands it only after a deterministic intent check and CI pass.

**Canonical planning docs (event requirement):** [`devpost/scope.md`](../../devpost/scope.md), then `prd.md` and `spec.md` as they are approved, each with an HTML companion. The files below are background written before scope; where they differ, `devpost/` wins.

This is a hackathon-sized project, so the plan set is collapsed (workspace rule for small projects):

| Doc | What it holds |
|---|---|
| [00-overview.md](00-overview.md) | Problem, users, competitors, the wedge, risks |
| [09-roadmap.md](09-roadmap.md) | Phases and gates; maps to the rows in [../../PLAN.md](../../PLAN.md) |

Read in this order: this file, `00-overview.md`, `09-roadmap.md`, then `PLAN.md` for live status. Architecture and stack decisions land in `docs/adr/0001-stack.md` and `docs/stack.md` at the start of Phase 1. Task-level steps live in `docs/IMPLEMENTATION.md`.
