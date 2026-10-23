# Founder Console: data contracts

Card: REQ-52 (Console 1/12). Placement and the owner gate:
[workspace ADR 0006](../../adr/0006-founder-console-placement.md). Design:
[`docs/designs/REQ-52.md`](../../designs/REQ-52.md).

## 1. Header and method

- **Repository:** `main` at `b3f45e5` (2026-10-21), plus this branch.
- **Notion fetch:** 2026-10-21, Notion MCP `fetch` of each data source below.
  Property names, types and select options in this file come from that fetch,
  never from the handoff pack or `01-discovery.md`. Example of the
  difference: Touches has a title property `Touch`, which discovery omits, and
  the live Lessons schema has no `Class occurrence` property although
  discovery and REQ-39 assume one (section 3.5).
- **Personal data:** this file holds schema (property names, types, options),
  ids of data sources and of pages that are not people, and counts. It holds
  no row values: no names, notes, phone numbers, emails or amounts.
- **Join rule:** by Notion page id, normalised to the dashed lower-case form
  as `normalId` in `apps/tracker/lib/domain/billing.ts` does, never by name.
- **Clock:** America/Toronto (`SCHEDULE_TIME_ZONE` and `todayIso` in
  `apps/tracker/lib/time.ts`).
- **Property lookup:** an adapter looks a property up by name and then uses
  its id, as `apps/tracker/lib/notion/students.ts` does for its three
  properties and `schemaLookup` in `apps/tracker/lib/notion/billing.ts` does. A missing
  property fails the panel to `error`, never to a guess.
- **Which files may call Notion:** the source scan in
  `apps/tracker/lib/notion/students.test.ts` lists exactly the files under
  `apps/tracker/lib/notion/` that call `api.notion.com`, and forbids
  `students.ts` from naming `Owner` or `Trial Teacher`. A new console reader
  goes in a new file under `apps/tracker/lib/notion/` and extends that list
  in the same PR. Every file there is a `human_merge_paths` entry.

## 2. Panel status vocabulary

Every console panel returns one of these statuses with its source ids and its
last successful fetch time. They map onto the four columns of
[`handoff/PANEL_STATES.md`](handoff/PANEL_STATES.md):

| Status | Meaning | PANEL_STATES column |
| --- | --- | --- |
| `ready` | every source read completed; the value is shown | Loaded |
| `empty` | every source read completed and returned nothing to show | Empty |
| `loading` | a read is in flight; no value is shown, never a zero | Loading |
| `stale` | the last good value is shown with its fetch time; a newer read failed or the local copy is older than its threshold | Error / stale |
| `error` | no usable value; the reason and a retry are shown | Error / stale |
| `unverifiable` | the value exists but cannot be proved (the north star without Invoices) | Error / stale |

Rules: `empty` only when the read completed. Unknown is never shown as zero.
One failed provider never blanks another panel.

## 3. Domains

### 3.1 Leads and funnel stage

- **Authority:** Notion Students & Parents, under the OPS SYSTEM rule "a lead
  is a Student row with Stage = New" (section 4).
- **Source:** Notion data source `fe3d651a-70c6-4d1e-8a38-656163d6bc63`
  (default `DEFAULT_STUDENTS_DATA_SOURCE_ID` in
  `apps/tracker/lib/notion/config.ts`). Local copy of name and stage:
  `tracker.student_people` (`supabase/migrations/0022_people_sync.sql`).
- **Fields (live, 2026-10-21):**
  - `Student Name` (title).
  - `Stage` (select: New, Working, Trial Booked, Trial Claimed, Awaiting
    Close, Onboarding, Active, Paused, Lost; legacy Trial, Churned).
  - `Owner` (relation to Staff), `Next Action` (select: Call, Text, Book
    trial, Deliver trial, Close call, Rebook trial, Assign teacher, Schedule
    first lesson, None), `Next Action Due` (date), `Attempts` (number),
    `Last Contact` (date).
  - `Source` (select: Meta form, Website, Referral, Other), `Lead ID` (text,
    dedupe only, never shown), `Lost Reason` (select: No answer (cold), Not
    interested, Wrong number, Do not contact, Duplicate, Trial no-show, Closed
    lost, Churned).
  - Milestones (date): `Contacted At`, `Trial Booked At`, `Trial Attended
    At`, `Closed At`.
  - Contact (shown only as deep links, never copied): `Parent Name` (text),
    `Parent Phone` (phone_number), `Parent Email` (email).
  - `Touches` (relation to Touches), `Invoices` (relation to Invoices).
  - `student_people` columns: `org_id`, `notion_student_id`, `name`,
    `stage`, `active`, `synced_at`, `archived_at`.
- **Adapter today:** `fetchStudentPeople` and `ACTIVE_STUDENT_STAGES`
  (`["Active", "Onboarding"]`) in `apps/tracker/lib/notion/students.ts`;
  `createPeopleStore` in `apps/tracker/lib/data/people.ts`. Both read only
  name and stage. `undiscovered` for every other field above:
  `grep -rn "Next Action" apps/tracker/lib apps/tracker/app` and
  `grep -rnE "Last Contact|Lost Reason|Contacted At" apps/tracker/lib` print
  nothing.
- **Console read path:** names and stage from `student_people` through
  `viewer.db`; the lead fields from a new reader file (section 1, "Which files
  may call Notion") that REQ-54 adds.
- **Freshness:** the local copy is as fresh as the last `ok` row in
  `tracker.sync_runs` (`peopleStaleMinutes: 120` in
  `apps/tracker/lib/domain/tuning.ts`). Lead fields are live reads.
- **Failure state:** Notion read fails → `error` with the last successful
  fetch time; people sync older than 120 minutes → `stale`.
- **Owner card:** REQ-54 (reader), REQ-57 (panel).
- Count on 2026-10-21: 25 rows, 2 with Stage = New.

### 3.2 Touches

- **Authority:** Notion Touches, written through the "Log a Touch" form.
- **Source:** Notion data source `772939bd-bd88-4272-9f1f-20ce75ef2204`.
- **Fields (live):** `Touch` (title), `Type` (select: Call, Text, Close call,
  Note), `Outcome` (select: No answer, Contacted, Trial booked, Follow-up, Not
  interested, Do not contact, Wrong number, Won, Lost), `Student` (relation
  to Students & Parents), `Staff` (relation to Staff), `Note` (text), `When`
  (created_time).
- **Adapter today:** `undiscovered`. Not configured anywhere:
  `grep -rn "772939bd" apps packages` prints nothing.
- **Console read path:** a new reader file (REQ-54), filtered on `Student`.
- **Freshness:** live read.
- **Failure state:** `error`; the lead panel still shows the lead fields from
  section 3.1.
- **Owner card:** REQ-54 (read), REQ-61 (write).

### 3.3 Trials

- **Authority:** Notion Students & Parents trial fields; delivery evidence is
  a Lessons row with `Type = Trial` (handoff contract B, section 4) or a
  `tracker.occurrence_outcomes` row.
- **Source:**
  - Students & Parents `fe3d651a-70c6-4d1e-8a38-656163d6bc63`: `Trial Time`
    (date), `Trial Teacher` (relation to Staff), `Level` (select: Strong
    (90+), Solid (80 to 89), Gaps (70 to 79), Rebuild (below 70)), `Major
    Gaps` (text), `Recommended Plan` (select: 1-on-1 1x/wk, 1-on-1 2x/wk,
    Group, Intensive, Not a fit), `Trial Summary` (text).
  - Lessons `6300f58a-8b8c-4789-88c1-e44272079b0f`: `Type` (select: Lesson,
    Trial), `Trial: Diagnosis` (text), `Trial: Preferred Lesson Day`
    (multi_select: Mon to Sun, Did not say), `Date` (date), `Teacher`
    (relation to Staff), `Related to Students & Parents (Lessons 1)`
    (relation), `Duration (hrs)` (number), `Topic Covered` (text).
  - `tracker.class_series.purpose` (`'makeup'`, `'trial'`, `'extra'`, one-off
    only; `supabase/migrations/0019_class_purpose.sql`).
  - `tracker.occurrence_outcomes` (`supabase/migrations/0023_occurrence_outcomes.sql`).
- **Adapter today:** `createLessonsPort` in `apps/tracker/lib/notion/lessons.ts`
  reads only `Lesson`, `Date`, `Teacher`, the student relation, `Duration
  (hrs)` and `Class occurrence`. `undiscovered` for `Type` and the trial
  fields: `grep -rn "Trial: Diagnosis" apps packages` prints nothing.
- **Console read path:** a new reader (REQ-54) for the trial fields and
  Lessons `Type = Trial`.
- **Rule:** attendance comes only from a Lessons `Type = Trial` row or an
  outcome row, never from `Trial Time` passing.
- **Freshness:** live read.
- **Failure state:** `error`; a trial whose time has passed with no evidence
  shows "not logged", never "attended".
- **Owner card:** REQ-59.

### 3.4 Teacher capacity

- **Authority:** the scheduler tables in Postgres.
- **Source:** `tracker.class_series`, `tracker.class_exceptions`,
  `tracker.availability_windows`, `tracker.availability_exceptions`
  (`supabase/migrations/0010_scheduler_core.sql`); active staff from
  `tracker.staff` (`supabase/migrations/0022_people_sync.sql`).
- **Fields:**
  - `class_series`: `notion_staff_id`, `notion_student_id`, `kind`
    (`one_off`, `weekly`), `start_date`, `start_time`, `duration_minutes`,
    `effective_until`, `split_from`, plus `purpose` (0019).
  - `availability_windows`: `notion_staff_id`, `weekday`, `start_time`,
    `end_time`, `effective_from`, `effective_until`.
  - `availability_exceptions`: `notion_staff_id`, `on_date`, `kind`
    (`time_off`, `extra`), `start_time`, `end_time`.
  - `staff`: `notion_staff_id`, `name`, `subjects`, `active`, `synced_at`,
    `archived_at`.
- **Adapter today:** `expandOccurrences` (`apps/tracker/lib/domain/schedule/recurrence.ts`),
  `computeAvailability` (`apps/tracker/lib/domain/schedule/availability.ts`),
  `weekOf` and `weekTotals` (`apps/tracker/lib/domain/schedule/week.ts`;
  available and remaining minutes are `null` when availability is not
  entered, never 0), `createScheduleStore` (`apps/tracker/lib/data/schedule.ts`),
  `loadWeek` (`apps/tracker/lib/scheduler/schedule-handlers.ts`, 92-day range
  cap), `isActiveTeachingStaff` (`apps/tracker/lib/domain/staff.ts`).
- **Console read path:** `createScheduleStore` through the owner's
  `viewer.db`, then `weekTotals`.
- **Freshness:** Postgres, current at read time. Occurrences are never
  stored; they are recomputed.
- **Failure state:** query error → `error`; a teacher with no availability
  shows "availability not entered", never 0 % capacity.
- **Owner card:** REQ-58.

### 3.5 Delivered lessons and gaps

- **Authority:** `tracker.occurrence_outcomes` for the scheduler side; Notion
  Lessons for what was logged.
- **Source:** `tracker.occurrence_outcomes` (0023): `series_id`,
  `original_date`, `outcome` (`delivered`, `no_show`), `link_source`
  (`logged`, `reconciled`), `notion_lesson_id`, `lesson_date`. Lessons
  `6300f58a-8b8c-4789-88c1-e44272079b0f`.
- **Adapter today:** `reconcile` (`apps/tracker/lib/domain/schedule/lesson-link.ts`);
  `createOutcomeStore` (`apps/tracker/lib/data/outcomes.ts`, lookup by known
  keys only, no date-range list); `GET /api/scheduler/lessons/unlinked`
  (`apps/tracker/app/api/scheduler/lessons/unlinked/`, owner only, 31 days at
  most, handler in `apps/tracker/lib/scheduler/lesson-handlers.ts`).
- **Observed on 2026-10-21:** the live Lessons schema has no `Class
  occurrence` property. `createLessonsPort` throws `lessons_not_ready` when it
  is missing, so the unlinked route answers `503 lessons_not_ready` in
  production until the property is added in Notion.
- **Console read path:** the same handler logic, called server side behind
  the owner gate.
- **Rule:** no outcome row means "not logged", never "not delivered".
- **Freshness:** Postgres at read time; Lessons live.
- **Failure state:** `503 lessons_not_ready` → `error` with the reason
  "Lessons is missing Class occurrence".
- **Owner card:** REQ-58.

### 3.6 Payment evidence

- **Authority:** Notion Invoices. OPS SYSTEM rule: Paid is set by hand or by
  the monthly run; the tracker never writes here.
- **Source:** Notion data source `be0f91e4-f054-4055-9ca6-c4e1a22c4f27`
  (`DEFAULT_INVOICES_DATA_SOURCE_ID` in `apps/tracker/lib/notion/config.ts`).
- **Fields (live):** `Invoice` (title), `Status` (select: Draft, Sent, Paid,
  Void), `Paid On` (date), `Amount (CAD)` (number, dollar), `Credit Applied
  (CAD)` (number), `Hours` (number), `Rate (CAD)` (number), `Issued` (date),
  `Due` (date), `Month` (text, YYYY-MM), `Student` (relation to Students &
  Parents), `Credits` (relation), `PDF` (file), `Notes` (text). Students &
  Parents also has `Last Payment Date` (date) and `Lesson Cadence` (select:
  1x/week, 2x/week, 3x/week, Intensive, Ad-hoc).
- **Adapter today:** `fetchInvoices` and `createBillingReader` in
  `apps/tracker/lib/notion/billing.ts` (read-only, filtered on one `Student`,
  property map `P`); `invoiceStatus` in `apps/tracker/lib/domain/billing.ts`
  derives Paid, Due and Overdue. `undiscovered`:
  - an org-wide invoice listing and the `Paid On` read:
    `grep -rn "Paid On" apps/tracker/lib --include=*.ts --exclude=*.test.ts`
    prints nothing;
  - card payments: Stripe Payment Links in `apps/landing/app/config.ts` have
    no webhook, and `grep -rlni "stripe" apps/tracker apps/landing/app --include=route.ts`
    prints nothing.
- **Console read path:** a new org-wide reader (REQ-54) over the same
  property map.
- **Freshness:** live read.
- **Failure state:** read fails → `error` for finance panels and
  `unverifiable` for the north star (section 5).
- **Owner card:** REQ-54 (org-wide reader), REQ-59 (panel).

### 3.7 Recurring hours

- **Authority:** `tracker.class_series` weekly rows.
- **Source:** `tracker.class_series` (0010, `purpose` from 0019).
- **Fields:** `kind`, `start_date`, `effective_until` (the last date the
  series runs: `expandOccurrences` stops after it, and `split_class_series`
  in 0010 sets the old row's `effective_until` to the split date minus one
  day), `duration_minutes`, `notion_student_id`, `split_from`.
- **Adapter today:** `undiscovered`. No function computes recurring hours
  from series bounds: `grep -nE "effective_?[uU]ntil|split_?[fF]rom" apps/tracker/lib/domain/schedule/week.ts`
  prints nothing.
- **Console read path:** a new pure function (REQ-56) over
  `createScheduleStore` output plus the section 3.6 reader.
- **Freshness / failure state:** section 5.
- **Owner card:** REQ-56.

### 3.8 Content work

- **Authority:** Notion Work.
- **Source:** Notion data source `3031b455-9be0-4f8d-b200-70fcfcf1a0b8`
  (`DEFAULT_WORK_DATA_SOURCE_ID`).
- **Fields (live):** `Name` (title), `Area` (select: Marketing, Sales,
  Delivery, Admin), `State` (select: Inbox, Defined, Next, Doing, Waiting /
  Blocked, Done), `Type` (select: Project, Task, Recurring), `Due / Review`
  (date), `Owner` (text), `Alignment` (select: Core, Enabler, Maintenance,
  Exception), `Agent permission` (select), `Expected result` (text), `Bet`,
  `Task Type`, `Parent Project`, `Children`, `Work Log` (relations), `Build
  hours` (number).
- **Adapter today:** `apps/tracker/lib/notion/work.ts` writes the daily
  teacher-texts task and Work Log rows (`createTaskPage`, `createLogEntry`);
  its only query is `findTaskByTitle`. `undiscovered` for a list by Area or
  State: `grep -nE "\"(Area|State)\"" apps/tracker/lib/notion/work.ts` prints
  nothing.
- **Console read path:** a new reader (REQ-54).
- **Freshness:** live read.
- **Failure state:** `error` with a deep link to the Work database.
- **Owner card:** REQ-60.

### 3.9 Signals

- **Authority:** none yet. Nothing in the repo sends a notification:
  `grep -rlnE "web-push|twilio|EventSource" apps/tracker/lib apps/tracker/app --include=*.ts --include=*.tsx --exclude=*.test.ts`
  prints nothing.
- **Source (existing pieces):** the hourly bearer cron to
  `/tracker/api/scheduler/daily-task/run` (tracker ADR 0039),
  `tracker.notion_outbox` (`supabase/migrations/0021_notion_outbox.sql`:
  `kind`, `status` pending, running, done, failed, uncertain, superseded,
  `attempts`, `last_error`, `next_attempt_at`), `tracker.sync_runs` (0022:
  `kind`, `trigger`, `result` ok or failed, `started_at`, `finished_at`,
  `error`).
- **Adapter today:** `buildSignals` (`apps/tracker/lib/console/signals.ts`)
  from the facade and Operations, `readFailedOutbox` and `readOwnerTeaching`
  (`apps/tracker/lib/console/signals-read.ts`), served by
  `GET /api/console/signals` (REQ-62, tracker ADR 0077); outbox delivery
  stays in `apps/tracker/lib/scheduler/outbox-store.ts`.
- **Console read path:** bounded polling. A fresh lead can only be found by
  polling Students & Parents on created time with `Stage = New`.
- **Freshness:** the poll interval; never shown as live.
- **Failure state:** a failed check is listed as failed, never hidden.
- **Owner card:** REQ-62.

### 3.10 Integration health

- **Authority:** the local run records.
- **Source:** `tracker.sync_runs` and `tracker.people_synced_at` (0022),
  `tracker.notion_outbox` status (0021), `tracker.setup_checks()`
  (`supabase/migrations/0021_setup_checks.sql`).
- **Adapter today:** `loadSetupInput` (`apps/tracker/lib/data/setup.ts`),
  `buildSetupStatus` (`apps/tracker/lib/domain/setup-status.ts`),
  `peopleStaleMinutes` in `TUNING` (`apps/tracker/lib/domain/tuning.ts`).
  `undiscovered` for a last-successful-fetch record per Notion read other
  than people sync:
  `grep -rnE "lastSuccessfulFetch|last_successful_fetch|fetched_at" apps/tracker/lib supabase/migrations`
  prints nothing.
- **Console read path:** `buildHealth` (`apps/tracker/lib/console/signals.ts`,
  REQ-62): seven providers from the facade panels' statuses and fetch times
  REQ-54 records, Operations' schedule and lessons reads, the people panel and
  the failed outbox rows. `loadSetupInput` stays the setup page's read.
- **Freshness:** Postgres at read time.
- **Failure state:** `error` per provider; one failed provider never marks
  another healthy.
- **Owner card:** REQ-62.

### Staff (supporting every domain)

Notion Staff `eaf8e9be-9ec3-4e0d-9442-f2c2ce111925`: `Name` (title),
`Function` (multi_select: Setter, Teacher, Closer, Owner, Trial Teacher),
`Role` (select), `Status` (select: Active, Inactive, Onboarding), `Subjects`,
`Email`. Local copy `tracker.staff` (0022) through `createPeopleStore`.

## 4. Lead source rule and write contract

Source: the Notion page "OPS SYSTEM (agents.md)",
`https://app.notion.com/p/3ead6ae73dd781d69a21ffabe0fe0861`, last edited
2026-10-21T01:19Z (its own "Last updated" line says 2026-10-16). It marks
itself "UNTESTED, theoretical" until five real students pass New to Active.

- **Lead source.** "A lead is a Student row with Stage = New." "Do not create
  a Leads DB." The console reads leads from Students & Parents only.
- **Legacy Leads CRM.** "Leads CRM (Sales Pipeline)",
  `31e061e3-aee3-481b-bfc9-09fcfa07499a`, is not read. Reproduce its state
  with Notion MCP `query-data-sources`, SQL
  `SELECT COUNT(*), MAX(createdTime) FROM "collection://31e061e3-aee3-481b-bfc9-09fcfa07499a"`:
  4 rows, latest created 2026-06-12. The current lead count is
  `SELECT COUNT(*) FROM "collection://fe3d651a-70c6-4d1e-8a38-656163d6bc63" WHERE Stage = 'New'`:
  2 on 2026-10-21.
- **Allowed Stage transitions, and nothing else:** New → Working; New or
  Working → Lost; Working → Trial Booked; Trial Booked → Trial Claimed; Trial
  Booked or Trial Claimed → Working (cancel, no-show, reschedule with no
  time); Trial Claimed → Trial Booked (unclaim); Trial Claimed → Awaiting
  Close; Awaiting Close → Onboarding or Lost; Onboarding → Active; Active →
  Paused or Lost; Paused → Active or Lost; Lost → Working (reactivate). The
  legacy options Trial and Churned are never written.
- **Handoff contracts.** A transition is not allowed until every field in its
  contract is non-empty.
  - **A. Working → Trial Booked:** Parent Name, Student Name, Parent Phone,
    Subjects, Grade, Target Program, Trial Time, Sales Notes. Side effects:
    stamp Trial Booked At (and Contacted At if empty), clear Owner, Next
    Action = Deliver trial, log a Touch with Outcome = Trial booked.
  - **B. Trial Claimed → Awaiting Close:** attended (or no-show, below),
    Level, Major Gaps, Recommended Plan, Trial Summary, plus a Lessons row
    with Type = Trial, Duration, Topic Covered. Side effects: stamp Trial
    Attended At, clear Owner, Next Action = Close call, Next Action Due = now
    + 4 h.
  - **C. Awaiting Close → Onboarding:** Lesson Cadence, Hourly Rate (CAD),
    Last Payment Date (first payment), Subjects confirmed. Side effects: stamp
    Closed At, Next Action = Assign teacher, Next Action Due = now + 24 h, log
    a Touch with Outcome = Won.
  - **D. Onboarding → Active:** Owner = the teacher, Next Action Due = first
    lesson time, Start Date.
- **Cadence (setter).** Two call sessions a day (12 PM and 3 PM). No answer at
  12 → Next Action Due 3 PM today. No answer at 3 → 12 PM next business day.
  After the cadence is exhausted, send the final approved text and set Next
  Action Due = +7 days; if untouched by then, Stage = Lost, Lost Reason = No
  answer (cold).
- **Exceptions table:**

  | Situation | Write |
  | --- | --- |
  | No answer | Touch (No answer), Attempts +1, Next Action Due per cadence |
  | Call back later | Touch (Follow-up), Next Action Due = the given time |
  | Wrong number, Duplicate, Do not contact | Stage = Lost with that Lost Reason; Do not contact is permanent |
  | Trial cancelled, new time known | update Trial Time, Stage unchanged |
  | Trial cancelled, no new time | Stage = Working, Next Action = Rebook trial, Owner = booking setter, Trial Time cleared |
  | Teacher cannot attend | clear Trial Teacher, Stage = Trial Booked |
  | Trial no-show | Stage = Working, Next Action = Rebook trial, Next Action Due = now, Attempts = 0, Owner = booking setter; a second no-show → Lost (Trial no-show) |
  | Follow-up after trial | stay in Awaiting Close, set Next Action Due; expires to Lost (Closed lost) after 14 days with no touch |
  | Reactivation | Lost → Working, Next Action = Call, Attempts = 0; never for Do not contact or Duplicate |
  | Pause or churn | Stage = Paused, or Lost (Churned) |

- **Agent rules on that page that bind REQ-61:** never change Stage without
  the contract fields and the milestone stamp; never clear a milestone date;
  Sales Notes and Notes never mix; trials go in Lessons, not Touches. Layer 2
  adds text properties `Txn ID` (Touches, Lessons) and `Last Txn` (Students &
  Parents) for idempotent retries; they do not exist yet (decision C3).
- **The console sends nothing.** "Call" and "Text" are deep links (`tel:`,
  the Notion page). The outcome is logged after the fact (REQ-61).

## 5. North-star rule: verified net-new recurring teaching hours per week

How a reviewer checks this section (AC5): take the rule text below and each
fixture, recompute the fixture's class and its verified and unverified
minutes from the rule alone, and compare with the values the fixture states.
Every one must match.

**Week.** W is `weekOf(date)` in `apps/tracker/lib/domain/schedule/week.ts`:
Monday to Sunday, America/Toronto.

**Universe.** `tracker.class_series` rows with `kind = 'weekly'` in the
owner's org. Every `one_off` row is excluded, whatever its `purpose` (trial,
makeup, extra or null). `tracker.class_exceptions` rows (single cancellations
and moves) never change recurring hours.

**Events.**
- Addition in W: the series' `start_date` falls in W. Worth
  `+duration_minutes`.
- Reduction in W: `effective_until + 1 day` falls in W (`effective_until` is
  the last date the series runs, section 3.7). Worth `-duration_minutes`.
- A split (`split_from` set on the new row) is the old row's reduction plus
  the new row's addition, so it nets to the duration change.

**Verification belongs to the series, not to the event.** A series'
addition and its reduction always carry the same class. A series is
**verified** when all three hold:

- (a) its `notion_student_id` has a `tracker.student_people` row;
- (b) at least one Invoices row whose `Student` relation holds that page id
  has `Status = Paid` (any date; `Paid On` is shown when present);
- (c) either that row's `stage` is Onboarding or Active, or the series has
  ended (`effective_until` is set and is before today in America/Toronto).

Otherwise the series is **unverified**.

- Rule (c) keeps a departing student's reduction in verified net. A student
  who leaves normally has their series ended, so the series keeps its
  verified class, and its earlier addition keeps it too. Only an open series
  whose student's stage is no longer Onboarding or Active is unverified,
  because the schedule then disagrees with Notion.
- Stage history is not stored, so "was ever verified" is approximated by
  rules (b) and (c) (decision 13 of the design).
- The metric is computed at read time, so a week's additions move from
  unverified to verified once an invoice is marked Paid.
- `Last Payment Date` on Students & Parents alone counts as "reported,
  unverified" (decision C4).

**Outputs.**
- verified net = verified additions minus verified reductions;
- unverified net, shown separately, never folded into verified and never
  shown as zero for unknown;
- students with no `student_people` row (`not_synced`) count as unverified;
- students with no series are listed as "not in scheduler" and not counted;
- **unverifiable**: if the Invoices read fails, the whole metric is
  `unverifiable`, with the reason and the counted series ids; gross additions
  and reductions are shown unclassified;
- `stale`: if people sync is older than `peopleStaleMinutes` (120).

**Fixtures.** Each series is 60 minutes unless stated. "W" is a past or
current week, and "ended" means `effective_until` is before today.

| # | Case | Stage | Invoice state | Class | Verified net in W | Unverified net in W |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | new weekly series starts in W | Active | a Paid invoice | verified | +60 | 0 |
| 2 | 60-minute series splits to 90 minutes mid-W: old row ends in W, new row (`split_from` set) starts in W and stays open | Active | a Paid invoice | both verified | -60 +90 = +30 | 0 |
| 3 | series ends in W (`effective_until + 1` in W) | Active | a Paid invoice | verified | -60 | 0 |
| 4 | one-off trial (`kind = 'one_off'`, `purpose = 'trial'`) in W | Trial Booked | no invoice | excluded | 0 | 0 |
| 5 | new weekly series starts in W, still open | Active | only Draft or Sent invoices, none Paid | unverified (rule b fails) | 0 | +60 |
| 6 | Invoices read fails | Active | read failed | unverifiable: no verified or unverified figure; gross +60 and -60 shown unclassified with the series ids | n/a | n/a |
| 7 | series starts and ends inside W, ended | Active | a Paid invoice | verified | +60 -60 = 0 | 0 |
| 8 | series ends in W after the stage moved to Lost | Lost | a Paid invoice from earlier | verified (series ended, rule c holds) | -60 (and the week of its addition stays +60 verified) | 0 |
| 9 | open series (no `effective_until`) started in W | Paused | a Paid invoice | unverified (open, rule c fails) | 0 | +60 |
| 10 | series ends in W, ended | none: `not_synced`, no `student_people` row | a Paid invoice exists | unverified (rule a fails) | 0 | -60 |
| 11 | new weekly series starts in W, still open | none: `not_synced`, no `student_people` row | no invoice | unverified (rule a fails) | 0 | +60 |

REQ-56 owns the function and turns these fixtures into its tests.

## 6. Risk register

Every freshness, missing-source and external side-effect risk named in this
spec. Each row has exactly one owning card; a risk two cards share is split
into one row per card, each naming its part.

| Risk | Domain | Owner |
| --- | --- | --- |
| Live Notion reads have no staleness record; each read must record its last successful fetch time | integration health | REQ-54 |
| Notion rate limits and pagination: a partial page set must not show "empty" or "queue clear" | leads and funnel stage | REQ-54 |
| Touches is not configured anywhere in the repo; a reader and its env default must be added | touches | REQ-54 |
| Invoices has no org-wide listing; the reader's cost and pagination are the reader's concern, the panel only consumes it | payment evidence | REQ-54 |
| New Notion reader files must extend the `students.test.ts` source-scan list and stay out of `students.ts` | leads and funnel stage | REQ-54 |
| Stripe card payments are invisible to the repo; finance shows only Invoices evidence and says so | payment evidence | REQ-59 |
| Trial attendance inferred from `Trial Time` passing would be fabricated; only Lessons Type = Trial or an outcome row counts | trials | REQ-59 |
| Teacher availability not entered must show "not entered", never 0 % capacity | teacher capacity | REQ-58 |
| Lessons `Class occurrence` is missing live, so lesson-gap reads return `503 lessons_not_ready` | delivered lessons and gaps | REQ-58 |
| Un-adopted students (no series) would be miscounted; they are listed as "not in scheduler" | recurring hours | REQ-56 |
| Invoices read failure must make the north star `unverifiable`, never zero | recurring hours | REQ-56 |
| People sync older than 120 minutes makes the north star `stale` | recurring hours | REQ-56 |
| Fresh leads are found only by polling created time; never presented as live | signals | REQ-62 |
| A failed health check must be shown as failed, never greenwashed | integration health | REQ-62 |
| Any Notion write (Touches, Students & Parents) amends ADR 0004 and needs idempotency | touches | REQ-61 |
| Outbound contact from the Notion write adapter: it writes Touches rows and never sends a message | touches | REQ-61 |
| Outbound contact from the lead panel: deep links only, no send or call action | leads and funnel stage | REQ-57 |
| Demo data in component source: kept in tests and an isolated preview only | signals | REQ-55 |
| Demo data in the production build: an automated scan at release | signals | REQ-63 |
| The landing `safeNext` is weaker than `safeNextPath`; tighten before adding a console `next` target | integration health | REQ-53 |
| Console JSON write routes need a prefix in `ORIGIN_CHECKED_PREFIXES` (amends tracker ADR 0042) | integration health | REQ-53 |
| Release gate: readiness is Charlie's call in `docs/readiness.md`, never implied by a merge | integration health | REQ-63 |

## 7. Board reconciliation

| Card | Console reuses | Must not duplicate |
| --- | --- | --- |
| REQ-33 (owner setup page, Done) | `loadSetupInput`, `buildSetupStatus` and `tracker.setup_checks()` for integration health; the setup page's owner gate as the pattern | a second setup checklist |
| REQ-38 (people sync, Done) | names and stage from `tracker.student_people` and `tracker.staff` | live name reads from Notion (workspace ADR 0004) |
| REQ-39 (occurrence outcomes, Done, PR #97) | `occurrence_outcomes`, `reconcile`, the unlinked route | its own lesson-link logic or any payout side effect |
| REQ-40 (structured billing input, In Review, PR #106, High) | the finance card reads REQ-40's merged design before choosing a source | charge states: the console never computes them |
| REQ-42 (Iris 2/9, Done) | pattern only: an owner-only product under the tracker, its own schema, a bearer poll, the Notion phone backup | any message intake; Iris excludes lead and sales handling |
| REQ-43 (Iris 3/9, In Review, PR #107) | pattern only | escalation rules for leads |
| REQ-44 (Iris 4/9, Backlog) | pattern only: the Notion phone backup channel | an approval queue for the console |
| REQ-45 (Iris 5/9, Backlog) | nothing | an evaluation harness |
| REQ-46 (Iris 6/9, Backlog) | nothing | schedule-aware cancellation logic |
| REQ-47 (Iris 7/9, Backlog) | `computeAvailability` is shared by both | make-up offers |
| REQ-48 (Iris 8/9, Backlog) | nothing | any send path: the console sends nothing |
| REQ-49 (Iris 9/9, Backlog) | nothing | auto-send, quiet hours |

**Layer 2 setter and trial cards** (`/ops/setter`, `/ops/trials`, OPS SYSTEM
section 10): out of scope, and no Dev Requirements card exists. Reuse
boundary: REQ-57's ranking and REQ-61's write adapter take a staff id as an
input rather than assuming the owner, so a later setter card can reuse them
behind its own gate. No `/ops/*` route is built by the console cards.

## 8. Decisions for Charlie

Each default is in force until Charlie answers.

| # | Decision | Default |
| --- | --- | --- |
| C1 | Console path | `/tracker/console` (ADR 0006), not an apex `/console` |
| C2 | Lead source | Students & Parents with `Stage = New` is canonical; the legacy Leads CRM (4 rows, none after 2026-06-12) is ignored |
| C3 | Console writes to Notion | REQ-61 writes Touches and Students & Parents under a new ADR amending workspace ADR 0004; `Txn ID` and `Last Txn` are added in Notion by hand first |
| C4 | Payment evidence | Invoices `Status = Paid` is the only proof of payment; `Last Payment Date` alone is "reported, unverified" |
| C5 | Fresh-lead signal | bounded polling of Students & Parents created time; never shown as live until a webhook path exists |

## 9. Stale statements in the pack

Carried over from `01-discovery.md` section 7, plus what the build-day fetch
found:

- "Leads CRM" as the lead store: superseded by the OPS SYSTEM rule
  (section 4).
- Any migration or ADR numbers in the pack: numbers are assigned at design
  time (REQ-51). This card took workspace ADR 0006.
- The pack's reference image date, names and percentages are fiction.
- `01-discovery.md` lists the Lessons `Class occurrence` property as present;
  the live schema on 2026-10-21 does not have it (section 3.5).
- `01-discovery.md` gives the proxy origin check as `/api/scheduler/` only;
  `ORIGIN_CHECKED_PREFIXES` now also covers `/api/iris/`.
- `01-discovery.md` calls REQ-42 "In Review" and REQ-40 "Needs Approval"; on
  2026-10-21 REQ-42 is Done and REQ-40 is In Review (PR #106).
