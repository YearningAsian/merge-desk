---
name: git-guardrails
description: "Use when: modifying git history, committing code, or creating PRs."
---

# Git Guardrails

## Core Directives
- Defensive programming layer for Git.
- Prevent careless git mistakes, broken commits, or dangerous force pushes.

## Execution Rules
1. Enforce atomic, single-purpose commits.
2. Ensure commit messages follow Conventional Commits formatting (`feat:`, `fix:`, `chore:`, etc.).
3. Verify that `npm run test` or `npm run lint` equivalents (if available) are acknowledged before staging files.
4. Block force pushes to `main` or `master`.