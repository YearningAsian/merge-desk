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