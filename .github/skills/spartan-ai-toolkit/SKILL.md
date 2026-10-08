---
name: spartan-ai-toolkit
description: "Use when: submitting work for completion, performing code review, or enforcing quality gates."
---

# Spartan AI Toolkit

## Core Directives
- Implement un-bypassable quality gates.
- Prevent marking a task "done" without going through verification.

## Execution Rules
1. Enforce the sequence: `typecheck → lint → test → review`.
2. Do not solely rely on editing a test file to look green; explicitly run terminal verification if possible, or verify static types.
3. Review code against best practices before finalizing.

## Concrete Skills For Each Gate
- Typecheck and compile: `check-compiler-errors`.
- Test: the project's test command, plus `run-smoke-tests` when it has Playwright smoke tests.
- Verify a "done" or "fixed" claim with fresh evidence: `verify-this`.
- Review: `ponytail-review` for logic, safety and bloat; `thermo-nuclear-code-quality-review` for structure and maintainability.
- Ship: `review-and-ship`.
