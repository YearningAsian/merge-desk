---
name: planning-with-files
description: "Use when: working on large refactors, executing multi-file changes, or complex system modeling."
---

# Planning with Files

## Core Directives
- Utilize a strict file-planning architecture: you must maintain a `task_plan.md` in the workspace root or memory during the task.
- Prevent the model from losing its place in endless loops.

## Execution Rules
1. Create or update `task_plan.md` immediately upon starting a complex task.
2. Dynamically update the progress state in `task_plan.md` every two file operations.
3. Check off completed items explicitly.