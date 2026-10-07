# Video plan (draft): Merge Desk, under 3 minutes (target 2:30)

Rules: real UI only for product shots; no third-party logos where avoidable (GitHub pages: crop to the PR status line, no octocat/header); no copyrighted music; numbers only from FACTS; captions burned in; URL on screen 3 s+.

| Time | Shot | Source | VO / caption (draft) |
|---|---|---|---|
| 0:00-0:08 | C0 cold open: a steered retry HELD with "theirs ... MISSING", then the next option VERIFIED | /demo PR #1, desktop capture | "This merge compiles. It also deletes your teammate's fix. Merge Desk won't land it." |
| 0:08-0:25 | Problem card over the PR list | /demo list | FACTS: 143 projects, 75.23% needed program-logic reasoning, 2x as likely to have a bug (Brindescu et al., 2019) |
| 0:25-0:40 | Two intents side by side, options slider | /demo PR #1 | "Each side as one sentence. Gemini proposes; the checks decide." |
| 0:40-1:15 | Beat A: run held on the real tests | /demo PR #2 (held) | "Parses. Choice honored. Then the real tests fail: HELD, nothing pushed." |
| 1:15-1:55 | Beat B: verified, Land, PR mergeable | /demo PR #1 Land replay; GitHub PR status line crop | "Land rechecks nobody pushed, adds the merge commit to the PR's own branch. Never main." |
| 1:55-2:20 | Dogfood on the phone: Merge Desk resolves its own conflicting PR into main with the app's own tests | learner's phone screen recording, live mode (slice 8) | "And it resolved a real conflict in its own code." |
| 2:20-2:40 | Proof: /judge, curl /api/health, repo | desktop capture + terminal | "Try it yourself: no sign-in." URL on screen |

Captures I can make (Playwright on production, 1920x1080): C0, C1 home, C2/C3 demo beats, C4 /api/stats + health curl, C5 /judge.
Captures that need the learner: the phone dogfood run (C6), narration voice (or an agreed generated voice), the YouTube/Vimeo upload.
