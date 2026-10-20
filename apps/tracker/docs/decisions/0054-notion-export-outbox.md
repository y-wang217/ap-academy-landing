# 0054: Notion exports go through an outbox in Postgres
Status: accepted
Date: 2026-10-19

## Context
A class save and its Notion exports (the student's Weekly Schedule, today's teacher-texts task) were separate steps in one request (REQ-35, readiness review finding F04). If the function died, timed out or Notion failed between them, the export was stale and nothing recorded that it was owed: only `schedule_summaries.sync_state` remembered a summary failure, and only when the code got that far. Notion can also apply a call and still report an error, so a blind retry of an append can duplicate a to-do.

## Decision
- **Enqueue in the database, in the write's transaction.** Migration 0021 adds `tracker.notion_outbox`. An `after` row trigger on `class_series`, `class_exceptions` and `schedule_summaries` (insert) writes one `summary` row per affected adopted student and one `daily_task` row for the org. A trigger is the one place that is always inside the save's transaction, whichever path wrote the row (`schedule_write`, `split_class_series`, `adopt_student_schedule`, seeds), with no change to any write call. A failed or empty statement fires nothing.
- **No stored payload.** A row says "this target is owed a refresh". Delivery renders from current state (the summary needs Staff names from Notion, which the database does not have), so later edits always win and an older delivery cannot land stale text. `payload_hash` records what each delivery rendered.
- **One pending row per target.** A partial unique index; a second change while one is pending bumps its `version`. A claim never takes a key that has a live running row.
- **Idempotency.** A summary delivery reads the Notion text first and writes nothing when it already matches, so a retry after a write that landed is harmless. A daily-task `append` or `createLog` that fails with a network error, timeout or 5xx is `uncertain`: never repeated automatically, shown to Charlie with a Retry. A running daily-task row whose lease expired is also `uncertain`.
- **Backoff and rate.** 30 s doubling to 1 h, or Notion's longer `Retry-After`; `failed` after 8 attempts or on a 400, 401, 403, 404 or render error. A drain sends one row at a time, 350 ms apart, at most 10 rows or 20 s, and stops at the first 429.
- **Three workers, no new infrastructure.** The save drains the rows its own write enqueued before it answers (`findPending`). `realDeps().identity` (`lib/scheduler/deps.ts`) wraps the resolver with `withBackgroundDrain`, so the first admin identity in a request schedules one drain of the org with `after()`; every scheduler route but `daily-task/run` resolves identity there, so this is the one hook point. The hourly `daily-task/run` drains on every authorised call, before the time check, with the service client and its org.
- **Visible until answered.** Rows are never deleted. A `failed` or `uncertain` row stays on the week editor's "Notion exports" strip until a Retry or a later successful delivery for the same target marks it `superseded`. A pending row waiting more than 10 minutes is shown as stale with "Retry now".
- **Columns stay.** `schedule_summaries.sync_state`, `last_error`, `last_written_text` and `last_drift_text` are still written, now only by outbox delivery, so the Schedules page keeps reading them.

## Alternatives considered
- A queue service: ruled out by the stack rule in `CLAUDE.md` (no queues) and not needed at this volume.
- Moving every save into one RPC that also writes the outbox row: every write path, REQ-30's included, would have to remember to enqueue.
- Storing the rendered text at enqueue: needs Notion data inside the transaction, and an older payload could overwrite a newer edit.
- Repeating an uncertain daily-task append after reading the page: the to-dos carry no stable key to match on, so a read cannot prove the append did not land.

## Consequences
- A save answers `summarySync` and `dailyTask` with the new value `queued` when a delivery did not finish, plus `exports` (the row ids), and the notice says so. Without the database (unit tests), the handlers still call Notion directly.
- A single-occurrence move or cancel now also delivers the student's summary. It writes to Notion only when the weekly text changed, which it does not, so this costs one Notion read.
- With no owner traffic, owed rows wait for the hourly run, about an hour at worst; the strip shows that as "Waiting".
- Old `done` rows are never pruned yet. A later card can add pruning if the table grows, or drop the `schedule_summaries` sync columns once nothing reads them.
- The setup page row (REQ-35 AC13) is not built: REQ-33's setup page is not on `main` yet.
