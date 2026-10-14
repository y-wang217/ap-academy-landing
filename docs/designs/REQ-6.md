# Design: REQ-6: Scheduler 5/8: Weekly calendar views (per-teacher and All teachers)

Notion card: https://app.notion.com/p/3f9d6ae73dd781a4a426dc465b5cfcbd (copied when the card was Approved, 2026-10-14). Condensed from the card; the card is the source of truth.

**Summary:** A read-only week calendar at `/tracker/schedule`. Teachers see their own Monday to Sunday week (availability underneath, class cards on top). Charlie picks any teacher or switches to All teachers, which shows scheduled and remaining available hours per teacher. Clicking a class opens its details and a link to the student's Notion record.

**Risk:** High. No migration, no new dependency, no new Notion permission. High because teachers now receive student names, read server-side from Students & Parents and filtered to the students in their own classes, and because it adds a guarded read endpoint.

**Depends on:** REQ-5 (merged): `findConflicts`, optional `staffId` on `listWindows`/`listAvailabilityExceptions`.

## Acceptance criteria
- AC1: `GET /api/scheduler/week?date=YYYY-MM-DD[&staffId=…]` returns the ISO week (Mon-Sun, America/Toronto) containing `date`; default today; invalid date 400.
- AC2: Teacher with no `staffId` or their own gets their own week. Another teacher's `staffId` or `view=all` is 403 and the store is never read. Signed out 401, unconfigured 503.
- AC3: Admin with `staffId` gets that teacher; `view=all` gets every active teaching staff member (including those with no classes) sorted by name; a non-teacher `staffId` is `422 invalid_staff`.
- AC4: Each teacher section has the 7 availability days, the week's occurrences and totals, parsed through strict schemas. Teacher shape: no email, no `seriesUpdatedAt`, nothing from Weekly Schedule. Admin adds `seriesUpdatedAt` and email.
- AC5: Fixture week totals: scheduled 240, available 540, remaining 330. Overlapping windows are not double-counted, cancelled adds nothing, overlapping classes subtract once, remaining is never below 0.
- AC6: `not_entered` gives null available and remaining, shown as "No availability entered".
- AC7: `studentName` only for students in the returned occurrences; a failed lookup or missing student gives null, cards say "Student", the week still returns 200.
- AC8: `conflict` comes from `findConflicts`; only on scheduled or moved occurrences dated today or later.
- AC9: `/tracker/schedule` uses the same loader as the route. A teacher with `?staffId=<other>` or `?view=all` sees "This page is not available for your account."
- AC10: Previous week, Next week, Today and a date input work as plain links and a GET form, keeping `staffId`/`view`. Admins also get a teacher select and an All teachers / One teacher toggle.
- AC11: At 768 px and up: 7 day columns, 15-minute rows from `min(08:00, earliest)` to `max(21:00, latest)`. Below 768 px: a stacked day list, no horizontal scroll at 375 px.
- AC12: State never depends on colour alone: "Available" plus hatch; conflict cards dashed with "⚠" and "Outside hours"/"Time off"; cancelled struck through and labelled; moved says "Moved from Mon Oct 19"; "No availability entered".
- AC13: Overlapping classes are laid out in lanes (`layoutDay`); back-to-back classes share a lane.
- AC14: A card is a `<button>` that opens a native `<dialog>` with the class details and a plain `<a target="_blank" rel="noopener">` "Open student record". Escape closes it and focus returns to the card.
- AC15: All teachers view: one bordered section per teacher with name heading, "Scheduled 4 h · 5.5 h available left", an outside-hours count, a compact 7-day list, and a link to that teacher's week.
- AC16: A Monday 17:00 weekly class sits on the 17:00 row in the weeks of 2026-10-26 and 2026-11-02 (DST ends 2026-11-01).
- AC17: Teacher home gains "Your week" (`/schedule`); owner home gains "Teacher schedules" (`/schedule?view=all`), both `next/link`.
- AC18: Nothing added writes anywhere. The source scan covers the new files; names are never stored or logged.
- AC19: Existing suites pass with no edited assertions.

**Fixture week** (teacher T, Mon 2026-10-19, today 2026-10-19): windows Mon 09:00-12:00 + 11:00-14:00, Wed 16:00-20:00; Wed 10-21 time off 18:00-20:00; Sat 10-24 extra 10:00-12:00 (available 540). Classes: Mon 10:00 weekly; Mon 13:30 one-off; Wed 16:00 weekly; Thu 17:00 weekly cancelled 10-22; Fri 15:00 weekly moved to Sat 10-24 10:30 (scheduled 240, inside availability 210, remaining 330).

## Approach
Domain (pure): `lib/domain/schedule/week.ts` (`weekOf`, `weekTotals`). View: `lib/view/week-layout.ts` (`layoutDay`, `gridBounds`, `rowOf`), `lib/view/week-text.ts`.
Server: `fetchStudentNames` in `lib/notion/students.ts` (names only), `getStudentNames` in `cached.ts` (300 s), `studentNames` in `ScheduleDeps`, `loadWeek`/`handleWeek` in `schedule-handlers.ts`, week schemas, `app/api/scheduler/week/route.ts`.
UI: `app/schedule/page.tsx`, `components/scheduler/{week-controls,week-grid,class-card,all-teachers-week}.tsx`, home links in `app/page.tsx`.
Docs: ADR 0037, `docs/PLAN.md`, this file.

## Additions made while building (not in the card)
- The week response carries `namesLoaded: boolean`, so the page can say "Student names could not be loaded." when the names lookup fails.
- `Page` in `components/ui.tsx` takes an optional `wide` prop (1200 px instead of 720 px) so the seven-column grid fits.
- An admin who asks for neither `staffId` nor `view=all` gets their own teaching record if they have one, else the first active teacher by name.
- `lib/notion/students.ts` honours the existing `NOTION_API_BASE` override so the e2e stack can serve the Students schema and a names-only query from `mock-notion.mjs`.

## Open questions (from the card)
1. The Notion link in the dialog is shown to everyone; Notion sharing decides access.
2. Remaining = available minus booked minutes inside availability.
3. Students outside Active or Onboarding show "Student".
4. Risk stays High because teachers see student names.
5. Per-teacher and All teachers views share one loader and one endpoint.
