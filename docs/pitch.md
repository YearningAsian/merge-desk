# Expo pitch and judge Q&A

Numbers come from `docs/FACTS.json` (as of <!-- asOf -->). Say them exactly as written there.

## The 90-second pitch (one person talks, the other drives)

1. **Hook (10 s).** About 1 in 5 merges hits a conflict, and code tied to a merge conflict is twice as likely to have a bug (Brindescu et al., 2019, 143 open source projects). <!-- add why you personally care -->
2. **The gap (10 s).** AI merge tools write the model's answer into your file and leave you to check it. A merge that compiles but drops one side's change looks exactly like a good one.
3. **What we built (10 s).** Merge Desk: the AI proposes the merge, and nothing lands until both branches' intent is still there and the tests pass.
4. **Beat A (20 s).** <!-- open the demo PR; the rename-vs-retry conflict; the naive merge drops the retry; HELD, "theirs: retry on 429, missing" -->
5. **Beat B (20 s).** <!-- the verified merge keeps both; CI goes green on merge-desk/resolve-<pr>; Merge unlocks; the original PR turns mergeable -->
6. **Proof (10 s).** <!-- headline number from the replay eval, from FACTS -->
7. **Close (10 s).** <!-- teams running coding agents at volume; point at the QR -->

## If they only have 30 seconds

"<!-- AI resolves the conflict, but the merge waits until both sides' intent survives and CI is green. Scan this, try it on our demo repo, no login. -->"

## Things to have ready

- Phone on the desk's demo PR; laptop on `/judge`; chargers.
- The demo repo's PR list open in a second tab (the Beat B PR history is the proof).
- Printed poster with verified QR codes.

## Judge questions, with honest answers

**Is it real (repos, CI, AI)?**
<!-- Real GitHub repo, real Actions CI, real model calls. The demo repo is ours. -->

**What does the AI actually decide?**
<!-- It proposes a merge and names each side's intent. It never unlocks the merge: the deterministic intent check and CI do. -->

**What if the model is wrong?**
<!-- A wrong merge fails the intent check or CI and is HELD; the conflict stays for a person. -->

**How good is it, measured how?**
<!-- Replay eval on real historical merges: unchecked AI vs gated, from FACTS. -->

**How is this different from existing AI merge drivers?**
<!-- They write the answer and ask you to review. We verify each side's intent and require CI before anything lands, and show the conflict as two intents instead of raw markers. -->

**What is still open?**
<!-- Two honest limits. -->

**Can I check it myself?**
Yes: `/judge`, `curl <!-- FACTS.demo.curlExample -->`, the demo repo's pull requests, and this public repo.
