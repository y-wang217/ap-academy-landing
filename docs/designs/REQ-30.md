# REQ-30: Two conflicting bookings cannot both succeed

Card: https://app.notion.com/p/3fbd6ae73dd781fda515e72d507adc6e (approved by the design approver, sha:c69e4e0ed14c)

**Summary:** Every class write (book, move, cancel, one-off edit, series edit by split, end series) goes through one locked database function that refuses to write if anything the booking check read has changed since, so two clashing saves can never both land, and a retried or doubled request returns its first result.
**Risk:** Medium (new tables and a new RPC behind the existing owner-only class-write RLS; no one gains a write path, no row is rewritten, no new data destination).

## Problem
Tracker ADR 0038 checks clashes and availability in TypeScript (`validateBooking` in `apps/tracker/lib/scheduler/schedule-handlers.ts`) and then writes through separate PostgREST calls (`apps/tracker/lib/data/schedule.ts`). Nothing holds a lock between the check and the write, so two saves in the same instant can both pass. Today only Charlie books; Iris and teachers will book soon.

## Acceptance criteria
- [ ] AC1: Two transactions that book the same teacher at overlapping times, each having read the same booking stamps, cannot both commit: the second blocks on the teacher lock until the first commits, then fails with `booking_changed` and writes nothing.
- [ ] AC2: The same holds for a move into a slot another transaction is booking, and for a split (series edit) while another transaction edits the same series or books the same teacher.
- [ ] AC3: A teacher or student availability or class change that commits between the handler's context read and its write (any write to `class_series`, `class_exceptions`, `availability_windows`, `availability_exceptions` for that teacher or student) makes the locked write fail with `booking_changed`.
- [ ] AC4: On `booking_changed` the handler re-reads the write context (stamps and replay), returns the earlier result with `200` if the request id is now recorded, else re-runs the full booking check once and writes only if it passes. A real clash then returns the existing `422 booking_conflict`. If the second write also fails with `booking_changed`, the response is `409 { "error": "stale" }`.
- [ ] AC5: The store interface has no class-write method other than the locked write (`createSeries`, `upsertException`, `split`, `endSeries`, `updateSeriesFields` and `getSeriesByRequest` are removed).
- [ ] AC6: In each class-write handler the write context is read before any data the booking check uses, apart from the single `getSeries` that names the keys, and its stamps are passed unchanged to the locked write.
- [ ] AC7: A stale move or cancel is the existing `409 stale` and writes nothing. `schedule_write` repeats the series version and position checks under the lock.
- [ ] AC8a: A retried create, move, one-off edit, series edit (split), cancel or end series with the same `requestId`, sent after the first one finished, returns `200` with the first result and writes nothing new.
- [ ] AC8b: Two requests with the same `requestId` sent at the same time give one `201` (or `200` for non-create ops) and one `200` with the same series, and exactly one write lands.
- [ ] AC9: A `requestId` already used for a different operation or a different series is `400 { "error": "invalid_request" }` and writes nothing.
- [ ] AC10: Only the org owner can run `tracker.schedule_write` or `tracker.schedule_write_context`, or read `booking_stamps` and `schedule_writes`. A teacher, a revoked teacher, a parent, a student and an outsider get `forbidden` or no rows, and no table changes.
- [ ] AC11: A one-off edit (exception plus series fields) is one transaction.
- [ ] AC12a: The class write routes (POST `classes`, PATCH and DELETE `classes/[seriesId]/occurrences/[date]`) export handlers wrapped in `withServerTiming`.
- [ ] AC12b: Up to and including the write, each class-write handler makes exactly the store calls in the "Store call sequences" table, in that order, against the fake store.
- [ ] AC13: Through the real local stack, two parallel POSTs for the same teacher and time with different request IDs give exactly one `201` and one `422 booking_conflict`, and the calendar shows one class.
- [ ] AC14: A lock timeout or deadlock in `schedule_write` returns `503 { "error": "scheduler_unavailable" }` and writes nothing.

## Approach
Compare-and-swap on booking stamps, under a per-teacher and per-student advisory lock. The clash and availability logic stays in the pure TypeScript domain. The database guarantees that the inputs to that check are unchanged at the moment of the write, inside the write's transaction, under a lock.

**Database (migration 0018, its own PR):** `tracker.booking_stamps` (one version per org, staff or student, Notion id); `tracker.bump_booking_stamps()` trigger on the four scheduling tables, taking each key's lock then bumping its stamp; `tracker.schedule_write_context(p_org_id, p_request_id, p_keys)` returning stamps and any replay; `tracker.schedule_write(p_org_id, p_request_id, p_op, p_stamps, p_args)`: owner check, `lock_timeout` 5s, keys derived from the series row and args and locked in sorted order, claim the request id (unique violation replays or raises `request_reused`), compare stamps (`booking_changed`), stale checks, the op (`create`, `move`, `cancel`, `edit_one_off`, `split` via `split_class_series`, `end_series`), record the result.

**Tracker app:** store methods `readWriteContext` and `lockedWrite` replace the six removed ones; `bookUnderStamps` in the handlers reads the context, replays a recorded request, else runs the existing checks and writes, retrying once on `booking_changed`; store errors map `55P03` and `40P01` to `unavailable`, `23505` to a context re-read; the three write routes use `withServerTiming`; new ADR 0050 supersedes the two 0038 bullets.

**Store call sequences (AC12b), up to and including the write:**

| Operation | After |
|---|---|
| create | readWriteContext, listSeries, listSeriesForStudent, listWindows, listAvailabilityExceptions, getSummary, lockedWrite |
| move (scope this, weekly) | getSeries, readWriteContext, listSeries, listSeries, listSeriesForStudent, listWindows, listAvailabilityExceptions, lockedWrite |
| one-off edit that moves and changes teacher | getSeries, readWriteContext, listSeries, listSeries, listSeriesForStudent, listWindows, listAvailabilityExceptions, lockedWrite |
| series edit (scope future, retimed) | getSeries, readWriteContext, listSeries, listSeriesForStudent, listSeries, listSeriesForStudent, listWindows, listAvailabilityExceptions, lockedWrite |
| cancel (scope this) | getSeries, readWriteContext, listSeries, lockedWrite |
| end series (scope future, weekly) | getSeries, readWriteContext, listSeries, lockedWrite |

## Migration
`supabase/migrations/0018_scheduler_locked_writes.sql`, checked by `supabase/tests/scheduler_locked_writes.sql` (dblink in the throwaway check database only). Ships first as `req/REQ-30-migration`.

## Test plan
| Test | Type | Covers |
|---|---|---|
| `supabase/tests/scheduler_locked_writes.sql`: concurrent create, move and split via dblink | integration (RLS) | AC1, AC2 |
| same file: availability insert between context read and write | integration (RLS) | AC3 |
| same file: replay after commit; concurrent same request id; reuse; role matrix; one-off rollback; lock timeout | integration (RLS) | AC8a, AC8b, AC9, AC10, AC11, AC14 |
| `booking-routes.test.ts`: `raceNext` re-check gives 422; a second race gives 409 stale; a race recording the same request id gives 200 | unit | AC4, AC8b |
| store type has no other class-write key; the fake's `WRITES` is exactly `lockedWrite`, `adoptStudent`, `markSummary` | unit | AC5 |
| `booking-routes.test.ts`: `readWriteContext` before every read, `lockedWrite` gets its stamps | unit | AC6 |
| existing stale tests; a stale position under the lock is 409 | unit | AC7 |
| retries of all six ops are 200 with the first series and no write; reuse is 400 | unit | AC8a, AC9 |
| `lib/data/schedule.test.ts`: error mapping, `55P03`/`40P01` to 503, `23505` replay, context parse | unit | AC4, AC8b, AC10, AC14 |
| each write route returns `503 { "error": "scheduler_unavailable" }` when the write is unavailable | unit | AC14 |
| `lib/server-timing-routes.test.ts`: the three write routes | unit | AC12a |
| `booking-routes.test.ts` store call sequences | unit | AC12b |
| `e2e/tracker/flows.mjs`: parallel POSTs, one slot (201 + 422) and one request id (201 + 200); Server-Timing header | e2e | AC8b, AC12a, AC13 |

## Out of scope
Storing occurrences. Iris booking. Any UI change beyond the existing error notices. Clash checks on the Weekly Schedule import. Purging old `schedule_writes` rows. Changing who may book. An in-place whole-series edit.

## Decisions (defaults stand)
1. Stamp compare-and-swap under the advisory lock; check logic stays in TypeScript.
2. One `schedule_write` with an op switch, plus `schedule_write_context`.
3. `tracker` schema, migration 0018, owner-only RLS.
4. No app dependency; `dblink` only in the RLS check file.
5. Lock keys: teacher and student.
6. The database raises `booking_changed`; the handler re-checks and returns 422 on a real clash.
7. `tracker.schedule_writes` request log, reusing the `requestId` body field.
8. Replay lookup folded into `schedule_write_context`.
9. Server-Timing on the write routes plus the call-sequence test; `bench.sh` stays GET only.
10. Store error `unavailable`, response `{ "error": "scheduler_unavailable" }`.
11. No audit triggers on the new tables.
12. Server-Timing wiring, one-transaction one-off edits, narrowed store interface, `getSeriesByRequest` removed.
