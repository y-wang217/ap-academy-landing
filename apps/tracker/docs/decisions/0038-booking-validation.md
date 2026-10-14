# 0038: Bookings are checked on the server before any write
Status: accepted
Date: 2026-10-14
## Context
Scheduler 6/8 (REQ-7) lets Charlie book, move and cancel classes from the week calendar. Until now the write endpoints accepted any class: nothing stopped a teacher or a student being in two places, or a class landing outside the teacher's declared hours.
## Decision
- **Server-side, before any write.** `validateBooking` expands the candidate occurrences, compares them with the same teacher's and the same student's other occurrences (wall-clock minutes, same date, touching is allowed) and, when the change is a booking, with availability (`findConflicts`). A refusal is `422 booking_conflict` with `{ date, startTime, endTime, reason }` problems, at most 10, and a count of the rest. Problems never carry the other class's student, subject or teacher.
- **Horizon.** An open-ended weekly series is checked from the later of its first date and today, to the earlier of its end and today + 182 days. Later availability changes are surfaced by the REQ-5 conflicts page, as before.
- **What counts as a new booking.** Create, a move (date or time), a split that changes weekday, time, duration or teacher, and a one-off teacher or duration change. Subject-only and student-only edits skip the availability check, so already-flagged classes stay editable; double-booking is always checked.
- **No availability entered is a refusal** (`availability_not_entered`), matching "reject bookings outside declared availability".
- **No "this class and future" on a moved occurrence** (`422 moved_occurrence`): the split would carry the old move along and the drop would not show.
- **Stale moves.** A move writes no series version, so edit and cancel bodies carry `expectedDate` and `expectedStartTime`; a mismatch is `409 stale`. The existing `expectedUpdatedAt` check is unchanged.
- **One-off edits are two writes**, exception first (an idempotent upsert) then the series row (stale-checked), so a retry after a partial failure is safe.
- **Ending a series** (`DELETE` scope `future`) sets `effective_until` to the day before; a repeat is a 200 with no change.
- **Check then write is not atomic.** Two saves in the same instant could both pass. Only Charlie books, so this is accepted; a database exclusion constraint is impossible because occurrences are computed, not stored.
## Alternatives considered
- A database constraint: not possible for computed occurrences.
- Warn instead of refuse when a teacher has no availability: lets bookings slip in while teachers are onboarding, which is the case the check exists for.
- A version column bumped by moves: needs a migration for a problem two request fields solve.
## Consequences
No migration, no new dependency. Existing route tests give their fake teachers a full week of availability in setup. Revisit if more than one person can book, or if a substitute teacher for a single occurrence is added (it needs `class_exceptions.new_staff_id`).
