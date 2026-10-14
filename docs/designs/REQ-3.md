# REQ-3: Scheduler 2/8: Scheduling data model and recurrence engine

Approved design, copied from the Notion card:
https://app.notion.com/p/3f9d6ae73dd781769595f6bf12877114

**Summary:** Adds four `tracker` tables (availability windows, availability exceptions, class series, class exceptions), a pure wall-clock recurrence and availability engine under `lib/domain/schedule/`, and guarded JSON endpoints that expand dated occurrences, so every later Scheduler card reads and writes schedules through one server API with stable `seriesId:originalDate` occurrence keys.
**Risk:** High (new migration with four tables, RLS policies and a write function; new permission rules for teachers vs admin; stores Notion student page IDs linked to class times).

## Acceptance criteria
- AC1: Weekly Monday 17:00 / 60 min series expands over 2026-10-19..2026-11-09 to four occurrences, local `17:00`; `startsAt` 21:00Z for the two October dates, 22:00Z for 2026-11-02 and 2026-11-09. Same across 2027-03-14.
- AC2: `occurrenceKey = "<seriesId>:<originalDate>"`, identical before and after move, cancel or re-expansion.
- AC3: Cancel ("This class only") stores one `class_exceptions` row; expansions return it `status: "cancelled"`; a re-sent cancel is `200` with no second row.
- AC4: Move ("This class only") returns the occurrence at the new local date/time, `status: "moved"`, same key, duration, student, teacher. Moved out of range: not returned; moved in from outside: returned.
- AC5: "This class and future" at date D ends the old series at D-1, creates a new series starting in D's week with the new values and the old `effectiveUntil`, linked by `splitFrom`; occurrences before D unchanged; one transaction.
- AC6: On a split, exceptions of the old series on or after D move to the new series: cancellations map to the same ISO week; moves keep their absolute date and time.
- AC7: Edits/cancels for an occurrence whose `originalDate` is before today (America/Toronto) return `422 past_occurrence`, writing nothing.
- AC8: Creates with an existing `requestId` return the existing record with `200` (first `201`); a retried split returns the same new series.
- AC9: A stale `expectedUpdatedAt` returns `409 { "error": "stale" }` and writes nothing.
- AC10: Availability per date: sorted non-overlapping `available` intervals, overlapping/touching windows and extra availability unioned (09:00-12:00 + 11:00-14:00 = 09:00-14:00, 300 minutes), time off subtracted. No rows at all: `not_entered`; otherwise no intervals: `unavailable`.
- AC11: Windows and exceptions honour effective dates; `effectiveUntil` inclusive.
- AC12: Teacher reads/writes only their own availability and reads only their own classes; another `staffId` is `403`; any class create/edit/split/cancel by a teacher is `403`. In Postgres a teacher JWT sees 0 rows of another teacher's data and cannot write class tables.
- AC13: Teacher class responses contain only `occurrenceKey, seriesId, originalDate, date, startTime, endTime, durationMinutes, startsAt, endsAt, staffId, studentId, subject, status, kind`.
- AC14: `staffId` must be active teaching staff (`422 invalid_staff`); no crossing local midnight; duration 15..480 in multiples of 5 (`400`).
- AC15: Nothing added writes to Notion, Lessons, Payouts or `tracker.students`; only the existing Staff query is used (source-scan test).
- AC16: Occurrence range over 92 days or `from` after `to` is `400`.
- AC17: Existing behaviour unchanged: `pnpm --filter tracker test`, `pnpm test:rls`, `pnpm test:tracker` pass with no edited assertions.

## Approach
- Migration `supabase/migrations/0010_scheduler_core.sql`: `availability_windows`, `availability_exceptions`, `class_series`, `class_exceptions`, RLS, `tracker.split_class_series()`.
- Pure engine in `apps/tracker/lib/domain/schedule/`: `wallclock.ts`, `recurrence.ts`, `availability.ts`, `edits.ts`.
- Data access `apps/tracker/lib/data/schedule.ts`; handlers `apps/tracker/lib/scheduler/schedule-handlers.ts`; routes under `apps/tracker/app/api/scheduler/{availability,classes}/`.
- ADR `apps/tracker/docs/decisions/0034-scheduler-recurrence-model.md`.
- UI: none.

## Test plan
| Test | Type | Covers |
|---|---|---|
| `lib/domain/schedule/{wallclock,recurrence,availability,edits}.test.ts` | unit | AC1-AC7, AC10, AC11, AC14 |
| `supabase/tests/scheduler_core.sql` | RLS | AC3, AC5-AC9, AC12 |
| `app/api/scheduler/schedule-routes.test.ts` | integration | AC8, AC9, AC12-AC16 |
| source scan in the same file | unit | AC15 |
| existing suites | unit, RLS, e2e | AC17 |

## Out of scope
UI; import or summary (3/8); conflict checks (4/8, 6/8); calendars (5/8); drag and drop (6/8); Notion writes and the daily task (7/8); lesson linking (8/8); per-occurrence teacher or duration change; validating student IDs in Notion; other time zones; deleting series.

## Open questions (as put to Charlie; design approved as written)
Student reference by Notion page ID with shape-check only; `updated_at` as the version token; ISO-week re-keying on split; availability and classes kept in one card.
