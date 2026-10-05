ROUND 4 · Code and follow-up · main...266edda253807f43bcfb00a95cc577caf4dfe226 · reviewer: Codex (GPT-6)
Checked: every side-effect path; signed identity/body/time window; deterministic model gates; persistence/concurrency; public endpoint authorization and secret flow. No payments, outbound contact or chain paths apply.

Reviewed 2026-10-05. Read the code changes in chronological order: 91c4407, 5b3cbdc, 41c72a3. 266edda changes PLAN only. Independent findings were formed before opening rounds 1-3. Three isolated GPT-6 agents checked Land, comments, and auth/runner boundaries; the primary reviewer independently repeated the branch race, comment race, visible-edit, retention, and real local test-mutation reproductions. The author/prior reviewers were Claude models, so this is the requested different-family review.

H1 [high] Separate server instances erase a decision already confirmed as recorded
  Where: src/server/github/comment.ts:81,106,108,116,132
  Trigger: A and B run in different processes and read the same comment. A writes [original,A], reads it back and returns ok. B then writes its already-built [original,B], reads it back and returns ok. Final history is [original,B]. Process-local queues do not coordinate these writers.
  Failing test: Inline assertion probe "both confirmed entries survive": A.ok=true, B.ok=true, finalEntries=[original,B], pass=false. Loaded the exact comment.ts implementation twice with independent module state and a shared fake GitHub thread. B's PATCH waited until A's entire upsert promise resolved.
  Fix direction: Shared atomic writer coordination or persistence that cannot overwrite a stale snapshot. Another read or additional read-back retries cannot close this schedule. This needs an approved storage/coordination decision; no new service or GitHub lock ref was introduced.

H2 [high] Tests can pass on different candidate bytes from the captured and signed tree
  Where: src/server/runner/workspace.ts:204,205,249,327; src/server/pipeline/run.ts:143,189; src/app/api/live/run/route.ts:144
  Trigger: A nonconflicting playground test writes playground/src/api.js before dynamically importing it. applyProposal already captured the merge tree and file contents. The test passes on the rewritten code, but the run signs the earlier contents, which Land faithfully rebuilds. This is a mismatch between the artifact tested and the artifact landed, not a claim that tests prove general semantic intent.
  Failing test: Real LocalRunner reproduction in an isolated temporary clone: captured candidate exported reviewMustBe42=0; a repository test changed it to 42 and asserted 42. Actual parse=passed, tests=passed, exit=0, capturedHasZero=true, testedHas42=true, assertion "tests run against captured candidate bytes" pass=false. The added test and its source commit existed only in the temporary fixture. Both temporary clones were removed after checked-path cleanup.
  Fix direction: Enforce integrity of the captured source throughout checks; fail closed when checks alter tracked source or Git state, and establish how test code is prevented from changing the candidate while it executes. Merely comparing GitHub's rebuilt tree cannot fix this earlier boundary. A post-test dirty-tree check closes the demonstrated persistent mutation but does not prove that bytes were never changed and restored during execution.

M1 [medium] An ancestry-preserving head change bypasses the exact-old-head premise
  Where: src/server/guard.ts:73; src/server/github/land.ts:95
  Trigger: The guard reads H/B. Another writer resets the head to ancestor A before the ref update. Merge C has parents H,B, so A->C is a valid fast-forward; force:false accepts it and Land succeeds despite the changed head.
  Failing test: Inline ancestry-model assertion "refuse head changed after guard": precheck.ok=true, actual={commit:C}, expected=REFUSED, pass=false. Existing land.test.ts:88 injects a 422 rather than modeling ancestry, so it misses this schedule.
  Fix direction: Use an atomic expected-old-head precondition at the ref update. Another read alone does not close the race. GitHub's REST update-reference API accepts sha and force, not an expected old SHA: https://docs.github.com/en/rest/git/refs#update-a-reference . An alternative API must be verified before implementation.

M2 [medium] The post-Land timeout is not an overall route deadline
  Where: src/app/api/live/land/route.ts:16,58,82,144
  Trigger: GitHub preparation and the confirmed ref update consume 55 seconds. Post-Land work stalls and receives a fresh 15-second budget, so the response is due after the 60-second function limit. The browser correctly reports UNKNOWN on cutoff despite a confirmed branch update.
  Failing test: No cumulative route deadline test. tests/server/deadline.test.ts tests the relative helper only; it does not exercise elapsed time before the helper is called.
  Fix direction: Track elapsed time from request entry, bound pre-update GitHub work, reserve response time, and use only the remaining budget after a confirmed update. Uncertain writes must still report UNKNOWN.

M3 [medium] A readable author or verdict edit retains a valid record seal
  Where: src/core/record.ts:54,63,76; src/server/github/comment.ts:55,116
  Trigger: A person permitted to edit the App comment changes the visible table's Who/What cells, leaving hidden JSON untouched. The parser accepts the comment and the next update overwrites the outside edit instead of preserving it as edited. A random comment author cannot do this; edit rights are required.
  Failing test: Inline assertion "visible edit is refused": changed=true, actualAccepted=true, pass=false after changing a visible YearningAsian/Held row to someone-else/Landed. Existing tests change hidden JSON, not visible prose.
  Fix direction: Validate readable content against its sealed representation, or explicitly narrow the integrity guarantee to hidden data. Do not treat a visible forgery as an unchanged comment.

M4 [medium] Permanent decision history silently drops old entries
  Where: src/core/record.ts:14,86,171; devpost/spec.md:234
  Trigger: Add a unique decision after the configured entry limit. addEntry drops the oldest entry and the writer overwrites the only durable comment, including any dropped-work recovery details in that entry, while the comment says "Every decision".
  Failing test: Inline assertion "permanent history retains original": adding event-40 to event-0..39 returns count=40 without event-0, pass=false. No existing retention-boundary test.
  Fix direction: Preserve history without destructive truncation, or obtain approval for an explicit bounded-retention product contract. This affects the promised permanent record and the one-comment design.

Verdict: 2 high, 4 medium, 0 low. NOT CLEAN. No product fixes made: the learner explicitly required a stop when behavior differs from the approved spec, and durable record coordination/history and source integrity need a consequential design decision. Do not push, merge, deploy, or perform a real Land on the strength of the prior clean round.

## Attack matrix (current reviewed code, before fixes)

PASS means the attack is blocked; it does not imply live GitHub verification. FAIL includes explicitly deferred work or a broader requested policy that the canonical spec does not promise; those are marked separately.

| Attack | Result | Source evidence | Existing coverage / missing coverage |
| --- | --- | --- | --- |
| a. Outside demo/*, main, odd branch names | PASS | core/scope.ts:16-39; server/guard.ts:60-66. Exact demo/ prefix, conservative ref grammar, no client-selected target. | core/scope.test.ts parameterized malformed/out-of-scope refs; server/guard.test.ts main/default/base/fork. Additional inline probes refused Main/MAIN, DEMO/Demo, encoded separators/traversal, demo and demo/../main. |
| b. Head/base move between check and push | FAIL | guard.ts:73 is a read-time check; github/land.ts:95 has no old-head precondition. M1 reproduces an accepted changed head. | guard.test.ts covers changes before the read; land.test.ts mocks a divergent-push rejection. No ancestor-reset race regression. Base advancement after final read is explicitly accepted by spec.md:193 and ADR 0001:35; post-Land mergeability is read at route.ts:112. |
| c. Force or ref update without expected old head | FAIL | github/land.ts:95-100 uses force:false but no atomic expected head. No force:true product Land path found. | land.test.ts:57 asserts force:false. No exact-head precondition test. Human demo reset is a separate explicitly authorized force rewrite, never a Land path. |
| d. Different tree, retries/replay/expiry/identity | FAIL | github/land.ts:77 protects rebuilt tree identity; workspace.ts:204 and :327 show capture before mutable tests (H2). sign.ts:81-89 and pipeline/run.ts:265 enforce expiry and scope. | land.test.ts tree mismatch; run-pipeline.test.ts signed identity/tampering/expiry; live-routes.test.ts cross-user/PR. Real local H2 probe fails. Ordinary replay after head moves is rejected by guard.ts:73; no durable consumed-run nonce exists, so restoring the original head permits reuse before expiry. |
| e. Failed/ambiguous GitHub response becomes LANDED | PASS | github/land.ts:102-114 returns REFUSED/UNKNOWN; live/land/route.ts:94 preserves it; ui/sources/live.ts:68-81 maps network/unreadable responses to UNKNOWN; ui/Land.tsx:99 gates success. | land.test.ts "is UNKNOWN, never landed"; e2e desk.spec.ts:407 UNKNOWN then confirmed LANDED. M2 is a separate false-UNKNOWN/deadline gap, not a false-LANDED bug. No full successful-route partial-failure test. |
| f. Browser bypasses repo/login allowlist | PASS | session.ts:122-127; env.ts:8-26; live/land/route.ts:18,42-45. Fixed repository, sealed session, allowlist and same-origin guard. | session.test.ts signed-out/disallowed/tampered/origin; env.test.ts widening denied; live-routes.test.ts cross-user/PR/token refusal. |
| g. GitHub token/signing key leaks | PASS (source inspection) | github/app.ts:22,49-55; sign.ts:33-36,111; runner/sandbox.ts:143-150 supplies public clone URL and no credential env; server/record.ts:16-39 selects public record fields; ui/Desk.tsx:366 strips tokens from copied logs. | env.test.ts:59 fixed-name error; signature/session integrity tests. No dedicated credential-canary sandbox/log/error test. No actual secrets or env files read. |
| h. Duplicated/forged/misattributed/concurrent records | FAIL | github/comment.ts:81,106-133 (H1); core/record.ts:54-76 (M3), :86 (M4). App ownership and hidden-data scope are checked, but confirmed entries can be lost and visible edits accepted. | comment.test.ts covers one process, preexisting duplicates, clobber before read-back, edited hidden JSON, foreign marker. core/record.test.ts hidden edits, nested data, markup escaping and cross-PR seals. No cross-instance late overwrite, visible-edit or retention test. |
| i. Daily cap or sandbox timeout on Land | FAIL for current app's daily admission; not a Land allocation bypass | Analyze/run have no daily accounting gate; checklist.md:76-79 explicitly defers it to slice 6. Land allocates no sandbox and invokes no LLM. sandbox.ts:147 sets 120-second timeout; workspace.ts:327 sets 30-second test limit. M2 concerns Land's own request duration. | No daily-cap/unavailable-accounting test. runner.live.test.ts smoke coverage exists but was not run in this review; provider expiration was not tested. Do not enable/share production live mode until slice 6 accounting/timeout checks pass. |
| j. PR modifies .github/workflows/ | FAIL for literal whole-PR policy; PASS for canonical merge-change policy | guard.ts:80-83 examines merge changes relative to the original head; workspace.ts:220-225 captures that diff. A workflow edit already in the PR head and unchanged by this merge is not examined. spec.md:187 prohibits workflow changes introduced by the merge, a narrower policy. | guard.test.ts workflow change rejection. No whole-PR changed-files test or check. Broadening the policy requires acknowledging this distinction. |

## Earlier findings checked after independent review

| Prior finding | Assessment and evidence |
| --- | --- |
| Round 1 H1, duplicate/lost concurrent record | Partially fixed: shared-module writers serialize and preexisting duplicates fold (comment.test.ts). Reopened as H1 for separate instances after successful read-back. |
| Round 1 H2, nested fake data block | Closed for the reported attack: exactly one trailing block, escaped visible input and sealed canonical data. record.test.ts nested markers/data tests. |
| Round 1 M1, mentions/links/images/HTML | Closed for reported commit/model text: entity escaping and record.test.ts neutralization tests. Round 2 dot/autolink fix is also present and tested. |
| Round 1 M2, schema-valid hidden edit | Closed for hidden entries: record.test.ts outside edit rejected; comment.test.ts ignores edited record and creates replacement. Visible edit remains a distinct M3 gap. |
| Round 1 L1, multiline description/trailers | Closed: github/land.ts:31 flattens whitespace/limits description; landMessage test checks no added trailer line. |
| Round 1 L2, oversized signed run | Closed for reported size handling: signLandableRun removes changes/tree with reason; run-pipeline.test.ts:351 covers it. |
| Round 2 M1, post-Land function cutoff | Partially fixed: deadline helper bounds optional work relative to its start. Reopened as M2 because earlier GitHub elapsed time is not included. |
| Round 2 L1, www/email autolinks | Closed: escaped dot/@ and record.test.ts autolink checks. |
| Round 2 L2, cross-PR seal transplantation | Closed for cross-PR copy: repo#PR is in canonical signed text; record.test.ts rejects another PR scope. No monotonic history/rollback guarantee is supplied. |
| Round 2 L3, pre-seal records treated as edited | Acceptance is reasonable before live records exist: old unsigned data is never trusted. The migration limitation is explicit. This review did not verify the claimed absence of old live records on GitHub. Keep the note if old records are later introduced; reset does not itself delete historical comments. |
| Round 3 CLEAN | Its tested fixes exist, but its verdict does not cover H1/H2/M1-M4 above. |

## Verification actually run

- npm test: exit 0, 26 test files, 198 tests passed.
- npm run typecheck: exit 0.
- npm run lint: exit 0, zero errors, one existing warning in ignored .review/run-check.mts:43 (unused token binding). That file was not changed or staged.
- npm run e2e: exit 0, 12 browser tests passed; Playwright started its test server on port 3100 after npm run build succeeded. The learner's port 3000 process was not killed/restarted. Browser API responses use recorded fixtures, not live Land.
- Independent inline probes: branch scope, ancestry race, two isolated comment queues, visible table edit, retention boundary, and actual LocalRunner source rewrite. Five bug assertions reported pass:false as detailed above. They are not additions to the 198-test ordinary suite.
- Official GitHub REST ref-update and issue-comment documentation read through web fallback because installed Firecrawl CLI was unauthenticated. No login/setup performed.
- No authenticated GitHub/Sandbox/Gemini operation, push, PR creation, reset, deploy, ruleset/settings change or real Land. No .env contents or secrets read or printed.

## Stop state and next repair decision

The learner's explicit stop condition applies: source/test artifact integrity and the permanent, single-comment record differ from the approved contract. Only review evidence and PLAN status were saved. No speculative durable service, lock branch, permissive fallback or spec change was implemented. Product fixes and their failing unit tests await the approved repair approach; Step 2 is not authorized to start at this stop.

probe.yml remains untouched, untracked and unstaged. Only PLAN.md and this exact report path may be staged for this checkpoint, with the report explicitly force-added by name because the learner requested committing it despite the repository's .review ignore rule.
