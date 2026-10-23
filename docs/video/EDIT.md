# Video script: Merge Desk, under 3 minutes (target 2:45)

Rules (Build With AI: Basics): under 3:00, on YouTube or Vimeo, shows the project working end to end, says what problem it solves, who it's for and why it matters. Real UI only. No third-party logos where avoidable (don't film github.com; the desk shows everything needed). No copyrighted music. Numbers only from `docs/FACTS.json`. Captions burned in. URL on screen 3 s or more.

Captured on: production https://merge-desk-swart.vercel.app, deployment ____ (fill in from `/api/health` time and the Vercel dashboard on the day).

## Before you record (once, about 20 minutes)

1. **Rehearse the live beat without landing.** Open `/live`, sign in, open `[#10] Land: the merge commit names the model that proposed it`, press Run checks on Combine both. It should end VERIFIED with the app's own unit tests passing. If it ends HELD or Gemini answers "high demand", stop: don't Land on camera; use the fallback in R4.
2. **Note #10's head for recovery:** `gh pr view 10 --json headRefOid`. Land is a real write and can be taken once. If a take goes wrong after Land, `git push --force-with-lease=feat/land-message-model:<landed sha> origin <old head>:feat/land-message-model` puts the conflict back (your git, not the app).
3. **Browser:** a clean Chrome profile, window 1920x1080, zoom 110%, bookmarks bar hidden, extensions hidden, Windows Do Not Disturb on. Sign in to `/live` before recording so the GitHub sign-in page is never filmed.
4. **Recorder:** OBS or the Windows Snipping Tool screen recorder, 1080p, 30 fps, no system audio. Record voice separately afterwards (easier to edit) or live, your choice.
5. **Demo state:** press **Reset** in the demo banner before every take.
6. **Pace:** slow cursor; pause 1 s on every state change; record each take twice.

## Recording order (not the edit order)

| Take | Where | Click by click | Gives you |
|---|---|---|---|
| R1 | `/` | Load the home page, wait for the hero's recorded run to finish, slow scroll to the proof row. No clicks. | C1 title and problem |
| R2 | `/demo`, PR #2 *Add a minimum charge and late fees* | Reset. Open #2. Hover the two intent panels (ours, theirs). Leave the slider on the recommended **Combine both**. Press **Run checks**. Let the steps tick to **HELD**; open the failed test step to show the tests' own output. Then under **Steer and retry combine both**, press **Retry** (the recorded line "Keep the old call working too." is filled in) and let it end **HELD** with ours and theirs **MISSING**. | C2 Beat A, and the cold open |
| R3 | `/demo`, PR #1 *Rename fetchUser to getUser* | Reset. Open #1. **Combine both**, **Run checks**, wait for **VERIFIED**. Press **Land: push merge commit to demo/clean/rename**. Show the Land result and the decision record entry. | C3 Beat B |
| R4 | `/live`, PR #10 (into `main`) | Open #10. Show the two intents (both edit Land's commit message). **Run checks** on **Combine both**; keep recording through the whole run (you'll speed it up). On **VERIFIED**, open the tests step so "the app's unit tests" is visible. Press **Land: push merge commit to feat/land-message-model**. Pause on the landed result. | C6 live dogfood |
| R4 fallback | `/demo` only | If the rehearsal failed, skip R4, drop scene S5 below and give its time to S3 and S4. Don't film a live HELD as if it were the plan; if you want it, say plainly that it was held. | |
| R5 | `/judge`, then `/api/stats` | Scroll the guide slowly to "What is real here". Open `/api/stats`. | C5 proof |
| R6 | Terminal | `curl https://merge-desk-swart.vercel.app/api/health` in a large font. | C4 proof |
| R7 (optional) | Phone, `/demo` PR #1 | Native phone screen recording: open #1, Run checks, VERIFIED. 10 s is enough. This is also PLAN 2.6's pending phone check. | Phone insert |

## Edit timeline and voiceover

About 330 words of voiceover, which fits in about 2:10 at a calm pace and leaves room for pauses.

| Time | Scene | Footage | Voiceover |
|---|---|---|---|
| 0:00-0:08 | S0 Cold open | R2: the steered retry ending HELD, ours and theirs MISSING | "This merge was written by AI. It parses. It also quietly drops code from both branches. Merge Desk caught it, and nothing was pushed." |
| 0:08-0:30 | S1 Problem | R1 home page | "This is Merge Desk. Merge conflicts are where bugs hide: in a study of 143 open source projects, 75.23 percent of conflicts needed someone to reason about program logic, and code tied to a conflict was 2 times as likely to have a bug. AI merge tools write the model's answer into your file and trust it. Merge Desk doesn't." Caption: Brindescu et al., Empirical Software Engineering, 2019. |
| 0:30-0:45 | S2 The desk | R2 opening #2: intent panels, slider | "Open a conflicting pull request and each side becomes one sentence: what ours meant, what theirs meant. Gemini offers options, and each one says exactly what it keeps and what it drops." |
| 0:45-1:20 | S3 Beat A: held | R2 run, HELD, test output, steer, MISSING | "I run the recommended option. The merge goes into a fresh sandbox with the network off. It parses, it keeps both sides, and then the repository's real tests fail: another file still calls the old signature. HELD. Nothing is pushed. I steer the model with one line and retry. This time Gemini leaves out lines from both branches, and a deterministic check catches it: MISSING. Held again." |
| 1:20-1:50 | S4 Beat B: verified and landed | R3 | "On this one, Combine keeps the rename and the retry. It parses, the choice is honored, the tests pass: VERIFIED. Only now can I Land. Land rechecks that nobody pushed since the run, then adds the merge commit to the pull request's own branch. Never main, never a force push. And the decision is recorded on the pull request." |
| 1:50-2:25 | S5 Live: its own code | R4, waits sped up with an on-screen "sped up" label | "Everything so far was a replay of real recorded runs. This is live. Two of Merge Desk's own pull requests changed the same line. It runs the app's own unit tests in the sandbox: VERIFIED. And I land it, for real, on that pull request's branch. Merging into main stays my click." |
| 2:25-2:45 | S6 Proof and close | R5, R6, then the URL full screen for 4 s | "Every number here is measured: 15 recorded runs, 3 VERIFIED, 12 HELD, 3 real Lands. You can replay all of it without signing in, starting at /judge. For small teams and anyone running coding agents: AI proposes, code decides." On screen: merge-desk-swart.vercel.app/judge |

Words to say exactly as the product says them: HELD, VERIFIED, MISSING, Land, Run checks, Combine both. Never "safe", "correct" or "bug-free".

## Editing

- Any editor works; Clipchamp ships with Windows 11 and does auto-captions. Burn captions in.
- Cut the cold open from the end of R2. Speed up only waiting time, never a verdict, and label it "sped up".
- The demo banner ("Demo: recorded from a real run") must stay visible in S0 to S4; S5 must visibly be `/live`.
- Export 1080p MP4. Check the length is under 3:00 before uploading.

## Before upload

- [ ] Under 3:00
- [ ] Cold open is real product footage
- [ ] Beat A (HELD) and Beat B (VERIFIED, Land) both visible
- [ ] Every number matches FACTS: 143, 75.23, 2, 15, 3, 12, 3
- [ ] No github.com page, no third-party logo, no music you don't have rights to
- [ ] URL on screen at least 3 s; captions readable on a phone
- [ ] Upload to YouTube as Public (or Unlisted if the form accepts it), then put the link in `docs/FACTS.json` `demo.videoUrl`
