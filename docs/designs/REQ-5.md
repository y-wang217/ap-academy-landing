# Design: REQ-5: Scheduler 4/8: Teacher availability editor (phone-first) and conflict flags

Notion card: https://app.notion.com/p/3f9d6ae73dd781bbb3e2e7e42b81698c (copied when the card was Approved, 2026-10-14).

**Summary:** Teachers get a phone-first page at `/tracker/schedule/availability` to set their weekly windows, copy a day to other days and add dated time off or extra availability. Charlie can edit any teacher's availability there too. Any upcoming class that falls outside availability shows up in a computed conflicts list with a count badge on his tracker home. No class is ever moved or cancelled.

**Risk:** Medium. No migration, no new dependency, no new permission rule (reuses the 0033 guard and the 0010 RLS). Adds one read endpoint, the first scheduler UI and a home-page change for the org owner.

## Acceptance criteria
- AC1: A signed-in scheduler teacher (staff link, no membership) opening `/tracker` sees a "Set your availability" link instead of the "not ready" card. `/tracker/schedule/availability` shows only their own availability and has no teacher selector.
- AC2: A teacher adds two Monday windows (09:00-12:00 and 13:00-17:00), copies Monday to Wednesday and Friday, and adds a full-day time off on a future date. After a reload, Monday, Wednesday and Friday each show both windows, and the 14-day preview labels that date "Time off" with 0 available minutes.
- AC3: Copying a day plans its writes with the pure `planCopy`. Without "Replace", only windows not already identical on the target day are created. With "Replace", the target day's current windows are deleted first. Copied windows keep the source's times and `effectiveUntil`, and start on `max(source.effectiveFrom, today)`.
- AC4: A dated extra availability (date, start, end) makes that date show as available for that interval only.
- AC5: Every preview day shows a text label and an icon, never colour alone: "Available 09:00-14:00" (one per interval), "Unavailable" or "Not entered". "Not entered" appears only when the teacher has no windows and no exceptions at all.
- AC6: Admin sees a teacher selector of active teaching staff (from `GET /api/scheduler/staff`) and can add, edit and remove any teacher's windows and exceptions. A teacher calling any availability or conflicts endpoint with another `staffId` gets `403`.
- AC7: `findConflicts` returns every `scheduled` or `moved` occurrence dated today or later that does not fit wholly inside a single available interval on its date. `reason: "time_off"` when a time-off exception covers part of the class, `"outside_availability"` otherwise. Cancelled occurrences, classes that exactly fill an interval, and back-to-back classes are not conflicts. Classes of a teacher whose availability is `not_entered` are not conflicts; that teacher's ID is listed in `notEntered`.
- AC8: `GET /api/scheduler/conflicts?from&to[&staffId]` behaves by scope. Admin gets all teachers, or one when `staffId` is given. A teacher gets only their own, and another `staffId` is `403`. Signed out is `401`, unconfigured `503`. `from` after `to` or more than 92 days is `400`. Both scopes use strict output schemas; the teacher shape is the REQ-3 teacher occurrence fields plus `reason`.
- AC9: Deleting or shrinking a window that covers an existing class leaves `class_series` and `class_exceptions` unchanged, and the class appears in `/api/scheduler/conflicts`. Restoring the window removes it. No availability handler calls a class write method (source scan).
- AC10: On the owner's tracker home, a "Teacher availability" link carries a badge "N classes outside availability" when N > 0. `/tracker/schedule/conflicts` (admin only) lists date, local time, teacher name, subject, reason and a link to the teacher's availability. If the conflicts load fails, the home page still renders, without the badge.
- AC11: A failed save shows an inline error and reloads server state. The editor never shows an unsaved change as saved. A retry of the same action reuses its `requestId`.
- AC12: At 375 px the editor has no horizontal scroll and every input has a visible label. Keyboard only is enough to add a window, save it and remove it.
- AC13: Nothing added writes to Notion, `tracker.students`, `class_series`, `class_exceptions`, Lessons or Teacher Payouts. The source scan covers the new files.
- AC14: Existing behaviour is unchanged: `pnpm --filter tracker test`, `pnpm test:rls` and `pnpm test:tracker` pass with no edited assertions.

## Approach
Domain (pure): `lib/domain/schedule/conflicts.ts` (`findConflicts`), `lib/domain/schedule/copy-day.ts` (`planCopy`).
Server: optional `staffId` on `listWindows` / `listAvailabilityExceptions`; `loadConflicts` and `handleConflicts` in `schedule-handlers.ts`; conflict schemas; route `app/api/scheduler/conflicts/route.ts`.
UI: `app/schedule/availability/page.tsx`, `components/scheduler/availability-editor.tsx`, `components/scheduler/teacher-picker.tsx`, `app/schedule/conflicts/page.tsx`, `lib/view/availability-text.ts`, `lib/scheduler/api-client.ts` (`SCHEDULER_API = "/tracker/api/scheduler"`), home page changes in `app/page.tsx`.
Docs: ADR for computed conflicts, `docs/PLAN.md`, this file.
E2E support: optional `NOTION_API_BASE`, `e2e/tracker/mock-notion.mjs`, `stack.sh`, `seed.sql`, a new block in `flows.mjs`.

## Test plan
- `conflicts.test.ts`, `copy-day.test.ts`, `availability-text.test.ts`: unit (AC2 to AC5, AC7).
- Handler tests with a fake store: conflicts by scope, 403/401/503, range 400s, strict schemas, delete window then conflict with class data unchanged, extra hours only affect their date (AC4, AC6, AC8, AC9).
- Source scan over the new files (AC9, AC13).
- `api-client.test.ts`: non-2xx, thrown fetch, requestId reuse, 409 stale, basePath constant (AC11).
- Owner home renders without badge when the conflicts load throws (AC10).
- E2E block at 375 px (AC1, AC2, AC9, AC10, AC12).

## Out of scope
Week calendar (5/8). Booking, moving, cancelling or reassigning classes (6/8). Stored or acknowledged conflicts. Notifications. Rejecting availability changes. Editing an exception in place. Showing student names (needs 3/8's Students read). Any schema, RLS, grant or Notion write change.

## Open questions (proposed answers were built)
1. Teachers with no availability entered are listed as "No availability entered", not flagged class by class.
2. Copy defaults to add (skip identical), with an opt-in "Replace hours already on those days".
3. Conflict horizon: today plus 91 days.
4. Teachers see a one-line count of their own classes outside their hours.
5. Conflicts show no student names until 3/8's Students read exists.
