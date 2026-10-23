# Design: REQ-58: Console 8/12: Operations mode, teacher load and lesson-log gaps

## Changes from last version

- Approver comment, item 1 (roster never applies `isActiveTeachingStaff`): the base roster is now defined as staff for whom `isActiveTeachingStaff` (`apps/tracker/lib/domain/staff.ts`) is true. The field is `PeopleSnapshot.staff[].active` from `createConsolePeopleReader` (`apps/tracker/lib/console/people-read.ts`), which is `tracker.staff.active && archived_at === null`; the people sync writes `tracker.staff.active` as `isActiveTeachingStaff(rec)` over the Notion Status and Function (`apps/tracker/lib/notion/staff.ts` line 140, tracker ADR 0055). The new pure `teacherRoster` in `operations.ts` applies `isActiveTeachingStaff` to each snapshot row through the same mapping as `toStaffRecord` in `lib/data/people.ts`, so the filter is the function itself, not a re-implementation. See AC9, Approach 1 and 3, Decision 10.
- Approver comment, item 2 (C1, active non-teaching staff could be listed): an active non-teaching staff member (for example Status Active, Function Setter or Closer only) is stored with `active = false` and is excluded from the roster when they have no class and no availability in the read range. New `operations.test.ts` rows prove it, plus the case where such a person does hold a class (listed, flagged "Not active teaching staff", so load is never hidden).
- The flag text "Inactive in Notion" becomes "Not active teaching staff", because `active = false` also covers active people with no teaching function.

**Summary:** Operations mode on `/tracker/console?mode=operations` stops saying "Not connected yet" in three panels. **Teacher load** shows, for each teacher, scheduled, delivered and available minutes for the current and next Toronto week. **Upcoming classes** is a new slot listing the next 7 days with purpose badges and moved or cancelled state. **Lesson log gaps** lists ended classes with no outcome row, each with its occurrence key, a next action and a deep link, plus no-shows in a separate list. Every number comes from the scheduler tables on the owner's own client, and Notion Lessons is read only through the existing lessons port. The Sales "Teacher load" capacity gauge shows the same data as an org total.  
**Risk:** Medium. This is owner-only UI and reads over tables that existing owner RLS already covers (`class_series`, `class_exceptions`, `availability_windows`, `availability_exceptions`, `occurrence_outcomes`, `staff`, `student_people`), plus a read-only call to the existing Lessons port. There is no schema, auth, permission or write change, and no file under `apps/tracker/lib/notion/` changes.

## Problem

Charlie (org owner) needs one screen that answers three operations questions without opening the scheduler page by page:

- How loaded is each teacher against the hours they entered?
- What runs in the next week?
- Which classes have happened but were never logged?

The slots exist: `operations.teacherLoad`, `operations.lessonGaps` and `sales.capacity` in `apps/tracker/lib/console/panel-slots.ts`. The bridge renders any `PanelView` (`apps/tracker/components/console/shell/bridge.tsx`). The domain functions exist: `expandOccurrences` (`lib/domain/schedule/recurrence.ts`), `computeAvailability` (`availability.ts`), `weekOf` and `weekTotals` (`week.ts`), and `reconcile`, `isLinkable` and `occurrenceRef` (`lesson-link.ts`).

Two pieces are missing:

- A console read path that fails loudly. `createScheduleStore.listSeries` and `listWindows` in `lib/data/schedule.ts` drop query errors and return empty arrays. `loadUnlinked` in `lib/scheduler/lesson-handlers.ts` runs `requireScheduler`, which calls `claim_staff_link` and needs Notion, a side effect tracker ADR 0053 and workspace ADR 0006 keep out of owner read pages.
- The pure aggregation that turns rows into panels.

Spec sections 3.4 and 3.5 of `docs/spec/founder-console/02-data-contracts.md` name this card as the owner of both domains. Teachers, students and parents see nothing new.

## Acceptance criteria

- [ ] AC1: Teacher load excludes cancelled occurrences. It shows scheduled and delivered minutes as two separate numbers. Delivered counts only occurrences whose `occurrence_outcomes` row is `delivered` with a `notion_lesson_id`. A past occurrence with no outcome row, or with a `no_show` row, counts as scheduled and not delivered. Delivered is shown for the current week only, and the next-week column shows no delivered figure.
- [ ] AC2: A teacher with no availability rows at all shows "availability not entered", no percentage and a link to `/tracker/schedule/availability?staffId=<id>`. A teacher with availability shows "X of Y h (P%)", where X is `availableMinutes - remainingMinutes` and Y is `availableMinutes` from `weekTotals`. A teacher whose entered availability totals 0 minutes that week shows "0 h available" and no percentage. Classes outside availability appear as "N h outside availability" with a link to `/tracker/schedule/conflicts`, never as a duplicated conflict list.
- [ ] AC3: Lesson gaps lists only occurrences that are not cancelled, have `date <= today` and `endsAt <= now`, and have no outcome row, inside the gap window. Each row carries its occurrence key `sched:<seriesId>:<originalDate>`, the teacher, the student, the subject, the next action ("Log" or "Link existing lesson") and the end time. The row deep-links to the week view (`/tracker/schedule?date=<date>&staffId=<staffId>`) or, for "Link existing lesson", to the Unlinked lessons page (`/tracker/schedule/lessons?from=<from>&to=<to>`). `no_show` occurrences never appear as gaps. They appear in a separate "No-shows" list, and the gap count excludes them.
- [ ] AC4: An occurrence moved inside the read range appears once, on its new date, under its original key. One moved out of the range does not appear. A split series (old row `effective_until = D-1`, new row starting D) gives one occurrence per date and the minutes are not double counted. A series past its `effective_until` produces nothing.
- [ ] AC5: Teacher load, Lesson log gaps, Upcoming classes and the Sales capacity gauge each render loading, empty, stale and error variants, and each has a canonical link in its header in every status. A failed outcomes read leaves teacher load showing scheduled and available minutes, with status `stale` and the reason "Delivered minutes unavailable", and makes only lesson gaps `error`. A failed availability read shows "availability unavailable" (never "not entered" and never 0%) with status `stale`. A failed schedule read makes these four panels `error` and leaves every other console panel as it was.
- [ ] AC6: When the Lessons port reports `lessons_not_ready`, the Lesson log gaps panel is `error` with the message "Lessons is missing Class occurrence" (spec 3.5) and lists no rows. When Notion is not configured, the panel is `error` with "Notion is not configured". Any other Lessons failure keeps the gaps listed with status `stale`, the reason "Lesson candidates unavailable", and next action "Review", which links to the Unlinked lessons page. Teacher load and Upcoming classes are unaffected in all three cases.
- [ ] AC7: Upcoming classes lists occurrences with `date` from today to today + 6 and `endsAt > now`, in start order. Each row has a purpose badge: "Regular" for weekly, otherwise "Trial", "Makeup" or "Extra" from `purpose`, and "One-off" when purpose is null. A moved row says "Moved from \<original date>". A cancelled row stays in the list marked "Cancelled".
- [ ] AC8: `?gapDays=N` with N from 1 to 31 sets the gap window to the N days ending today (Toronto). Anything else gives 14. The panel shows its window and a link to the other preset (14 or 31). `?mode=` and REQ-56's `?week=` keep working alongside it.
- [ ] AC9: The base teacher roster is every staff row in the people snapshot for which `isActiveTeachingStaff` is true (Status Active or Onboarding and a Teacher or Trial Teacher function, as stored in `tracker.staff.active` by the people sync, with archived rows never active). The roster then adds any staff id that has a class or availability in the read range. A staff member in that second group who is not active teaching staff is listed with "Not active teaching staff". An active non-teaching staff member (for example Function Setter only) with no class and no availability in the range is not listed. When the people read fails, the roster comes from series and availability ids, names show "Unknown teacher", and the status is `stale` with the reason `names_unavailable`. When the people read fails and no series or availability exist, the panel is `unverifiable` ("Teacher roster unavailable"), never "No teachers active".
- [ ] AC10: The health route still reports exactly the six REQ-54 providers, and the people snapshot is read once per page load (shared with the facade).
- [ ] AC11: No console file added by this card writes. A source scan finds no `.insert(`, `.update(`, `.delete(`, `.upsert(`, `rpc(` or lessons-port write method (`createLesson`, `linkLesson`, `unlinkLesson`) in them.

## Approach

**1. Pure aggregation (new): ****`apps/tracker/lib/domain/schedule/operations.ts`****.** It does no I/O and imports nothing outside `lib/domain` (the rule `lib/domain/boundaries.test.ts` enforces). All id comparisons use `normalId` (`lib/domain/billing.ts`).

```ts
export type OutcomeFact = { seriesId: string; originalDate: string; outcome: "delivered" | "no_show"; notionLessonId: string | null };
export type StaffAvailability = { staffId: string; windows: AvailabilityWindow[]; exceptions: AvailabilityException[] };
export type WeekLoad = {
  from: string; to: string;
  scheduledMinutes: number;
  deliveredMinutes: number | null;          // current week only; null when outcomes unknown or week not current
  availability: "entered" | "not_entered" | "unknown";
  availableMinutes: number | null; insideMinutes: number | null; outsideMinutes: number | null;
  utilisation: number | null;               // insideMinutes / availableMinutes, only when availableMinutes > 0
};
export type TeacherLoadRow = { staffId: string; weeks: [WeekLoad, WeekLoad] };
export function teacherLoad(input: {
  staffIds: string[]; occurrences: Occurrence[]; current: { from: string; to: string }; next: { from: string; to: string };
  availability: StaffAvailability[] | null; outcomes: OutcomeFact[] | null; now: Date;
}): TeacherLoadRow[];

export type GapRow = { key: string; occurrence: Occurrence; nextAction: "log" | "link" | "review"; candidates: number | null };
export function lessonGaps(input: {
  occurrences: Occurrence[]; window: { from: string; to: string }; today: string; now: Date;
  outcomes: OutcomeFact[]; lessons: LessonRow[] | null;
}): { gaps: GapRow[]; noShows: Occurrence[]; pendingLogs: number };

export type UpcomingRow = { occurrence: Occurrence; badge: "regular" | "trial" | "makeup" | "extra" | "one_off" };

export type RosterEntry = { staffId: string; teaching: boolean };
export function teacherRoster(input: {
  staff: { id: string; active: boolean }[] | null;   // PeopleSnapshot.staff, null when the people read failed
  occurrences: Occurrence[]; availability: StaffAvailability[] | null;
}): RosterEntry[];
export function upcomingClasses(input: { occurrences: Occurrence[]; today: string; now: Date }): UpcomingRow[];
```

Rules:

- **teacherLoad.** Per staff id and per week, call `weekTotals(occurrencesOfStaffInWeek, computeAvailability(windows, exceptions, week))`. Then:
  - `scheduledMinutes` is its `scheduledMinutes`, so cancelled is excluded and a move counts on its new date.
  - `insideMinutes = availableMinutes - remainingMinutes`, and `outsideMinutes = max(0, scheduled - inside)`.
  - `availability` is `unknown` when the availability input is null (read failed). In that case every availability figure is null.
  - `deliveredMinutes` covers the current week only, from occurrences with `endsAt <= now`, not cancelled, whose outcome is `delivered` with a non-null `notionLessonId`. It is null when outcomes is null.
  - Rows are sorted by staff id. The panel builder sorts by name.
- **lessonGaps.** Linkable means `isLinkable(o, today) && Date.parse(o.endsAt) <= now.getTime()` with `o.date` in the window.
  - Run `reconcile(linkable, outcomes, lessons ?? [])`.
  - Each `unlinked` entry becomes a gap with `key = occurrenceRef(o)`. Its next action is `link` when it has candidates, `log` when it has none, and `review` with `candidates: null` when `lessons` is null.
  - `noShows` are linkable occurrences whose outcome is `no_show`. `pendingLogs` counts `delivered` outcomes with a null `notionLessonId`, which are neither a gap nor delivered (a log in progress or a stalled claim; the week view resumes it).
  - Gaps are sorted oldest end time first.
- **teacherRoster.** `teaching` for a snapshot row is `isActiveTeachingStaff({ status: row.active ? "Active" : "Inactive", functions: row.active ? ["Teacher"] : [] })`, the same mapping `toStaffRecord` uses in `lib/data/people.ts`, imported from `lib/domain/staff.ts` (inside `lib/domain`, so the boundary rule holds). The base set is the snapshot rows with `teaching` true. Every `staffId` on a non-cancelled occurrence or an availability window or exception in the read range is added with `teaching` from its snapshot row, or false when it has none. Ids are compared with `normalId` and listed once. A snapshot row with `teaching` false and no class or availability is never in the output. When `staff` is null, the output is only the ids from occurrences and availability, each with `teaching` false.
- **upcomingClasses.** Occurrences with `today <= date <= addDays(today, 6)` and `endsAt > now`, cancelled included, sorted by `startsAt`. The badge is `regular` for weekly, otherwise `purpose ?? "one_off"`.

**2. Console reads (new): ****`apps/tracker/lib/console/operations-read.ts`****.** `createOperationsReader(viewer: OwnerViewer)` works on `viewer.db.tracker` (RLS decides), parses every row with Zod (ADR 0017), and throws on any query error, so a failure never looks like "no classes". Methods:

- `schedule(range)` reads `class_series` (`eq("org_id", orgId)`, `lte("start_date", to)`, `or(effective_until.is.null, effective_until.gte.<from>)`) and `class_exceptions` (`org_id`, original or new date in range), plus the extra series that reach the range only through a move, the same three-step logic as `listSeries` in `lib/data/schedule.ts`. It returns `{ series: ClassSeries[], exceptions: ClassException[] }`. The Zod row shapes are copied from `lib/data/schedule.ts`, which is not edited.
- `availability(range)` reads `availability_windows` (org) and `availability_exceptions` (org, `on_date` in range), grouped into `StaffAvailability[]`.
- `outcomes(keys)` calls `createOutcomeStore(() => ({ db: viewer.db, orgId, userId }))` and then `listForOccurrences(keys)`, which already throws on error. No new method goes into `lib/data/outcomes.ts`.
- `unlinkedLessons(range, signal)` returns `{ ok: false, code: "not_configured" }` when `readLessonsConfig()` is null. Otherwise it calls `createLessonsPort(config, bound(signal)).listUnlinkedLessons(range)`, using the same abort-bound fetcher as `providers.ts`. A `LessonLinkError` with code `lessons_not_ready` maps to `code: "lessons_not_ready"`, and any other error maps to `code: "failed"`.

**3. Panel builder (new): ****`apps/tracker/lib/console/operations.ts`****.** `loadOperationsPanels({ reader, people, now, gapDays, orgId, freshness, timeoutMs })` returns `{ teacherLoad, lessonGaps, upcoming, capacity }` as `PanelView`s. It never throws.

- **Dates.** `today = todayIso(now)`, `current = weekOf(today)`, `next = { from: addDays(current.from, 7), to: addDays(current.to, 7) }`, `gapWindow = { from: addDays(today, -(gapDays - 1)), to: today }`, and `range = { from: min(gapWindow.from, current.from), to: next.to }`, at most 44 days.
- **One expansion.** `expandOccurrences(series, exceptions, range)` runs once and is filtered per panel. Filtering after expansion is safe because moved and cancelled inclusion depends only on the range bounds.
- **Read order.** `schedule`, `availability`, `unlinkedLessons` and `people()` start together, each through `withTimeout` with `TUNING.consoleProviderTimeoutMs`. Then `outcomes` runs over the non-cancelled occurrences dated in the current week up to now, plus those in the gap window.
- **Status precedence per panel:** error, then unverifiable, then stale, then empty or ready. Stale reasons are joined with `"; "` as in the facade.
  - **teacherLoad**
    - error: the schedule read failed.
    - unverifiable: the people read failed and the roster is empty (AC9).
    - stale: availability failed, outcomes failed, people stale (`people_sync_stale`), or people failed (`names_unavailable`).
    - empty: the people read is ok and the roster is empty ("No teachers active").
    - Roster: `teacherRoster({ staff: people.ok ? people.value.staff : null, occurrences, availability })`, which is the `staffIds` passed to `teacherLoad`. A row with `teaching` false and a snapshot entry is flagged "Not active teaching staff"; one with no snapshot entry (people read failed, or a staff id the sync never saw) shows "Unknown teacher".
    - Data: one row per teacher with the name, a `notTeaching` flag, both `WeekLoad`s and the links.
  - **lessonGaps**
    - error: the schedule or outcomes read failed, or `unlinkedLessons` returned `not_configured` or `lessons_not_ready` (AC6). Data stays null, so no rows render.
    - stale: the lessons read `failed`, or there are name-join reasons.
    - empty: no gaps and no no-shows ("Nothing due").
    - `count` is the number of gaps.
  - **upcoming**
    - error: the schedule read failed.
    - stale: name-join reasons only.
    - empty: no rows ("No classes in the next 7 days").
    - Data: `QueueItem[]` with title `"<student> with <teacher>, <subject>"`, reason `"<Badge>"` plus `", moved from Tue 21 Oct"` or `", cancelled"`, due `"Wed 22 Oct 16:00"`, and href to the week view.
  - **capacity (Sales)** is a `GaugeData` of the org total for the current week: the sum of `insideMinutes` over the sum of `availableMinutes` across teachers whose availability is `entered`, in hours.
    - error: the schedule or availability read failed.
    - unverifiable: no teacher has availability entered ("Availability not entered").
    - stale: some teachers are left out ("N teachers without availability not counted").
    - empty: the roster is confirmed empty.
- **Lists.** Gap, no-show and upcoming lists are capped at `TUNING.consoleOperationsListCap` (new, 25), with an "N more" row linking to the canonical page.
- **Evidence and freshness.** `sourceEvidence` lists the tables read (and the Lessons data source id for gaps). `lastSuccessfulFetchAt` comes from `consoleFreshness` keys `${orgId}:operations.schedule` and `${orgId}:operations.lessons`, which hold times only, never rows. Every href is a full `/tracker/...` path rendered as a plain `<a>`, as REQ-56 does.

**4. Facade helpers: ****`apps/tracker/lib/console/facade.ts`****.** Export the existing private `withTimeout` and `messageOf` so the operations builder reuses the same timeout and failure text. `loadConsolePanels` does not change.

**5. Slots and layout.**

- `apps/tracker/lib/console/panel-slots.ts` gains `slot("operations", "upcoming", "list", "Upcoming classes", "No classes in the next 7 days")` after `lessonGaps`. The operations DOM order becomes teacherLoad, lessonGaps, upcoming, finance, trials, integrations.
- `apps/tracker/app/console/console.css` operations `grid-template-areas`:
  - 1440 px and up: `"teacherLoad lessonGaps finance" "teacherLoad lessonGaps trials" "upcoming upcoming upcoming" "integrations integrations integrations"`
  - 901 to 1439 px: `"teacherLoad lessonGaps" "upcoming upcoming" "finance trials" "integrations integrations"`
  - 641 to 900 px: `"lessonGaps lessonGaps" "teacherLoad upcoming" "finance trials" "integrations integrations"`
  - 640 px and below: one column in DOM order.

**6. Kit: canonical link.** `PanelFrame` in `apps/tracker/components/console/kit/instrument-panel.tsx` gains an optional `canonical?: { href: string; label: string }`, rendered as a plain `<a>` in the panel header for every status. That is how an error or unverifiable panel still points at the real page (AC5). `bridge.tsx` passes it from a new optional `canonical` on the `PanelView` the builder returns: `canonical?: { href; label }` added to `PanelView` in `lib/console/panel-view.ts`, optional, so existing callers are unchanged.

**7. Components (new).** Both wrap `InstrumentPanel` and add no new kit primitive. `bridge.tsx`'s `Instrument` renders them by slot id before the kind switch (the same pattern REQ-56 adds for `northStar`). `upcoming` and `capacity` use the existing `QueueList` and `Gauge`.

- `apps/tracker/components/console/teacher-load.tsx` renders a `<table>` (`<th scope>`) with a caption that gives both week ranges. Each row has the teacher, the current week (scheduled, delivered, availability readout) and the next week (scheduled, availability readout). Below 641 px each row stacks.

```javascript
TEACHER LOAD                               [Ready]   Open schedule
               This week (Mon 19 to Sun 25 Oct)      Next week (Mon 26 Oct to Sun 1 Nov)
Ryan M.        12 h scheduled, 6 h delivered         10 h scheduled
               12 of 20 h (60%)                      10 of 20 h (50%)
Ana P.         4 h scheduled, 2 h delivered          4 h scheduled
               availability not entered [Enter]      availability not entered
Lee K.         1 h scheduled, 0 h delivered          0 h scheduled
 Not active teaching staff   1 h outside availability [Conflicts]
Last checked 14:05
```

- `apps/tracker/components/console/lesson-gaps.tsx` renders a gap list as `QueueRow`s: title `"<student> with <teacher>, <subject>"`, reason `"Log"`, `"Link existing lesson (2 candidates)"` or `"Review"` with the key `sched:...` in a `<code>`, and due `"ended Tue 21 Oct 17:00"`. It also renders a "No-shows (N)" sub-list of the same shape without actions, a "N logs in progress" note when `pendingLogs > 0`, and the window line "Last 14 days. Show 31 days" (AC8).

States: loading is the kit skeleton. Empty prints the slot's empty text. Error is the kit `FailureState` with the verbatim message. Hours use `formatReadout(min / 60, { unit: "h" })` and the percentage is rounded to a whole number. Copy is plain with no em dashes, and no motion is added.

**8. Page wiring: ****`apps/tracker/app/console/page.tsx`****.** Next to REQ-56's facade call, use the same `deps` (REQ-56's `sharePeopleRead(createConsoleDeps(...))`):

- `parseGapDays(raw)` (new, in `lib/console/modes.ts` beside `parseMode`).
- `ops = await loadOperationsPanels({ reader: createOperationsReader(gate.viewer), people: deps.people, now, gapDays, ... })` runs alongside the facade.
- `panels.operations.teacherLoad`, `.lessonGaps` and `.upcoming`, and `panels.sales.capacity`, are set from `ops`. Every other slot keeps whatever REQ-56 and the other cards set, or "Not connected yet".

**9. Preview and docs.**

- `apps/tracker/test/console/demo-panels.ts` gains demo results for the four panels. Demo data stays in `test/`, which the existing scan enforces.
- `docs/designs/REQ-58.md` gets this design. The `docs/readiness.md` row, if one exists, is updated on ship.
- No ADR: the rules come from tracker ADR 0037 (`weekTotals`), ADR 0056 (lesson link) and spec sections 3.4 and 3.5, and the choices made here are the Decisions below.

## Migration

None. Every column read already exists (0010, 0019, 0022, 0023), and the owner reads it under the existing `tracker.is_org_owner` RLS.

## Test plan

| Test | Type | Covers |
| --- | --- | --- |
| `apps/tracker/lib/domain/schedule/operations.test.ts`, table-driven. **teacherLoad:** cancelled excluded; moved into the week counts on the new date and moved out does not; split series counts each date once; `effective_until` ends output; delivered counts only `delivered` with a lesson id; `no_show`, a pending row and no row add nothing to delivered but stay scheduled; next week's delivered is null; outcomes null gives delivered null; availability `not_entered`, entered and summing to 0, entered with classes outside (inside, outside, utilisation); availability null gives `unknown`; a week containing 2026-11-01 (DST) keeps wall-clock dates. **lessonGaps:** a class today that has not ended is not a gap; a cancelled past class is not a gap; `no_show` goes to noShows; a pending delivered row counts in `pendingLogs`; next action `log`, `link` with candidate count, and `review` when lessons is null; key format `sched:<id>:<date>`; oldest first; a moved occurrence keyed by its original date. **upcomingClasses:** the 7-day bound, ended classes dropped, cancelled kept, every badge including `one_off`. **teacherRoster:** an Active Teacher row (snapshot `active` true) with no classes is listed with `teaching` true; an active non-teaching staff member (Status Active, Function Setter, stored `active` false) with no class and no availability in range is not listed; the same person with one class in range is listed with `teaching` false; an archived teacher (`active` false) with availability only is listed with `teaching` false; an id on a class with no snapshot row is listed with `teaching` false; ids differing only by dashes or case are listed once; `staff` null gives only class and availability ids. A guard test asserts `teacherRoster` calls `isActiveTeachingStaff` (spy via module mock) rather than reading `active` alone | unit (vitest) | AC1, AC2, AC3, AC4, AC7, AC9 |
| `apps/tracker/lib/console/operations.test.ts`, `loadOperationsPanels` with a fake reader. Schedule failure gives four `error` panels. Outcomes failure gives teacherLoad `stale` with "Delivered minutes unavailable", scheduled figures present, and lessonGaps `error`. Availability failure gives "unavailable", no percentage and capacity `error`. `lessons_not_ready` gives the exact message, `data` null, and teacherLoad and upcoming unchanged. `not_configured` gives "Notion is not configured". Lessons `failed` gives `stale` with Review rows. People failure with series gives "Unknown teacher" and `names_unavailable`, and without series gives `unverifiable`. Also covered: a non-teaching staff member with classes flagged "Not active teaching staff"; a snapshot holding one Active Teacher and one active Setter (no classes) renders one teacher row; capacity sums over entered teachers only, with the stale count; the list cap with an "N more" row; `sourceEvidence` and freshness keys; a timeout gives "Timed out after N s" | unit, integration | AC1, AC2, AC5, AC6, AC9 |
| `apps/tracker/lib/console/operations-read.test.ts`. A recording fake client asserts the filters (`org_id`, range, moved-in extras) and selected columns. An error on any query throws. Rows parse to domain types. Lessons not configured gives `not_configured`. A `LessonLinkError("lessons_not_ready")` maps by code, and any other error gives `failed`. The abort signal reaches the fetcher | unit | AC5, AC6 |
| `apps/tracker/lib/console/operations-scan.test.ts`. Source scan of `operations.ts`, `operations-read.ts` and the two components: no write calls (AC11), no import of `lib/scheduler/guard` or `identity`, and no `requireScheduler` | unit (scan) | AC11 |
| `apps/tracker/lib/console/modes.test.ts` additions. `parseGapDays`: missing, "abc", 0, 32 and "7.5" give 14; "1", "31" and an array give the first valid value | unit | AC8 |
| `apps/tracker/components/console/teacher-load.test.ts` and `lesson-gaps.test.ts` (renderToStaticMarkup, as `kit/kit.test.ts`). Covered: ready, stale, empty, loading, error and unverifiable variants; "availability not entered" with no `%` and the availability link; "X of Y h (P%)"; "0 h available" with no `%`; the outside-availability link to conflicts; no "0%" or "0 h delivered" when delivered is unknown; gaps show the key, next action and week-view href; no-shows in their own list and not counted; the window toggle link; the canonical link present in every variant | unit | AC1, AC2, AC3, AC5, AC6, AC8 |
| `apps/tracker/components/console/kit/kit.test.ts` addition. `canonical` renders an `<a>` in the header for ready, error and unverifiable | unit | AC5 |
| `apps/tracker/components/console/shell/bridge.test.ts` updates. `TOTALS.operations` goes to 6. The `teacherLoad` and `lessonGaps` slots render the new components and `upcoming` renders a list | unit | AC5, AC7 |
| `apps/tracker/lib/console/providers.test.ts` addition. `deps.people` is invoked once when both the facade and `loadOperationsPanels` read it | unit | AC10 |
| `e2e/tracker/flows.mjs` REQ-58, after the REQ-39 block (whose weekly class for Ryan and Sam leaves a logged class today, a no-show 7 days ago, a linked class 21 days ago, and none 14 and 28 days ago). The owner opens `/tracker/console?mode=operations&gapDays=31`. The Teacher load section has `data-status` ready or stale and lists Ryan's scheduled hours. The Lesson log gaps section lists `sched:<series>:<date-14>` and `<date-28>` and not `<date-7>`. The No-shows list contains the 7-days-ago class. Following a gap link answers 200 on `/tracker/schedule?date=...&staffId=...`. Upcoming classes shows the next weekly occurrence with "Regular". `?gapDays=14` lists no gaps from 28 days ago. The health route still has six providers. The builder runs `pnpm test:tracker` before the PR | e2e | AC3, AC7, AC8, AC10 |

## Out of scope

- No new scheduler, attendance logger or payout logic, and no writes of any kind. Logging, linking, no-show marking and availability entry stay on the existing scheduler pages, which the panels link to.
- No change to `apps/tracker/lib/notion/`, `lib/data/schedule.ts`, `lib/data/outcomes.ts` or `lib/scheduler/lesson-handlers.ts`.
- Trials and finance (REQ-59), integration health (REQ-62) and the other console slots.
- A new facade provider or any change to the health route.
- Duplicate-link detection (`reconcile`'s `doubles`). It stays on the Unlinked lessons page.

## Risks and edge cases

- **Lessons is not ready live** (spec 3.5, observed 2026-10-21). In production the gaps panel is `error` "Lessons is missing Class occurrence" until the property is added. Teacher load and upcoming still work, because they never read Lessons.
- **Stalled log claims.** A `delivered` row without a lesson id is neither a gap nor delivered. The "N logs in progress" note keeps it visible, and the week view resumes it (`planLog` resume).
- **Moved classes and keys.** The key always uses the original date (`occurrenceRef`), so the gap row matches the outcome row and the Notion ref even when the class moved.
- **Large weeks.** One series read over at most 44 days (inside `loadWeek`'s 92-day cap), and lists capped at 25 rows with an "N more" link.
- **Time zone.** Every date is a Toronto wall-clock string (`todayIso`, `weekOf`). "Ended" compares instants (`endsAt` against now), so DST weeks behave (test).
- **Shared files with REQ-56, REQ-57, REQ-59 and REQ-60.** `page.tsx`, `bridge.tsx`, `panel-slots.ts`, `console.css` and `modes.ts` take small additive edits. This card builds after REQ-56 (Building), whose `sharePeopleRead` and page wiring it reuses. If REQ-56 is not on main when this card builds, the builder waits or rebases rather than duplicating it.
- **Roster drift.** Staff names come from the people copy, which can be up to 120 minutes stale. The panel says `people_sync_stale` and never hides a teacher who has classes.

## Decisions for approval

| # | Decision | Options | Default if you say nothing |
| --- | --- | --- | --- |
| 1 | New dependencies | None | None. |
| 2 | Schema placement and numbers | Migration; tracker or workspace ADR | No migration and no ADR, so no number is reserved. The rules come from tracker ADR 0037 and 0056 and spec 3.4 and 3.5, with the choices recorded here and in `docs/designs/REQ-58.md`. |
| 3 | Schedule read path | New throwing reader `lib/console/operations-read.ts`; `createScheduleStore` as spec 3.4 names it | New reader. `listSeries` and `listWindows` drop query errors, which would show "no classes" on failure, against spec 3.4's "query error gives error". `lib/data/schedule.ts` is not edited. |
| 4 | Outcomes read | Reuse `createOutcomeStore().listForOccurrences(keys)`; add a list-by-range method to `lib/data/outcomes.ts` | Reuse. It already throws on error and handles moved keys. No new method. |
| 5 | Notion Lessons read, against the card's "no Notion reads" line | Read through the existing `createLessonsPort.listUnlinkedLessons`, read-only; no Lessons read (every gap "Log", no `lessons_not_ready`) | Existing port, read-only. The card's own gap requirement names `lessons_not_ready` and "link an existing lesson", which only the Lessons read can give. No file in `lib/notion/` changes. The "no Notion reads" line is taken to mean no new Notion reader. |
| 6 | `lessons_not_ready` state | `error` with "Lessons is missing Class occurrence" (spec 3.5); `unverifiable` | `error`, per spec 3.5, with no rows ("offers nothing else"). |
| 7 | What counts as delivered | `delivered` with a `notion_lesson_id`; any `delivered` row | With a lesson id. Pending claims are counted as "logs in progress", neither delivered nor a gap. |
| 8 | Delivered for next week | Current week only; both weeks | Current week only, because a future week has nothing delivered and showing 0 would read as a fact. |
| 9 | Utilisation formula | Minutes inside availability over available (ADR 0037 `remainingMinutes`); scheduled over available | Inside over available, at most 100%. Classes outside availability show as "N h outside availability" with a conflicts link, so nothing is hidden or double counted. |
| 10 | Roster | Staff where `isActiveTeachingStaff` is true (snapshot `active`, set by the people sync from Status and Function) plus anyone with classes or availability in range, others flagged; `isActiveTeachingStaff` only | `isActiveTeachingStaff` base plus anyone with classes or availability, flagged "Not active teaching staff", so load is never invisible. Active non-teaching staff with nothing in range are excluded. |
| 11 | Upcoming classes placement | New `operations.upcoming` slot (list kind) with the grid areas above; inside the teacher load panel | New slot. The operations total goes from 5 to 6 (`bridge.test.ts`). |
| 12 | Upcoming contents | Include cancelled (marked) and today's not-yet-ended classes; one-off with null purpose badged "One-off" | As written. The card lists four badges, and "One-off" covers rows written before purpose existed (0019). |
| 13 | Gap window control | `?gapDays=` from 1 to 31, default 14, with a 14 or 31 toggle; a fixed 14 days | Query param and toggle ("owner-configurable up to 31"). |
| 14 | "Ended" rule for gaps | `isLinkable` and `endsAt <= now`; `isLinkable` alone (date today or earlier) | Ended only, per the card ("whose end time has passed"). The week view still lets a teacher log a class earlier the same day. |
| 15 | "Source timestamp" per gap | The occurrence's end time on each row, plus the panel's last fetch time; the series' `updated_at` | End time per row, fetch time in the freshness line. |
| 16 | Sales "Teacher load" capacity slot | Fill it with the org-total gauge from the same read; leave it "Not connected yet" | Fill it. It is the same data and the same slot title, so leaving it would show two answers to one question. |
| 17 | Canonical link | New optional `canonical` on `PanelFrame` and `PanelView`, a header `<a>` in every status; a link inside each panel body | Header link. AC5 requires it in error and unverifiable too, where the body is replaced. |
| 18 | Facade provider | Separate builder called by the page; new facade providers | Separate builder. The health route keeps the six providers REQ-54 and e2e pin. |
| 19 | Timeout and failure text | Export `withTimeout` and `messageOf` from `facade.ts`; copy them | Export (two keywords, no behaviour change). |
| 20 | List cap | `TUNING.consoleOperationsListCap = 25` with "N more"; no cap | 25 with "N more". |
| 21 | Link targets | `/tracker/schedule?date&staffId`, `/tracker/schedule/availability?staffId`, `/tracker/schedule/conflicts`, `/tracker/schedule/lessons?from&to`; the card's "/tracker/scheduler views" | The `/tracker/schedule` paths: the week, availability, conflicts and unlinked pages live under `app/schedule/` (`/tracker/scheduler` holds billing, schedules and setup only). |
| 22 | Preview | Add demo results for the four panels to `test/console/demo-panels.ts`; leave placeholders | Add them (test data only). |
| 23 | Build order | After REQ-56 merges, reusing its `sharePeopleRead` and page wiring; independently | After REQ-56. Its card is Building, and this card's AC10 relies on the shared people read. |

## Build notes

- **Built on REQ-56's branch.** Decision 23 makes this card build after REQ-56, reusing its `sharePeopleRead` and page wiring. REQ-56 (#117) was not on `main` when this card was built, so the branch is based on `req/REQ-56-north-star` and the PR targets that branch; GitHub retargets it to `main` when #117 merges.
- **Lessons port built in `providers.ts`.** Approach 2 had `operations-read.ts` call `readLessonsConfig()` and `createLessonsPort` itself. The REQ-54 console scan (`lib/console-scan.test.ts`) allows only `providers.ts` to import from `lib/notion/`, so `providers.ts` gains `createOperationsLessons()` (read-only, `listUnlinkedLessons` only, same abort-bound fetcher) and the reader takes it as a port. Same behaviour, scan rule kept.
- **Roster read range.** `teacherRoster` takes the read range, so an availability window that ended before it, or a class outside it, does not add someone to the roster (AC9 "in the read range").
- **Grid at 1280 to 1439 px.** The stylesheet has a separate 1280 to 1439 block; it uses the design's 901 to 1439 layout.
- **e2e fixture.** The REQ-39 weekly class starts 21 days ago, so there is no class 28 days ago: the e2e checks the class 14 days ago is a gap with `gapDays=31` and drops out with `gapDays=14` (AC8), and the no-show 7 days ago is listed apart.
