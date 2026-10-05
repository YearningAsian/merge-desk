# Brand

Single source for the site, stills, poster, thumbnail and video. Change it here first, then everywhere.

## Name and line

- **Name:** Merge Desk
- **Tagline:** AI merges that wait for proof.

## Mood

- **Atmosphere word:** deliberate
- **Supporting words:** precise, warm
- **Reference site:** a good code-review tool's diff view (calm neutral surfaces, one strong color per side, monospace that reads at a glance). Borrow: the restraint and the two-color diff language. Avoid: dark-mode neon, dashboard grids of cards, gradients behind code.
- **Metaphor:** a drafting desk. Two sheets (ours, theirs) laid side by side, the merged sheet below, a stamp that says HELD or VERIFIED.

## Color

| Token | Hex | Use |
|---|---|---|
| `--ink` | #12161d | text, outlines, primary button |
| `--paper` | #fbf8f1 | sheets (code surfaces) |
| `--field` | #ece6d8 | page background, the desk |
| `--accent` | #12161d | the one call to action (ink button, paper text) |
| `--ours` | #2f6fed | everything from the current branch |
| `--theirs` | #e07a2f | everything from the incoming branch |
| `--ok` | #1f8a4c | VERIFIED, LANDED |
| `--stop` | #c93c3c | HELD, REFUSED |
| `--wait` | #a68a1f | VERIFYING, UNKNOWN |

Blue and orange are the two sides because they stay distinct for the common forms of color blindness; every status also carries its word, never color alone.

## Type

- **Display:** Fraunces
- **Body:** IBM Plex Sans
- **Code:** IBM Plex Mono

All three self-hosted (no network fetch at build).

## Motion

1. The two intent sheets slide in from left and right when a conflict opens.
2. The HELD or VERIFIED stamp lands once when verification finishes.
3. CI status ticks from VERIFYING to its result.
None on scroll; nothing animates while a judge is reading code.

## Generation prompt tokens

Used by `hackathon-demo-assets` prompts: `[NAME]` = Merge Desk, `[ATMOSPHERE]` = deliberate, precise, warm, `[C1] [C2] [C3]` = #ece6d8 #2f6fed #e07a2f, `[ACCENT]` = #12161d, `[ONE-LINER]` = AI merges that wait for proof.
