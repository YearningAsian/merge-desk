---
name: pstack
description: "Use when: a task touches more than one file, changes a signature other files call, involves a design or architecture choice, or is a bug or performance issue whose cause is not yet known. Trigger phrases: pstack, poteto-mode, go deep first, architect this, interrogate this, why does this exist, how does this work."
---

# pstack

Lauren Tan's agent workflow stack: go deep first, then write less but higher-quality code. It depends on harness features (subagents, model routing, scripts), so it is installed as a native plugin per agent rather than copied into this folder.

## Where It Lives

| Agent | Install |
|---|---|
| Claude Code | `claude plugin marketplace add michael-denyer/pstack-claude` then `claude plugin install pstack@pstack-claude` |
| Codex | `codex plugin marketplace add michael-denyer/pstack-claude` then `codex plugin add pstack@pstack-claude` |
| Cursor | `/add-plugin pstack` (official, cursor/plugins) |
| Copilot CLI | `copilot plugin marketplace add michael-denyer/pstack-claude` then `copilot plugin install pstack@pstack-claude` |

## Routing

Skill names may carry a `pstack:` prefix, depending on the agent.

1. Start with `poteto-mode`. It reads the task and routes to the right skill below.
2. Enter a skill directly when the intent is already specific:
   - `tdd`: behavior change with a test that can fail first.
   - `architect`: a design or architecture choice.
   - `how` / `why`: explain how code works, or why it exists.
   - `interrogate`: multi-reviewer critique of a plan or diff.
   - `unslop`: strip AI slop from prose or code.
3. Small contained edits (one file, obvious test) skip pstack: work directly and verify on the real artifact.

## If pstack Is Not Installed

Apply its core principles by hand:

1. Understand before editing: read the code paths you will change and their callers.
2. Fix root causes, not symptoms.
3. Subtract before you add: delete or reuse before writing new code.
4. Test behavior, not implementation.
5. Prove it works on the real artifact (run it), not only by reading the diff.
