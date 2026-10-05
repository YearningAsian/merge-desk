# Brand

Single source for the site, stills, poster, thumbnail and video. Aligned with the approved `devpost/prd.md > Look and Feel` and `devpost/spec.md > Look and Feel`; keep those documents synchronized when the direction changes.

## Name and line

- **Name:** Merge Desk
- **Tagline:** AI merges that wait for proof.

## Mood

- **Atmosphere word:** deliberate
- **Supporting words:** precise, warm
- **Reference site:** a good code-review tool's diff view (calm neutral surfaces, one strong color per side, monospace that reads at a glance). Borrow: the restraint and the two-color diff language. Avoid: dark-mode neon, dashboard grids of cards, gradients behind code.
- **Metaphor:** a drafting desk. Two sides (ours, theirs) laid side by side, the merged result below, with an explicit HELD or VERIFIED label.
- **Interaction:** Linear/Xcode density, a clear step list and one primary action per view. Phone actions stay within thumb reach; the phone is for watching and deciding.

## Color

| Token | Hex | Use |
|---|---|---|
| `--ink` | #16181d | text, outlines, primary button |
| `--surface` | #ffffff | code and content surfaces |
| `--bg` | #f5f5f3 | neutral page background |
| `--paper` | #ffffff | semantic alias for content surfaces |
| `--field` | #f5f5f3 | semantic alias for page background |
| `--muted` | #646a75 | secondary text |
| `--hair` | #e3e3df | quiet borders |
| `--accent` | #16181d | the one call to action (ink button, white text) |
| `--ours` | #2f6fed | everything from the current branch |
| `--theirs` | #d9711f | everything from the incoming branch |
| `--ok` | #1f8a4c | VERIFIED, LANDED |
| `--stop` | #c93c3c | HELD, REFUSED |
| `--wait` | #9a7d14 | VERIFYING, UNKNOWN |
| `--ours-text` | #2558bd | current-branch small text on neutral surfaces or blue wash |
| `--theirs-text` | #a84e0f | incoming-branch small text on neutral surfaces or orange wash |
| `--ok-text` | #176b3a | VERIFIED, LANDED small text on neutral surfaces or green wash |
| `--wait-text` | #78600b | VERIFYING, UNKNOWN small text on neutral surfaces or amber wash |
| `--stop-text` | #a83030 | HELD, REFUSED small text on neutral surfaces or red wash (`--stop` on its wash is 4.3:1) |
| `--control-border` | #85867e | boundaries needed to identify active inputs |

Blue and orange identify the two sides; every side and status also carries its word, never color alone. Diffs use GitHub-style green/red line washes. No gradients, blur or translucency behind code.

Keep identity colors for markers and washes; use the darker text roles for small labels. Text needs at least 4.5:1 against its actual background, including badge and diff washes. The five text variants pass on `--surface` and `--bg`; verify rendered combinations before shipping. `--hair` is a decorative divider, not the sole input boundary or focus cue. Required control boundaries and focus cues need at least 3:1 against adjacent colors. Use a visible 2 px `--ink` focus outline with an offset on these light surfaces, including buttons after any CSS reset. [Text contrast](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html), [non-text contrast](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html).

## Type

- **Text:** `-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif`.
- **Code and states:** `ui-monospace, "SF Mono", Menlo, Consolas, monospace`.
- **Density:** 13 to 14 px base text, about 32 px list rows, 8 px radii and hairline borders. Phone actions need comfortable touch targets.

System fonts only; no web-font download or build-time font fetch.

## Motion

State changes only, 150 ms or less. Honor `prefers-reduced-motion`; keep the code view still while someone reads. Check rows move from queued to running and their actual result. No scroll animation, typing effects, sparkle or theatrical status stamps.

## UI foundations

Use owned shadcn/ui components with Radix primitives for accessible sheets, tabs, collapsible sections and tooltips; Lucide for consistent icons; Pierre Diffs for the read-only code view. Apply these tokens to the components instead of adopting a library's default visual identity. Keyboard focus, labels and status announcements remain visible and useful. Versions and responsibilities live in [../stack.md](../stack.md).

Each product view has a named main landmark and a keyboard-visible skip link. Status badges use a dark text role on a quiet wash; icon strokes remain consistent and their actions carry names.

## Generation prompt tokens

Used by `hackathon-demo-assets` prompts: `[NAME]` = Merge Desk, `[ATMOSPHERE]` = deliberate, precise, warm, `[C1] [C2] [C3]` = #f5f5f3 #2f6fed #d9711f, `[ACCENT]` = #16181d, `[ONE-LINER]` = AI merges that wait for proof.
