# Workspace Skills Template

Canonical skill set for every project under `Projects/`. The jumpstart in `Projects/AGENTS.md` copies this folder into each new project's `.github/skills/`. Agents read each `SKILL.md` frontmatter and follow the skills whose triggers match the task.

## By Stage

| Stage | Skills |
|---|---|
| Plan | `planning-with-files`, `superpowers`, `pstack` |
| Write | `ponytail`, `pstack`, `frontend-design`, `vercel-react-best-practices`, `remotion-best-practices` |
| Test | `check-compiler-errors`, `run-smoke-tests` |
| Validate | `verify-this`, `ponytail-review`, `thermo-nuclear-code-quality-review`, `deslop`, `spartan-ai-toolkit` |
| Merge | `review-and-ship`, `new-branch-and-pr`, `make-pr-easy-to-review`, `get-pr-comments`, `loop-on-ci`, `fix-ci`, `fix-merge-conflicts`, `git-guardrails` |
| Repo health | `ponytail-audit`, `ponytail-debt` |
| Other | `caveman`, `composio-tools`, `firecrawl-web-scraping` |

## Sources

| Skills | Source | Pinned |
|---|---|---|
| `caveman`, `composio-tools`, `firecrawl-web-scraping`, `frontend-design`, `git-guardrails`, `planning-with-files`, `remotion-best-practices`, `spartan-ai-toolkit`, `superpowers`, `vercel-react-best-practices` | Written for this workspace | - |
| `pstack` | Written for this workspace: points to the native pstack plugin | - |
| `check-compiler-errors`, `deslop`, `fix-ci`, `fix-merge-conflicts`, `get-pr-comments`, `loop-on-ci`, `make-pr-easy-to-review`, `new-branch-and-pr`, `review-and-ship`, `run-smoke-tests`, `thermo-nuclear-code-quality-review`, `verify-this` | [cursor/plugins `cursor-team-kit`](https://github.com/cursor/plugins/tree/main/cursor-team-kit), copied verbatim | `ccb5507` (2026-10-07) |
| `ponytail`, `ponytail-audit`, `ponytail-debt`, `ponytail-review` | [DietrichGebert/ponytail](https://github.com/DietrichGebert/ponytail) `skills/`, copied verbatim | `b088b2d` (2026-10-08) |

Copied skills are MIT. Their licenses are in `THIRD_PARTY_NOTICES.md`. Edit them only by re-copying from upstream, so updates stay mechanical.

## Native Plugins

The copies above work in any agent. The native plugins add what files cannot: ponytail's always-on mode hooks, pstack's subagents and model routing, and agents such as `ci-watcher`.

| Agent | ponytail | pstack | cursor-team-kit |
|---|---|---|---|
| Claude Code | `claude plugin marketplace add DietrichGebert/ponytail`, `claude plugin install ponytail@ponytail` | `claude plugin marketplace add michael-denyer/pstack-claude`, `claude plugin install pstack@pstack-claude` | Local copy at `~/.claude/skills/cursor-team-kit` (minus the skills pstack ships) |
| Codex | `codex plugin marketplace add DietrichGebert/ponytail`, `codex plugin add ponytail@ponytail` | `codex plugin marketplace add michael-denyer/pstack-claude`, `codex plugin add pstack@pstack-claude` | Local marketplace; see the Codex `developer-workflows` install |
| Cursor | `node scripts/cursor-hooks.js install` from a ponytail checkout | `/add-plugin pstack` | `/add-plugin cursor-team-kit` |
| Copilot CLI | `copilot plugin marketplace add DietrichGebert/ponytail`, `copilot plugin install ponytail@ponytail` | `copilot plugin marketplace add michael-denyer/pstack-claude`, `copilot plugin install pstack@pstack-claude` | Copies in this folder |

## Updating

1. Clone cursor/plugins and DietrichGebert/ponytail.
2. Re-copy the skill folders listed under Sources, strip CRLF, and update the pinned commits above.
3. Sync this folder into each project's `.github/skills/` and commit there.
