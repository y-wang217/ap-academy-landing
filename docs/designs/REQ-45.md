# REQ-45: Iris 5/9: Evaluation harness on real past replies

Copied from the approved design on the Notion card
(https://app.notion.com/p/3fbd6ae73dd7813fb7b6f29252ae015a) so the reviewer can read it next to the diff.

**Renumbered (REQ-51):** the card's design names migration `0028_iris_eval_results.sql` and tracker ADR
`0069-iris-evaluation-harness.md`. REQ-48's design (Building) names migration `0028_iris_sends.sql` and ADR
`0069-iris-send-at-most-once.md`, so this card uses the first numbers nothing uses: migration
`0027_iris_eval_results.sql` (PR #121) and ADR `0074-iris-evaluation-harness.md`. Every 0028 or 0069 below
reads as 0027 or 0074.

**Summary:** Charlie can import a year of family mail (with his own replies) into Iris, label each message on a
new owner-only page `/tracker/iris/eval`, have Iris classify and draft the labelled set in the background, rate
those drafts, and record one aggregate eval run. The settings page then shows, per reply type, which auto-send
gate conditions it meets. A pure `evaluateGate` function encodes the gate. Nothing is turned on and nothing is sent.

**Risk:** Medium. Owner-only routes and one new table behind the existing `iris` owner-only RLS pattern. More
parent messages are stored in the same schema under the same 90-day retention and go to the same model provider
Iris 3/9 already uses. No new destination, no permission or auth change, no sends.

## Problem

Spec section 6 (decisions 15, 21): no reply type may be switched to auto-send (Iris 9/9) on the live streak
alone. Charlie needs a measurement on his own past replies first: a corpus of real family messages paired with
what he answered, his gold labels, Iris's classification and drafts over that set at the current `POLICY_VERSION`
and model, stored aggregates, and a gate that says, per type, which conditions hold. Today Iris only reads the
last 3 days of the inbox. `iris.eval_labels` and `iris.eval_runs` exist (migration 0025) but nothing fills them.

## Acceptance criteria

- [ ] AC1: **Import scope.** An import reads only mail older than `TUNING.irisPollWindowDays` (3) and newer than
  `TUNING.irisHistoryDays` (365): inbound `newer_than:365d older_than:3d from:(<addresses>)` with the directory's
  Parent Emails in chunks of 15, and `in:sent newer_than:365d older_than:3d to:(<addresses>)`. An inbound message
  whose From does not exactly match a directory entry is skipped entirely (no thread, message, event detail or
  snippet row). Automated mail is skipped the same way.
- [ ] AC2: **Imported inbound row.** `direction inbound`, `source external`, `state escalated`,
  `escalation_reason history_import`, `handled_at` the import time, `policy_version` null, body capped at 20,000,
  `purge_at` = import time + `settings.retention_days`. Charlie's reply is a `charlie_manual` outbound row with
  the same `purge_at` rule, stored only when its thread already has an imported or live inbound message.
- [ ] AC3: **Live path untouched.** After an import, the next poll run classifies, drafts, supersedes and pushes
  only live messages; `/tracker/iris` lists no imported message in any section; the import makes zero Notion
  requests and inserts zero `iris.drafts` rows.
- [ ] AC4: **Idempotent import.** Importing twice stores each Gmail message once; at most
  `TUNING.irisMaxImportPerRun` (50) `messages.get` calls per run; one `eval_import_finished` event (counts only)
  when nothing storable remains; `capped: true` when a list hit the 500-id cap.
- [ ] AC5: **Labels.** One row per imported inbound message (date, family, subject, message, Charlie's first
  later reply or "No reply found"); gold intent, gold reply type (or none), gold escalate, optional note; labels
  reload unchanged; escalate yes with a reply type is 400; saving twice updates the one row.
- [ ] AC6: **Eval run.** "Run evaluation" records `eval_run_requested` stamped with `POLICY_VERSION` and
  `AI_MODEL`. Later runs classify every fully labelled message, at most `TUNING.irisMaxEvalPerRun` (4) per run,
  with the live prompts, route with `routeClassification`, draft a classified draftable intent and check it with
  `checkDraft` (a broken rule is escalated with no body), and write one `iris.eval_results` row each. Every model
  call is an `ai_calls` row with purpose `eval`, tokens and policy version, no text. `eval_run_finished` when none
  remain. A stale policy or model finishes with `reason: stale` and no model call. A second request while one is
  pending is 409.
- [ ] AC7: **Rating.** Each message with an eval draft from the latest finished request shows the draft (with the
  signature) and a 1 to 5 rating. Saving sets `draft_rating` and `rated_result_id`. A rating for another request's,
  message's or org's result is 400.
- [ ] AC8: **Record results.** Computes with `scoreEval` and inserts one `eval_runs` row (`policy_version`,
  `model`, `labelled_count`, `per_type`, `sensitive_recall`, `mean_rating_per_type` from that request's ratings
  only). 409 while unfinished or with any `outcome error`. The page shows the latest run's per-type table and a
  confusion table while results exist, else "Details purged; aggregates kept".
- [ ] AC9: **Scoring rules** (precision, recall, count, sensitive recall, with the null cases) pinned by a
  table-driven test.
- [ ] AC10: **The gate.** `evaluateGate` is pure, returns `{ pass, failing }` over `never_auto_send`, `no_run`,
  `stale_run`, `labelled_count`, `precision`, `sensitive_recall`, `mean_rating`, `streak`; names every failing
  condition; passes at exactly 20, 0.95, 1.0, 4 and a streak of 20; one step below fails with that condition alone.
- [ ] AC11: **Settings page.** An "Auto-send readiness" card lists the six candidate types with each condition met
  or not, the latest run's date, and one "Never sent automatically" line. No switch or toggle.
- [ ] AC12: **Purge.** `iris.purge_expired` removes an expired imported message, its label and its results;
  every `eval_runs` row and event remains.
- [ ] AC13: **Access.** Teacher, student, parent, signed-out user: redirect from the page, 403 from every new
  route, nothing read. Another org's owner reads none of this org's eval data. No authenticated write to
  `iris.eval_results`. A cross-site POST is 403.
- [ ] AC14: **Paused.** While paused, import and eval make no Gmail or Claude call; the page says "Iris is paused:
  import and evaluation wait until it runs".
- [ ] AC15: Tracker ADR (now 0074) exists with every section, is indexed and has no em dash.

## Approach

- Requests are owner `iris.events` rows (`eval_import_requested`, `eval_run_requested`); the run writes
  `eval_import_batch`, `eval_import_finished`, `eval_run_finished`. A request is pending until a finished event
  names its id; only the newest of each kind is acted on.
- `handleIrisRun` order: intake, supersede, classify, draft, push, **history import**, **eval**, purge, each new
  step only after a good intake and under its budget. `IrisRunDeps` gains `evalClassify` and `evalDraft`.
- New `lib/iris/history-import.ts` (`runHistoryImport`), `lib/iris/eval-step.ts` (`runEval`),
  `lib/iris/eval-score.ts` (`scoreEval`), `lib/iris/gate.ts` (`evaluateGate`, `AUTO_SEND_CANDIDATES`).
- `lib/iris/gmail.ts`: `listMessageRefs` keeps `threadId` from the same `messages.list` call; `GmailPort` gains
  `listRefs`. Scope and endpoints unchanged.
- `intake.ts`: `historyInboundRow`; `charlieManualRow` takes an optional `purgeAt`.
- `classify-step.ts` and `draft-step.ts`: the prompt preparation moves into exported `prepareClassifyPrompt` and
  `prepareDraftPrompt`, called by the live steps unchanged and by the eval step.
- Store (`store.ts`, `store.fake.ts`, `lib/data/iris.ts`): `pendingRequest`, `requestBatches`, `storedThreadIds`,
  `listEvalPending`, `insertEvalResult`; Recent excludes `history_import`.
- Owner side: `listEvalItems`, `evalStatus`, `saveLabel`, `saveRating`, `requestEval`, `recordRun` on the owner's
  client; `lib/iris/eval-handlers.ts`; routes `POST /api/iris/eval/import`, `POST /api/iris/eval/run`,
  `PUT /api/iris/eval/labels/[messageId]`, `PUT /api/iris/eval/labels/[messageId]/rating`,
  `POST /api/iris/eval/record`.
- Tuning: `irisHistoryDays` 365, `irisMaxImportPerRun` 50, `irisImportBudgetMs` 100,000, `irisMaxEvalPerRun` 4,
  `irisEvalBudgetMs` 105,000, `irisGateMinLabelled` 20, `irisGateMinPrecision` 0.95,
  `irisGateMinSensitiveRecall` 1, `irisGateMinMeanRating` 4.
- UI: `app/iris/eval/page.tsx`, `components/iris/eval-actions.tsx`, `components/iris/eval-label-form.tsx`, copy in
  `lib/view/iris-text.ts`; an "Evaluation" link on the settings page and the inbox; the readiness card on settings.

## Migration

`supabase/migrations/0027_iris_eval_results.sql` (was 0028), additive: `iris.eval_results` (owner select via
`tracker.is_org_owner`, service role writes, no owner write, not audited) and
`iris.eval_labels.rated_result_id` with owner column grants. Check: `supabase/tests/iris_eval.sql`. Ships first as
`req/REQ-45-migration`.

## Test plan

`history-import.test.ts`, `eval-step.test.ts`, `eval-score.test.ts`, `gate.test.ts`, `run-handlers.test.ts`
additions, `classify-step.test.ts` and `draft-step.test.ts` unchanged, `gmail.test.ts` addition,
`app/api/iris/eval-routes.test.ts`, `lib/data/iris.test.ts`, `lib/view/iris-text.test.ts` additions,
`lib/iris-adr.test.ts` addition, `supabase/tests/iris_eval.sql`, and the REQ-45 steps in `e2e/tracker/flows.mjs`
with `mock-gmail.mjs` honouring `older_than`, `newer_than`, `from:` and `to:`.

## Decisions (defaults taken)

No new dependency; a migration (needed to tie ratings to drafts); import and eval inside the poll run;
`history_import` reason code rather than a new column; retention from import time; wait while paused; replies only
in threads with a stored inbound message; escalate yes needs reply type none; mean rating by predicted type;
error results block recording; null sensitive recall fails the gate; 50 gets and 4 evals per run; owner clicks
Record results; `listMessageRefs` with no new endpoint; shared prompt builders; six candidate types; one card.

## Builder notes

- `request_event_id` has no foreign key to `iris.events`: a key there changes how the events append-only guard
  refuses a truncate (0A000 instead of 42501) and breaks `supabase/tests/iris_core.sql`. The run writes the column
  after reading the event.
- A history Gmail id that answers 404 is skipped (gone from the mailbox) so an import can still finish; any other
  get failure is retried on the next run.
- A recorded run takes its policy version and model from the request's stamp, not the response model, so a
  server-side fallback model never makes the run look stale.
- The owner's insert grant on `eval_labels` has no `labelled_at`, so `saveLabel` updates first and inserts only
  when no row exists; one row per message either way.
- Gold reply types are every reply type but `no_reply_needed` (which is "None").
