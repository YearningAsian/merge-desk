---
doc: prd
status: approved
---

# Merge Desk — Product Requirements

A merge you can watch and understand, for a developer whose pull request just went red because a teammate merged first. Desktop is the showpiece; the phone mirrors it for watching and deciding.
Source: `scope.md > The Unique Kernel`, `scope.md > Who It's For`.

## The Core Journey

Source: `scope.md > The Core Loop`, `scope.md > What "Working" Looks Like`.

1. **Open Merge Desk** on a computer. One screen: the repository's open pull requests on the left, conflicting ones first.
2. **Select a conflicting pull request.** The right side shows an **analysis of both sides**: what each side meant, in one line, with the commits, files and authors behind it one click away.
3. **See the options before anything happens.** Two or three ways to resolve it (for example *combine both*, *keep the newer side and drop the older one*), one marked **Recommended** with the reason. Each option says exactly what will be kept, what will be dropped, and whose work that is.
4. **Choose an option.** A slider runs from *keep ours* (blue) through *combine* to *keep theirs* (orange) and starts on Recommended, so the common path is one click to run. If it drops work, an inline confirmation shows what will be lost; confirm with Cmd/Ctrl+Enter on desktop or hold-to-confirm on phone.
5. **Watch the agent work**, as a plain step list with states (queued, running, passed, failed): read both sides, write the merge on a scratch copy, describe what it did, then the checks (it parses, your choice was honored, the tests pass). Raw logs stay collapsed under each step.
6. **One of two endings:**
   - **Verified:** a result card says what the merge did in plain words, with the diff. **Land** writes it to the pull request's own branch, and the pull request shows as mergeable on GitHub.
   - **Held:** nothing on the real branch changed. You see which check failed, what the agent tried, and what it produced, then choose what to do next.
7. The pull request's row updates (Landed, Held, Dropped) and the decision is recorded in its history.

## Screens and Layout

**One main screen, no page changes for the core flow.** (Learner: "The pc layout is the main selling point.")

- **Left: Pull request list.** Fixed-width column. Conflicting pull requests first, then the rest collapsed under "Can merge".
- **Right: Pull request detail**, top to bottom: header (title, number, branches, state), **Analysis** (ours and theirs side by side), **Options**, **Run** (live steps and checks), **Result** (what the merge did, diff, Land), then **Details**, folded (the exact commits everything is bound to, step timings and logs, commands that recreate the conflict locally). **Settings** (gear, or `,`) chooses the Gemini model and tunes the desk; `?` lists the keyboard shortcuts. Sections are minimized but clickable to expand; the section that needs attention is open.
- **Phone:** the same order and pieces, adapted: the list is the home view; selecting a pull request opens the detail as a full-height sheet; diffs are shown one column at a time; actions sit at the bottom within thumb reach. The phone is for **watching and deciding** (pick an option, confirm, land, discard), not editing code.

## Look and Feel

Learner direction (captured in the PRD interview):

- **Fast, quiet, keyboard-first.** References: **Linear** for speed and density, **Vercel** for clear status and deployment-style step lists, **GitHub's diff view** for anything showing code ("that's what I already read fluently").
- **Apple design guidelines in spirit:** clear hierarchy, **one primary action per view**, **system fonts**, restrained motion, native Mac and iOS conventions, but with developer-tool density (Xcode or Linear spacing, not consumer-app spacing).
- Agent activity is a plain step list with states; raw log collapsed underneath.
- **Every state visible at a glance.** No action hidden behind a gesture or a menu.
- **Avoid:** Jira-style settings sprawl, pop-up stacks, AI sparkle effects and typing animations, blur or translucency behind code or diffs.
- Side colors carried from `docs/design/BRAND.md`: ours blue, theirs orange; every status also has its word, never color alone. (BRAND.md's custom fonts are replaced by system fonts per this direction.)

## Features and Behavior

### Pull request list

Shows the connected repository's open pull requests.
- [ ] Conflicting pull requests appear first, each row showing: title, number, author, the two branches, number of conflicting files, and its Merge Desk state (Needs resolution, Running, Held, Landed, Dropped).
- [ ] Pull requests that can already merge are grouped below, collapsed.
- [ ] Selecting a row opens its detail on the right without leaving the screen.
- [ ] Up/Down (or J/K) moves through the list; Enter opens.

### Conflict analysis

Source: `scope.md > The Unique Kernel`.
- [ ] For each side (ours, theirs): one plain-language line saying what that side meant to do.
- [ ] Expanding a side shows its commits, files touched and authors.
- [ ] The conflicting files are listed; each opens a GitHub-style diff (side by side on desktop).

### Resolution options

- [ ] Two or three options are shown before anything runs, such as *combine both*, *keep ours and drop theirs*, *keep theirs and drop ours* (including "drop the older build" when one side is clearly older).
- [ ] Exactly one option is marked **Recommended**, with a one-sentence reason; every other option has a one-sentence reason too (when someone would pick it instead).
- [ ] Each option states what will be kept, what will be dropped (commits, files) and whose work is affected, before it is chosen.

### Intentional drops

Learner: record it "as a decision, not a failure".
- [ ] Choosing an option that drops work shows an **inline** confirmation (no pop-up): number of commits and files lost and whose work it is. If the dropped work belongs to someone else, the confirmation says so by name.
- [ ] Confirm with Cmd/Ctrl+Enter on desktop or hold-to-confirm on phone; it is asked once.
- [ ] Checks run **against the choice**: pass only if the dropped side's changes are the only thing missing and everything else is intact; fail if anything else was lost or part of the dropped side leaked in.
- [ ] After landing, the pull request's history shows "Dropped by [person], [time]", the option picked, the reason shown at the time, and exactly what was dropped (commits, files, authors).
- [ ] **Dropped work stays recoverable now, without a restore button:** the dropped side's branch and commits are never deleted, and the decision entry records exactly where they are (branch name and commit IDs). The promise that a drop is reversible is true from day one.

### Live run and checks

- [ ] After an option is chosen, a step list appears with each step's state: queued, running, passed, failed.
- [ ] Steps: read both sides; write the merge on a scratch copy; describe what it did; check it parses; check the choice was honored (both intents present for *combine*, or only the dropped side missing for a drop); run the tests.
- [ ] Each step's raw log is collapsed underneath it and opens with one click.
- [ ] The run never changes the pull request's real branch.
- [ ] Automatic retries stop after two; then the run waits for the user.
- [ ] **Tests are real and shown as they ran:** the demo repository has a small real test suite that finishes in under 30 seconds, and the screen shows its actual result and output. If tests cannot be run for a merge, the step shows **not run** and the merge is held. A pass that did not happen is never shown.

### Held merges

Learner: "a held merge has changed nothing on the real branch."
- [ ] A held run shows, in plain words: which check failed, what the agent tried, and the diff of what it produced; logs and test output are one click away.
- [ ] Actions, in this order: **pick a different option** (with the recommendation updated for what just failed); **steer and retry** with a short instruction; **discard** the attempt.
- [ ] After discarding, the pull request is back to Needs resolution with nothing changed.
- [ ] Both **pick a different option** and **steer and retry** work in the proof of concept; with the editor deferred they are the only ways out of a hold besides discarding.

### Landing a merge

- [ ] When every check passes, a result card shows what the merge did in plain words plus the full diff, and one primary action: **Land**.
- [ ] Landing writes the checked merge to the pull request's own branch; the pull request then shows as mergeable on GitHub.
- [ ] Merge Desk never writes to the base branch and never overwrites history.

### Decision record

- [ ] Every landed merge, drop, hold and discard is recorded on the pull request with who, when, the option, the reason shown, and the check results, visible in Merge Desk and on the pull request on GitHub.

### Demo mode and live mode

Learner decision: "Same UI and same code path for both; demo mode only swaps the data source for recorded runs. No separate fake screens."

- **Demo mode (public, no sign-in):** anyone can click through the full flow on three prepared pull requests: one clean merge, one that gets held, one where dropping a side is the right call.
  - [ ] It plays back real runs captured from live mode (real options, agent steps, check results and timings), so it is fast, costs nothing per visitor, and cannot break during judging.
  - [ ] It acts out everything live mode does, with no "live mode only" screens: steering, the decision record and Land replay real ones captured on the demo pull requests, which were reset after each Land (learner, 2026-10-07).
  - [ ] Nothing is written to any repository in demo mode.
  - [ ] The screen is clearly labelled **"Demo: recorded from a real run"** and has a **Reset** that starts the demo over.
- **Live mode (sign-in, the learner's account only for now):** the real agent on a real repository, with real checks and real landing. This is what the submission video shows, on a repository the learner owns, including one held merge and one verified merge landing.
  - [ ] Signing in is required before anything can run or land; other accounts are refused.
  - [ ] Settings can switch the model from Gemini (the server's key) to Claude, GPT or any OpenRouter model on the user's own key (learner, 2026-10-07). The key is kept sealed for that sign-in, never shown again or stored on the server, and cleared on sign-out; whichever model proposes, the same checks decide. Not mentioned in judge-facing copy until a real call with a real key has passed.
- **Recordings come from live mode:** demo recordings are captured from live mode once it works, and re-captured whenever the flow changes, so the demo never shows something the live system can't do.
- **Stated plainly:** the README and the Devpost page say what judges can try themselves (demo mode) and that the video shows live mode.

### Phone

- [ ] The same pieces in the same order, one column; the detail opens as a full-height sheet over the list.
- [ ] Phone actions are watch-and-decide only: pick an option, hold-to-confirm, land, steer with a short instruction, discard.

## States and Boundaries

- **First use / not connected:** a single panel explaining how to connect a repository; nothing else is shown until one is connected.
- **No conflicts:** "No conflicts. Every open pull request can merge." with the open pull requests listed below.
- **Running:** the step list is live; the row in the list shows Running.
- **Held:** see *Held merges*; the row shows Held.
- **Landed:** result card stays visible; the row shows Landed.
- **Pull request changed during review:** if someone pushes new commits while the analysis or a run is open, Merge Desk marks it out of date and requires a fresh run before Land is possible.
- **Already mergeable:** no options or run; the detail says nothing needs resolving.
- **Service unavailable** (GitHub or the AI not reachable): the step shows failed with the reason in plain words; nothing is written; the user can retry.
- **Permissions:** demo mode lets anyone click through and writes nothing. Live mode requires sign-in, accepts only the learner's account for now, and can only land on repositories that account can write to.
- **Demo reset:** Reset returns the three demo pull requests to their starting state.

## Product Decisions

- **Options before action** — see what can be done and why before anything changes, then watch exactly what happens during and after.
- **Intentional drops are decisions, not failures** — recorded with who, when, which option, the reason shown, and what was dropped; checked against the choice.
- **Inline confirmation, once** — Cmd/Ctrl+Enter or hold-to-confirm; names whose work is lost.
- **Held means untouched** — the agent always works on a scratch copy.
- **Two automatic retries, then wait** — the user stays in control.
- **Desktop first, phone mirrors it** — phone is for watching and deciding.
- **Two modes, one product** — public demo mode replays real recorded runs (fast, free, can't break during judging); live mode is the real thing, the learner only, shown in the video. Same screens and code path.
- **Recoverable drops now, restore button later** — never delete the dropped side; record where it is.
- **Never a fake pass** — tests that can't run show "not run" and hold the merge.
- **System fonts and Apple-style polish at developer-tool density** — no blur behind code, no hidden actions, no AI effects.
- **Assumptions (agent calls, delegated by the learner: "You can also decide what belongs and should be shown or hidden"):** the list row contents; which sections start collapsed (Analysis and Options open, logs and commit details collapsed); the option names; the Up/Down, J/K, Enter shortcuts.

## What We're Building

Everything above under *Features and Behavior*, for one connected repository, on desktop and phone layouts, in both demo mode (three prepared pull requests, recorded from real runs) and live mode (the learner's account, a repository the learner owns).

## Build Priority

Learner decision. Build in this order; if 1 to 3 are not working by the halfway point, stop, report, and cut from the bottom:

1. Held merge, end to end.
2. Verified merge, end to end.
3. The chosen-drop path with its check.
4. Options before action, with the recommendation.
5. Everything else in *What We're Building*.

## Deferred From the POC

Agreed in review. Each was requested and is worth building, but none is needed to prove the kernel in a short demo:
- **Fix it yourself in a side-by-side editor** — a code editor is a product on its own. For now a held run links to the scratch copy so you can fix it in your own editor.
- **Hand it to a teammate with full context** — needs teammates, identities and delivery. For now the held run's page can be shared by link.
- **Phone notification when something is held** — needs a notification service; arrives with the Expo app.
- **"Restore dropped side" button** — deferred, but recoverability is not: the dropped branch and commits are kept and their location recorded (see *Intentional drops*).
- **Command palette** — the core flow works with a few shortcuts; a full palette comes with the dashboard.
- **Native iOS feel: swipe actions and haptics** — a web page can't buzz an iPhone; these come with the Expo app. The web version keeps sheets and hold-to-confirm.

## Possible Later Enhancements

- Expo React Native app with a downloadable Android APK (from scope Later), bringing haptics, swipe actions and notifications.
- Full dashboard across projects, pull requests and merges; many repositories; sign-in with GitHub.
- A git merge driver so `git merge` uses the same checks.
- More AI providers with automatic fallback; a replay test over real historical merges. (Your own Claude, GPT or OpenRouter key in Settings was pulled in on 2026-10-07; see *Features and Behavior > Demo mode and live mode*.)

## Non-Goals

- **Merging into `main` for you** — Merge Desk makes the pull request mergeable; the team still merges it. (`scope.md > Explicitly Cut`)
- **Rebuilding GitHub** — issues, code browsing and reviews stay on GitHub. (`scope.md > Explicitly Cut`)
- **Editing code on the phone** — the phone is for watching and deciding.
- **Settings screens** — no Jira-style configuration in the proof of concept.

## Open Questions

1. ~~Who can run and land on the public demo?~~ **Resolved in review:** demo mode (public, recorded real runs, writes nothing) and live mode (sign-in, learner only). See *Demo mode and live mode*.
2. **"Older" side:** assumed to mean the side whose latest commit is older. Can be confirmed during the build.
3. **"Tests pass, live":** product rule settled (real suite under 30 seconds, actual output shown, "not run" holds the merge); how it runs is for `4-spec`.
