# Merge Desk stack

Verified **2026-10-04** against npm stable release metadata and official documentation. Derived from [workspace STACK.md](../../STACK.md), with project-specific decisions in [ADR 0001](adr/0001-stack.md). [The technical spec](../devpost/spec.md) owns the application behavior; its [HTML companion](../devpost/spec.html) is the visual review surface.

This is a **planned dependency baseline**. There is no application scaffold or lockfile yet. Published peer ranges and service documentation have been checked; installation, production build and authenticated integration checks remain Phase 1 work.

## Runtime and framework

| Component/package | Exact baseline | Evidence | Role |
|---|---|---|---|
| Node.js | 24.21.0 LTS | [Official release](https://nodejs.org/en/download/archive/v24.21.0) | Local/CI runtime; Vercel Functions use the supported `24.x` major |
| npm | 12.2.0 | [Registry](https://registry.npmjs.org/npm/12.2.0) | One package manager and `package-lock.json` |
| `next` | 16.3.8 | [Registry](https://registry.npmjs.org/next/16.3.8) | App Router, Server Components, Node Route Handlers, Turbopack |
| `react` | 19.3.0 | [Registry](https://registry.npmjs.org/react/19.3.0) | Interactive desk |
| `react-dom` | 19.3.0 | [Registry](https://registry.npmjs.org/react-dom/19.3.0) | Matching React renderer |
| `typescript` | 6.0.3 | [Registry](https://registry.npmjs.org/typescript/6.0.3) | Strict types and syntax parser; compatibility hold |
| `@types/node` | 24.19.1 | [Registry](https://registry.npmjs.org/@types%2Fnode/24.19.1) | Latest stable types for the chosen Node 24 runtime |
| `@types/react` | 19.3.0 | [Registry](https://registry.npmjs.org/@types%2Freact/19.3.0) | React types |
| `@types/react-dom` | 19.3.0 | [Registry](https://registry.npmjs.org/@types%2Freact-dom/19.3.0) | Matching DOM types |

## UI and UX

| Component/package | Exact baseline | Evidence | Role |
|---|---|---|---|
| `tailwindcss` | 4.3.3 | [Registry](https://registry.npmjs.org/tailwindcss/4.3.3) | CSS-first design tokens, density, responsive layouts |
| `@tailwindcss/postcss` | 4.3.3 | [Registry](https://registry.npmjs.org/@tailwindcss%2Fpostcss/4.3.3) | Matching Tailwind PostCSS integration |
| `shadcn` | 4.21.1 (CLI) | [Registry](https://registry.npmjs.org/shadcn/4.21.1) | Generates owned component source; development tool |
| `radix-ui` | 1.6.7 | [Registry](https://registry.npmjs.org/radix-ui/1.6.7) | Accessible primitives under the copied components |
| `lucide-react` | 1.52.0 | [Registry](https://registry.npmjs.org/lucide-react/1.52.0) | Named, tree-shaken SVG icons |
| `clsx` | 2.1.1 | [Registry](https://registry.npmjs.org/clsx/2.1.1) | Conditional classes |
| `tailwind-merge` | 3.7.0 | [Registry](https://registry.npmjs.org/tailwind-merge/3.7.0) | Resolve Tailwind class conflicts in `cn()` |
| `class-variance-authority` | 0.7.1 | [Registry](https://registry.npmjs.org/class-variance-authority/0.7.1) | Button, badge and status variants; stable 0.x line |
| `tw-animate-css` | 1.4.0 | [Registry](https://registry.npmjs.org/tw-animate-css/1.4.0) | CSS used by copied component transitions |
| `@tanstack/react-query` | 5.104.1 | [Registry](https://registry.npmjs.org/@tanstack%2Freact-query/5.104.1) | Fetched PR data, focus refresh, cancellation, pending/error state |
| `@pierre/diffs` | 1.5.1 | [Registry](https://registry.npmjs.org/@pierre%2Fdiffs/1.5.1) | Read-only split/unified highlighted diffs |

Use shadcn's **Radix** family consistently, adding components only where the approved journey needs them: Button, Badge, Sheet, Accordion/Collapsible, RadioGroup, Tooltip, Skeleton, Textarea/Field and Kbd. Customize its source to the system fonts, neutral surfaces, blue/orange branch colors and compact spacing in [BRAND.md](design/BRAND.md). The default theme is a starting point; the conflict review surface defines the identity. [shadcn source model](https://ui.shadcn.com/docs), [Radix Sheet](https://ui.shadcn.com/docs/components/radix/sheet).

TanStack Query handles fetched data; typed React state/reducers handle local selection and run events. Explicitly disable retries on analyze/run/land/record mutations and never optimistically show a check pass or a completed Land. Cache identities separate demo/live, repository, PR and revision. Demo Reset clears replay state; focus refresh can invalidate a stale analysis. [Query defaults](https://tanstack.com/query/latest/docs/framework/react/guides/important-defaults), [mutations](https://tanstack.com/query/latest/docs/framework/react/guides/mutations).

Keep Pierre behind `DiffView`: lazy-loaded client code, stable `FileDiff`/`PatchDiff`, split desktop and unified phone, line numbers, selectable code and wrap/scroll controls. Theme the Shadow DOM through its documented configuration. Its experimental unresolved-file/token APIs and editor features are excluded. Syntax themes/languages/workers are local assets, with a readable plain-code fallback. Its Shiki dependency is resolved by the lockfile; a second highlighter is unnecessary. [Diffs documentation](https://diffs.com/llms-full.txt).

The UX completion criteria are keyboard navigation without stealing input focus, sheet focus trapping/return, inline recoverable drop confirmation, readable collapsed logs, honest loading/error/stale states, phone safe areas/touch targets, and state-only transitions of at most 150 ms with reduced motion. A pointer hold has a deliberate keyboard alternative. No notification pop-up stacks or essential icon-only states.

The explicit Firecrawl/Taste follow-up used the local [Firecrawl skill](../.github/skills/firecrawl-web-scraping/SKILL.md) to produce temporary clean Markdown from the HTML, with scripts/styles removed and tables retained. Python performed the extraction; no Firecrawl service was available or called. The remote [Taste redesign audit skill](https://raw.githubusercontent.com/Leonxlnx/taste-skill/main/skills/redesign-skill/SKILL.md) informed focused contrast, keyboard-focus and landmark corrections. Its font swaps, decorative effects and longer motion yield to the approved product design. No new runtime dependency or skill installation was needed. [BRAND.md](design/BRAND.md) defines darker text roles and contrast requirements; check actual rendered backgrounds during the scaffold's Playwright/axe and manual review.

## Backend and integrations

| Component/package | Exact baseline | Evidence | Role |
|---|---|---|---|
| `zod` | 4.6.5 | [Registry](https://registry.npmjs.org/zod/4.6.5) | Requests, model JSON, streams, signed artifacts and recordings |
| `@google/genai` | 2.27.0 | [Registry](https://registry.npmjs.org/@google%2Fgenai/2.27.0) | Official Gemini SDK |
| Gemini model | `gemini-3.5-flash-lite` (default since 2026-10-05; `GEMINI_MODEL` overrides) | [Official stable model](https://ai.google.dev/gemini-api/docs/models/gemini-3.5-flash-lite) | Intent explanations/options and merge proposals. Chosen over `gemini-3.8-flash` (503 "high demand" on the free tier all day), `gemini-3.5-flash` (38 s), `gemini-3.1-flash-lite` (cheaper if paid, but 2 of 4 held-scenario calls timed out and a weaker drop recommendation) |
| `@vercel/sandbox` | 3.5.1 | [Registry](https://registry.npmjs.org/@vercel%2Fsandbox/3.5.1) | Ephemeral isolated runner |
| `@octokit/rest` | 22.0.1 | [Registry](https://registry.npmjs.org/@octokit%2Frest/22.0.1) | GitHub REST client |
| `@octokit/auth-app` | 8.3.1 | [Registry](https://registry.npmjs.org/@octokit%2Fauth-app/8.3.1) | App JWT and installation-token scoping/refresh |
| `iron-session` | 9.0.1 | [Registry](https://registry.npmjs.org/iron-session/9.0.1) | Database-free sealed session cookie |
| `diff` | 9.0.0 | [Registry](https://registry.npmjs.org/diff/9.0.0) | Pure line comparison for the choice-honored gate |

Use Google's **GA Interactions API**, recommended for new projects, with `store: false`, JSON response schema derived from Zod, a bounded call deadline, and server-side Zod validation. Two stateless model tasks do not require an agent loop, tool execution or a second generation SDK. `generateContent` remains a supported legacy alternative, not the selected new-project API. [Interactions](https://ai.google.dev/gemini-api/docs/interactions-overview), [structured output](https://ai.google.dev/gemini-api/docs/structured-output).

Run live routes on Vercel Node Functions with Fluid compute, explicit `runtime = 'nodejs'`, `maxDuration = 240`, and a 210-second request deadline. NDJSON carries typed progress events. The 120-second sandbox cap and 30-second tests are independent sub-budgets; retries share the request deadline. No durable reload resume is promised. Stable Hobby function maximum is currently 300 seconds. [Duration limits](https://vercel.com/docs/functions/configuring-functions/duration).

Specify `image: 'vercel/sandbox/node:24'` and `persistent: false`; the older `runtime` sandbox option is deprecated. Snapshot from a trusted dependency revision; key reuse by image, lockfile, manifests and installation policy, then fetch/checkout the signed head/base SHAs. `snapshot()` stops the original VM. Only dependency-free JS-only playground runs can skip the snapshot; TS/TSX requires its trusted pinned compiler. Set deny-all before executing candidate code; cleanup belongs in `finally`. Account spend controls and SDK behavior still need an authenticated smoke check. [Sandbox SDK](https://vercel.com/docs/sandbox/sdk-reference), [snapshots](https://vercel.com/docs/sandbox/concepts/snapshots).

`iron-session` uses an explicit eight-hour TTL, HttpOnly/SameSite=Lax cookies, Secure in production, and the GitHub login allowlist. It supplies cookie sealing, not authorization or CSRF protection. Every mutation also verifies the expected origin/CSRF protection, signed revision and repository policy. The sandbox receives no application/model/session credentials. [Session API](https://github.com/vvo/iron-session).

## Quality and deployment polish

| Component/package | Exact baseline | Evidence | Role |
|---|---|---|---|
| `vitest` | 5.0.3 | [Registry](https://registry.npmjs.org/vitest/5.0.3) | Pure core, guards, schemas and server adapters with fakes |
| `@vitest/coverage-v8` | 5.0.3 | [Registry](https://registry.npmjs.org/@vitest%2Fcoverage-v8/5.0.3) | Matching coverage package |
| `@playwright/test` | 1.63.0 | [Registry](https://registry.npmjs.org/@playwright%2Ftest/1.63.0) | Desktop/phone end-to-end and visual checkpoints |
| `@axe-core/playwright` | 4.13.0 | [Registry](https://registry.npmjs.org/@axe-core%2Fplaywright/4.13.0) | Accessibility scans within the real journeys |
| `eslint` | 9.39.5 | [Registry](https://registry.npmjs.org/eslint/9.39.5) | Compatible flat-config lint major |
| `eslint-config-next` | 16.3.8 | [Registry](https://registry.npmjs.org/eslint-config-next/16.3.8) | Match the Next release |
| `typescript-eslint` | 8.71.0 | [Registry](https://registry.npmjs.org/typescript-eslint/8.71.0) | Typed lint rules/parser |
| `prettier` | 3.9.9 | [Registry](https://registry.npmjs.org/prettier/3.9.9) | Formatting |
| `@sentry/nextjs` | 11.4.0 (deployment polish) | [Registry](https://registry.npmjs.org/@sentry%2Fnextjs/11.4.0) | Redacted exception reporting; add after core works |
| `@vercel/speed-insights` | 2.0.0 (deployment polish) | [Registry](https://registry.npmjs.org/@vercel%2Fspeed-insights/2.0.0) | Measured real-user performance; add after core works |

CI will run formatting, ESLint CLI, `tsc --noEmit`, core/server tests, recordings validation and production build. Next 16 has no `next lint`. Playwright/axe must cover held, verified, chosen drop, reset and stale revision, with keyboard focus/confirmation and reduced-motion checks. Do not add a second component-test environment until it answers a gap these checks leave. [Next lint configuration](https://nextjs.org/docs/app/api-reference/config/eslint), [accessibility testing](https://playwright.dev/docs/accessibility-testing).

Structured server logs include request/run ID, step, duration, outcome and dependency error code. Sentry and performance integrations must not collect source code, prompts, candidate files, raw test logs, access tokens, cookies or signed artifacts. Health booleans describe actual integration status, not proof that a merge is correct.

## Compatibility exceptions

- **TypeScript:** npm `latest` is **7.0.2**; selected **6.0.3** is the newest stable 6.x patch. `typescript-eslint` 8.71.0 supports `>=4.8.4 <6.1.0`, and the syntax gate needs the compatible compiler API. A dual TypeScript 6/7 alias/toolchain adds complexity without helping the demo. [Support policy](https://typescript-eslint.io/users/dependency-versions/).
- **ESLint:** npm `latest` is **10.12.0**; selected **9.39.5** is the newest stable 9.x patch. TypeScript ESLint itself supports 10, but Next's React **7.37.5**, import **2.32.0** and JSX accessibility **6.10.2** plugin peers do not. Check the entire chain rather than Next's permissive top-level peer. [React peer](https://registry.npmjs.org/eslint-plugin-react/7.37.5), [import peer](https://registry.npmjs.org/eslint-plugin-import/2.32.0), [a11y peer](https://registry.npmjs.org/eslint-plugin-jsx-a11y/6.10.2).
- **Node:** choose newest LTS 24 rather than Current 26. Keep Node types on major 24; Vercel controls the deployed patch and sandbox image contents, so verify `node --version` in the live smoke check rather than claiming exact cloud patch parity.
- **Package manager:** npm preserves the approved build/snapshot commands. The workspace's pnpm preference is an explicit project deviation; do not create a second lockfile.
- **UI:** published peers for Radix, Lucide, Query and Pierre accept React 19. `tailwind-merge` 3.7.0 documents Tailwind 4.0-4.3 support. `@pierre/diffs` already depends on `diff` 9.0.0. Vitest 5 accepts Node 24, and its coverage package must match exactly. These metadata checks do not replace a scaffold/build test.

## Deferred additions and their trigger

| Addition | Add when |
|---|---|
| Base UI | An alternative primitive family is explicitly chosen; use it instead of Radix |
| React Hook Form | Forms grow beyond the current option selection and steering textarea |
| Motion | A required interaction cannot be expressed by the approved short CSS transitions |
| TanStack Virtual/Table, resizable panels | Profiling or the later multi-repository dashboard needs them |
| Monaco/CodeMirror | The deferred desktop editing product is approved |
| AI SDK or another provider | Provider portability becomes a requirement; replace the Google generation layer |
| Workflow/queue | Runs must survive disconnects/reloads/deployments or be scheduled independently |
| Postgres/Supabase/Redis | Shared durable history/accounts or strict atomic admission control becomes required |
| Expo/native tooling, notifications, PWA | The later native/installable product is approved |

## Installation and update policy

At scaffolding, requery each package's npm `latest`, exclude prereleases, and inspect the selected versions' `engines`, peers and optional peers. Apply compatibility holds above. Use exact direct dependency pins, `packageManager: 'npm@12.2.0'`, Node `24.x` in host configuration and an exact local/CI Node pin. Commit one `package-lock.json`; use `npm ci` for repeatability. Transitives and any dependencies generated by shadcn are captured there. Commit component source and `components.json`; a pinned CLI alone does not freeze upstream registry content.

Use `npx shadcn@4.21.1` during scaffolding, then inspect and commit only the needed generated source. No `latest`/canary/preview versions in manifests, no forced peer resolution, and no automatic major upgrade without compatibility review. Dependabot weekly grouped patch/minor PRs plus required CI can maintain this baseline after the scaffold exists; review majors separately.

## Scaffold check (2026-10-05, build slice 1)

- Every planned pin above was re-queried on npm before installing; none changed. TypeScript 7.0.2 and ESLint 10.12.0 are still npm `latest`, so both holds stay. ESLint 9.39.5 now prints npm's "no longer supported" notice; the hold remains while Next's React, import and JSX accessibility plugin peers exclude ESLint 10.
- Installed with `npx npm@12.2.0 install`. npm 12 blocks dependency install scripts unless allowed: `esbuild` and `unrs-resolver` postinstall scripts were blocked, and lint, typecheck, tests, build and `tsx` all work without them. Nothing was approved.
- Only slice 1's packages are installed: `next`, `react`, `react-dom`, `zod`, `diff`, Tailwind, ESLint, Prettier, Vitest and TypeScript. The others join in the slice that first uses them.
- Added `tsx` **4.23.15** (development) to run the TypeScript scripts (`gate`, `demo:seed`, `demo:reset`).
- Local development ran on Node 26.3.0; CI and deployment use Node 24 through `.nvmrc` (24.21.0).
- Passing: `npm run format:check`, `npm run lint`, `npm run typecheck`, `npm test`, `npm run test:playground` and `npm run build` (Turbopack).

## Checks that remain before calling the stack operational

- Install the pins with normal peer resolution, then lint, typecheck, unit tests and Next production build. Smoke-test the lazy diff component, generated primitives, styling and phone sheet.
- Run one authenticated structured Gemini call and one sandbox merge/test/deny-all/dispose round trip. Check the account's quotas, environment/OIDC handling and actual Node image.
- Exercise GitHub App authorization, scope and fast-forward-only writes on a disposable demo branch. Both head and base SHA changes must invalidate the signed result.
- Prove trusted dependency snapshot reuse; dependency changes hold until a trusted snapshot can be prepared. Candidate install/lifecycle code must not execute with unrestricted networking.
- Verify usage accounting before live mode is enabled. Tagged Sandbox listing supports accounting but is not atomic daily admission; a cookie counter is not a substitute. Retain the single-user usage throttle, and state the actual quota/pause controls without calling them an instantaneous hard budget cap. [Tags](https://vercel.com/docs/sandbox/concepts/tags), [Sandbox quotas](https://vercel.com/docs/sandbox/pricing), [spend controls](https://vercel.com/docs/spend-management).
