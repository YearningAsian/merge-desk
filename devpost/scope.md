---
doc: scope
status: approved
---

# Merge Desk

A merge you can watch and understand: an AI proposes the resolution, you see what each side meant and what the merge did, and checks run live in front of you before anything lands. On your phone or your computer.

## The Unique Kernel

Merge conflicts stop being a black box. Each side of the conflict is shown as a plain-language intent ("ours renames `fetchUser`", "theirs adds a retry on 429") next to a visual diff. The AI's proposed merge is checked live, on screen, for whether it still keeps both intents and passes the tests. A merge that drops a teammate's change is held, with the missing intent named. Nothing lands until the checks pass.

## Who It's For

A developer on a small team whose pull request just went red with a conflict because a teammate merged first. Today they open the editor, read raw conflict markers, guess what the teammate meant, push, wait for CI, test by hand, and repeat. In the learner's words: "resolving merge conflicts are a headache... I love working with teammates but hate dealing with merge conflicts and spending lots of time trying to fix it." First user: the learner.

## The Core Loop

Open Merge Desk (phone or desktop) and see the pull requests that can't merge. Tap one. Read the two intents side by side, watch the proposed merge and the checks tick live, and tap Land. The pull request turns mergeable on GitHub. They come back every time a teammate's merge breaks theirs.

## Inspiration & Identity

- "A visualization, description, live updates that are actually easy to understand", "a live view... that doesn't get lost in the CLI".
- "An easy to navigate GitHub that is less confusing and focused on development." Out of the way day to day; open it full screen for a dashboard.
- Works on a phone as well as a computer: "you can easily resolve from your phone or computer."
- Existing AI merge drivers resolve conflicts inside git and write the model's answer straight into the file. Merge Desk borrows their flow and adds what they lack: the explanation, the live checks, and the hold.
- Feel (from `docs/design/BRAND.md`, agent-drafted): a drafting desk, calm and precise; one color per side (ours blue, theirs orange); every status in words, not color alone.

## Why This Matters to the Learner

"I want to use this myself since resolving merge conflicts are a headache and I wanna make a tool that makes collaboration among devs easier." The learner also wants to use Merge Desk on this project itself and show that in the demo.

## What "Working" Looks Like

Agent recommendation (the learner invited it; confirm in review): on a phone, open Merge Desk on the merge-desk repo itself. Two real branches made during this build touched the same file, so their pull requests conflict.
1. Tap the conflicting pull request. Both sides appear as one-line intents above a side-by-side diff.
2. **The held case:** a merge that keeps one side and drops the other fails live: "theirs: retry on 429, MISSING". It is HELD and nothing is pushed.
3. **The "oh, that's cool" beat:** the proposed merge keeps both. Checks tick green one by one as you watch (parses, both intents kept, tests pass). Tap Land, switch to GitHub, and the pull request shows it can merge.
The same flow works on a laptop screen.

## The POC Boundary

- Connect one GitHub repository (the learner's own; merge-desk for the demo).
- List its pull requests that GitHub reports as conflicting.
- Conflict view: each side's intent in plain language, a side-by-side visual diff, the AI-proposed merge (Gemini), and a one-line description of what the merge did.
- Live checks streamed on screen: the result parses, each side's intent is still present, and the repo's tests pass.
- Land: commit the checked resolution to the pull request's own branch (what GitHub's web conflict editor does), never to `main`, never a force-push. Held merges push nothing.
- One responsive web app that works on a phone and a desktop.

## Later

- Full dashboard of all projects, pull requests and merges ("an easy to navigate GitHub").
- Installable desktop / home-screen app that stays out of the way.
- **Expo React Native app with a downloadable Android APK**, built once the web app works end to end (learner: "This will be made obviously once the full app itself works"). Same backend as the web app.
- Many repositories, sign-in with GitHub for any user, notifications when a conflict appears.
- A git merge driver for the terminal, so `git merge` uses the same checks.
- More AI providers, with fallback.
- A replay test over real historical merges to measure how often an unchecked AI merge drops an intent.

## Explicitly Cut

- **App-store releases:** publishing to the Play Store or App Store adds review time and nothing to the kernel; a downloadable APK covers the native case.
- **Rebuilding GitHub in general** (issues, code browsing, reviews): it is not the kernel; the dashboard waits for Later.
- **Merging into `main` for you:** Merge Desk makes the pull request mergeable; the team still merges it.
