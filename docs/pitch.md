# Expo pitch and judge Q&A

Numbers come from `docs/FACTS.json` (as of its `asOf`). Say them exactly as written there.

## The 90-second pitch

1. **Hook (10 s).** In a study of 143 open source projects, 75.23% of merge conflicts needed a developer to reason about program logic, and code tied to a conflict was 2 times as likely to have a bug (Brindescu et al., 2019). I hate resolving them, and coding agents now open PRs faster than anyone can review.
2. **The gap (10 s).** AI merge tools write the model's answer into your file and leave you to check it. A merge that compiles but drops one side's change looks exactly like a good one.
3. **What we built (10 s).** Merge Desk: Gemini proposes the merge, and Land waits for three checks you can watch: it parses, a deterministic check confirms the chosen option was honored line by line, and the real tests pass in a sandbox with the network off.
4. **Beat A (20 s).** Open the held demo PR. The proposal parses and keeps both sides, then the real tests fail: HELD, nothing pushed. Steer it with one line ("keep the old call working too") and the choice-honored check catches the model dropping lines: MISSING, held again.
5. **Beat B (20 s).** Open the clean PR. The proposal keeps the rename and the retry; parses, choice honored, tests pass: VERIFIED. Land rechecks nobody pushed and adds the merge commit to the PR's own branch, never main. The PR turns mergeable.
6. **Dogfood (10 s).** It resolved a real conflict between two of its own pull requests, with the app's own unit tests in the sandbox, and on the way found a real bug in how it read the base branch.
7. **Proof (10 s).** 15 recorded runs from real sandboxes and real Gemini answers: 3 VERIFIED, 12 HELD, 3 real Lands. `/judge` replays them with no sign-in; `/api/health` is public.
8. **Close (10 s).** For small teams and anyone running coding agents: AI proposes, code decides. Try it at the URL on screen.

## If they only have 30 seconds

"Gemini proposes the merge; Merge Desk checks that it parses, honors the option you chose and passes the real tests before Land will push anything, and only to the PR's own branch. The demo replays real recorded runs with no sign-in: start at /judge."

## Judge questions, with honest answers

**Is it real (repo, tests, AI)?**
Yes. The demo pull requests are real PRs in this repository, the runs are real Gemini answers and real Vercel Sandbox test output, and the Lands were real commits on the PR branches (reset afterwards so the demo can repeat). The public demo replays those recordings; live mode is limited to my account and this repository.

**What does the AI actually decide?**
Nothing. It explains each side and proposes a merge. Only the parse check, the deterministic choice-honored check and the real tests can make a run VERIFIED, and Land rechecks the exact commits on GitHub. These checks are bounded evidence, not a proof that the merge is semantically right.

**What if the model is wrong?**
The run is HELD with the reason shown and nothing is pushed. You can steer with one line, try another option, discard, or download the attempt as a patch.

**How good is it, measured how?**
What we measured is in FACTS: the recorded runs and their outcomes. In those runs Gemini never dropped a side on its own, so every unsteered HELD came from the real tests; steering showed the choice-honored check catching a real drop. A replay over historical merges is future work, so there's no accuracy number.

**How is this different from existing AI merge drivers?**
They write the model's output into the file. Merge Desk shows each side's intent and every option's keeps and drops first, then requires the checks before anything lands, and records every decision on the PR.

**What is still open?**
Live mode is one account and one repository on purpose. The daily usage throttle counts sandboxes; it isn't a hard spending limit.

**Can I check it myself?**
Yes: `/judge`, `curl https://merge-desk-swart.vercel.app/api/health`, the demo PRs in the repository, and this public repo.
