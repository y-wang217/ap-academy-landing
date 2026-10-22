# REQ-44: Iris 4/9: Drafting, approval queue, Notion phone backup

Card: https://app.notion.com/p/3fbd6ae73dd781948911f632ed5785d7 (Risk High, approved by Charlie on the card).
Migration PR: #110 (`0025_iris_drafts`).

**Numbers used at build time (REQ-51 reservation).** Migration **0025** (`main` ends at 0024, no open `req/` PR). Tracker ADRs **0063** and **0064** (`main` ends at 0062). The card's "0019", "0053" and "0056" are stale spec placeholders.

**Build notes (choices the design left open, pinned in the build).**
- `VOICE_RULES` are worded apart from `HARD_RULES` ("Do not ..." rather than "Never ..."), so AC1's "no `HARD_RULES` text in the draft prompt" holds literally.
- The owner functions return jsonb `{"result": "ok" | "conflict" | "not_found"}` (edit adds `draft_id`); a draft of another org, and any caller who is not its org owner, reads as `not_found` rather than raising, so nothing leaks whether the id exists. A shared `iris.count_review` (not executable by any API role) holds the streak rules.
- Approving keeps the message's `handled_at` as it was; it moves the message to `approved`, which takes it out of Needs you and Drafts waiting.
- A no-show escalation whose draft fails three times stays `escalated` (only a classified message can become `failed`), so it never leaves Needs you.
- The phone backup skips a message already within 1 day of its purge date, so the retention sweep never deletes a to-do that the same run then writes again.
- A to-do whose comment failed after the append keeps its block id and is retried for the comment only; a lost block id is recovered by its ref.
- The ai_line rule matches "as an AI", "assistant", "automated" and "Iris"; a bare "AI" is not matched, to avoid over-escalating.
- `iris_core.sql` (REQ-42's RLS check) needed two changes for 0025: the six core tables are checked as a subset, and its `draft_id` event points at a real draft now that `draft_id` has a foreign key.
- The REQ-8 scan that forbids comments in the daily-task files now excludes `createComment` in `work.ts` (design decision 22) and still forbids any daily-task file from calling it.

Draft every reply from the policy file, put it in an approval queue Charlie works from, and push a copy-ready version to his phone through Notion. Nothing is sent by Iris in this card.

**Full spec:** [Iris spec](https://app.notion.com/p/3fbd6ae73dd78194ba65d2a6caedcc20) (sections 3 for the 0019 tables, 4.4, 4.5, 4.6, 4.8 streak counting only; decisions 13, 14, 16; card 4/9)

**Blocked by:** Iris 3/9.

## Requirements

- Migration `supabase/migrations/0019_iris_drafts.sql`: `iris.drafts` (versions, `edited`, `approval_mode`, `send_after`, `notion_block_id`), `iris.reply_types` (switches off by default, `unedited_streak`, totals, `streak_policy_version`; audit trigger on; owner may update `auto_send_enabled` only), `iris.eval_labels`, `iris.eval_runs`. Owner-only RLS; check `supabase/tests/iris_drafts.sql`. Ships as its own migration PR.
- `lib/iris/draft.ts`: prompt holds the policy text for the reply type verbatim from `policy.ts` (test: that text and no other policy text), the first names, the message, the thread summary and the voice rules (plain, short, signed by Charlie, no AI line, no dollar amounts, no specific make-up time unless supplied, never confirm a forfeit). Output (Zod): `body`, `needs_charlie`, `reason`. Signature appended by code. Draft row `proposed`, version 1, `created_by iris`. Escalations that allow a draft (pause_or_stop, no_show) get one.
- Queue `/tracker/iris`: Needs you, Drafts waiting, Sent today, Failed. Message page `/tracker/iris/messages/[id]`: thread, classification, policy text used, editor, Approve (marks approved and shows Copy until 8/9), Edit (version n+1, `created_by owner`, `edited true`), Reject (reason; message back to escalated), Mark handled, Open in Gmail. Failed saves shown as failed.
- Streak counting from this card: unedited approval increments the type's `unedited_streak`; an edit or reject resets it; at 20 the type is `auto_send_eligible` (no switch shown until 9/9).
- Charlie's manual Gmail reply in a thread with a `proposed` draft marks it `superseded` on the next run.
- Phone backup `lib/iris/notion-push.ts` through `lib/notion/work.ts`: one Work page per local date `Iris replies — YYYY-MM-DD` (Area Delivery, Type Recurring, State Next, Owner Charlie, Alignment Maintenance, Due / Review the date; adopted by exact title on retry); one to-do per new draft or escalation with parent first name, child, intent, tracker link, Gmail link and a code block of the reply text; one comment per new to-do mentioning `NOTION_CHARLIE_USER_ID`; the parent's message text is never written to Notion; one Work Log entry per day updated with counts. A Notion failure leaves the draft in the queue, marks the push failed and retries next run.
- ADRs 0053 (policy file and versions), 0056 (phone backup choice).

## Acceptance hints

- Prompt test; approve, edit and reject streak behaviour; superseded on manual reply; one Work page per date; no `checked` sent after creation; no parent message text in any Notion request body; teacher 403 on every route; RLS file passes.

## Out of scope

Sending (8/9), auto-send switches (9/9), evaluation (5/9).

## Global guardrails (all Iris cards)

Reuse the existing stack, auth, adapters, persistence, UI and test patterns. Admin only, checked server-side through `tracker.memberships` (org owner). Iris data lives in Postgres schema `iris` with RLS on every table; migrations in the root `supabase/migrations/`. No queues, Redis, separate backend or new hosting. Policy text lives in one versioned file in the repo, never inside prompts. Escalate when unsure, on 2 or more intents, and on money disputes, legal threats, crisis language or hardship; never process refunds; never promise a specific make-up time unless it comes from real teacher availability; log every draft and send. A message is processed once, a reply is sent at most once, retries never double-send. A failed Gmail, Claude or Notion call leaves the tracker usable and shows one admin error of at most 300 characters. Iris never writes Students & Parents, Invoices, Missed Sessions & Credits, Lessons or the scheduler's tables. Gmail scope is read-only until Iris 8/9. Iris starts paused.

---

# Design: REQ-44: Iris 4/9: Drafting, approval queue, Notion phone backup

**Summary:** every classified parent message (and every no-show escalation) gets a Claude draft written from its policy section, checked by code and stored as version 1; Charlie works a four-section queue and a message page where he approves (then copies), edits (a new version) or rejects, each counted toward the reply type's unedited streak; a reply Charlie sends himself from Gmail supersedes the pending draft; and each new draft or escalation becomes one to-do with a copy-ready code block and one mention comment on a per-day Notion Work page. Nothing is sent by Iris.  
**Risk:** High (reply text with parent and child first names is written to Notion Work, a new destination for parent data under this feature, and the owner's approval record created here is the control every later send relies on; spec section 7 assigns High for the same reasons).

## Problem

Iris 3/9 (REQ-43, #107) leaves each matched message at `classified` (ready for a draft) or `escalated` (Charlie must act). Charlie (the org owner) still writes every reply from scratch, and only sees the queue at a desk. This card is rung 2: Iris drafts each reply from the versioned policy file, Charlie approves, edits or rejects it in the tracker, and a copy-ready version reaches his phone through Notion. Approvals are counted per reply type so that Iris 9/9 can later offer auto-send to types Charlie approved unedited 20 times in a row. Parents see nothing new: Iris sends nothing until Iris 8/9; Charlie copies an approved reply into Gmail himself.

## Acceptance criteria

- [ ] AC1: `buildDraftPrompt` for each draftable reply type contains `POLICY[type].text` verbatim, `VOICE_RULES` and `HOLDING_LINE` (imported from `policy.ts`), and no other `POLICY` section text, no `INTENT_HINTS`, `FLAG_HINTS` or `HARD_RULES` text; it carries the parent's and child's first names, at most 5 code-built history lines and the quote-stripped message inside message tags, and no email address, no surname from the directory fixture and no Parent Phone, rate, invoice or note field.
- [ ] AC2: A `classified` message gets one `iris.drafts` row: version 1, state `proposed`, `created_by 'iris'`, `edited false`, `reply_type` equal to its intent, `policy_version = POLICY_VERSION`, body without a signature. The message moves to `drafted`, one `iris.ai_calls` row (`purpose 'draft'`, tokens and outcome only) and one `drafted` event (`draft_id` set, codes only) are written.
- [ ] AC3: The copy text, the Notion code block and (from 8/9) the send body are `withSignature(body)`, which ends with `SIGNATURE` ("Charlie" then "AP Academy") exactly once, including when the model already ended the body with "Charlie".
- [ ] AC4: A model body that contains a dollar amount ("$40", "40 dollars"), an AI line ("as an AI", "assistant", "automated", "Iris"), a clock time ("5:30", "5 pm") or the word "forfeit" stores no draft; the message ends `escalated` with `escalation_reason 'draft_rule'`, unhandled, and the event detail lists the rule codes.
- [ ] AC5: `needs_charlie: true` stores the draft as `proposed` and moves the message to `escalated` with reason `needs_charlie`, unhandled; it shows in Needs you with its draft on the message page.
- [ ] AC6: An unhandled `escalated` message with reason `escalate_only` and intent `no_show` gets a draft and stays `escalated`; no other escalation (flagged, multi_intent, low_confidence, ambiguous_student, billing_question, refund_request, other, unknown_sender, automated) gets a draft or a draft call.
- [ ] AC7: A Claude refusal, 429 or 500 stores no draft, adds 1 to `retry_count` with a short fixed `last_error` (at most 300 characters); the third failure sets `failed` with an event. `ANTHROPIC_API_KEY` unset makes zero draft calls. A run starts at most `TUNING.irisMaxDraftPerRun` (6) draft calls, oldest first, and none after `TUNING.irisDraftBudgetMs` (70,000 ms) from the run start. A successful classification resets `retry_count` to 0.
- [ ] AC8: Approve on the latest `proposed` version (owner, `POST /api/iris/drafts/[id]/approve` with that version) sets the draft `approved`, `approval_mode 'manual'`, `approved_by` the owner's uid, `approved_at`; the message `approved`; for an unedited Iris version the type's `unedited_streak` and `approved_unedited_total` go up by 1; one `approved` event. A second Approve, or Approve with an older version, is 409 and changes nothing.
- [ ] AC9: Edit (`POST /api/iris/drafts/[id]/edit` with a body of 1 to 5,000 characters) stores version n+1 (`created_by 'owner'`, `edited true`, `proposed`), sets version n `superseded` and the type's streak to 0; approving that version adds 1 to `edited_total` and leaves the streak at 0.
- [ ] AC10: Reject (`POST /api/iris/drafts/[id]/reject` with a reason of 1 to 300 characters) sets the draft `rejected` with the reason, the message `escalated` with reason `draft_rejected` and `handled_at` null (back in Needs you), the streak to 0 and `rejected_total` plus 1.
- [ ] AC11: After 20 consecutive unedited approvals of a type at one policy version, `auto_send_eligible` is true (false after 19); an edit or reject sets the streak to 0 and `auto_send_eligible` false; an approval of a draft with a newer `policy_version` than `streak_policy_version` restarts the streak at 1 under that version. No switch appears on any page.
- [ ] AC12: A reply Charlie sends from Gmail (listed by `in:sent`, carrying the SENT label) in a thread whose inbound message has a `proposed` draft is stored once as an outbound `charlie_manual` row; on the same run that draft becomes `superseded` and the message `escalated` with reason `answered_by_charlie` and `handled_at` set, so it leaves Needs you and Drafts waiting; the streak is unchanged. Mail from the mailbox address that is only in the inbox (no SENT label) supersedes nothing.
- [ ] AC13: `/iris` shows Needs you, Drafts waiting, Sent today (approved or sent since Toronto midnight, labelled "Approved, send by hand" or "Sent") and Failed, each row with family, child, intent, confidence, age and a "Phone copy failed" mark when its push failed; Recent stays below. Each section has an empty state. A teacher, student or parent is redirected to `/` before any Iris read.
- [ ] AC14: `/iris/messages/[id]` shows, to the owner only, the thread (inbound text, Charlie's manual replies), the classification, the policy text used, the draft versions, an editor on the latest `proposed` version with the signature shown below it, and Approve, Save edit, Reject (with reason), Mark handled and Open in Gmail; after Approve it shows Copy. A failed save shows "Could not save. Try again." and never a success state.
- [ ] AC15: Every new route answers 403 to a teacher before any Iris read, 403 to a cross-site POST (proxy prefix check), 404 to an unknown or other-org draft id, 400 to an invalid body.
- [ ] AC16: The push step keeps one Notion Work page per Toronto date titled `Iris replies — YYYY-MM-DD` with Area Delivery, Type Recurring, State Next, Owner Charlie, Alignment Maintenance and Due / Review the date; a retry after a lost write adopts the page by exact title, so a date never gets two pages.
- [ ] AC17: Each new draft or unhandled escalation gets exactly one to-do: parent first name, child first name, intent label, reason label, a tracker link to its message page, a Gmail thread link, a `ref` code (first 8 characters of the message id) and, when a draft exists, a code block with `withSignature(body)`. An unknown sender's to-do says "Unknown sender" and carries no address. Automated mail and `no_reply_needed` get none.
- [ ] AC18: Each new to-do gets one page comment that mentions `NOTION_CHARLIE_USER_ID` and says only "New Iris item" with its ref and intent label (no names). With the variable unset, to-dos are written with no comment and the settings page says phone alerts are off.
- [ ] AC19: No Notion request body contains the parent's message text (a sentinel in the fixture body), the sender's address, or a `checked` field on any request other than the to-do's creation; a to-do is never edited after creation.
- [ ] AC20: A Notion 500 on a to-do leaves the draft in the queue, sets the push `failed` with `attempts` plus 1 and a short error, and the next run retries it; when the earlier append did reach Notion, the retry finds the to-do by its ref and writes no second one. After `TUNING.irisMaxPushAttempts` (5) the push stays failed and the row shows "Phone copy failed".
- [ ] AC21: One Work Log entry per date, linked to that date's Work page, whose Decisions text is updated with counts (drafts, escalations, phone copies failed) on each run that pushed.
- [ ] AC22: A to-do whose message is past or within 1 day of its `purge_at`, or whose message is gone (purge or `delete_thread`), is deleted from Notion on the next run and its push row removed, so a Notion copy is never kept longer than the tracker keeps the message (privacy text from Iris 1/9).
- [ ] AC23: `supabase/tests/iris_drafts.sql` passes: owner cannot insert or update `iris.drafts` directly and does so only through the three functions; a teacher, a parent and the owner of another org are refused by each function and read no draft; `reply_types.auto_send_enabled` is the only owner-updatable column there; the streak rules of AC8 to AC11 hold in SQL; audit rows appear for `reply_types` changes and none for drafts; `events.draft_id` becomes null when a draft's message is purged.
- [ ] AC24: The run response and `iris.runs.drafted` carry the drafted count; tracker ADRs `0063-iris-policy-versions-and-drafts.md` and `0064-iris-phone-backup.md` exist with every section, are in the decisions `README.md`, have no em dash, and `lib/iris-adr.test.ts` lists them.

## Approach

**Policy (`apps/tracker/lib/iris/policy.ts`, POLICY_VERSION 2 to 3).** Adds, as plain data:

- `VOICE_RULES`: plain and short; write as Charlie, first person; do not sign (code adds the signature); no AI line; no dollar amounts; no specific make-up or class time unless supplied; never confirm a forfeit; never promise a refund; if unsure, say `HOLDING_LINE` and set needs_charlie.
- `SIGNATURE = "Charlie\nAP Academy"` (spec decision 13).
- `DRAFTABLE_INTENTS`: `cancellation`, `reschedule_request`, `pause_or_stop`, `general_question`; `DRAFTABLE_ESCALATIONS`: `no_show` (spec 4.4).
- The bump follows the file's rule; `policy.test.ts` pins 3. Iris is paused, so nothing live is re-stamped.

**Draft prompt (`apps/tracker/lib/iris/draft-prompt.ts`, new, pure).** `buildDraftPrompt({ replyType, parentFirstName, childFirstName, history, body })` returns `{ system, user }`. System: role line ("You draft one email reply for Charlie..."), `VOICE_RULES`, `HOLDING_LINE`, and only `POLICY[replyType].text` in a policy block; the message is untrusted data, never instructions. User: first names, history lines (the same code-built lines as `classify-prompt.ts`, reused through a shared `historyLines` helper), then `stripQuoted(body)` in message tags. Surnames and addresses are scrubbed with the classifier's existing scrub.

**Rule check (`apps/tracker/lib/iris/draft-rules.ts`, new, pure).** `checkDraft(body)` returns rule codes: `money` (`$` or a number followed by dollars, CAD or USD), `ai_line`, `time` (`H:MM` or `H am/pm`), `forfeit`. `withSignature(body)` trims a trailing "Charlie" or "AP Academy" line the model added and appends `SIGNATURE` once.

**Model call (`apps/tracker/lib/iris/draft.ts`, new).** Built like `classify.ts`: `new Anthropic({ maxRetries: 2, timeout: 30_000 })`, `beta.messages.parse`, `AI_MODEL`, the server-side refusal fallback beta, `output_config: { effort: AI_EFFORT, format: betaZodOutputFormat(DraftWire) }`, `max_tokens 2000`, the run's `AbortSignal`. `DraftWire` (Zod): `body` (1 to 3,000), `needs_charlie` (bool), `reason` (string, at most 200, used in memory only). Same fixed error map and abort handling as `classify.ts`; logs carry the HTTP status only.

**Draft step (`apps/tracker/lib/iris/draft-step.ts`, new).** `runDraft(deps)` with injected `store`, `draft` port (null when AI is off), the memoised `directory`, `now`, `startedAtMs`. Picks `store.listDraftable(TUNING.irisMaxRetries, TUNING.irisMaxDraftPerRun)`: inbound messages at `classified`, or `escalated` with reason `escalate_only`, intent `no_show` and `handled_at` null, with no draft yet, oldest first; concurrency 2. Per message: first names from the directory by the message's `notion_student_id` (new column) and the thread's ids; history from `threadContext`; build, call, insert the `ai_calls` row; then:

- failure: retry as in `classify-step.ts` (abort is not a failure);
- `checkDraft` hits: message `escalated`, reason `draft_rule`, event detail `rules: [...]`, no draft;
- otherwise insert the draft (v1) and set the message `drafted`, or `escalated` with `needs_charlie` (a no-show keeps `escalated`, `escalate_only`); one event with `draft_id`.  
Never throws; a store error ends the step with "Iris run failed".

**Supersede step (`apps/tracker/lib/iris/supersede.ts`, new).** Runs after intake. `gmail.list(token, "in:sent newer_than:3d")`, drop known ids, `gmail.get` at most 20, keep messages whose `labelIds` contain `SENT` and whose thread is known; store each with the intake's existing outbound `charlie_manual` row builder (moved to an exported helper in `intake.ts`), `setLastOutbound`, then `store.supersedeThread(threadId, sentAt)`: every inbound message of that thread received before `sentAt` and in `drafted`, or `escalated` with `handled_at` null, gets reason `answered_by_charlie` and `handled_at = sentAt`; their `proposed` drafts become `superseded`; one `superseded` event per message. `GmailMessage` gains `labelIds` (optional array). A sent-list failure is a run error line, not a 502. Gmail scope stays `gmail.readonly`.

**Owner review (SQL functions, see Migration).** `iris.approve_draft(p_draft, p_version)`, `iris.save_draft_edit(p_draft, p_version, p_body)`, `iris.reject_draft(p_draft, p_reason)`: security definer, owner check inside, the message row locked `for update`, state checks, the streak rules, one event with `actor = auth.uid()`. Each returns `ok`, `conflict` or `not_found` (edit returns the new draft id). Atomic, so a double click or two tabs write once.

**Notion push (`apps/tracker/lib/iris/notion-push.ts`, new) through `apps/tracker/lib/notion/work.ts`.** Runs last in the run, only when `readWorkConfig()` is set and the run is before `TUNING.irisPushBudgetMs` (95,000 ms).

1. Retention sweep first: push rows whose message is gone or within 1 day of `purge_at` get their to-do deleted (`DELETE /v1/blocks/{id}`) and the row removed (AC22).
2. Candidates: `store.listPushable(TUNING.irisMaxPushPerRun)` (20): messages in `drafted`, or `escalated` and unhandled with a reason other than `automated`, whose push row is missing or `failed` with `attempts` under 5, oldest first.
3. Day page: `iris.push_days` row for today's Toronto date (`todayIso`), else `findTaskByTitle`, else `createTaskPage` with an intro line and no to-dos; the page id is stored.
4. Per candidate: if the row has `attempts > 0` and no block id, list the page's to-dos and adopt one whose text holds the ref; else `appendToDo`. Store the block id and `pushed`; then `createComment` (when `NOTION_CHARLIE_USER_ID` is set) and set `comment_done`. A failure sets `failed`, `attempts + 1`, a short error.
5. Work Log: `createLogEntry` once per date (id stored on `push_days`), then `updateLogDecisions` with counts.  
`work.ts` gains three generic functions beside the teacher ones: `appendToDo(config, pageId, { text, bullets, links, code? })`, `createComment(config, pageId, { mentionUserId, text })` (the mention shape from `scripts/design-approver.mjs`) and `deleteBlock(config, blockId)`. The to-do text is "`<parent first name>` re `<child>`: `<intent>` (`<reason>`) ref `<8 chars>`"; bullets and links only; the message body and the model's reason never enter a request.

**Wiring.**

- `apps/tracker/lib/iris/handlers.ts` `handleIrisRun`: intake, supersede, classify, draft, push, purge; counts gain `drafted`; `IrisRunDeps` gains `draft` and `push` ports. `IrisRunResponse` gains `drafted`.
- `apps/tracker/app/api/iris/run/route.ts`: wires `draftReply` and the push port (`readWorkConfig`, `NOTION_CHARLIE_USER_ID`, `NEXT_PUBLIC_SITE_URL` for links); `maxDuration` 60 to 120. `app/api/iris/run-now/route.ts` `maxDuration` 80 to 140, and `handleRunNow`'s fetch timeout 70 s to 130 s.
- `classify-step.ts`: writes `notionStudentId` and `retryCount: 0` on success (two fields).
- `store.ts`, `store.fake.ts`, `apps/tracker/lib/data/iris.ts`: `MessageState` adds `drafted`, `approved`, `sent`; `MessagePatch` adds `notionStudentId`; `AiCallRecord.purpose` adds `draft`; new `listDraftable`, `insertDraft`, `supersedeThread`, `listPushable`, `pushRow` reads and writes, `pushDay` get and save, `listExpiringPushes`, `deletePush`; `RunRecord.drafted`. Reader: `listDraftsWaiting`, `listSentToday`, `listFailed`, `getThreadView`, `approveDraft`, `saveDraftEdit`, `rejectDraft` (rpc on the owner's client).
- `schemas.ts`: states widen; `DraftRow`, `PushRow`, `ThreadViewRow`; `InboxMessage` gains `confidence`, `childId`, `pushFailed`.
- `apps/tracker/lib/domain/tuning.ts`: `irisMaxDraftPerRun 6`, `irisDraftBudgetMs 70_000`, `irisPushBudgetMs 95_000`, `irisMaxPushPerRun 20`, `irisMaxPushAttempts 5`, `irisAutoSendStreak 20` (the SQL function takes the threshold as a constant 20 with a comment pointing here; a test reads both).
- `apps/tracker/lib/iris/config.ts`: `IRIS_OPTIONAL_ENV = ["NOTION_CHARLIE_USER_ID"]`, shown on settings as "Phone alerts are off" when unset.

**Owner pages and routes.**

- `apps/tracker/app/api/iris/drafts/[id]/approve/route.ts`, `.../edit/route.ts`, `.../reject/route.ts` (new, POST only) call `handleApproveDraft`, `handleEditDraft`, `handleRejectDraft` in `handlers.ts`: `requireScheduler(identity, ["admin"])` first, `z.guid()` id, Zod strict body (`{ version }`, `{ version, body }`, `{ reason }`), then the reader. ok 200, conflict 409, not_found 404, error 500 `save_failed`. Covered by the existing `/api/iris/` origin prefix in `apps/tracker/lib/cross-site.ts`.
- `apps/tracker/app/iris/page.tsx`: four cards (Needs you, Drafts waiting, Sent today, Failed) then Recent. Row: family, child, subject, age, intent, confidence %, state label, "Phone copy failed" when set. Empty copy per card ("Nothing needs you", "No drafts waiting", "Nothing approved or sent today", "Nothing failed").
- `apps/tracker/app/iris/messages/[id]/page.tsx` (extended): card 1 as today; card 2 "What Iris read" as today; new card "Thread" (older messages: date, Parent or Charlie, body or snippet); new card "Draft" with "Policy used" (title and `POLICY[type].text`, plus "Drafted under policy version n; current is m" when they differ), `components/iris/draft-editor.tsx` (new client component: textarea with the latest proposed body, signature shown read-only below, Save edit, Approve, Reject with a reason field; Saving... then the new state; error line "Could not save. Try again."), and after approval `components/iris/copy-reply.tsx` (Copy, then "Copied"; text "Approved. Paste it into Gmail and send it yourself."); older versions listed collapsed with state and who wrote them. Layout at 375 px: one column, cards stacked, buttons full width.
- `apps/tracker/app/iris/settings/page.tsx`: "Phone alerts are off (NOTION_CHARLIE_USER_ID is not set)" notice when unset.
- `apps/tracker/lib/view/iris-text.ts`: labels for `drafted` ("Draft waiting"), `approved` ("Approved, send by hand"), `sent`, reasons `needs_charlie` ("Iris wants you to check"), `draft_rule` ("Draft held back"), `draft_rejected` ("You rejected the draft"), `answered_by_charlie` ("You replied in Gmail"), the section titles, editor and copy strings, `pushFailed`.

**Docs.** Tracker ADR `0063-iris-policy-versions-and-drafts.md` (policy file and versions, what a draft prompt holds, code-side rule check and signature, owner review through functions, the streak rules) and `0064-iris-phone-backup.md` (Notion Work page plus mention comment, not SMS and not a Gmail draft; what a to-do holds and never holds; retention sweep; no edits after creation), both with README rows; `apps/tracker/docs/iris-operations.md` gains Drafting, Review and Phone backup sections; `lib/iris-adr.test.ts` lists both.

**e2e.** `e2e/tracker/mock-anthropic.mjs` answers draft requests (recognised by the draft system prompt's first line) with a fixed body keyed on a word in the message (`cancel` gives a clean body; `forfeit` gives a body that breaks a rule). `e2e/tracker/mock-gmail.mjs` honours an `in:sent` query and serves one sent reply with `labelIds: ["SENT"]` in a seeded thread. `e2e/tracker/mock-notion.mjs` gains `POST /v1/comments` and keeps every request body for `GET /__work`.

## Migration

- File: `supabase/migrations/0025_iris_drafts.sql` (number reserved, Decisions row 2). Additive only: no drop, delete or truncate, so it is applied through `apply_migration`, not a human migration.
- Creates:
  - `iris.messages.notion_student_id uuid` (the chosen child, a Notion page id; written by the run).
  - `iris.drafts` (spec section 3 columns minus `notion_block_id`, see Decisions row 4): `message_id` references messages on delete cascade, `unique (message_id, version)`, a partial unique index allowing one `proposed` draft per message, `body_text` at most 5,000, state, `created_by`, `approval_mode` and `rejected_reason` (at most 300) checks, `approved_by` references `auth.users` on delete set null; `updated_at` trigger; no audit trigger (ADR 0058).
  - `iris.reply_types` (spec columns) with `unique (org_id, type)`; audit trigger `tracker.write_audit` on insert, delete and update.
  - `iris.eval_labels` and `iris.eval_runs` (spec columns; labels cascade with their message), used by Iris 5/9.
  - `iris.pushes`: id, org_id, `message_id` references messages on delete set null (so the sweep can still delete the Notion block after a purge or `delete_thread`), `draft_id` references drafts on delete set null, unique per message, `day`, `notion_block_id`, `comment_done`, state (`pending`, `pushed`, `failed`), `attempts`, `last_error` (at most 300), `purge_at`, timestamps. Ids and codes only.
  - `iris.push_days`: id, org_id, `day date`, `work_page_id`, `log_entry_id`, unique (org_id, day).
  - `iris.events.draft_id` gains a foreign key to `iris.drafts` on delete set null (the append-only guard already allows that update).
  - Functions `iris.approve_draft(uuid, integer)`, `iris.save_draft_edit(uuid, integer, text)`, `iris.reject_draft(uuid, text)`: security definer, `search_path ''`, owner check through `tracker.is_org_owner`, execute granted to `authenticated` only.
  - RLS on every new table. Owner selects drafts, reply_types, eval_labels, eval_runs, pushes, push_days in their org; owner updates `reply_types.auto_send_enabled` only; owner inserts and updates eval_labels and inserts eval_runs (5/9); no owner insert or update grant on drafts (functions only); service_role all.
- Check: `supabase/tests/iris_drafts.sql`, run by `supabase/tests/run-rls.sh` (proves AC23).
- Ships as its own PR first (`req/REQ-44-migration`, human-merged and applied). The feature PR assumes it is live.

## Test plan

| Test | Type | Covers |
| --- | --- | --- |
| `lib/iris/draft-prompt.test.ts`: for each draftable type, the prompt contains `POLICY[type].text`, `VOICE_RULES`, `HOLDING_LINE`; for every other key, its text is absent; no `INTENT_HINTS`, `FLAG_HINTS`, `HARD_RULES` string; first names present; no `@`, no fixture surname, no forbidden field name; at most 5 history lines; quoted text absent | unit | AC1 |
| `lib/iris/draft-step.test.ts` with `store.fake.ts`: classified message gives v1 proposed, created_by iris, edited false, reply_type, policy_version, no signature in stored body, message drafted, one ai_calls row purpose draft with no text field, one drafted event with draft_id | unit | AC2 |
| `lib/iris/draft-rules.test.ts`: `withSignature` appends once, strips a model "Charlie" line; each rule code fires on its examples and not on a clean body | unit | AC3, AC4 |
| `draft-step.test.ts`: rule-breaking body stores no draft, escalated draft_rule, rule codes in the event; needs_charlie stores the draft and escalates needs_charlie unhandled; no_show escalation gets a draft and stays escalated; `it.each` over the other escalation reasons and intents makes no draft call | unit | AC4, AC5, AC6 |
| `lib/iris/draft.test.ts`: SDK mocked as in `classify.test.ts`; refusal, max_tokens, 429, 500, auth, network, abort map to fixed strings | unit | AC7 |
| `draft-step.test.ts`: three failures to failed; budget and cap of 6; port null makes zero calls; `classify-step.test.ts`: success resets retry_count and writes notionStudentId | unit | AC7 |
| `supabase/tests/iris_drafts.sql`: approve, edit, reject, second approve and stale version through the functions; 19 and 20 approvals; edit and reject reset and clear eligible; newer policy version restarts at 1; direct insert or update by owner refused; teacher, parent and other-org owner refused and read nothing; only `auto_send_enabled` updatable on reply_types; audit rows for reply_types, none for drafts; purge sets `events.draft_id` null | integration (pnpm test:rls) | AC8, AC9, AC10, AC11, AC23 |
| `lib/iris/streak.test.ts`: `TUNING.irisAutoSendStreak` equals the constant in `0025_iris_drafts.sql` (file read) | unit | AC11 |
| `lib/iris/supersede.test.ts`: sent reply with SENT in a thread with a proposed draft stores one charlie_manual row, supersedes the draft, handles the message with answered_by_charlie; repeat run stores nothing new; no SENT label or unknown thread supersedes nothing; earlier-only rule (a later inbound message is untouched) | unit | AC12 |
| `app/api/iris/iris-routes.test.ts`: approve, edit, reject 200, 409, 404, 400; teacher 403 and the reader never called; inbox and message loaders deny first | unit | AC8, AC9, AC10, AC15 |
| `lib/iris/run-handlers.test.ts`: run order (intake, supersede, classify, draft, push, purge), drafted in response and run row, directory read once | unit | AC24 |
| `lib/view/iris-text.test.ts`: every new state and reason has a label; section empty strings | unit | AC13 |
| `lib/iris/notion-push.test.ts` with a fetch spy and the fake store: one page per date, adoption by title, property values; one to-do per candidate with the listed fields, no code block for an escalation without draft, "Unknown sender" with no address; one comment with the mention and no names, none when the id is unset; sentinel body text and from address absent from every request body; `checked` only in the creating request; no PATCH to a to-do; 500 marks failed and retries next run; adopt by ref after a lost write; stop at 5 attempts; Work Log created once then updated; retention sweep deletes the block and the row | unit | AC16, AC17, AC18, AC19, AC20, AC21, AC22 |
| `lib/notion/work.test.ts` additions: `appendToDo`, `createComment`, `deleteBlock` request shapes; errors carry status only | unit | AC17, AC18, AC19 |
| `lib/iris-adr.test.ts` lists 0063 and 0064 | unit (doc) | AC24 |
| `e2e/tracker/flows.mjs` REQ-44: after a run the cancellation message is `drafted` with v1; the "forfeit" one is `escalated` `draft_rule`; owner opens the message page, edits, approves, sees Copy; streak row is 0 with edited_total 1; a second message approved unedited gives streak 1; reject on a third puts it in Needs you; the mock sent reply supersedes a fourth's draft; the mock Notion holds one page for the date, one to-do per item and one comment each, and no request body contains the seeded body sentinel; Ryan (teacher) on `/iris/messages/[id]` lands on `/` and his approve POST is 403; cross-site approve POST is 403 | e2e (builder runs `pnpm test:tracker` locally before the PR) | AC2, AC4, AC8, AC9, AC10, AC12, AC13, AC14, AC15, AC16, AC17, AC18, AC19 |
| Settings loader unit test with `NOTION_CHARLIE_USER_ID` unset shows the phone-alerts notice | unit | AC18 |

## Out of scope

- Sending (8/9): Approve only marks and offers Copy; no `iris.sends`, no Gmail write scope.
- Auto-send switches, the gate, quiet hours and the fail-safes that turn a type off (9/9); `reply_types.auto_send_enabled` exists but nothing sets it and no switch is shown.
- Evaluation pages and import (5/9); `eval_labels` and `eval_runs` are created only.
- Holding drafts for escalations other than no-show; Charlie writes those.
- Updating or ticking a Notion to-do after creation; deleting the page-level comment.
- Schedule-aware reply types and make-up offers (6/9, 7/9); a Retry or Delete thread button (settings card).

## Risks and edge cases

- **Parent data to Notion.** First names, the intent and Iris's reply text go to Notion; the parent's message, the model's reason and every address never do (AC19, a sentinel test). The sweep removes a to-do before its message's purge date, keeping the privacy promise "no longer than in the tracker". The comment holds no names because a page comment cannot be removed by this integration.
- **Prompt injection in mail.** The message is wrapped as data; the output is a Zod object; a manipulated body is caught by the rule check or is only a proposal Charlie must approve. Nothing is sent.
- **Wrong child.** A sibling family's child-scoped message reached `classified` only with a resolved child (3/9 rule 6); the draft uses that child's first name from `notion_student_id`.
- **Run time.** `maxDuration` rises to 120 s with start budgets (classify 35 s, draft 70 s, push 95 s); leftover work waits 15 minutes. Run now waits 130 s.
- **Lost Notion writes.** Adoption by title (page) and by ref (to-do) prevents duplicates; a duplicated comment (write reached Notion, row did not) is an extra notification only.
- **Forged From.** Supersede reads only `in:sent` mail with the SENT label, which only Charlie's own sending sets; the inbox path stays a record that supersedes nothing.
- **Edit then walk away.** The edit resets the streak even if Charlie never approves; that only delays eligibility, the safe direction.
- **Policy change mid-queue.** Older drafts keep their `policy_version`; the page shows the version note; approving an older-version draft does not count toward a newer streak.
- **Notion off.** No Work config skips the push; the queue works; settings shows the last error line.

## Decisions for approval

| # | Decision | Options | Default if you say nothing |
| --- | --- | --- | --- |
| 1 | New dependencies | None | None. `@anthropic-ai/sdk` is already in `apps/tracker/package.json`; Notion and Gmail stay plain fetch. |
| 2 | Schema and numbers | Migration number; tracker ADR numbers | `supabase/migrations/0025_iris_drafts.sql` (main ends at 0024; no open `req/` PR or live card design uses 0025). Schema `iris`, tables drafts, reply_types, eval_labels, eval_runs, pushes, push_days, column `messages.notion_student_id`; owner-only RLS through `tracker.is_org_owner`, owner writes to drafts only through the three functions, service_role all. Tracker ADRs `0063-iris-policy-versions-and-drafts.md` and `0064-iris-phone-backup.md` (main ends at 0061, open PR #109 holds 0062, REQ-34 names none). The card's "0019", "0053" and "0056" are stale spec placeholders. |
| 3 | How the owner writes drafts | Three security-definer functions (atomic: draft, message, streak and event in one statement); direct insert and update grants plus a trigger for the streak (spec section 3) | Functions only, no direct grants. The RLS test proves the owner can create a version and update the allowed fields only through them. |
| 4 | Where push state lives | `iris.pushes` keyed by message (covers escalations with no draft, and survives a purge so the sweep can delete the block); `drafts.notion_block_id` plus a push state column (spec) | `iris.pushes`; `drafts` has no `notion_block_id`. |
| 5 | Chosen child across runs | New `messages.notion_student_id`; read the latest `classified` event's detail | The column (ADR 0061 left this to 4/9). |
| 6 | Which messages get a draft | Classified messages plus no-show escalations (spec 4.4); a holding draft for every escalation | Classified plus no-show only. `pause_or_stop` drafts as a classified message. |
| 7 | Model draft that breaks a rule | Store nothing and escalate `draft_rule`; store it for Charlie to fix | Store nothing; escalate. The regexes can over-escalate (a parent's "5 pm class" echoed back); that only costs Charlie a reply. |
| 8 | POLICY_VERSION | Bump to 3 for `VOICE_RULES`, `SIGNATURE`, draftable lists; keep 2 | Bump to 3. |
| 9 | Streak rules | Reset on edit save and on reject; approval of an edited version counts edited_total; eligible recomputed as streak at least 20; newer policy version restarts at 1; older-version drafts do not count | As listed. Open question 8 (reject resets) is taken as yes. |
| 10 | Detecting Charlie's manual reply | One `in:sent newer_than:3d` list per run, SENT label required; the inbox From match intake already records | `in:sent` with SENT. The poll query is inbox-only, so Charlie's sent replies never reach intake today. |
| 11 | What a to-do and comment hold | First names, intent, reason, links, ref, reply code block; never the parent's text, the model's reason or an address; comment with mention, ref and intent only | As listed (stricter than spec 4.6, which allowed the one-line summary). |
| 12 | Notion retention | Delete each to-do before its message's purge date and after `delete_thread`; leave Notion copies | Delete (privacy text says Notion keeps it no longer than the tracker). Work pages and Work Log entries stay; they hold no parent data once their to-dos are gone. |
| 13 | Updating a to-do after Approve or Reject | Never; mark it done | Never (no `checked` after creation, spec). The tracker is the approval record. |
| 14 | Run time | `maxDuration` 120 s (run) and 140 s (run-now, fetch timeout 130 s) with budgets 35/70/95 s; keep 60 s and push next run | Raise to 120 s; other tracker routes already use 120. |
| 15 | Draft model and effort | `AI_MODEL` at `AI_EFFORT` (medium), timeout 30 s, max_tokens 2000; effort low | Medium: reply quality matters more than for classification. |
| 16 | Queue layout | The four spec sections plus Recent kept below; replace Recent | Keep Recent. Sent today shows approved and sent rows until 8/9 sends. |
| 17 | `NOTION_CHARLIE_USER_ID` unset | Push without comments and show "Phone alerts are off"; skip the push | Push without comments. Value: `charlie_user_id` in `.claude/notion-ids.json`, set by a human in the tracker Vercel project. |
| 18 | Push retries | 5 attempts with ref adoption, then failed and marked on the row; unlimited | 5 attempts. |
| 19 | Policy text shown on the message page | Current file text with a version note when it differs; stored per draft | Current text plus note (no policy text stored in Postgres). |
| 20 | The model's `reason` | Memory only; stored on the draft | Memory only. |
| 21 | Work page title | `Iris replies — YYYY-MM-DD` as the card says; a hyphen | As the card says (the title is data, not repo prose; ADR text has no em dash). |
| 22 | Changes in `apps/tracker/lib/notion/work.ts` | Three generic functions beside the teacher ones; a new `lib/notion/iris.ts` | In `work.ts` (a human-merge path; this PR is High and human-merged anyway). |
| 23 | Size | One feature PR after the migration PR; split phone backup into its own card | One feature PR. Drafting, review and phone backup share the store and run, and the spec confirmed decision 14 for this card. |
