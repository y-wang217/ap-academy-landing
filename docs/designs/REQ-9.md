# REQ-9: Scheduler 8/8: Lesson-link extension point, payout guardrail tests and operator docs

Card: https://app.notion.com/p/3f9d6ae73dd78185be73e22a1ead3a7b (design approved there; this is the build copy).

**Summary:** Closes the Scheduler module with no new behaviour for users: a small pure lesson-link module that fixes how a delivered lesson will later point at one class occurrence, regression tests proving that booking, moving and cancelling classes never touch Lessons or payout fields, a section 7 verification record, and a short operator guide.

**Risk:** Low. No migration, no new dependency, no auth or permission change, no new Notion write and no new personal data.

**Depends on:** REQ-8 (merged).

## Problem
The spec (sections 5 and 7) asks the module to (a) connect to lesson logging without disturbing it, (b) prove planned classes never leak into delivered lessons or payouts, (c) run the whole verification list and (d) leave Charlie a short guide to keep it running.

- The tracker does not log lessons. Nothing under `apps/tracker` reads or writes the Lessons data source (6300f58a). Teachers log lessons through the Notion "Log a Lesson" form. So the requirement's second branch applies: leave a clean, documented extension point and do not wire a link now.
- Lessons has no field that could hold an occurrence identity. Adding one is a Notion schema change, so it is an Open question, not part of this card.
- Occurrence identity already exists: `occurrenceKey = <seriesId>:<originalDate>` (ADR 0034). Moves and cancels keep it; splits and edits of past occurrences are refused.
- Existing guardrails are source scans. What is missing is a behavioural test that drives create, move and cancel and inspects every outbound Notion request and every other tracker table.

## Acceptance criteria
- AC1: `occurrenceRef(o)` returns `sched:<seriesId>:<originalDate>`; `parseOccurrenceRef` returns `{ seriesId, originalDate }` for that string and `null` for anything else. Round trip holds for every occurrence in the recurrence fixtures.
- AC2: A weekly class moved Monday to Wednesday keeps its ref; after a "this and future" split, earlier occurrences keep their ref and only later ones carry the new series ID.
- AC3: `isLinkable(o, today)` is true only when `o.status !== "cancelled"` and `o.date <= today`.
- AC4: The new module is pure, names no Lessons data source ID, exports a `LessonLinkPort` type with no implementation, and no route, component or handler imports it.
- AC5: Driving `handleCreateClass` (one-off and weekly), `handleEditOccurrence` (this, future) and `handleCancelOccurrence` (this, future) through fake deps with recording ports produces Notion writes of only a `Weekly Schedule` summary write and REQ-8's Work writes. No write body at any depth contains `Paid to Teacher`, `Pay Period`, `Duration (hrs)`, `Teacher` or `Type`, and no URL contains `6300f58a`.
- AC6: In `pnpm test:tracker`, after the admin books, drags, edits (this and future) and cancels (this and future), the mock Notion journal shows no request to the Lessons data source or a Lessons page, and every PATCH to a student page has exactly the property key `Weekly Schedule`.
- AC7: Row counts and an md5 of each row set in every `tracker` table other than `class_series`, `class_exceptions`, `schedule_summaries`, `audit_log`, `daily_tasks`, `daily_task_teachers` are identical before and after the booking flow.
- AC8: The mock Notion holds one Lessons page (Paid to Teacher true, Pay Period 2026-10, Duration 1). After the booking flow a GET returns the same properties and the journal shows it was never requested.
- AC9: `apps/tracker/docs/scheduler-report.md` has one row per section 7 item: evidence, command, date, PASS / FAIL / MANUAL. Every MANUAL row has numbered steps.
- AC10: The same file has four short sections: Integration, Storage ownership, Checks performed, Remaining setup. About 150 lines at most.
- AC11: `apps/tracker/docs/scheduler-operations.md` covers exactly four tasks as numbered steps: change the daily task time; approve or revoke a teacher login; repair an import entry; resolve a conflict.
- AC12: `pnpm --filter tracker lint`, `typecheck`, `test`, `pnpm test:rls` and `pnpm test:tracker` pass; no existing assertion is weakened.

## Approach
- `apps/tracker/lib/domain/schedule/lesson-link.ts` (pure): `occurrenceRef`, `parseOccurrenceRef`, `isLinkable`, and `LessonLinkPort` with a doc comment stating the contract. ADR `0040-lesson-link-extension-point.md` and an index line.
- `app/api/scheduler/payout-guardrails.test.ts` (AC5), reusing the booking fake store (extracted to `booking-world.fake.ts` because it would otherwise be copied).
- `e2e/tracker/mock-notion.mjs`: a request journal at `GET /__journal` and one read-only Lessons page. `e2e/tracker/flows.mjs`: table snapshots with psql, the extra edit and cancel calls, and checks for AC6 to AC8.
- `scheduler-report.md`, `scheduler-operations.md`, a PLAN.md line.

## Out of scope
Writing anything to Lessons, adding a Lessons property, a "log this class" button; any new scheduler feature, UI change, migration or Notion write; fixing gaps the verification run finds (a FAIL row becomes a new card).

## Open questions
1. Lesson link, later: (a) add a text property "Class occurrence" to Lessons and a tracker "Log this class" button, or (b) keep the Notion form and add a matcher. Left open; (a) would be its own High-risk card.
2. Who runs the MANUAL rows: proposed Charlie, after deploy, using the steps in the report.
3. Report location: proposed `apps/tracker/docs/scheduler-report.md`.
