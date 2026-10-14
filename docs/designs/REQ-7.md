# Design: REQ-7: Scheduler 6/8: Book, edit and drag-move classes (admin only)

Card: https://app.notion.com/p/3f9d6ae73dd781adb0b7fd210ac00223 (copied from the approved design on the card)

**Summary:** Charlie can book one-off and weekly classes, edit or cancel them from a form, and drag a class to another day or time in the displayed week on `/tracker/schedule`; every save is checked on the server for teacher and student double-booking and declared availability, and a failed save puts the card back where it was.

**Risk:** High. No migration, no new dependency, no RLS change. High because it writes bookings linked to students and shows Charlie a student picker read from Students & Parents (student personal data), and because it widens what the existing admin-only write endpoints accept. The card was Medium; raised per the pipeline rule.

**Depends on:** REQ-3 (class tables, `split_class_series`, write endpoints), REQ-4 (summary sync), REQ-5 (`findConflicts`), REQ-6 (week page, `loadWeek`, `ClassCard`, `layoutDay`). All merged (f0c9e5f).

## Problem

Charlie books classes in ZoomShift today. The scheduler already stores classes and has admin-only write endpoints (`POST /api/scheduler/classes`, `PATCH` and `DELETE /api/scheduler/classes/[seriesId]/occurrences/[date]`, built in REQ-3), but there is no UI to call them, no double-booking or availability check on save, no way to end a weekly series, and no way to change the teacher of a one-off class. This card adds those so Charlie (admin) can run bookings from the week calendar. Teachers keep a read-only calendar.

Reused, not rebuilt:
- Write handlers in `apps/tracker/lib/scheduler/schedule-handlers.ts`: `handleCreateClass`, `handleEditOccurrence` (scope `this` writes a `moved` exception; scope `future` calls `store.split`), `handleCancelOccurrence` (scope `this` only). All gated with `gate(deps, ["admin"])`, and RLS in `supabase/migrations/0010_scheduler_core.sql` already lets only the org owner write `class_series` and `class_exceptions`.
- Idempotency: `request_id` unique per org (series), one exception per `(series_id, original_date)`, `getSeriesByRequest` for retried splits.
- Stale edits: `expectedUpdatedAt` compared to `class_series.updated_at` (409 `stale`). The browser client `apps/tracker/lib/scheduler/api-client.ts` already maps 409 to "Someone else changed this. Showing the latest." and reuses one `requestId` per in-flight action key.
- Occurrence identity `seriesId:originalDate` from `recurrence.ts`; a move keeps the key.
- Availability fit test in `conflicts.ts` (`findConflicts`).
- Weekly Schedule regeneration `syncStudents` in the handlers (REQ-4); scope `this` moves already skip it.

## Acceptance criteria

Fixture (the booking fixture): today is Mon 2026-10-19 (America/Toronto). Teacher Ryan has windows Mon to Fri 15:00-21:00 and time off on Mon 2026-11-02 all day. Teacher Kuby has windows Mon to Fri 15:00-21:00. Student S1 has a weekly class with Ryan, Mon 16:00, 60 min, from 2026-10-19. Student S2 has a weekly class with Kuby, Wed 17:00, 60 min.

- AC1: Create. Admin `POST /api/scheduler/classes` for a one-off or weekly class inside availability with no clash returns 201; resending the same `requestId` returns 200 and leaves one series row. A `startDate` before today returns `422 past_occurrence` and writes nothing.
- AC2: Teacher double-booking. Any create, move or split whose candidate occurrence overlaps a non-cancelled occurrence of the same teacher (`start < otherEnd` and `otherStart < end`, wall-clock, same date) returns `422 { error: "booking_conflict", problems: [...] }` with reason `teacher_busy`, and writes nothing. Example: booking S2 with Ryan Mon 2026-10-19 16:30-17:30.
- AC3: Student double-booking. The same rule across all teachers for the class's student returns reason `student_busy`. Example: booking S1 with Kuby Mon 2026-10-26 16:00-17:00.
- AC4: Back-to-back is allowed. Booking S2 with Ryan Mon 17:00-18:00 next to S1's 16:00-17:00 returns 201.
- AC5: Availability. A create, a move, or a split that changes day, time, duration or teacher must place every candidate occurrence wholly inside one available interval (the `findConflicts` rule). Otherwise reason `outside_availability` or `time_off`; a teacher with no availability rows at all gives `availability_not_entered`. An edit that changes only subject or student skips the availability check (double-booking is still checked), so already-flagged classes stay editable.
- AC6: Every affected date. A weekly create or a `future` edit checks every candidate occurrence from the later of (first affected date, today) up to the earlier of (`effectiveUntil`, today + 182 days). With the booking fixture, creating a weekly Mon 18:00 class for S2 with Ryan from 2026-10-19 is rejected because 2026-11-02 is time off; the response lists each problem as `{ date, startTime, endTime, reason }`, at most 10, plus `more` (count not listed). Problems never include the other class's student ID, name or subject.
- AC7: A class never clashes with itself. Moving S1's 2026-10-19 occurrence to 16:30 the same day succeeds; a `future` split excludes the old series' occurrences on or after the split date.
- AC8: Drag Monday to Wednesday. Dragging S1's Mon 2026-10-19 card to Wed 16:00 sends `PATCH` scope `this` with `{ date: "2026-10-21", startTime: "16:00" }`. After a page reload the card is on Wed 2026-10-21 16:00-17:00, status `moved`, `occurrenceKey` still `seriesId:2026-10-19`, `durationMinutes` 60, the same student and teacher, and the series count is unchanged.
- AC9: Stale and concurrent edits. Edit and cancel bodies gain `expectedDate` and `expectedStartTime` (where the client last saw the occurrence). If the occurrence's current date or start time differs, the server returns `409 stale` and writes nothing. The existing `expectedUpdatedAt` check is unchanged. Two tabs moving the same occurrence: the second gets 409, not a silent overwrite.
- AC10: This class and future. Scope `future` keeps the REQ-3 split behaviour: occurrences before the split date and their exceptions are unchanged; the new series starts on the chosen weekday. Scope `future` on an occurrence whose status is `moved` returns `422 moved_occurrence`.
- AC11: Cancel. `DELETE` scope `this` writes a `cancelled` exception (existing). `DELETE` scope `future` on a weekly series sets `effective_until` to the day before the occurrence; a retry, or a request when the series already ends there, returns 200 with no change. On a one-off, `future` behaves as `this`. A cancelled occurrence stays cancelled after refresh. A past occurrence returns `422 past_occurrence`.
- AC12: One-off edits. For a one-off class, scope `this` may change teacher, subject and duration (the series row is updated, checked against `expectedUpdatedAt`) as well as date and time (a `moved` exception). For a weekly class, scope `this` with teacher, student, subject or duration still returns `400 use_scope_future`.
- AC13: Teachers cannot book or reschedule. A teacher identity calling `POST /classes`, `PATCH` or `DELETE` (any scope) gets 403 and no store write method is called. The teacher's `/tracker/schedule` renders no Book, Edit or Cancel control and its cards are not draggable. RLS already rejects a teacher JWT writing `class_series.effective_until` or `notion_staff_id`.
- AC14: Weekly Schedule summary. A weekly create, a `future` split and a `future` cancel regenerate the affected students' summaries (REQ-4 rules). A `this` move, a `this` cancel and any one-off edit do not call the summary sync.
- AC15: Guardrails. Nothing added writes to Lessons, Teacher Payouts, Paid to Teacher, Pay Period or Notion other than the existing summary sync. The source scan in `app/api/scheduler/schedule-routes.test.ts` covers every new file.
- AC16: Drag interaction (admin, per-teacher week, viewport 768 px and up). Pointer-dragging a scheduled or moved card shows a ghost at the snapped 15-minute position with a text label such as "Wed Oct 21 16:00-17:00"; the ghost keeps the class's duration. Drops are limited to the 7 displayed days and must end by 24:00. Dropping on the original slot or pressing Escape sends nothing. Cancelled cards are not draggable.
- AC17: Scope prompt. Dropping a weekly, scheduled occurrence, or saving the edit form for one, asks "This class only" (preselected) or "This class and future". One-offs and moved occurrences skip the prompt and use `this`.
- AC18: Optimistic save and rollback. While a move is saving, the card sits at the new slot labelled "Saving…". On 422, 5xx or a network error the card returns to its original slot and a concise error shows, for example "Not saved: Ryan already has a class Wed Oct 21 16:00-17:00." or "Not saved: Ryan is not available then." On 409 it shows "Someone else changed this. Showing the latest." and reloads the week. On success the week reloads from the server (`router.refresh()`).
- AC19: Form. "Book a class" (admin, per-teacher view) and "Edit" and "Cancel class" in the class dialog open a native `dialog` form with labelled fields: Student (select), Subject, Teacher (select), Date, Start time (5-minute step), Duration in minutes, Repeats weekly and optional Until (create only), and the scope radios (weekly edit and cancel). It is fully usable by keyboard (Tab order, Enter submits, Escape closes, focus returns to the card) and has no horizontal scroll at 375 px. Below 768 px this form is the only way to move a class.
- AC20: No duplicates on retry. Double-submitting create, move or cancel results in one series row or one exception row (the client reuses the `requestId` for the same action key). `api.send("DELETE", ...)` now sends its JSON body, which the cancel endpoint requires.
- AC21: Existing behaviour. `pnpm --filter tracker test`, `pnpm test:rls` and `pnpm test:tracker` pass. Existing route tests may gain an availability window in their fake-store setup (classes now need availability), but no existing assertion is edited.

## Approach

**Data model:** None. No migration. Every new write uses columns migration 0010 already grants to `authenticated` for the org owner.

**Domain (pure):** `lib/domain/schedule/booking.ts` (`bookingWindow`, `checkBooking`, reusing `findConflicts`); `checkNotPast` in `edits.ts`.

**Storage:** `endSeries` and `updateSeriesFields` on the store, implemented with the same stale pattern as `updateWindow`.

**Handlers:** internal `validateBooking`, run before any write; `handleCreateClass`, `handleEditOccurrence` (adds `expectedDate`/`expectedStartTime`, one-off edits, `moved_occurrence`), `handleCancelOccurrence` (scope `future`). Strict `BookingConflictResponse` schema.

**Browser client and view helpers:** `api-client.ts` sends the JSON body on DELETE and exposes `status`, `error`, `problems` on failure; `lib/view/drag.ts` (pure); `lib/view/booking-text.ts`.

**UI:** `WeekGrid` takes an optional `editor`; new `week-editor.tsx`, `class-form.tsx`; `ClassCard` gains Edit and Cancel class; `app/schedule/page.tsx` renders `WeekEditor` for an admin's per-teacher view.

**Docs:** ADR `apps/tracker/docs/decisions/0038-booking-validation.md`, `apps/tracker/docs/PLAN.md` progress line, this file.

## Test plan

| Test | Type | Covers |
|---|---|---|
| `lib/domain/schedule/booking.test.ts` | unit | AC2-AC7 |
| `lib/view/drag.test.ts` | unit | AC16 |
| `lib/view/booking-text.test.ts` | unit | AC18 |
| `app/api/scheduler/booking-routes.test.ts` (new, booking fixture, fake store) | integration | AC1-AC14 |
| Source scan in `schedule-routes.test.ts` extended to the new files | unit | AC15 |
| `lib/scheduler/api-client.test.ts` | unit | AC20 |
| `supabase/tests/scheduler_core.sql`: teacher JWT cannot update `class_series.effective_until` or `notion_staff_id` | RLS | AC13 |
| `e2e/tracker/flows.mjs`: drag Monday to Wednesday, rollback on a 500, scope prompt, keyboard booking at 375 px, teacher controls and 403 | e2e | AC8, AC13, AC16-AC19 |
| Existing suites | unit, RLS, e2e | AC21 |

## Out of scope

- Daily Notion task (7/8) and lesson logging or lesson links (8/8).
- Substituting a teacher for one occurrence of a weekly class (needs a migration). See Open question 4.
- Dragging across weeks, on phones, in the All teachers view, and resize-to-change-duration.
- Deleting series, teacher-initiated moves, parent booking, notifications, external calendar sync.

## Risks and edge cases

- **Check then write is not atomic.** Accepted, recorded in ADR 0038.
- **Open-ended weekly series.** Checked for 182 days.
- **One-off edit is two writes.** Exception first (idempotent upsert), series row second (stale-checked).
- **Moves did not bump a version.** `expectedDate` and `expectedStartTime` close that gap without a migration (AC9).
- **Existing tests book classes with no availability.** Their fake stores gain a full-week window in setup; assertions stay as they are.
- **DST.** All checks are wall-clock on local dates.
- **Student names.** The picker shows names to Charlie only; never stored, logged, or returned in conflict problems.
- **Notion down.** The form shows "Student list could not be loaded." and Book is disabled; editing existing classes still works.

## Open questions (as proposed on the card; the builder followed the proposals)

1. A teacher with no availability entered: reject (`availability_not_entered`, proposed).
2. Moves and time, day, duration or teacher changes count as new bookings; subject-only or student-only edits do not.
3. Validation horizon of 182 days.
4. One-day substitute teacher is a separate follow-up card.
5. "This class and future" is not offered on an already-moved occurrence.
6. Risk raised from Medium to High.
