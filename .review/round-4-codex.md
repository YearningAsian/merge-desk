ROUND 4 · Code and follow-up · main...266edda253807f43bcfb00a95cc577caf4dfe226 · reviewer: Codex (GPT-6)

The original independent review below is preserved as historical evidence. The authorized repairs, final attack matrix, commands, eligibility audit and STOP 1 state follow it. Its earlier NOT CLEAN / no-fixes stop does not describe the final working tree.
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

## Original stop state and repair decision

The learner's explicit stop condition applies: source/test artifact integrity and the permanent, single-comment record differ from the approved contract. Only review evidence and PLAN status were saved. No speculative durable service, lock branch, permissive fallback or spec change was implemented. Product fixes and their failing unit tests await the approved repair approach; Step 2 is not authorized to start at this stop.

probe.yml remained untouched, untracked and unstaged at that checkpoint. Only PLAN.md and this exact report path were staged for that review-only checkpoint, with the report explicitly force-added by name because the learner requested committing it despite the repository's .review ignore rule.

## Authorized repair follow-up and exact scope

The learner subsequently authorized failing-test-first repairs and Step 1 only. No later gate was crossed. Main/merge-base is `4ad4011b57c6f9bb08a15f0f81a309b6e2ab1217`. The original branch ancestry, in order, is:

| Commit | Parent | Addition |
| --- | --- | --- |
| `91c4407e849c332a1c57c8ec34068dca4fbd1f0e` | `4ad4011b57c6f9bb08a15f0f81a309b6e2ab1217` | Slice 5 Land / record implementation |
| `5b3cbdcce13e6421c8b96792a4557f354bd13c28` | `91c4407e849c332a1c57c8ec34068dca4fbd1f0e` | Round 1 repairs |
| `41c72a359c18255397ede6f0146b9fda06398c15` | `5b3cbdcce13e6421c8b96792a4557f354bd13c28` | Round 2 repairs |
| `266edda253807f43bcfb00a95cc577caf4dfe226` | `41c72a359c18255397ede6f0146b9fda06398c15` | PLAN status only |

`git log --reverse --format='%H %P %s' main..266edda`, `git merge-base main 266edda`, and `git diff --quiet 41c72a3 266edda -- src tests` confirm this relationship; the last exits 0. No discrepancy and no silently revised original scope. The follow-up reviewed the repair diff over `bb1f0c1604b1848917a51f4d1296db7c101c7114`, now committed as `e1212e73e18f07b47cfddc4a00aeb60e38641b48` (16 explicitly named source/test files).

Review/status commits before repair: `b3db4eac320c112999366c15ea2ae2259c3f8687` (claim), `2796bebffc2fcd3fcec853b317840c7161e46067` (original NOT CLEAN report and stop), `bb1f0c1604b1848917a51f4d1296db7c101c7114` (repair claim). The final report/status commit changes only PLAN.md and this report; its exact SHA is in git log and the STOP 1 response.

Primary and collaboration reviewers actually ran as Codex/GPT-6. A fresh isolated GPT-6 reviewer, given only relevant files and follow-up guidance, found the remaining ambiguous-dispatch H1 race; another fresh child checked its lease paths. The Claude CLI attempt (`claude -p --model sonnet --tools '' --permission-mode plan --no-session-persistence --output-format json --bare`, source-only stdin) failed: `is_error:true`, `Not logged in · Please run /login`. No Claude review ran and no authentication changed. Current repair follow-up is therefore fresh but same-model, not the separate-model evidence required before merge. The original blind Codex review remains different-family from the Claude implementation. Later rereads of prior reports were not claimed as blind.

## Findings and repairs

| ID | Severity | Final assessment, source and regression |
| --- | --- | --- |
| H1 | high | Closed for one development host sharing its lock filesystem: global queue survives module copies; atomic mkdir excludes OS processes; production/unknown hosts refuse. Crucially, a dispatched-but-unconfirmed PATCH/POST retains the lock instead of allowing a later confirmed record to be erased by its late completion. No TTL or automatic recovery. `record-writer.ts:9,27,42,50,66`; `github/comment.ts:124,134,144,159`; tests `comment.test.ts:75,104,222`, `record-writer.test.ts:21`, `land-route.test.ts:96`. Human reconciliation of unresolved writes is required and was not performed. |
| H2 | high | Sandbox source and its parent become root-owned/read-only, verified using trusted built-in filesystem code; tests run with a distinct non-root UID and verified sudo denial. Before/after raw-byte and HEAD/tree/index checks hold persistent mutation, untracked files, Git-cache tricks and symlinks. Missing evidence holds. `runner/workspace.ts:58,88,120`; `runner/sandbox.ts:254,269`; tests `local-runner.test.ts:169,219`, `sandbox-runner.test.ts:226,241,254,268`. Live image policy remains unverified. Trusted LocalRunner detects persistent changes, not transient write-and-restore; `runner/local.ts:150` explicitly states that limit. |
| M1 | medium | Closed: GitHub GraphQL updateRefs requires beforeOid=signed H, fully qualified head ref and force:false, atomically; commit parents remain [H,B]. `github/land.ts:118,140,142`; tests `land.test.ts:106,159`. Semantics verified from https://docs.github.com/en/graphql/reference/git#updaterefs . No authenticated mutation run. |
| M2 | medium | Closed: request-wide 55-second deadline, progress-aware REFUSED / UNKNOWN / confirmed LANDED, abort propagation, optional work uses only remaining budget. `live/land/route.ts:29,35,42,54,218`; tests `land-route.test.ts:69,104,121`. No automatic retry. |
| M3 | medium | Closed: v2 MAC covers exact visible prefix, PR scope and canonical entries; readable Who/What/URL/note/whitespace edits and legacy v1 seals are refused. `core/record.ts:50,55,77`; tests `record.test.ts:116,150`; harmless hidden key reordering remains accepted (`:135`). |
| M4 | medium | Closed: no entry eviction; oversized body refuses before PATCH/POST/folding and preserves existing history. `core/record.ts:88`; `github/comment.ts:116`; tests `record.test.ts:205`, `comment.test.ts:201`. This does not promise infinite capacity in one GitHub comment; a full record reports failure. |
| M5 | medium | New follow-up finding, fixed: caller abort reaches preparation and queued writers; hold/discard has a 25-second request deadline. `live/land/route.ts:35`; `live/record/route.ts:52,55,102`; tests `land-route.test.ts:137,147,162,178`, actual queued-cancellation test `comment.test.ts:145`. Already dispatched uncertainty is handled by H1 lock retention, not by pretending abort undoes GitHub. |
| L1 | low | Remaining: an authorized editor can replace the entire comment with an older valid v2 record from the same PR. Stateless MAC verification proves origin/content, not monotonic history. `core/record.ts:77`; `github/comment.ts:55,108`. Read-only real-parser probe accepted the older record and omitted the newer entry. No ordinary regression test, no live edit, no anti-rollback anchor. Requires comment-edit rights; foreign comments/cross-PR copies are still refused. Not accepted on the learner's behalf. This same-PR rollback limit was noted in the original round-2-L2 assessment; the probe makes the limit concrete. |

The fresh affected-code follow-up after the final H1 repair returned zero high/medium/low for that boundary and passed 20 focused tests. Its source review applies to the final production logic; afterward one test-only TypeScript non-null assertion fixed a compiler error without changing emitted test behavior. Overall round 4 has no remaining high/medium within the supported local topology, one low above, and the explicit policy/live-verification limits below. This is not clearance to merge or enable production writes.

## Complete a–j matrix at the repaired code commit

PASS means prevented within the stated code scope. Source/model evidence is distinguished from live verification; no live result is inferred from mocked browser or provider tests.

| Attack | Result | File:line evidence | Covering test or no test; limits |
| --- | --- | --- | --- |
| a. Outside demo/*, main, case/encoded/traversal/literal demo refs | PASS | `src/core/scope.ts:16`; `src/server/guard.ts:60,66` | `tests/core/scope.test.ts:17,26`; `tests/server/guard.test.ts:90,106`. Original inline odd-ref probes also refused. Only server-selected PR head is targeted. |
| b. Head or base moves between check and push | FAIL for literal both-ref policy; head PASS | `src/server/guard.ts:73`; `src/server/github/land.ts:140`; `devpost/spec.md:193` | `guard.test.ts:112`, `land.test.ts:159` cover pre-read changes/atomic head race. No simultaneous base precondition: base advancement after final read is explicitly accepted by canonical spec/ADR. No test proves that advancement is refused. |
| c. Force / no expected-old-head check | PASS for Land | `src/server/github/land.ts:140,142` | `land.test.ts:106,159,277` assert beforeOid, force:false and head-only ref. Human demo reset uses a separately authorized force rewrite; no reset was run. |
| d. Different checked tree, retry/replay, expiry, wrong user/PR | PASS for guarded Sandbox path; live unverified | `github/land.ts:110,140`; `runner/sandbox.ts:269`; `runner/workspace.ts:120`; `sign.ts:30,81,85`; `pipeline/run.ts:265`; `guard.ts:73` | `land.test.ts:148,159,297`; `run-pipeline.test.ts:339`; `live-routes.test.ts:189`; runner mutation tests above. Ordinary replay after H moves fails guard. No consumed-run nonce: restoring H permits reuse before expiry, without allowing a different tree. Expiry checked at request verification. Trusted local transient mutation remains possible; configured dev RUNNER value was not read. No live replay performed. |
| e. Failed/timed-out/ambiguous GitHub reply shown as LANDED | PASS | `github/land.ts:148`; `live/land/route.ts:42,54,157`; `ui/sources/live.ts:59`; `ui/Land.tsx:99` | `land.test.ts:168,180,195,237,297`; `land-route.test.ts:69,121`; `tests/e2e/desk.spec.ts:407`. Matching mutation confirmation required; partial/malformed replies and in-flight timeouts UNKNOWN. Confirmed Land stays LANDED even if optional record work fails. |
| f. Browser widens repo/login allowlist | PASS | `server/env.ts:8,9,30,34`; `server/session.ts:124,132`; fixed REPO in `live/land/route.ts:18` | `env.test.ts:15`, `session.test.ts:52,60`, `live-routes.test.ts:189`. Hosted/local writer restrictions add refusal, never widen identity scope. |
| g. GitHub token/signing key leaks to candidate, logs, client or comment | PASS by source inspection; dedicated live canary unverified | `server/github/app.ts:22,49`; `server/sign.ts:33,111`; `runner/sandbox.ts:135,194`; `server/record.ts:16`; `ui/Desk.tsx:366` | `env.test.ts:59`; sign/session integrity tests; fixed error tests `land.test.ts:195,212`. Public clone and explicit runner env carry no app credentials. No dedicated credential-canary/log/error test; no live transport inspection. No actual env file/secret read or printed. |
| h. Duplicated/forged/edited/misattributed/concurrent decision record | FAIL for complete anti-edit/rollback policy; app-writer races closed | `record-writer.ts:9,42,50,66`; `github/comment.ts:55,124,159`; `core/record.ts:77,88` | `comment.test.ts:75,104,145,201,222,277,292`; `record-writer.test.ts:21`; `record.test.ts:116,192,205`. Source/entry tampering and scoped concurrent writers prevented/detected, uncertain writes poison lock. Whole older same-PR sealed replay remains L1 (inline probe, no ordinary test). Outside edits are preserved with a replacement record; physical old comments are not deleted. |
| i. Daily cap or sandbox timeout unenforced on Land | FAIL for app daily admission; Land allocates neither sandbox nor Gemini | `devpost/checklist.md:72,77`; `runner/sandbox.ts:36,197`; `runner/workspace.ts:43`; `live/land/route.ts:29` | No daily admission/unavailable-accounting test: slice 6 deferred. Land deadline tests pass. Sandbox 120-second lifetime and 30-second suite limit configured; no fresh provider lifetime smoke. Production Land/record now refuse; production analyze/run accounting still a future gate. |
| j. PR modifies .github/workflows/ | FAIL for whole-PR policy; canonical merge-delta policy PASS | `server/guard.ts:82`; `runner/workspace.ts:318` (merge delta); `devpost/spec.md:187` | `guard.test.ts:117` rejects workflow changes introduced by merge. No whole-PR changed-files check/test; preexisting workflow changes unchanged by merge can pass. This distinction was reported, not silently broadened. |

## Commands, failures and measured verification

Primary reviewer actually ran the final required checks:

- `npm test`: exit 0, **29 files / 250 tests passed**, after the final H1 repair.
- `npm run typecheck`: final exit 0. One intervening run failed at `tests/server/comment.test.ts:84` because the Octokit mock argument type permits undefined; corrected with a test-only non-null assertion, then reran successfully. An earlier delegated run during M1 implementation failed while the route had not yet supplied new repositoryId; that wiring was added and subsequent runs passed. No unexpected command failed twice consecutively.
- `npm run lint`: exit 0, **0 errors / 1 existing warning**, `.review/run-check.mts:43` unused token binding. That ignored scratch file was neither modified nor committed.
- `npm run e2e`: final exit 0, **12/12 browser tests passed**. Its `playwright.config.ts:23` webServer executes `npm run build && npx next start -p 3100`; build succeeded before tests. New build process emitted ordinary color/outer-lockfile warnings. Browser requests use fixtures, not authenticated integrations. The user's localhost:3000 process was not restarted or killed.
- Environment used: measured `node --version` / `npm --version`; Node **v26.3.0**, npm **11.16.0**. Repository minimum Node 24; fresh install on Node 24 and actual node:24 Sandbox behavior were not verified here.
- `git diff --check`, named-path staged-list verification, ancestry/source-diff commands above; successful final staged check before code commit. `git status --porcelain=v1 -- .github/workflows/probe.yml` returns `??`; `git ls-files -- .github/workflows/probe.yml` empty; cached file list excludes it.

Failing-test-first evidence (deliberate red runs, not unexpected command failures):

| Boundary | Actual RED command/result | GREEN evidence |
| --- | --- | --- |
| M1 | Delegated `npm test -- tests/server/land.test.ts`: 17 failed / 2 passed; actual ancestor-reset scenario wrongly landed | Focused adapter 20/20; final suite |
| M3/M4 | Delegated `npm test -- tests/core/record.test.ts`: 7 failed / 10 passed (five visible edits, legacy weak seal, retention) | 17/17; final suite |
| H1/M2/production containment | Primary `npx vitest run tests/server/comment.test.ts tests/server/land-route.test.ts`: 5 failed / 5 passed | Focused combinations and final suite |
| H2 | Delegated `npm test -- tests/server/local-runner.test.ts tests/server/sandbox-runner.test.ts`: five local and six Sandbox false-pass regressions before source edits; fixture signature corrected during RED | Final runner 22/22, including pristine success, absent capture and symlink refusal |
| M5 | Primary `npx vitest run tests/server/land-route.test.ts`: first 3 failed / 4 passed; later 1 failed / 7 passed for record deadline | Final route 8/8; actual queued cancellation included in comment suite |
| H1 follow-up | Fresh read-only inline probe found late aborted PATCH erases confirmed B. Primary `npx vitest run tests/server/comment.test.ts`: 1 failed / 9 passed before lease repair | Comment 10/10; writer/comment/route 20/20; final suite |

Additional actual focused commands: `npx vitest run tests/server/comment.test.ts tests/server/land-route.test.ts tests/server/land.test.ts tests/core/record.test.ts` (47/47 at that intermediate snapshot); `npx vitest run tests/server/record-writer.test.ts tests/server/land-route.test.ts` (6/6 then); named-file `npx prettier --write` on changed files. Fresh review ran `npm test --` with all seven affected test files (78/78 at its earlier snapshot), typecheck, then the three writer/route files after H1 repair (20/20). Intermediate full suites intentionally saw other lanes' RED regressions; they are not the final 250 count.

Official GitHub GraphQL, REST refs/comment docs and official Devpost rules were checked read-only through web fallback. Firecrawl installed but unauthenticated; Claude installed but signed out. No login/setup. The initial missing `docs/checklist.md` search path produced a file-not-found diagnostic; the actual `devpost/checklist.md` and root checklist were then searched. The intentional untracked-file `git ls-files --error-unmatch` diagnostic confirmed probe was not tracked.

## Read-only hackathon readiness assessment

Official evidence: https://learn-ai-basics.devpost.com/rules . Submission closes **October 26, 2026, 4:00 p.m. America/Chicago (5:00 p.m. EDT)**. Judging ends **October 30, 2026, 4:00 p.m. Central**. New work is required during September 22–October 26; incorporated earlier work needs disclosure. Rules require Skill Pack use with generated plans, an installable working function, complete public source/assets/instructions, authorized integrations/materials, English or translations, and a public YouTube/Vimeo demo. Under three minutes and a detectable open-source license are recommendations; testing must remain free and unrestricted through judging.

| Item | Verified evidence | Remaining gap / limit |
| --- | --- | --- |
| Actual Devpost Learn Skill Pack use and generated plans | Six local `1-start` through `6-ship` SKILL.md files; `skills-lock.json:5` names challengepost/learn-ai-basics. Historical approved, substantive `devpost/{scope,prd,spec}.md:3`, first committed October 4 as 55adcfb / 39708f0 / d07a243. PLAN records planning workflow. | Supports historical use, not independent certification of each earlier invocation/approval conversation. Do not claim documents added later prove earlier use. No provenance fabricated or backfilled. |
| New project in allowed period / earlier-work disclosure | Earliest reachable commit `8ab8e9418ddf9060d39e8173cb7c21ba9d5eb482`, October 4 21:12:28 CDT; public GitHub created_at `2026-10-05T02:12:34Z` (October 4 CDT). PLAN:49 discloses planning templates/workspace skills. | History does not prove an initially empty folder or exclude every imported component. Final incorporated-work inventory/disclosure is still needed; `docs/submission-draft.md:36` remains a placeholder. |
| Working function / consistent install | Actual LocalRunner integration fixtures merge, check and hold/verify; browser desk journeys and production build pass. README:29 has Node/git/npm ci/run/gate instructions; lockfile exists. | No real authenticated end-to-end Land yet; no fresh clone/npm ci on intended Node 24; latest Land repair is not public until later push gate. Slice 5 checkpoint remains unchecked. |
| Public complete repo / detectable recommended license | Unauthenticated GitHub repo API: private:false, default_branch:main, license:MIT; LICENSE:1 and package.json:6. Source, planning documents, lockfile and README are tracked. | Recordings/stills/final video assets are unfinished. Public main lacks this Land branch. README:9 and pitch.md:4 contain stale unscaffolded status. Leave unrelated submission-copy repair outside Step 1. |
| Authorized SDK/API/data and materials | Owned demo repository and fixed learner-only integration intent recorded in spec/PLAN. | Account/API terms, third-party content/music/trademark permissions and final license attribution inventory not independently verified. Do not assert universal authorization from installed SDKs alone. |
| English / accurate description / demonstration | Existing text materials are English. FACTS:28 videoUrl is null. | Final submitted text/video/testing instructions and translations, if any, not present. Feature copy must distinguish live evidence from replay and current refusal/health state. No public YouTube/Vimeo demo or verified duration. |
| Published site | Public repo homepage points to https://merge-desk-swart.vercel.app . Primary read-only fetch at health timestamp `2026-10-05T20:46:46.381Z`: HTTP 200, ok:true, github/gemini/sandbox/recordings all false. `/demo`, `/judge`, `/api/stats` each 404. | Published placeholder exists despite FACTS liveUrl:null; not a working judge path. No deployment performed in this review. Health false is not proof integrations work. |
| Free unrestricted judge testing through Oct 30 | Canonical spec:83 plans public `/demo` / `/judge` recordings without sign-in or keys; env.ts:8-9 preserves learner/repo allowlists. | Capture real recordings, package them publicly, supply no-cost testing instructions, and maintain access through judging. Verify replay experience and obtain organizer clarification if it is insufficient to test the live features described. If any offered site is private, its testing credentials must be supplied without broadening the production live allowlists or sharing the learner's credentials. No judge credentials created/shared. |

No unrelated submission documents/assets were added or changed. The eligibility gaps above remain tracked, not portrayed as resolved by this report.

## STOP 1

Fix commit: `e1212e73e18f07b47cfddc4a00aeb60e38641b48`. Report and PLAN updated separately by name. Await learner's **continue**. No push, PR, real Land/reset, merge, deploy, production permission changes or ruleset edits. Later Steps 2–5 and STOP 2 / STOP 3 remain unchanged; separate-model repair review, live integration validation and production shared coordination remain outstanding.

probe.yml is untouched, untracked and unstaged. It schedules at minutes 7/37 hourly and supports workflow_dispatch; Python GETs configured production health/stats/homepages, checks integration flags and branding. It references repository variables, no secrets, has no explicit permissions block and no repository write command; inherited workflow token permissions were not verified. PLAN row 2.6 and its own comment identify the future deployment probe, but git log/review history contain no creation provenance because it was never committed. Its external URL calls were explicitly cleared by the learner. Slice 6 alone owns `permissions: {}`, own-production-URL verification and its separate named-file commit.

## STOP 2 follow-up: bot identity authentication (2026-10-05)

M6 [medium] App JWT used for a public bot-user lookup, preventing Land and decision-record reads.

- Observed by the learner: `GET /users/merge-desk-yearningasian%5Bbot%5D` returned 401, `POST /api/live/land` returned 503/REFUSED, and `GET /api/live/record?pr=3` returned 503. This is not a completed Land or authorization to start Step 4. The original unexpected-behavior stop was reported; the learner then authorized proceeding with the fix.
- Root cause in reviewed base `0274b862aacf2307133ec4688db9d161a6722933`: `src/server/github/app.ts:65-70` minted an App JWT, successfully fetched App metadata and reused that client for `users.getByUsername`. App JWT authentication does not work for this user endpoint. Official endpoint documentation permits an unauthenticated public lookup: https://docs.github.com/en/rest/users/users#get-a-user . This authentication boundary was missed in the earlier review; the Land route tests mocked appIdentity rather than exercising its HTTP authentication.
- Smallest fix: retain JWT authentication for `GET /app`, use a separate unauthenticated Octokit solely for the server-derived public bot profile (`app.ts:68,71`). No permission, allowlist, settings, branch-guard, signature, writer or mutation change. Existing lookup errors reject and clear the cached promise (`app.ts:78`), never invent an identity.
- Claim commit: `fd74b3b757b77e86b852c2f6bef4f4a9c0a7c450` (PLAN only). Fix commit: `1c8e4c0283c1d6461402bc46fc16dd777bffcbed` (app.ts and named regression test only). Actual builder/reviewer: Codex (GPT-6); exact runtime variant unavailable.

### Test-first evidence and actual commands

- Added `tests/server/app-identity.test.ts` before production edits. Real Octokit performs its actual auth/request construction; only credential minting and HTTP are replaced with fixed fake fixtures. No environment file, real private key, token or live write is used.
- RED: `npm test -- tests/server/app-identity.test.ts` exited 1 with all 3 regressions failing at JWT-bearing bot HTTP 401 before the fix. GREEN: same command exited 0, 3/3 passed. Tests cover successful identity derivation and fail-closed recovery after App or bot lookup failure.
- `npx prettier --write src/server/github/app.ts tests/server/app-identity.test.ts`; `git diff --check`: passed, named files only.
- `npm test`: exit 0, **253 tests / 30 files passed**.
- `npm run typecheck`: exit 0.
- `npm run lint`: exit 0, **0 errors / 1 existing warning**, ignored `.review/run-check.mts:43` unused token binding.
- `npm run e2e`: exit 0, **12/12 browser tests passed**. Port 3100 was initially free, so Playwright ran its configured `npm run build && npx next start -p 3100` against a fresh production build. Browser tests use recorded fixtures, not real Land. Existing FORCE_COLOR/NO_COLOR and out-of-repository lockfile warnings were present.
- One read-only real provider check used `new Octokit().users.getByUsername({ username: 'merge-desk-yearningasian[bot]' })` with no auth: HTTP **200**, type Bot. It confirms the public lookup works, not the entire authenticated appIdentity or Land round trip. No secret or env file was read or printed.
- `node --version`: v26.3.0; `npm --version`: 11.16.0 for these local checks. Previous PR CI on 0274b86 used the repository's Node 24 configuration and succeeded; updated-head CI must be checked separately.
- One exploratory Get-Content attempted nonexistent vitest.config.ts; rg found vitest.config.mts, which was then read. No unexpected command failed twice. Deliberate RED failures and synthetic provider refusals were expected verification.

### Fresh independent affected-boundary review

ROUND 1 of this follow-up, code, STOP 2 App identity fix, reviewer: fresh isolated Codex (GPT-6), same model; exact variant unavailable. An earlier read-only diagnostic agent failed with a usage-limit message and produced no review. The fresh fix reviewer subsequently completed successfully.

Reviewed base 0274b862aacf2307133ec4688db9d161a6722933 and working fix over status-only fd74b3b. Reviewed bytes were then committed unchanged in 1c8e4c0. Scope: app.ts and app-identity.test.ts; probe.yml excluded. SHA-256 of concatenated raw binary app diff against base and new-test diff against NUL: `383a55eefe827ea7343dce5a994c349752a07f916a627f3fdcd77302d10522f2`.

Checked every-side-effect-path focus items 1-8 at the affected boundary, plus App identity provenance, request authentication, caching/error recovery, Land/record callers, comment ownership/seal, installation permissions, session/signed-run/repository/branch/tree/deadline and writer guards. The new unauthenticated client only performs a public GET. No alternate write path or guard bypass was found. Independently ran the targeted test: **3/3 passed**; the reviewer did not independently rerun RED or the full suites. Primary also rechecked the final source and failure propagation after the fix.

M6 closed by the regression `resolves the committer using App auth for metadata and no App JWT for the public bot`, plus lookup-failure recovery tests. Verdict: **CLEAN ROUND, 0 high / 0 medium / 0 low in this affected scope**. No live operation, real credentials, settings change, Land, reset, push or deployment was performed by the independent reviewer. Successful cache concurrency was not independently exercised. This same-model review does not fulfill the outstanding separate-model-before-merge gate.

### Preserved gates and branch evidence

STOP 2 remains: the learner performs the original #1 and #2 checks and reports observations with "landed" before Step 4. The REFUSED attempt on demo/drop/fix-b (#3) does not substitute for those checks. No manual clicks, scripted Land/replay/reset, merge, deploy or repository settings changes occurred during this repair.

The original all-branch baseline `.review/slice5-before-land.json` at 2026-10-05T21:15:55.4834654Z remains byte-for-byte preserved, SHA-256 `0D07F384967E91C1192978728CAC906D40651932527E924EE1F02F86B84BE135`. The additional snapshot at 21:24:15Z showed all nine heads unchanged, including feat/land. Updating the existing PR for this authorized repair will advance feat/land; that change must be disclosed separately, not hidden by overwriting the baseline or silently treating the original Step 4 no-other-branch-moved condition as passed. A new all-head snapshot is required before subsequent manual checks.

probe.yml remains untouched, untracked and unstaged; verified SHA-256 `48E3B2A27DB383BA740450ED564EBA1B1850A483148D8A156588B18ADF8BD125`. Original round 4 policy findings, L1 and readiness gaps remain as previously recorded; this narrow authentication fix does not resolve them.

## Autonomous slice 5 closure (2026-10-05)

The learner's latest instruction supersedes STOP 2, STOP 3, manual clicks/the "landed" message and the separate merge-go checkpoint. It explicitly authorizes automated original #1/#2 checks, demo-only resets, bounded repairs, named-file commits/pushes and a conditional exact-head merge commit for #4 using the existing account's permitted administrator authority. It does not authorize production deployment, ruleset changes, failed/missing-requirement bypass, main force-push or app main-merge capability. Earlier STOP descriptions above are historical evidence, not the active gate. Claim commit: `0c9e0d1a6279105f97d36523bdb1f39a4790c8d2` (PLAN only). Primary: Codex (GPT-6), runtime variant unavailable.

### Preserved baseline and separate #3 events

The original `.review/slice5-before-land.json` remains byte-for-byte unchanged, timestamp `2026-10-05T21:15:55.4834654Z`, SHA-256 `0D07F384967E91C1192978728CAC906D40651932527E924EE1F02F86B84BE135`. Later all-head snapshots were added, never substituted for it. The old feature head `0274b862aacf2307133ec4688db9d161a6722933` advanced to `9e8905f98422740327a6c211a28ed09a6c207a1a` only for the previously authorized bot-authentication repair and status commits. The new closure pushes must be recorded separately.

Two distinct #3 events were verified before reset:

| Event | GitHub commit and parents | Effect |
| --- | --- | --- |
| App Land | `0ae387a2f5c580fce38b19e5e8222c5cb11cde0e`; parents `[d32055264f2be740c52c32093f766dce73438942, a41f224f7a69b10eabb38387d237110019ac4f25]`; tree `7a6bdb16b7b9b2adae24699ed5386d0a4e00deef` | Moved only `demo/drop/fix-b`. App comment `6003595433`, created `2026-10-05T21:43:05Z`, verified by App ownership, server seal and PR scope. |
| Subsequent GitHub PR merge | `65392e68c70337ad5802033446851a1c03afd1ce`; parents `[a41f224f7a69b10eabb38387d237110019ac4f25, 0ae387a2f5c580fce38b19e5e8222c5cb11cde0e]`; merged by YearningAsian at `2026-10-05T21:44:02Z` | Moved `demo/base`, closed #3. This was not a base write by Land. |

Safe evidence: `slice5-live-reconcile-2026-10-05T22-16-45-145Z.json`. #3 is additional evidence, not a substitute for #1/#2. Resetting its branches cannot reopen the already merged PR; no replacement PR was silently created.

### Reset confinement inspected before any authorized reset

The actual reset script constructs a complete validated plan before its write loop (`scripts/demo-reset.mts:25,45`). `DemoBranch` validates every configured branch through `checkWritableBranch(branch, "demo-only")` (`src/core/demo.ts:7`), and `planBranchWrites` checks every branch and full target SHA before returning the plan (`:39`). The conservative ref syntax, nonempty `demo/` prefix and demo-only scope are enforced at `src/core/scope.ts:25-40`. Every push checks again at `scripts/lib/git.mts:54-55`:

```ts
const check = checkWritableBranch(branch);
if (!check.ok) throw new Error(check.reason);
```

The reset's explicit expected-old `--force-with-lease=refs/heads/${check.branch}:${expectCurrent}` is an operator-only fixture operation. The app never calls it, and Land still uses `force: false` plus atomic `beforeOid`. The learner explicitly authorized restoring `demo/base` despite its #3 merge, after evidence preservation.

Three actual `npm run demo:reset -- --yes` executions succeeded: initial restoration of base `65392e6...` to `a41f224...` and drop head `0ae387a...` to `d320552...`; restoration of the first #1 Land to its seed head before the repeat; final restoration after the repeat. Each operation was followed by a full branch inventory. Every demo branch returned to its seed, main remained `4ad4011b57c6f9bb08a15f0f81a309b6e2ab1217`, and #1 returned to CONFLICTING/DIRTY before repeat and after final reset. Immediate GitHub UNKNOWN while recomputing was not treated as a conflict or mergeability confirmation.

### Actual supported-flow observations

The ignored local evidence harness used the same `/api/live/{analyze,run,land,record}` routes as the desk, with a fixed allowlisted session sealed in memory. It performed one deliberate Land POST at a time and inspected actual GitHub branches, commit trees/parents and comments before any subsequent operation. The UI's automatic HELD record and Discard sequence was reproduced through its supported record endpoint. Cookies, keys and full signed analysis/run credentials were never printed or saved. Comment seals were verified in memory; only selected fields and body hashes were saved.

| Check | Actual observation |
| --- | --- |
| Original #1 Run checks | Recommended combine; all six checks passed, signed VERIFIED at `2026-10-05T22:18:23.572Z`. |
| Original #1 Land | HTTP 200 LANDED, commit `0d9ccc86f79856fd8e6cc1485af5c2aa5123427c`. Only `demo/clean/rename` moved. Parents exactly `[df6c107561c4dbe0caf18ba287d2a98af5355eaf, a41f224f7a69b10eabb38387d237110019ac4f25]`. GitHub tree `d10d0dfa39c83f4dfd4c363a613b33a8cc9f6e46` equals the signed checked tree. GitHub later confirmed MERGEABLE/CLEAN. |
| #1 decision record | Exactly one authentic App record, comment `6004283429`, created `22:18:28Z`; matching landed entry and commit. |
| Original #2 Run checks | Recommended combine; parsing/honor passed, real tests failed; signed HELD. No branch moved. |
| #2 automatic HELD and Discard | Both HTTP 200. Comment `6004290422` was created at `22:18:53Z`, then the same comment updated at `22:18:55Z`; its body hash changed, HELD and discarded entries were preserved, App ownership/seal/PR scope verified. Exactly one authentic record; no branch moved. |
| Fresh #1 repeat Land after reset | Signed VERIFIED, HTTP 200 LANDED, commit `67533c8eaf82ca9474f6c8a1efef5007edc12763`; same correct parents and checked tree. Only `demo/clean/rename` moved. Same authentic comment `6004283429` updated with both Land entries. |
| Replay of that exact signed run | HTTP 409 REFUSED: "Pull request changed since the run; run it again." No branch moved. |
| One signature byte XOR-changed | HTTP 403 REFUSED: "This run can't land: it expired (15 minutes) or belongs elsewhere. Run it again." This was the fresh token's tampered signature, not an observed expiry. No branch moved. |
| Final reset | Seed branches restored, #1/#2 conflicting, their authentic comments retained. #3 remains merged historical evidence. |

Evidence files: `slice5-live-first-2026-10-05T22-17-59-538Z.json`, `slice5-live-repeat-2026-10-05T22-19-33-134Z.json`, `slice5-live-final-2026-10-05T22-21-50-417Z.json`. Before/after inventories around each operation compare all remote branches, not just demo branches. No unrelated branch movement occurred. Authorized feature pushes and the eventual main merge/status push are separate branch events, not passed off as "no other branch moved."

At `2026-10-05T22:40:23.1064906Z`, pre-final-push remote heads were:

| Branch | Full SHA |
| --- | --- |
| demo/base | `a41f224f7a69b10eabb38387d237110019ac4f25` |
| demo/clean/rename | `df6c107561c4dbe0caf18ba287d2a98af5355eaf` |
| demo/clean/retry | `69c68f87e4fbe70966df802aaf39ed39593256a8` |
| demo/drop/fix-a | `a41f224f7a69b10eabb38387d237110019ac4f25` |
| demo/drop/fix-b | `d32055264f2be740c52c32093f766dce73438942` |
| demo/held/caller | `999e936f3866bf011ffa6d36af9c98760f97789a` |
| demo/held/signature | `586cb92434fa72752e779fd47cfdcfa92a5836ed` |
| feat/land | `9e8905f98422740327a6c211a28ed09a6c207a1a` |
| main | `4ad4011b57c6f9bb08a15f0f81a309b6e2ab1217` |

Snapshot: `slice5-pre-final-push-all-heads-20261005T2240231520684Z.json`. Later final-head evidence will be appended after actual writes.

### Focused UI fixes and fresh review findings

`d534dc34500ede9627b0d3f034280b49bb865391` separates file conflicts from readiness, lists current-head check snapshots and known blockers, links head/base commits and provides **Review and merge on GitHub**. Public check GETs use a separate unauthenticated client, with exact-head caching, a bounded entry count, request timeout and provider rate-limit cooldown; no App permission expansion. Missing/truncated/unavailable/empty evidence never proves passing requirements. Historical Land results retain their checked revisions, option and attempt time, while refreshed PR metadata determines current status. The old speculative "base probably moved" and conflict-free merge-permission claims were removed. Six new unit and two initial browser regressions were test-first: readiness RED 4 failed/3 passed then GREEN 7/7; cache/rate RED 2 failed/7 passed then GREEN 9/9; browser RED 2/2 then targeted GREEN 3/3.

Fresh final review round 1: actual model **claude-sonnet-5-5**, Claude Code 2.1.289, firstParty; requested alias sonnet. Exact source scope `4ad4011b57c6f9bb08a15f0f81a309b6e2ab1217...b0c6194a9971ee5ee5c3835f11d9acac9f98d1fa`. It reviewed 139 named public files and the exact affected diff, with earlier Codex/round reports, PLAN, environment values, private profile and session history withheld. Source-only, no tools/test execution. Input SHA-256 `83e38b9db76508e3e894d6d8c6ce1e5aeb61003d1c79ac85340a2e8e5d65660a`; report `slice5-final-claude-sonnet-r1.md`, safe source manifest alongside it. First bare-mode invocation failed before any model use because bare mode ignores OAuth; documented safe-mode isolation preserved OAuth and disabled customization/tools/session reuse for the successful fresh retry. No login or credential inspection was performed.

Round 1 found **0 high / 2 medium / 3 low**. Earlier reviews did not cover the new UI changes; these findings were not hidden by calling the old review sufficient.

| Finding | Disposition and test-first evidence |
| --- | --- |
| Final-R1 M1, medium: Discard after pending/UNKNOWN Land could post a contradictory discarded entry and hide uncertainty | Fixed in `1e42b067701f36d456147eeedc213a404ff39400`. Synchronous per-run and per-PR interlocks prevent new Run/Land/Discard across options during pending/UNKNOWN, preserve history and remove "Nothing has been pushed". Other PRs remain usable. Original pending/REFUSED regressions RED 2/2, independent UNKNOWN RED 1/1. Root independently found an option-switch bypass in the first per-run fix; a corrected-setup browser regression then failed on the actual bypass before the PR-wide repair. Final targeted GREEN 6/6. Full browser suite also checks ordinary pre-Land VERIFIED discard. Interlock is tab-local; server CAS/signed-run guards still govern other callers. |
| Final-R1 M2, medium: retained record lock refusal not actionable | Fixed in `56c38fc2e245b2d413174fe64d6c29a94c06a0aa`. Portable opaque lock reference and operator instructions; no private path/scope leakage, TTL, takeover, automatic unlock or unsafe retry. Real local-lock regression RED 1 failed/2 passed, GREEN 3/3; callback remains blocked and exact lock still exists. `src/server/record-writer.ts:47`, `tests/server/record-writer.test.ts:23`, `docs/record-reconciliation.md`. Root separately rechecked source/tests/docs and unchanged locking semantics. |
| Final-R1 L1, low: transient check failure/pending cached too long | Fixed in `788be3dca4cdb250aa14104c36089899ff583098`. UNKNOWN/pending expire after one minute, stable/none retain the disclosed maximum; rate-limit cooldown still wins. Same-head behavioral regressions RED 2 failed/9 passed, GREEN 11/11, `tests/server/prs.test.ts:192`. |
| Final-R1 L2, low: definite REFUSED could not be manually retried | Fixed with M1. A new explicit click rechecks the same signed run and every server guard; no automatic retry. Browser RED before implementation; regression `tests/e2e/desk.spec.ts:522` asserts two deliberate Land requests, identical token, only one Run. |
| Final-R1 L3, low: guard covers workflows, not actions/CODEOWNERS | Deferred additional hardening, not claimed prevented. Canonical slice-5 guard is the merge delta's `.github/workflows/`; writes remain demo-only and never main. Do not silently broaden the approved policy or claim a whole-PR configuration scan. Track for slice 6/security planning. |

The review skill defines CLEAN ROUND as zero highs and requires medium dispositions; this closure uses the stricter requirement of zero unresolved high/medium. Low L3 and the earlier older-valid-same-PR rollback limit remain explicitly disclosed, not described as fixed or accepted on the learner's behalf. Fresh follow-up verdict and final-head attestation are appended after they actually occur.

### Measured verification at final code head

Exact final code/docs/config head: `1e42b067701f36d456147eeedc213a404ff39400`. Additional closure commits since the previous published feature head include status claim `0c9e0d1`, UI `d534dc3`, deployment guard `e54f9b3b7513a31230ecf05fc9cd346f435f654b`, formatting-only test commit `b0c6194`, accurate local-source README `996dfec5f2f6bc04f862bb587fab39d89f1ec21b`, transient-cache fix `788be3d`, lock guidance `56c38fc`, ambiguity/manual-refusal recovery `1e42b06`. The exact ancestry list is also captured before final push. Metadata-only final-head changes require byte-equivalence rechecking against the review manifest and CI on their exact head.

- Primary `npm test`: exit 0, **262 tests / 30 files**, 73.84 seconds.
- Primary `npm run e2e`: exit 0, **19/19 browser tests**, fresh configured build/start on previously free port 3100. All new regressions and the added pre-Land discard case passed; fixture-based browser tests are not live GitHub evidence.
- Primary `npm run format:check`: exit 0, all matched files formatted.
- Primary `npm run lint`: exit 0, **0 errors / 1 existing ignored scratch warning** at `.review/run-check.mts:43`; production sources have no reported findings.
- Primary `npm run typecheck`: exit 0.
- Primary `npm run build`: separate final exit 0; fresh build also passed inside e2e. Existing outer-lockfile/color warnings only.
- Primary `npm run test:playground`: **6/6 passed**.
- Additional real provider smoke: `node node_modules/vitest/vitest.mjs run --config vitest.live.config.mts --reporter=default`, **2/2 tests / 2 files**, exit 0 at `2026-10-05T22:33:29.290Z`. A fresh schema-valid Gemini call and real Sandbox create/merge/network denial/protected-source test run/disposal passed. `runTests` must complete actual `protectSource` before returning the failed-test state required by this smoke; setup failure returns not_run and would fail it. This is bounded evidence for that owned fixture, not a general sandbox security certification. Safe selected output only, `slice5-live-provider-2026-10-05T22-33-12-222Z.json`.
- Node v26.3.0/npm 11.16.0 locally. Exact final-head GitHub CI must prove clean Node 24/npm 12.2.0 installation separately; earlier CI at 9e8905f already did so.
- Initial format check failed for one test mock's wrapping; named-file formatting and repeat passed. Initial lint failed for 19 intentional dynamic-payload any annotations in the ignored evidence collector; scoped rationale was added and repeat passed. A later local CommonJS helper lint reported two require-import errors; helper converted to ESM and targeted lint passed. No production lint finding was bypassed.
- First safe live-provider collector returned incomplete metadata despite child exit 0: Vitest's JSON reporter writes a file by default, not stdout. A harmless unit invocation confirmed that format; its generated artifact was moved into ignored review evidence. Collector corrected to capture default output in memory, save only fixed counts/timing formats, then repeated successfully. No failed provider diagnostics, credentials or full run tokens were printed or persisted by the collector.
- One option-switch browser setup initially raced analysis rendering; corrected with a visible-slider wait before the actual failing regression. Expected refusal and RED tests are verification, not unexpected operations. Read-only exploratory rg Windows-glob and Get-Date unsupported-parameter diagnostics were corrected without writes; bounded diagnosis replaced the superseded two-failure stop.

At `2026-10-05T22:32:31.186Z`, authenticated read-only localhost `/api/live/prs` returned #1/#2 conflicting at seed heads, and #4 conflict-free but BLOCKED with passing checks at its published head. This confirms the new readiness behavior was loaded. Localhost PID 32000 remained running and was not killed/restarted. Exact runtime SHA has no self-attestation endpoint: matching source/served artifacts and new behavior support an inference, not cryptographic proof of an entire process image. Browser production builds were fresh and tied to checkout bytes; old manual Land state is never used as current readiness evidence.

### Updated a–j assessment and limits

The earlier complete matrix remains the independently formed review. These real checks update its verification limits, not its canonical policy scope:

| Attack | Final assessment | Evidence and test / remaining limit |
| --- | --- | --- |
| a. Outside demo/*, main/default/base/fork/odd refs | PASS in supported scope | `src/core/scope.ts:16`, `src/server/guard.ts:60,66`; scope/guard regressions named in original matrix. No live unauthorized branch mutation attempted. |
| b. Head or base races | Head PASS; literal simultaneous both-ref policy FAIL | `guard.ts:73`, `github/land.ts:140`; guard and atomic-head-race tests. Actual parents are signed H/B. No atomic base precondition; no test proves post-final-read base movement refused. Canonical spec accepts this race. |
| c. Force/no expected old head | PASS for Land | `github/land.ts:140,142`; `land.test.ts:106,159,277`; actual demo writes and branch comparisons. Operator resets are separately authorized leased rewrites, not app Land. |
| d. Different checked tree/ordinary replay/expiry/wrong scope | PASS with stated limitations | Actual two #1 Lands' tree/parents match signed checked evidence; actual replay 409 and signature-byte tamper 403. Signature/scope/expiry, tree/CAS and runner tests in original matrix. No consumed nonce: intentional restoration to H can permit reuse while valid; tested replay was before reset. Local transient write-and-restore limit remains. Real protected Sandbox smoke passed one owned fixture; not general proof. |
| e. Uncertain reply or stale UI implies current success | PASS within tested paths | `github/land.ts:148`, deadline tests, live two confirmed Lands, `ui/Land.tsx:110`, `Desk.tsx:101,250,283`. Browser `desk.spec.ts:406,471,596,734` covers UNKNOWN/pending, option changes and historical notices. Independent caller/browser reload uncertainty still needs reconciliation; tab interlock is not durable authority. |
| f. Browser widens login/repo allowlists | PASS | Fixed env/session scope and original regressions; localhost harness uses only YearningAsian/merge-desk. No allowlist or App permissions widened. |
| g. Secret exposure | PASS by source inspection; dedicated live canary unverified | Original source/tests remain; all new harness output is selected metadata, source-only reviewer inputs exclude env/auth/private data. No credential-canary/transport audit test. |
| h. Forged/edited/duplicate/concurrent record | Scoped App writer races/tamper PASS; complete anti-rollback policy FAIL | Actual #1/#2/#3 App ownership/seal/scope verified, exactly one authentic comment each; same #2 comment changed on Discard. Writer/parser/concurrency/retention tests and new `record-writer.test.ts:23`. An authorized editor's whole older same-PR valid seal remains L1; no anti-rollback anchor/test, no live edit attempted. |
| i. Daily admission/caps/timeouts | Daily app admission FAIL/deferred; existing execution limits preserved | No daily cap/accounting test. Land/record deadlines, configured Sandbox/test lifetime limits and actual owned-fixture smoke passed. Land itself allocates no Gemini/Sandbox; hosted decision writes remain refused. Slice 6 must add fail-closed usage admission before production. |
| j. Workflow files | Canonical merge-delta PASS; whole-PR policy FAIL | `guard.ts:82`, `guard.test.ts:117`; no whole-PR changed-files test. Actions/CODEOWNERS additional hardening remains low L3; do not claim it blocked. |

### Readiness and deployment boundary

Historical challengepost lock and substantive approved October 4 `devpost/{scope,prd,spec}.md` commits support actual Devpost Learn Skill Pack use. They do not certify every invocation or an initially empty folder; adding documents later would not prove earlier use. Earliest commit/repository creation remain within September 22–October 26, 2026. Existing planning-template/workspace-skill disclosure is preserved; the final incorporated-work and material-attribution inventory is incomplete.

Real end-to-end demo Land and clean intended-stack CI installation now have evidence; final reviewed-head/main CI remains a separate check. Public repository, complete implementation source/lockfile/instructions and detectable MIT license are present. README now distinguishes verified local functionality from disabled production and explains installation, fixed login/repo scope, test ports and operator resets. Recorded public replay/assets, authorized final materials/API terms, completed English submission copy, and a public English YouTube/Vimeo demonstration under three minutes remain gaps. Pitch/submission draft are still unfinished; no provenance or compliance claim was fabricated.

Fresh read-only production health at `2026-10-05T22:33:01.303Z` reports ok:true and github/gemini/sandbox/recordings all false. `/demo`, `/judge`, `/api/stats` remain absent on the published placeholder. Plan free public recorded testing without keys or login through **October 30, 2026, 4:00 p.m. Central**; maintain availability and verify it covers the features accurately described. Supply dedicated testing credentials only if necessary, without widening live allowlists or sharing owner credentials. Submission deadline: **October 26, 2026, 4:00 p.m. Central**. Official rules: https://learn-ai-basics.devpost.com/rules .

GitHub deployment records showed previous main pushes automatically produced Production deployments. To honor the separate production gate, `e54f9b3` adds only `"main": false` to existing `vercel.json` git.deploymentEnabled; demo/** remains false and unspecified preview branches retain their existing provider behavior. Official reference: https://vercel.com/docs/project-configuration/git-configuration . No deployment command, platform setting, ruleset or App permission was changed. Read-only Vercel connector lookup was unavailable for the current scope (403); no reauthentication or setup was attempted. Confirm the merged main receives no Production deployment, and keep this guard until the learner's separate go.

`probe.yml` SHA-256 remains `48E3B2A27DB383BA740450ED564EBA1B1850A483148D8A156588B18ADF8BD125`, untracked/unstaged/untouched. Its permissions block, own-production-URL verification and separate named-file commit remain reserved for slice 6. Full final CI, merge and closure status evidence follow only after actual confirmation.

### Fresh separate-family follow-up and explicit dispositions

Final follow-up reviewed exact `1e42b067701f36d456147eeedc213a404ff39400`, actual **claude-sonnet-5-5**, fresh isolated one-turn source-only invocation. It included 141 named files, README and operator guide, the complete final code/config/doc diff and the prior independently formed Sonnet findings. Earlier Codex reports/PLAN/private environment or profile data stayed excluded. HEAD and clean affected sources were rechecked afterward. Input SHA-256 `1efd6e9bf64e03231b9643479c77a4176a8deb8065d8f2e841de6aeca8475f1c`; reviewed diff `cfd8e45134ad14104270d9cbdf2148c691effa2fec1e68bbb15f8766405d086c`; raw output `695a539b7addf27dd1aa197831ea80818dd9ad04560fb4c1eb59a959a72a1d9e`. Original report and source manifest: `slice5-final-claude-sonnet-r2.md` / `slice5-final-claude-sonnet-r2-safe-manifest.json`.

Verdict: **CLEAN ROUND, 0 high / 0 medium / 3 low**, both medium findings closed. Claude ran no tests; builder/root measurements above and actual provider evidence are separate. Root independently rechecked the final ambiguity guards, token-retry boundary, cached-check behavior, opaque lock hint and manual reconciliation instructions against their regression assertions.

Explicit builder dispositions, not inferred learner acceptance:

- Follow-up L1 (low), stale cross-tab/direct-API discarded record has no current-revision note: deferred audit-clarity improvement. Entries retain the run's signed head/base and describe that attempt; they do not move or undo code. In-tab ambiguity interlocks do not claim cross-tab authority. No stale-record route regression currently covers annotation/refusal; proposed test remains unimplemented. Track alongside durable production coordination in slice 6.
- Follow-up L2 (low), definite 403/422 comment rejection retains a lock: deliberately retain the conservative fail-closed policy. Even this availability case requires the documented operator reconciliation; no automatic release or speculative success was added. No proposed automatic-release regression exists. Track future classification separately from uncertain transport responses, preserving all current guards.
- Follow-up L3 (low), additional actions/CODEOWNERS protection: deferred defense-in-depth hardening. Current merge-delta suite selection holds changes outside playground, but this does not scan the entire PR or prove preexisting head-side metadata blocked. The narrower explicit workflow guard and whole-PR limit remain as reported in j.

The earlier authorized-editor rollback limit remains open and disclosed, with no anti-rollback anchor and no acceptance claimed for the learner. These low limitations do not negate the clean high/medium review of the supported local demo scope, and no production enablement follows from it. Conditional merging still requires exact final-head CI and current head/base/requirements verification.
