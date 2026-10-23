# Gallery: real production captures (2026-10-23)

Captured from https://merge-desk-swart.vercel.app with Playwright at 1500x1000 (3:2, the size Devpost recommends), UI pixels unchanged. Only image 6 is composited: a 390 px phone capture placed on a plain canvas with a short title. No generated UI. Upload in this order:

| # | File | Caption |
|---|---|---|
| 1 | `gallery/1-cover.png` | Merge Desk: AI merges that wait for proof. |
| 2 | `gallery/2-verified.png` | VERIFIED: it parses, both sides' changes are present and the real tests pass. Only now can it Land. |
| 3 | `gallery/3-held-steered.png` | HELD: the steered merge dropped lines from both sides, so the choice-honored check stopped it and nothing was pushed. |
| 4 | `gallery/4-chosen-drop.png` | Dropping work on purpose: theirs "dropped as chosen", checked like any other option. |
| 5 | `gallery/5-judge.png` | The judge's guide: three real pull requests, replayed with no sign-in. |
| 6 | `gallery/6-phone.png` | The same desk on a phone, with the action pinned within thumb reach. |

Images 1 to 5 replay recorded real runs in demo mode (the "Demo: recorded from a real run" banner is visible wherever the desk is). The older 1440 px captures stay in `raw/`; they show the home page before the 2026-10-19 redesign.

Found while capturing: after a demo Land, the result card shows the attempt time as the time of the replay, not the recorded date (low, frozen; the banner states Oct 7).
