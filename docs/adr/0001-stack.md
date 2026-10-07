# ADR 0001: A compatible stable stack for the Merge Desk review desk

Date: 2026-10-04. Status: selected for documentation under the requested stack review; installation and integration validation remain pending. Supersedes the earlier token/resolution-branch architecture in background planning notes. Exact versions and evidence live in [docs/stack.md](../stack.md).

## Context

The approved [scope](../../devpost/scope.md), [PRD](../../devpost/prd.md) and [spec](../../devpost/spec.md) describe one responsive website, one public repository, recorded public demos and learner-only authenticated live runs. The model explains and proposes; deterministic choice checks and real tests decide whether Land is available. Land adds a merge commit to the PR's head branch, without writing to the base or rewriting history.

The requested review favors current stable technology and a complete UI/UX. That means filling missing implementation choices and verifying compatibility while keeping the approved desktop-first, phone watch-and-decide workflow.

## Decision

Retain **Next.js App Router + React + TypeScript + Tailwind on Vercel**, with Node LTS Route Handlers for the API. Add **shadcn owned source + Radix**, Lucide, class/variant helpers, **TanStack Query**, and **Pierre Diffs**. These cover accessible interaction primitives, fetched data and an actual code-review renderer; local run state remains a typed React reducer. System fonts, neutral surfaces, side colors and compact spacing come from the approved product direction, with reduced motion and keyboard/focus requirements in the spec.

Retain direct **Google GenAI SDK** calls to stable `gemini-3.5-flash-lite` (changed from `gemini-3.8-flash` on 2026-10-05 by learner decision after free-tier 503s; see [stack.md](../stack.md)), using Google's GA Interactions API in stateless mode. Use **Zod** across requests, model responses and recordings. Keep **Vercel Sandbox** behind the runner interface, with a trusted dependency snapshot, signed head/base revisions, deny-all networking for candidate code and mandatory teardown. Use **Octokit App auth** and **iron-session** for the existing single-user GitHub App workflow. GitHub comments hold decisions; repository files hold recordings; no application database is needed.

Addendum 2026-10-07 (learner): live mode's Settings may use **Claude, GPT or any OpenRouter model on the user's own key**, through the official **Anthropic SDK** and **OpenAI SDK** (OpenRouter via its OpenAI-compatible endpoint), each pinned to its provider's host. Keys are sealed per sign-in in an HTTP-only cookie, never stored server-side. Gemini stays the default on the server's key; the checks are the same whichever model proposes.

Use **Vitest + Playwright + axe**, matching ESLint/Next configuration and Prettier. Add redacted Sentry and Vercel Speed Insights during deployment polish after the core beats work. These integrations are planned capabilities, not claims of a deployed system.

Prefer exact current stable package pins and newest Node LTS. Two exceptions are necessary: **TypeScript 6.0.3** instead of stable 7.0.2 because the parser/lint chain and syntax API require the supported 6.x line; **ESLint 9.39.5** instead of stable 10.12.0 because Next's React/import/a11y plugin peers exclude 10. All other selected packages use the verified stable baseline. Keep **npm** instead of workspace-default pnpm to preserve existing commands, trusted snapshot installation and one lockfile.

## Alternatives considered

| Approach | Benefit | Tradeoff and decision |
|---|---|---|
| Next + targeted UI/runtime libraries (selected) | One deployment, matching React peers, accessible primitives, specialized diffs, straightforward streams | Requires disciplined client/server boundaries and a focused rendering/build check |
| Vite + separate Hono/Fastify backend | Clear independent frontend/backend releases | Adds deployment/auth/configuration work without serving a current requirement |
| Hosted data/realtime backend + durable workflow | Durable run history, reload resume, multi-user scale and atomic counters | Useful later; current approved behavior allows losing a run on reload and stores history on GitHub |

For primitives, **Base UI** is a valid stable alternative supported by shadcn, but Radix covers all current interactions and avoids mixing APIs. For code rendering, a generic editor such as Monaco introduces the explicitly deferred editing product; Pierre's stable read-only surface fits the current desk. AI SDK would be a replacement generation abstraction if providers expand, not an additional SDK for the same two Google calls.

## Consequences and limits

- Exact pins and a single lockfile make builds reproducible. Copied shadcn source is maintained in the project; CLI pinning does not freeze its remote registry. Newer compiler/linter majors wait for the whole chain to support them.
- Query refresh never authorizes Land; signed server artifacts, current head/base, deterministic checks and GitHub ref guards do. UI status and telemetry never supply proof of verification.
- A fast-forward head update cannot atomically guard a moving base; recheck it before Land and show GitHub's actual post-Land mergeability, including a new conflict if the base advances concurrently.
- The line/rename check is bounded evidence that the chosen changes survived; it cannot prove general semantic intent. Real tests and explicit fail-closed behavior remain essential.
- Ordinary streams do not provide durable background runs. A reload loses the attempt and cannot cause a push; Workflow/storage has an explicit future trigger.
- A tagged sandbox count is useful accounting, not atomic budget enforcement. Cookie counts can reset or race. Quotas and delayed provider pause settings must be described accurately; a strictly enforceable daily admission requirement would need a durable atomic counter and a separate decision.
- The local runner is a trusted manual dogfood/recording fallback with no cloud network isolation. It is never a public runner for arbitrary PR code.
- This review changes documentation only. No scaffold, account provisioning, dependency installation or production deployment has been completed.

## Validation before implementation proceeds

Use the pending checks in [docs/stack.md](../stack.md#checks-that-remain-before-calling-the-stack-operational): normal dependency resolution, lint/types/core tests/build, Pierre and sheet rendering, schema-valid Gemini response, sandbox snapshot/network/cleanup, GitHub App guard round trip, and actual account quota/spend settings. Preserve the held → verified → chosen-drop build priority.
