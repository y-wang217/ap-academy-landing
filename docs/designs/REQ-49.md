# Design: REQ-49: Iris 9/9: Auto-send per reply type, quiet hours, fail-safes

Copied from the approved card (Notion, REQ-49) so the reviewer can read it next to the diff.

**Numbers (REQ-51):** the approved design names migration `0030_iris_auto_send.sql`. PR #131 (REQ-48's follow-up, `0030_iris_revoke_approve_draft.sql`) took 0030 first, so this card uses `0031_iris_auto_send.sql`. Tracker ADR 0078 is unchanged.

**Summary:** Charlie can switch on auto-send for a reply type that passed the eval gate and its 20-approval streak, plus one global Sending switch. Drafts of that type that pass every check are then approved and sent by the poll run with the automated line, held to 07:00 Toronto overnight, and the type switches itself off the moment Charlie edits or rejects one of its drafts, an auto-send fails, or the policy version changes.

**Risk:** High. Iris sends parent email with no person in the loop, which cannot be undone. The card also changes who may write `iris.reply_types.auto_send_enabled`: the raw column grant is revoked and replaced by a checked function.

## Problem

Cards 4/9 to 8/9 built drafting, the approval queue, the eval harness, the readiness card and sending after approval. Every reply still waits for Charlie. Founder decision 5 says a reply type that Charlie approved unedited 20 times in a row, and that passed the eval gate (spec 6.4, decision 21), may send on its own. It sits behind a per-type switch and one global switch, both off by default, with quiet hours (decision 19), the automated line (decision 13) and three fail-safes (decision 20). This is for Charlie, and for the parents who get the reply sooner.

What exists on `main` today:

- `apps/tracker/lib/iris/gate.ts` (`evaluateGate`, `AUTO_SEND_CANDIDATES`) and `loadReadiness` in `apps/tracker/lib/iris/eval-handlers.ts` show the readiness card on `/tracker/iris/settings` with no switch (`EVAL_TEXT.noSwitchNote`).
- `iris.count_review` (migration `0025_iris_drafts.sql`) keeps the streak and sets `auto_send_eligible` at 20. Edit and reject reset the streak, but nothing turns a type off.
- `iris.reply_types` grants `update (auto_send_enabled)` to `authenticated` with an owner policy. Today a direct PostgREST PATCH could switch a type on with no gate check, and `enabled_at` and `enabled_by` would never be written.
- `iris.settings.sending_enabled`, `quiet_start` and `quiet_end` exist (0024), and the owner may already update `sending_enabled`. Nothing reads them yet.
- `iris.drafts.approval_mode` and `send_after` exist (0025). `iris.sends.mode` allows `auto` (0028). `attemptSend` in `apps/tracker/lib/iris/send.ts` always builds `withSignature(text)`.

## Acceptance criteria

- [ ] AC1: With Iris unpaused, `sending_enabled` true, the type's `auto_send_enabled` true, and a drafted message with no flags, one intent, confidence at or above the threshold, one matched student (or an intent outside `CHILD_SCOPED`), state `drafted` (not `needs_charlie`) and a version-1 Iris draft whose `policy_version` equals the type's `streak_policy_version`, the run approves the draft with `approval_mode = 'auto'`, `approved_by` null, writes one `auto_approved` event (actor `gate`), creates one `iris.sends` row with `mode = 'auto'`, and sends it in the same run during the day.
- [ ] AC2: Each failing condition sends nothing, leaves the draft `proposed` and the message `drafted`, and writes one `auto_send_skipped` event whose `detail.conditions` lists every failing code. The codes are `paused`, `sending_disabled`, `type_disabled`, `never_auto_send`, `needs_charlie`, `intent`, `flags`, `confidence`, `student`, `policy_version` and `edited`. Each code has its own test.
- [ ] AC3: The body of an auto-sent reply is the draft, then the signature, then a blank line and exactly this line: "This reply was sent automatically from AP Academy's written policy. If anything here is not right, reply to this email and Charlie will pick it up personally." A manual send never carries it. The stored outbound `iris.messages` row matches what was sent.
- [ ] AC4: A draft auto-approved at 22:00 Toronto gets `drafts.send_after` and a send `lease_until` of 07:00 Toronto the next day. No run before 07:00 attempts it, and the first run at or after 07:00 sends it. A draft auto-approved at 03:00 waits until 07:00 the same day. One auto-approved at 07:00 or 20:59 sends at once. The time comes from `iris.settings.quiet_start` and `quiet_end` and stays correct across the DST change (2026-11-01).
- [ ] AC5: Charlie's Approve at 22:00 still sends at once, with no automated line (manual approvals are unaffected).
- [ ] AC6: When Charlie edits or rejects a draft of a type whose `auto_send_enabled` is true, the same statement sets `auto_send_enabled` false, `auto_send_eligible` false, `unedited_streak` 0, `disabled_reason = 'edited_after_enable'` and `disabled_at`, and writes one `auto_send_disabled` event.
- [ ] AC7: When an auto send reaches `failed` (attempts spent), its type is switched off with `disabled_reason = 'send_failed'` and an `auto_send_disabled` event. A failed manual send changes no type.
- [ ] AC8: When the deployed `POLICY_VERSION` differs from a type's `streak_policy_version`, the next run sets every such type off, makes it not eligible, resets its streak to 0, sets `streak_policy_version` to the new version and, for each type that was on, sets `disabled_reason = 'policy_changed'` and writes one event. A second run changes nothing.
- [ ] AC9: An auto send still waiting for 07:00 when its type or `sending_enabled` has been switched off is withdrawn at claim time. Its send row (0 attempts, nothing sent) is removed, the draft goes back to `proposed` with its approval fields cleared, the message goes back to `drafted`, and one `auto_send_withdrawn` event is written. Paused leaves it waiting.
- [ ] AC10: `POST /api/iris/reply-types/[type]/auto-send` with `{ "enabled": true }` returns 422 `{ error: "gate_failed", failing: [...] }` and changes nothing when `evaluateGate` fails. It returns 422 `failing: ["never_auto_send"]` for a type on the never list, 404 for an unknown type, and 403 or a redirect for a non-owner (the guard runs before the body is read). On a pass it returns 200, sets `enabled_at` and `enabled_by`, and writes an audit row and an `auto_send_enabled` event. `{ "enabled": false }` always succeeds for the owner, sets `disabled_reason = 'owner'`, and writes an audit row.
- [ ] AC11: The database refuses to switch a type on without the route. `authenticated` has no update grant on `iris.reply_types`. `iris.set_auto_send` returns `gate_failed` for a type on the never list, or whose streak is below 20 or at another policy version, even when the owner calls it directly.
- [ ] AC12: `PATCH /api/iris/settings` accepts `{ "sendingEnabled": true, "confirmed": true }` and `{ "sendingEnabled": false }`. Switching on without `confirmed` is 400 `confirm_required`. Each change writes a `tracker.audit_log` row through the existing settings trigger.
- [ ] AC13: The settings page shows a Sending enabled switch, and per candidate type its readiness conditions, enabled state, streak, totals and last disabled reason. A type gets a switch only when `auto_send_eligible` is true and it is not on the never list. A 422 shows the failing conditions in words, and a never-list type never shows a switch.
- [ ] AC14: Tracker ADR 0078 is written and indexed in `apps/tracker/docs/decisions/README.md`. The Agent Playbook amendment below is in this design for Charlie to paste. Iris stays paused, and Sending and every type stay off after deploy.

## Approach

### The run (`apps/tracker/lib/iris/handlers.ts`, `handleIrisRun`)

Order after this card: claim → **policy reset** → intake → supersede → sends (the existing `runSends`, which now also picks up 07:00 sends) → classify → draft → **auto-send gate** → push → import → eval → purge.

- **Policy reset**: `store.resetForPolicy(POLICY_VERSION)` calls `iris.reset_for_policy(p_org, p_policy_version)` once per run. It is idempotent: the only rows it changes are those at another version.
- **Auto-send gate**: the new `runAutoSend` in `apps/tracker/lib/iris/auto-send.ts`. It only runs when `drafted.result === "ok"`, and it runs before the push, so a draft that is auto-approved is never pushed to the phone backup (`listPushable` only takes `drafted`/`escalated`).

### New files

- `apps/tracker/lib/iris/auto-send.ts`:
  - `autoSendCheck(input): { approve: boolean; failing: AutoSkipCondition[] }`. Pure. Inputs: the settings (`paused`, `sendingEnabled`, `confidenceThreshold`), the reply type switch row (`autoSendEnabled`, `streakPolicyVersion`), and the message (`state`, `intent`, `flags`, `confidence`, `notionStudentIds`, `notionStudentId`). Also the draft (`version`, `createdBy`, `edited`, `policyVersion`, `replyType`). It returns every failing code from AC2 in a fixed order. `never_auto_send` reuses `NEVER_AUTO_SEND` from `policy.ts`, and `student` reuses `CHILD_SCOPED` (it passes when the intent is not child-scoped, or when exactly one child is chosen).
  - `quietSendAfter(now, quietStart, quietEnd): string | null`. Pure. It returns the ISO instant of the next `quietEnd` in America/Toronto when the local time `localHhmm(now)` is inside the window (which wraps midnight), and null otherwise. A small `torontoInstant(dayIso, hhmm)` turns a local time into an instant, trying offsets -04:00 and -05:00 the way `torontoMidnight` in `handlers.ts` does. Both use `SCHEDULE_TIME_ZONE`, `todayIso` and `localHhmm` from `apps/tracker/lib/time.ts`.
  - `runAutoSend({ store, sender, mailbox, settings, drafted, now, startedAtMs })`. For each draft id that `runDraft` left `drafted`, it loads `store.autoSendCandidates(ids)` in one read, checks each one, and writes `auto_send_skipped` with `{ reply_type, conditions }` on a fail. On a pass it calls `store.autoApprove(draftId, sendAfter)`. The SQL re-checks everything under the message lock, so a skip result from SQL is also written as `auto_send_skipped` with its code. When it returns ok with no `sendAfter` and a sender is set up, it calls `claimSend` then `attemptSend({ verifyFirst: false })`: attempts were 0, so nothing can have gone out. It stops starting sends after `TUNING.irisSendBudgetMs`, and those sends go out on the next run. It never throws. A store error ends the step with one error line (300 chars max) on the run.
- `apps/tracker/app/api/iris/reply-types/[type]/auto-send/route.ts`: a POST that calls `handleAutoSendSwitch(realIrisAdminDeps(), realEvalAdminDeps(), type, body)`. `/api/iris/` is already in the proxy's cross-site prefix list, so this route needs no `proxy.ts` change.
- `apps/tracker/components/iris/auto-send-switch.tsx`: a client switch per type. It shows saving, the error line, and the 422 failing conditions through `gateConditionText`.
- `apps/tracker/docs/decisions/0078-iris-auto-send.md`, plus its row in the README index.

### Changed files

- `apps/tracker/lib/iris/policy.ts`: adds `AUTOMATED_LINE` (the decision 13 text). Not a policy change: `POLICY_VERSION` stays 5.
- `apps/tracker/lib/iris/send.ts`: `SendContext` gains `mode: "manual" | "auto"`. `attemptSend` builds `mode === "auto" ? withSignature(t) + "\n\n" + AUTOMATED_LINE : withSignature(t)`. `ClaimResult` gains `"withdrawn"`, which `runSends` skips like `busy`.
- `apps/tracker/lib/iris/draft-step.ts`: `DraftOutcome` gains `draftedIds: { messageId; draftId }[]`, the drafts whose message ended `drafted`. Escalated and `needs_charlie` drafts are left out. If the run dies before the gate, those drafts stay in the manual queue (fails closed).
- `apps/tracker/lib/iris/store.ts`, `apps/tracker/lib/data/iris.ts`, `apps/tracker/lib/iris/store.fake.ts`:
  - `IrisSettings` gains `sendingEnabled`, `quietStart` and `quietEnd`.
  - New run methods: `resetForPolicy(version)`, `autoSendCandidates(draftIds)` (the draft, its message, the thread's `notion_student_ids` and the type's switch row, never a body), and `autoApprove(draftId, sendAfter)` (the `iris.auto_approve_draft` rpc).
  - `sendContext` reads `sends.mode`.
  - The fake mirrors the SQL rules, including the fail-safes, so the handler tests cover them.
- `apps/tracker/lib/iris/handlers.ts`:
  - `handleIrisRun` adds the two steps above, and `sent` counts auto sends too. No new `iris.runs` column.
  - `handleIrisSettings` takes a strict union: `{ paused, confirmed? }` or `{ sendingEnabled, confirmed? }`. Switching on needs `confirmed: true`. `IrisReader` gains `updateSendingEnabled(on)` (0 rows means 403, as with paused) and `setAutoSend(type, enabled, policyVersion)`.
  - The new `handleAutoSendSwitch` works in this order: guard `requireScheduler(identity, ["admin"])`, then the type must be in `AUTO_SEND_CANDIDATES`, or it is 422 `never_auto_send` for `NEVER_AUTO_SEND` and 404 otherwise. Then the body `{ enabled: boolean }`. On enable it runs `evaluateGate` over the eval reader's `gateInputs()` with `POLICY_VERSION` and `AI_MODEL`, where a fail is 422 `failing`. Then the rpc, where a SQL `gate_failed` is also 422 and other errors are 500 `save_failed`.
- `apps/tracker/lib/iris/eval-handlers.ts` and `apps/tracker/lib/data/iris-eval.ts`: `gateInputs` also selects `auto_send_eligible`, `auto_send_enabled`, `approved_unedited_total`, `edited_total`, `rejected_total`, `disabled_reason` and `disabled_at`. `ReadinessRow` carries these fields and `switchable = eligible && !never`.
- `apps/tracker/lib/iris/deps.ts`: wires `updateSendingEnabled` and `setAutoSend`.
- `apps/tracker/app/iris/settings/page.tsx` and `apps/tracker/components/iris/settings-actions.tsx`: the global switch and the per-type table (below).
- `apps/tracker/app/iris/messages/[id]/page.tsx`: for an auto-approved draft it shows "Approved automatically" and, while waiting, "Sends at 07:00" (from `send_after`). `ThreadView` drafts already carry `approval_mode`. `send_after` is added to that select.
- `apps/tracker/lib/view/iris-text.ts`: the switch labels, the skip-condition words, the disabled-reason words (`edited_after_enable`, `send_failed`, `policy_changed`, `owner`) and the confirm text. `noSwitchNote` is removed.
- `apps/tracker/lib/domain/tuning.ts`: no change. The streak (20) and the gate numbers already exist, and quiet hours live in `iris.settings`.
- `docs/iris-operations.md`: how to switch Sending and a type on and off, what turns a type off, and how to stop a 07:00 send (switch the type off).
- `supabase/tests/run-rls.sh`: runs the new `iris_auto_send.sql`.
- `e2e/tracker/flows.mjs` (and `e2e/tracker/seed.sql` if a seed is needed): the e2e rows below.

### UI: `/tracker/iris/settings`

```
[Status: Running]  Pause | Run now                        (unchanged)
Auto-send
  Sending enabled: Off   [Turn on]   ( ) I have read which types are on and the automated line
  Latest eval run: Oct 22, policy 5
  cancel_with_notice   On   streak 23   approved 41 · edited 3 · rejected 1   [Turn off]
     20 labelled: met · precision: met · sensitive recall: met · rating: met · streak: met
  late_cancel          Off  streak 12   ...   (no switch: not eligible)   last turned off: edited after enable, Oct 20
     ... streak: not met
  Never auto-send: pause_or_stop, billing_question, refund_request, no_show, other
```

States: Loading (server-rendered, so there is none); Error (the existing `EVAL_TEXT.loadError` notice); Saving (the button is disabled); Failed save (one error line, and the old state is kept); 422 (the failing conditions are listed under the type); Success (`router.refresh()`). Turn on for Sending needs the tick, the same pattern as Unpause. Turn off never asks.

### Agent Playbook amendment (decision 26, for Charlie to paste)

In section 3, replace the level 5 row's Rule cell "Never" with:

> Never, except Iris replies to parents of a reply type Charlie switched on under tracker ADR 0078 (eval gate and 20 unedited approvals passed; any edit, reject, failed send or policy change switches it off).

The builder does not write the Playbook. The PR body repeats this text.

## Migration

- File: `supabase/migrations/0030_iris_auto_send.sql` (built as `0031_iris_auto_send.sql`, see Numbers above). It is additive, with replaced function bodies. It has no `drop`, `truncate` or `alter ... drop`, so it does not need the human-migration path. Its only `delete` sits inside a function body, the same as `iris.purge_expired` in 0024, which applied through the MCP.
- Creates or replaces:
  - `iris.count_review` (replaced): same streak rules. On `edit` or `reject` of a type whose `auto_send_enabled` is true, it also sets enabled false, eligible false, streak 0, `disabled_reason 'edited_after_enable'` and `disabled_at`, and inserts an `auto_send_disabled` event (actor `auth.uid()`, detail `{reply_type, reason}`).
  - `iris.mark_send_failed` (replaced): same as now. When `s.mode = 'auto'` it also switches the draft's type off with `'send_failed'` and writes the event. It keeps the streak.
  - `iris.auto_approve_draft(p_draft uuid, p_send_after timestamptz) returns jsonb`: security definer, executable by `service_role` only. It locks the message and re-checks: not paused, `sending_enabled`, type enabled, type not on the mirrored never list, draft `proposed` with version 1, `created_by 'iris'`, not edited, `policy_version = streak_policy_version`, message `drafted`, and no send row yet. A fail returns `{result:'skipped', reason}`. Otherwise it approves the draft (mode `auto`, `approved_at`, `send_after`) and sets the message to `approved`. It writes an `auto_approved` event (actor `gate`), inserts a send (`mode 'auto'`, `attempts 0`, `lease_until = p_send_after`) and writes a `send_started` event. It does not touch the streak or the totals. It returns `{result:'ok', send_id}`.
  - `iris.claim_send` (replaced): same as now. After the paused check, an `auto` send with `attempts = 0`, whose type or `sending_enabled` is now off, is withdrawn. The send row is deleted, the draft goes back to `proposed` (approval fields and `send_after` cleared), the message goes back to `drafted`, an `auto_send_withdrawn` event is written, and it returns `'withdrawn'`.
  - `iris.set_auto_send(p_org uuid, p_type text, p_enabled boolean, p_policy_version integer) returns jsonb`: security definer. It needs `tracker.is_org_owner(p_org)`, otherwise it returns `not_found`. Enabling it refuses `gate_failed` with `failing` for: a type on the never list, a missing row, `unedited_streak < 20`, or `streak_policy_version <> p_policy_version`. Otherwise it sets enabled, `enabled_at` and `enabled_by`. Disabling sets `disabled_at` and `disabled_reason 'owner'`. Each change writes an event, and the existing `audit_reply_types` trigger writes the audit row. It is granted to `authenticated`.
  - `iris.reset_for_policy(p_org uuid, p_policy_version integer) returns integer`: for `service_role`. It changes the rows whose `streak_policy_version` is not null and differs from the version, as AC8 describes, and returns the count.
  - `revoke update (auto_send_enabled) on iris.reply_types from authenticated`. The policy "owner switches iris reply types" stays and does nothing without a grant. Dropping it would make this a human migration.
  - The SQL keeps its own copies of the never list and the streak 20, as `count_review` already does. A scan test checks they match `NEVER_AUTO_SEND` and `TUNING.irisAutoSendStreak`.
- Check: `supabase/tests/iris_auto_send.sql` proves these points: the owner cannot update `reply_types` directly; `set_auto_send` refuses never-list, low-streak and old-version types, and enables a qualifying one with an audit row; another org's owner and a teacher get `not_found`; edit and reject of an enabled type switch it off; a failed auto send switches it off, and a failed manual send does not; `auto_approve_draft` is refused to `authenticated`, skips on each re-checked condition and creates exactly one auto send, and a second call returns skipped; `claim_send` returns busy before `lease_until`, and withdraws when the type is off; `reset_for_policy` is idempotent.
- Ships as its own PR first (`req/REQ-49-migration`, human-merged and applied). The feature PR below assumes it is live.

## Test plan

| Test | Type | Covers |
| --- | --- | --- |
| `lib/iris/auto-send.test.ts`: `autoSendCheck` passes with every condition met, and fails with each single condition broken (11 cases, each names exactly its code). It also checks that several failures list all of them. | unit | AC1, AC2 |
| `lib/iris/auto-send.test.ts`: `quietSendAfter` at 20:59, 21:00, 22:00, 23:59, 00:00, 03:00, 06:59 and 07:00 Toronto, on 2026-10-31 / 2026-11-01 (DST end) and 2027-03-14 (DST start), with custom `quietStart`/`quietEnd` | unit | AC4 |
| `lib/iris/auto-send.test.ts`: `runAutoSend` on the fake store. A pass approves, claims and sends with the line. A pass at 22:00 approves, makes no Gmail call, and the send waits. A fail writes one skipped event and nothing else. A SQL skip is recorded. The budget stops new sends. A store error gives one error line. | unit | AC1, AC2, AC4 |
| `lib/iris/send.test.ts`: an auto mode body ends with signature + blank line + `AUTOMATED_LINE`. A manual body has no line. `withdrawn` is skipped by `runSends`. | unit | AC3, AC9 |
| `lib/iris/run-handlers.test.ts`: the full run with a fake store. Policy reset is called first. The gate runs after draft and before push, and an auto-approved message is not pushed. The 07:00 run sends a waiting auto send. Paused touches nothing. | unit | AC1, AC4, AC8 |
| `lib/iris/run-handlers.test.ts`: on the fake, edit and reject of an enabled type turn it off, and an exhausted auto send turns it off (`send_failed`). A changed `POLICY_VERSION` turns every type off, and a second run is a no-op. | unit | AC6, AC7, AC8 |
| `app/api/iris/iris-routes.test.ts`: auto-send switch. A non-owner is denied before the body is read. Unknown is 404, never-list is 422 and gate-fail is 422 with `failing`. SQL `gate_failed` is 422, pass is 200, disable is 200, and a store error is 500. Settings `sendingEnabled` on without confirm is 400, with confirm 200, off 200, and 0 rows 403. | unit | AC10, AC12 |
| `lib/iris/scan.test.ts`: the never list and the streak in the migration match `NEVER_AUTO_SEND` and `TUNING.irisAutoSendStreak`. `AUTOMATED_LINE` is the decision 13 text. | unit | AC3, AC11 |
| `lib/iris-adr.test.ts`: ADR 0078 exists, is indexed, and names the switches, the gate, quiet hours and the three fail-safes | unit | AC14 |
| `lib/view/iris-text.test.ts`: the skip-condition and disabled-reason words, with no em dashes | unit | AC13 |
| `supabase/tests/iris_auto_send.sql` (`pnpm test:rls`) | integration | AC6, AC7, AC8, AC9, AC11, AC12 (audit) |
| `e2e/tracker/flows.mjs`, REQ-49 block, with a seeded eval run and a reply type at streak 20: the owner turns on Sending (tick) and the type on the settings page. A run with a qualifying mock-Gmail message makes mock Gmail receive one message whose body ends with the automated line. A non-eligible type shows no switch. A crafted enable of a below-gate type is 422 with the conditions shown. A cross-site switch POST is 403. The owner rejecting a draft of the enabled type leaves it off on reload. | e2e | AC1, AC3, AC6, AC10, AC13 |

## Out of scope

- New reply types, texts, and any refund, invoice or credit change (card).
- Changing quiet hours, the threshold or retention from the UI. The page shows them read-only, as the spec says.
- Revoking `iris.approve_draft` from `authenticated`, the follow-up 0028 mentions. That is a separate small migration card (now #131).
- Editing the Agent Playbook (Charlie pastes the line).
- Releasing the readiness gate in `docs/readiness.md`. The builder only updates the production status, and Charlie releases.

## Risks and edge cases

- **Double send**: auto sends reuse card 8's single send row per draft, our own Message-ID, and verify-before-retry. `auto_approve_draft` refuses a draft that already has a send.
- **Race between a switch-off and an auto-approve**: the SQL re-checks the switches under the message lock. A waiting 07:00 send is re-checked at claim and withdrawn if anything is off, so it never goes out after Charlie turned it off.
- **Charlie wants to stop one queued 07:00 send**: an approved draft cannot be edited (409). He switches the type off and the send returns to the queue at claim. `docs/iris-operations.md` says so.
- **DST**: the local-to-instant conversion is DST-safe, and the tests cover both changes.
- **Gate drift between TS and SQL**: the SQL only enforces the floor (never list, streak and version), while the eval numbers stay in the TS gate. The scan test pins the shared constants.
- **Skip-event volume**: one `auto_send_skipped` per drafted message (at most `irisMaxDraftPerRun` = 6 per run), ids and codes only, with one year of retention.
- **The failed-send fail-safe keeps the streak**: a Gmail outage should not cost 20 approvals. Charlie switches the type back on once Gmail works, and the gate still applies.
- **A deploy that bumps `POLICY_VERSION` while a 07:00 send waits**: the reset switches the type off in the next run, before `runSends`, so the waiting send is withdrawn.
- **Iris is paused**: nothing runs, and waiting sends stay waiting (claim returns `paused`).

## Decisions for approval

| # | Decision | Default taken |
| --- | --- | --- |
| 1 | New dependencies | None. |
| 2 | Schema placement | `iris` schema, migration 0031 (see Numbers). No new table or column. Replaced: `count_review`, `mark_send_failed`, `claim_send`. New: `auto_approve_draft` (service_role), `set_auto_send` (owner), `reset_for_policy` (service_role). RLS unchanged. |
| 3 | Who may switch a type on | (a) Revoke the owner's column grant. The route runs the full TS gate, and `set_auto_send` enforces the floor in SQL. |
| 4 | ADR number | Tracker ADR **0078** `0078-iris-auto-send.md`. |
| 5 | Do auto approvals count in the streak or totals? | Don't. |
| 6 | Does the failed-send fail-safe reset the streak? | Keep. |
| 7 | How quiet hours hold a send | The send's `lease_until` set to `send_after` (with `drafts.send_after` recorded for display). |
| 8 | A waiting auto send whose switch is turned off | Withdraw it back to the manual queue. |
| 9 | Daytime auto sends | Same run, within `irisSendBudgetMs`. |
| 10 | Turning on Sending enabled | Tick to turn on, none to turn off. |
| 11 | "One intent" and "needs_charlie" | Read from the message: state `drafted` and `intent` set. |
| 12 | Where the policy reset runs | Every run, idempotent. |
| 13 | Skip events for drafts of a type that is simply off | Write one each. |
| 14 | Playbook | Charlie pastes the line above. |
| 15 | Run counts | Count them in `sent`. No column. |

## Build notes

- `quietSendAfter` uses the existing DST-safe `localToUtc` from `lib/domain/schedule/wallclock.ts` instead of a new `torontoInstant`, so there is one local-to-instant conversion in the app.
- `DraftRow` did not yet carry `approval_mode`; this card adds `approval_mode` and `send_after` to the draft select and its schema.
- The settings card is titled "Auto-send" (it was "Auto-send readiness").
