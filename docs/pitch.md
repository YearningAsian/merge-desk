# Expo pitch and judge Q&A

Numbers come from `docs/FACTS.json` (as of <!-- asOf -->). Say them exactly as written there.
Draft only: the app is not scaffolded or deployed. Align final claims with the approved spec and actual live evidence; public demo replay and authenticated live mode must be distinguished.

## The 90-second pitch (one person talks, the other drives)

1. **Hook (10 s).** About 1 in 5 merges hits a conflict, and code tied to a merge conflict is twice as likely to have a bug (Brindescu et al., 2019, 143 open source projects). <!-- add why you personally care -->
2. **The gap (10 s).** AI merge tools write the model's answer into your file and leave you to check it. A merge that compiles but drops one side's change looks exactly like a good one.
3. **What we built (10 s).** <!-- Merge Desk: Gemini proposes the merge, and Land waits for parsing, a deterministic check against your choice and actual sandbox tests. Say this only after it works. -->
4. **Beat A (20 s).** <!-- open the demo PR; the rename-vs-retry conflict; the naive merge drops the retry; HELD, "theirs: retry on 429, missing" -->
5. **Beat B (20 s).** <!-- the proposal keeps both; choice-honored evidence and real sandbox tests pass; Land adds a merge commit to the PR's own branch; the original PR turns mergeable -->
6. **Proof (10 s).** <!-- show the actual check output and PR history. Replay evaluation is deferred; use an evaluation number only if it was built and measured into FACTS. -->
7. **Close (10 s).** <!-- teams running coding agents at volume; point at the QR -->

## If they only have 30 seconds

"<!-- Gemini proposes the merge; code checks the chosen changes and runs the tests before Land. Public demo replays real recorded runs with no sign-in. The video shows learner-only live mode. -->"

## Things to have ready

- Phone on the desk's demo PR; laptop on `/judge`; chargers.
- The demo repo's PR list open in a second tab (the Beat B PR history is the proof).
- Printed poster with verified QR codes.

## Judge questions, with honest answers

**Is it real (repo, tests, AI)?**
<!-- After verification: real GitHub repo, Gemini calls and isolated tests. The public demo replays those real runs; live mode is authenticated. App development CI is separate from the per-run sandbox test gate. -->

**What does the AI actually decide?**
<!-- It proposes a merge and explains each side's intent. It never unlocks Land: parsing, the deterministic choice-honored check and actual tests do. Those checks do not prove general semantic correctness. -->

**What if the model is wrong?**
<!-- If the proposal fails a check, it is HELD and pushes no code. A person can choose another option, steer and retry, discard or download the patch. Passing checks are bounded evidence, not a guarantee. -->

**How good is it, measured how?**
<!-- State actual measured evidence from FACTS. Historical replay evaluation is deferred, so do not claim its results. -->

**How is this different from existing AI merge drivers?**
<!-- We show explanations, keeps/drops and options before action, then require a deterministic check against the chosen changes and real tests before Land. Intentional drops stay recorded and recoverable. -->

**What is still open?**
<!-- Two honest limits. -->

**Can I check it myself?**
Yes: `/judge`, `curl <!-- FACTS.demo.curlExample -->`, the demo repo's pull requests, and this public repo.
