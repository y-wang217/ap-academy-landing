# REQ-28: Calendar saves report every downstream result

Card: https://app.notion.com/p/3fbd6ae73dd78128a3d7e470752a4a40 (approved by design-approver, sha 200b5ab03e31).

**Summary:** After any calendar book, edit, move, cancel or delete, Charlie's week editor shows "Saved." plus the real result of the Weekly Schedule write and today's Notion task, in the import screen's words, with a Retry next to whichever one failed, instead of a plain "Saved." that hides a failed summary.

**Risk:** Low (UI change over existing admin-only endpoints; no new route, no new Notion write path, no schema, no permission change; the one server edit lets the existing admin-only sync endpoint accept the client's ignored request ID).

## Which action returns what

- Book (`POST /classes`): `summarySync` and `dailyTask`.
- Edit or drag-move, "This class and future" (`PATCH`, `scope: "future"`, a split): `summarySync` and `dailyTask`.
- Edit or drag-move, "This class only": `dailyTask` only.
- Cancel, "This class only": `dailyTask` only.
- Delete, i.e. "Cancel class" with "This class and future" on a weekly class (`DELETE`, `scope: "future"`, ends the series): `summarySync` and `dailyTask`.
- An idempotent replay: neither.

## Acceptance criteria

- AC1: A pure `saveNotice()` maps each of the 20 combinations of `summarySync` (synced, failed, skipped, absent) and `dailyTask` (updated, unchanged, skipped, failed, absent) to a fixed tone and fixed lines. The lines are exactly `["Saved."]` with tone `ok` only when `summarySync` is absent and `dailyTask` is absent, unchanged or skipped.
- AC2: When `summarySync` is failed or skipped, or `dailyTask` is failed, the tone is `warn` and a line names that specific result. The tone is `ok` only when nothing failed or was skipped. A save response whose body cannot be read gives `warn` with "Saved. The Notion results could not be read." and no Retry.
- AC3: Every write path feeds the same builder: book, edit and cancel (both scopes) through `ClassForm`, and drag-move (both scopes) through `WeekEditor.save`. A successful drag-move now shows a notice.
- AC4: When `summarySync` is failed, the Weekly Schedule line has a Retry button (accessible name "Retry Weekly Schedule") that POSTs `/summaries/sync` with `{ studentId }` and no class request. `synced` turns it into the Synced line; failed, 404 or no network keeps Failed and adds "Retry did not work."
- AC5: When `dailyTask` is failed, the daily line has a Retry button (accessible name "Retry today's task") that POSTs `/daily-task` with `{ date: today }`. `created`/`updated` give "Today's Notion task updated."; `unchanged`/`skipped` remove the line; `busy`, `failed` or non-ok keep it and add "Retry did not work."
- AC6: After a week-editor daily retry, `DailyTaskStatus` above the calendar shows the new state (`key={daily.state}`).
- AC7: `POST /api/scheduler/summaries/sync` accepts an optional `requestId` (guid, ignored), still answers 400 to any other extra field, still admin only.
- AC8: No new Notion write path and no new route; `payout-guardrails.test.ts` passes unchanged.
- AC9: In the browser, with the mock Notion failing Weekly Schedule writes, booking shows the warn notice with Failed and Retry; after recovery, Retry shows Synced, the Retry is gone, and the retry sent no request to `/api/scheduler/classes`.

## Approach

- New `apps/tracker/lib/view/save-notice.ts`: `SaveOutcome`, `readSaveOutcome`, `saveNotice`, `afterSummaryRetry`, `afterDailyRetry`.
- `components/scheduler/class-form.tsx`: `onSaved(outcome: SaveOutcome)`.
- `components/scheduler/week-editor.tsx`: renders the outcome lines with per-line Retry; drag-move always sets the notice on success.
- `lib/scheduler/import-handlers.ts`: `SyncBody` accepts an optional ignored `requestId`.
- `app/schedule/page.tsx`: `key={daily.state}` on `DailyTaskStatus`.

Copy: summary lines use the import screen's words ("Synced", "Failed. The Notion save failed.", "Retry") prefixed with "Weekly Schedule for {name}:"; daily wording from `daily-task-status.tsx`. Each Retry has an `aria-label` so two of them are distinguishable.

## Test plan

- `lib/view/save-notice.test.ts`: 20-combination table, `readSaveOutcome`, `afterSummaryRetry`, `afterDailyRetry`.
- `app/api/scheduler/import-routes.test.ts`: sync with `requestId` 200, extra field 400, teacher 403.
- `e2e/tracker/mock-notion.mjs` `POST /__schedule/fail` toggle; `e2e/tracker/flows.mjs`: failed summary then Retry (no class request), delete via cancel "This class and future", drag-move with a rewritten `dailyTask: "failed"` then Retry.

## Out of scope

Durable retry or an outbox (Feedback 7). What the summary contains. The import screen. One button that retries both. Any change to the class write handlers or their response shape.
