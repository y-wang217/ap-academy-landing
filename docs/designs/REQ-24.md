# REQ-24 Parent 3/4: Calendar tab, the child's classes by month with states

Copied from the approved card (design-approver Approved, sha:170acaa465d6). The card is the source; this copy sits next to the diff for review.

**Summary:** The parent Calendar tab at `/tracker/parent/[studentId]/calendar` shows one month of the child's scheduler classes (dots at 375px, full blocks from 640px), a month switcher, the summary line and a This week list. Each class is tagged Scheduled, Moved, Cancelled or Makeup and is read under the parent RLS policies that 0016 already ships.

**Risk:** Medium. Read-only UI over class rows a parent can already read under the 0016 policies, with no migration and no write. The only new flow is teacher first names (staff data) reaching the parent of that teacher's own student.

## Acceptance criteria
- AC1: `buildMonth` (pure) returns, for a weekly series, exactly the pattern dates inside the requested month. A one-off appears only on its date. A series that ended before the month, or starts after it, yields nothing.
- AC2: Each class has one state. A `cancelled` exception gives Cancelled. A `moved` exception gives Moved and carries the original date and original start time. A scheduled occurrence of a `one_off` series gives Makeup. Every other occurrence gives Scheduled. A moved one-off is Moved.
- AC3: A class moved into the month from another month is shown on its new date. A class moved out of the month is not shown in it.
- AC4: The summary line reads `N classes this month · D done · U upcoming`. N counts the month's classes that are not Cancelled, D counts those whose end time is at or before now, and U = N - D. One class reads `1 class this month`. A month with no classes shows "No classes this month." instead of the line, and the grid still renders.
- AC5: The moved note reads `Moved from Tue 5:30 PM` when the original is in the same Sunday-to-Saturday week as the new date, and `Moved from Tue Oct 13, 5:30 PM` otherwise.
- AC6: The month comes from `?month=YYYY-MM`. Absent or invalid gives the current month in America/Toronto. The previous and next links point at exactly one month back and forward, across year ends.
- AC7: Sunday-first weeks covering the whole month. Adjacent-month days are muted and carry no classes. Under 640px each day cell is a button with the day number and one dot per class, ordered by start time, at most 3 and then `+N`. Each dot carries `data-state` and is toned by state, never by course. The cell's accessible name holds the full date and the state word of every class that day, or "no classes". Tapping a day shows that day's classes under the grid. The selected day starts as today when today is in the shown month, and as none otherwise.
- AC8: From 640px each day cell shows full blocks with time, course code and teacher first name, tinted by state and carrying `data-state`. Cancelled blocks are struck through and muted. The dots are hidden.
- AC9: "This week" lists the classes of the Sunday-to-Saturday week that contains today (independent of the month shown) with day, time, course code, teacher first name and the state pill. The moved note sits under a Moved row. Cancelled rows are struck through and muted. No classes gives "No classes this week."
- AC10: A child whose `notion_student_id` is null, or who has no `class_series` row, sees "Schedule not available yet" and no grid, summary or week list. The legacy schedule text is never read on this path.
- AC11: Teacher first names come from the cached Notion Staff list (`getStaffList`), reduced as `greetingName`. Only names for staff in the shown classes reach the client. If the Staff list fails, or an ID is missing, the class shows "Teacher", a single notice says "Teacher names could not load." (on failure only), and the page still renders.
- AC12: A failed class read shows "Could not load classes. Try again later." and no grid, summary or empty state.
- AC13: A parent sees only their linked child's classes (RLS, proven in e2e).
- AC14: The calendar files read no Lessons, Payouts, invoice or billing source, call no store method other than `listSeriesForStudent`, make no write call, call no Notion URL directly, use no service-role client, and do not log (source scan). While the parent browses, no Notion request names the Lessons source and no tracker table changes (e2e, REQ-9 checks reused).
- AC15: No input, textarea or select, and no horizontal scroll at 375px.
- AC16: Tracker ADR 0047 records the makeup rule, the not-available rule, the state tones, the week start and the loading behaviour, and is listed in the decisions README.
- AC17: While a month switch is in flight, the pressed switcher link has `aria-busy="true"` and the month label shows "Loading". The previous month stays visible until the new one replaces it.

## Approach
- Pure domain `apps/tracker/lib/domain/schedule/month.ts`: `monthRange`, `shiftMonth`, `parseMonth`, `sundayWeekOf`, `classState`, `buildMonth` (over `expandOccurrences`).
- View text `apps/tracker/lib/view/calendar-text.ts`: `STATE_LABEL`, `STATE_TONE`, `summaryLine`, `movedNote`, `clock`, `monthLabel`, `dayLabel`, `teacherFirstName`, `dayDots`, `cellLabel`.
- Data `apps/tracker/lib/data/parent-calendar.ts` (`server-only`): `loadChildCalendar(viewer, child, store: Pick<ScheduleStore, "listSeriesForStudent">)` and `teacherNames(staffIds, loadStaff)`.
- Page `app/parent/[studentId]/calendar/page.tsx` replaces the placeholder; client component `components/parent-calendar.tsx` holds the selected day; month links are `next/link` with `prefetch={false}` and a `useLinkStatus` child for the pending state. No `loading.tsx`.
- Guardrail list `apps/tracker/test/parent-guardrails.ts` (`PARENT_FORBIDDEN`), scanned by `apps/tracker/lib/parent-guardrails.test.ts`.
- e2e: `LESSONS_RE` hoisted in `e2e/tracker/flows.mjs` and reused with `snapshot()`.

## Migration
None. Reads `tracker.students`, `tracker.class_series` and `tracker.class_exceptions` under the 0016 parent select policies.

## Test plan
| Test | Type | Covers |
|---|---|---|
| `month.test.ts`: weekly dates, one-off, ended/future series, states, moved in/out, summary counts, Sunday weeks, This week across a month boundary, `parseMonth`, `shiftMonth` | unit | AC1-AC4, AC6, AC7, AC9 |
| `calendar-text.test.ts`: summary line, moved note, clock, month label, teacher first name, `dayDots`, `cellLabel`, no em-dash | unit | AC4, AC5, AC7, AC11 |
| `parent-calendar.test.ts`: not_available, error, pass-through; `teacherNames` keeps only given IDs, failure flag | unit | AC10-AC12 |
| `parent-guardrails.test.ts`: `PARENT_FORBIDDEN` and store method scan | unit | AC10, AC14 |
| e2e 375px: seeded Ada (four states today) and Cy (Kuby SCH4U); summary, This week, today's cell dots and label, tap list, no SCH4U or Kuby, switcher, no inputs, no scroll | e2e | AC2, AC4, AC6, AC7, AC9, AC11, AC13, AC15 |
| e2e journal and `snapshot()` | e2e | AC14 |
| e2e 720px blocks, tints, line-through | e2e | AC8 |
| e2e held next-month request: `aria-busy`, "Loading", grid still visible | e2e | AC17 |
| e2e revoke select on `class_exceptions`: error state, then re-grant in `finally` | e2e | AC12 |
| e2e Di (no `notion_student_id`): "Schedule not available yet" | e2e | AC10 |
| ADR and README index | review | AC16 |

## Decisions (approved defaults)
1. No new dependencies. 2. No migration. 3. Makeup = any scheduled occurrence of a `one_off` series; a moved one-off is Moved. 4. Not adopted = null `notion_student_id` or zero `class_series` rows. 5. Tones: Scheduled ok, Moved warn, Makeup neutral, Cancelled error pill with struck, muted text. 6. Sunday week start. 7. Server component plus `?month=` links. 8. `sm` (640px) breakpoint. 9. Cancelled excluded from the counts; Done = end time passed. 10. 12h time. 11. Child header with first name, last initial and grade. 12. Teacher first names via `greetingName`, shown classes only. 13. ADR 0047. 14. Page returns early for an unpublished child. 15. `useLinkStatus`, no `loading.tsx`. 16. One shared forbidden list. 17. `prefetch={false}`. 18. e2e fault by revoking `select` on `class_exceptions`.
