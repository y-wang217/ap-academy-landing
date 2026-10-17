# 0050: Class writes are revalidated under a lock
Status: accepted
Date: 2026-10-16

## Context
ADR 0038 checks clashes and availability in TypeScript, then writes through separate calls, and accepted that two saves in the same instant could both pass because only Charlie booked. Iris and teachers will book too (readiness review finding F08, REQ-30). Occurrences are computed, not stored, so an exclusion constraint is impossible.

## Decision
- **One locked write.** Every class write (create, move, cancel, one-off edit, series edit by split, end series) goes through `tracker.schedule_write` (migration 0018). The store has no other class write: `createSeries`, `upsertException`, `split`, `endSeries`, `updateSeriesFields` and `getSeriesByRequest` are gone.
- **Compare-and-swap on booking stamps.** `tracker.booking_stamps` holds one version per teacher and per student, bumped by a trigger on `class_series`, `class_exceptions`, `availability_windows` and `availability_exceptions`. The handler reads the stamps of the people the write touches (`schedule_write_context`), runs the unchanged TypeScript check, and passes the stamps to the write. Under a per-teacher and per-student advisory lock (`pg_advisory_xact_lock`, keys in sorted order, `lock_timeout` 5s), the write refuses with `booking_changed` if any stamp moved. If the inputs are unchanged, the check's answer is unchanged, so there is no second copy of the recurrence engine in SQL. The trigger takes the same lock, so an availability edit or the import waits for an in-flight write.
- **One retry.** On `booking_changed` the handler re-reads the context and runs the whole check once more: a real clash is the existing `422 booking_conflict`; a second refusal is `409 stale`. A lock timeout or deadlock is `503 { "error": "scheduler_unavailable" }`.
- **Idempotency.** `tracker.schedule_writes` logs one row per request ID, claimed before the write under the lock. A retry, or a duplicate in flight (it waits on the unique index), returns the first result with `200`. A request ID reused for another operation or series is `400 invalid_request`. This replaces the `getSeriesByRequest` pre-checks.
- **One-off edits are one transaction**: the exception and the series fields change together or not at all.
- **Stale checks repeat under the lock**: the series `updated_at` and, for move and cancel, the occurrence's position.
- **Who.** Both functions are security invoker and refuse anyone but the org owner, as the class tables already do. No one gains a write path.
- The class write routes are wrapped in `withServerTiming` (ADR 0044).

## Consequences
- Supersedes the 0038 bullets "One-off edits are two writes" and "Check then write is not atomic". The rest of 0038 stands.
- Move and cancel make one more storage call (the context read); create, split and end series make the same number as before.
- A teacher editing availability while a booking is checked makes that booking retry once.
- The Weekly Schedule import bumps stamps but is not itself revalidated. Old `schedule_writes` rows are never purged yet.
