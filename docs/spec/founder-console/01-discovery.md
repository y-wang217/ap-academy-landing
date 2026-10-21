# Founder Console: read-only discovery (2026-10-21)

Status: discovery notes, committed before any console code. Observed from the
repository at `main` (0cda4fa) and the Notion workspace on 2026-10-21. Nothing
here is an approved design; the designer writes those on the Notion cards.
The handoff pack is kept verbatim in [`handoff/`](handoff/README.md).

Every claim below is marked **observed** (read from a file, a migration, a
Notion schema or a Notion page) or **proposed** (a decision for the cards).
Real parent, student and staff names from Notion are deliberately left out.

## 1. Where the console lives

**Observed**
- One domain, path routing (ADR 0002). Login UI and `/auth/callback` exist
  only in `apps/landing`; the tracker never renders a login page. Its
  `apps/tracker/proxy.ts` refreshes the session and sends signed-out visitors
  to `/login?next=<path>` (`apps/tracker/lib/login-redirect.ts` keeps the
  basePath), so any new tracker page is signed-in-only with no routing work.
- Owner authority is `tracker.memberships` role `owner`
  (`supabase/migrations/0003_tracker_schema.sql`), checked in SQL by
  `tracker.is_org_owner(org_id)` (migration 0009, used by every later RLS
  policy) and in app code by one of two resolvers:
  - pages and server actions: `getViewer()` in `apps/tracker/lib/data/queries.ts`
    (an owner membership wins over a teacher one, line 36); the owner setup
    page gates with `if (viewer.kind !== "staff" || viewer.role !== "owner") notFound();`
    (`apps/tracker/app/scheduler/setup/page.tsx:20`, tracker ADR 0053), a 404
    for every other role, pinned by `apps/tracker/lib/setup-scan.test.ts`;
  - JSON APIs: `resolveSchedulerIdentity()` (`apps/tracker/lib/scheduler/identity.ts`)
    plus `requireScheduler(identity, ["admin"])` (`apps/tracker/lib/scheduler/guard.ts:17`),
    returning 401, 403 or 503 JSON. That resolver also runs `claim_staff_link`,
    needs Notion configured, and schedules an outbox drain, which is why ADR
    0053 chose `getViewer()` for the setup page.
- There is no shared `requireOwner` helper; `apps/tracker/lib/pages.ts` is
  where the role helpers live (`staffStudent`, `parentChild`).
- The permission contract across the five roles is tracker ADR 0052,
  `apps/tracker/docs/permission-matrix.md`, `supabase/tests/permission_matrix.sql`
  and `apps/tracker/lib/permission-matrix.test.ts` (tracker schema only; a new
  schema needs the matrix, the doc and the SQL test extended in the same PR).
- Scheduler API writes are origin-checked before the session is read, only
  under the `/api/scheduler/` prefix (`apps/tracker/proxy.ts:18`,
  `apps/tracker/lib/cross-site.ts`, tracker ADR 0042). Server actions get
  Next's own origin check through `allowedOrigins` in `apps/tracker/next.config.ts`.
- Owner-only surfaces already in the tracker: the setup page,
  `apps/tracker/app/api/scheduler/people/sync`, staff routes, monthly review,
  `GET /api/scheduler/lessons/unlinked`, and the owner server actions in
  `apps/tracker/app/actions/teacher.ts`. The audit log is owner-readable by RLS
  (migration 0020) and nothing in app code reads it yet.
- Precedent for a new owner-only product inside the tracker: migration
  `0024_iris_core.sql` (merged, not yet applied live) creates the `iris`
  schema owner-read-only through `tracker.is_org_owner`, and the Iris spec
  (Notion, "Spec: Iris") puts its admin pages at `/tracker/iris`. The OPS
  SYSTEM page plans the Layer 2 setter and trial cards "as a route group in
  the AP Academy Next.js repo" (`/ops/setter`, `/ops/trials`, Work Log
  2026-09-29). Neither exists in the repo today.
- `apps/landing` has no owner concept; its middleware only refreshes the
  session on `/sat`, `/auth` and `/login` and never redirects, and apps never
  import each other (root `CLAUDE.md`). A landing-side `/console` would need
  its own copy of the owner check or a new app with a Vercel project, two
  rewrite lines and copies of the proxy, login-redirect and origin logic.
- The e2e harness `e2e/tracker` runs real Postgres and RLS with mock auth and
  already exercises owner, scheduling teacher, grade teacher, student, parent
  and a role-less guest (`e2e/tracker/flows.mjs`, `seed.sql`); the setup page
  404 check at `flows.mjs` around line 1387 is the pattern for a console gate.
- `apps/landing/app/auth/callback/route.ts` uses a local `safeNext` that is
  weaker than `safeNextPath` in `packages/db/src/paths.ts` (it does not reject
  `/\host` or control characters). Worth tightening when a console adds a
  new `next` target.

**Proposed (decision 1, default for the audit card)**
- The console is a tracker route group at **`/tracker/console`**
  (`https://www.apacademy.ca/tracker/console`), gated by a small
  `ownerViewer()` helper in `apps/tracker/lib/pages.ts` that mirrors the setup
  page (404 for everyone but the owner, no `claim_staff_link` side effect), with
  every read through the owner's own client so RLS is the real boundary.
- Console writes are server actions (origin-checked) or JSON routes under a
  prefix covered by the proxy's origin check; widening that prefix is an ADR
  0042 amendment the designer lists under Decisions for approval.
- A bare `/console` on the apex is not built. If Charlie wants that address,
  it is a later landing rewrite decision and not part of these cards.

## 2. Source of truth per data domain

| Domain | Authority (observed) | Repo adapter today (observed) | Gaps (observed) |
|---|---|---|---|
| Leads and funnel stage | Notion **Students & Parents** (`fe3d651a-...`): `Stage` select (New, Working, Trial Booked, Trial Claimed, Awaiting Close, Onboarding, Active, Paused, Lost; legacy Trial, Churned), `Owner` (relation to Staff), `Next Action` (select: Call, Text, Book trial, Deliver trial, Close call, Rebook trial, Assign teacher, Schedule first lesson, None), `Next Action Due` (date), `Attempts`, `Last Contact`, `Source` (Meta form, Website, Referral, Other), `Lead ID` (Meta dedupe key), `Lost Reason` (incl. Do not contact, Duplicate), milestone dates `Contacted At`, `Trial Booked At`, `Trial Attended At`, `Closed At`. Rules: Notion page "OPS SYSTEM (agents.md)" (last edited 2026-10-21): "A lead is a Student row with Stage = New"; "Do not create a Leads DB". | `apps/tracker/lib/notion/students.ts` reads only Student Name, Stage, Weekly Schedule by property id, and a source-scan test forbids naming `Owner` and `Trial Teacher`. `tracker.student_people` (migration 0022) holds synced name and stage. | No reader for Next Action, Next Action Due, Attempts, Last Contact, Source, Lost Reason or the milestone dates. The legacy **Leads CRM (Sales Pipeline)** database (`31e061e3-...`, listed on the Notion "Records" page) holds 4 rows, all New Lead, none created after 2026-06-12: dormant, not canonical. Meta leads reached a Google Sheet, not Notion, as of 2026-10-07; Zapier is not connected, leads are typed in by hand. |
| Touch history (calls, texts) | Notion **Touches** (`772939bd-...`): `Type` (Call, Text, Close call, Note), `Outcome` (No answer, Contacted, Trial booked, Follow-up, Not interested, Do not contact, Wrong number, Won, Lost), `Student` relation, `Staff` relation, `Note`, `When` (created time). Written through the "Log a Touch" form. | None. | No reader or writer in the repo. |
| Trials | Notion Students & Parents: Stage Trial Booked / Trial Claimed / Awaiting Close, `Trial Time`, `Trial Teacher`, trial report fields `Level`, `Major Gaps`, `Recommended Plan`, `Trial Summary`; completion evidence is a **Lessons** row with `Type` = Trial, `Trial: Diagnosis`, `Trial: Preferred Lesson Day` (handoff contract B, OPS SYSTEM section 5). Scheduler side: `tracker.class_series.purpose = 'trial'` (one-off only, migration 0019). | `apps/tracker/lib/notion/lessons.ts` reads Date, Teacher, student relation, `Class occurrence` only. `tracker.occurrence_outcomes` (0023) records delivered or no_show per occurrence. | No reader for Lessons `Type`, `Trial: Diagnosis`. Trial Time is set by hand (Calendly has no webhook in the repo; the 2026-10-20 "Trial Pipeline SOP" keeps Calendly coverage on Charlie's Google Calendar outside the repo). Attendance must come from a Lessons Type = Trial row or an `occurrence_outcomes` row, never from `Trial Time` passing. |
| Teacher capacity | `tracker.class_series` + `tracker.class_exceptions` expanded by `expandOccurrences` (`apps/tracker/lib/domain/schedule/recurrence.ts`); availability from `tracker.availability_windows` and `tracker.availability_exceptions` via `computeAvailability`; per-teacher Mon to Sun totals from `weekTotals` in `apps/tracker/lib/domain/schedule/week.ts` (available and remaining minutes are `null` when availability is `not_entered`, never 0). Active staff: `tracker.staff` (0022) and `isActiveTeachingStaff`. | `createScheduleStore` (`apps/tracker/lib/data/schedule.ts`), `loadWeek` in `apps/tracker/lib/scheduler/schedule-handlers.ts`, `GET /api/scheduler/availability` (92-day cap). | Occurrences are never stored; always recomputed. Only adopted students (`tracker.schedule_summaries`) have series; others are Weekly Schedule free text in Notion. |
| Delivered lessons and gaps | `tracker.occurrence_outcomes` (`delivered` or `no_show`, `notion_lesson_id`, unique per series and date) and `reconcile()` in `apps/tracker/lib/domain/schedule/lesson-link.ts`; `GET /api/scheduler/lessons/unlinked?from&to` (owner only, 31 days max). "No outcome row" means not logged, not "not delivered". | `apps/tracker/lib/scheduler/lesson-handlers.ts`, `apps/tracker/lib/data/outcomes.ts` (lookup by known keys only, no date-range list). | Needs the Lessons `Class occurrence` property live, else `503 lessons_not_ready`. `docs/readiness.md` F07 still says "Merged: no" although PR #97 merged (commit 7356042); the register is stale. |
| Payment and enrolment evidence | Notion **Invoices** (`be0f91e4-...`): `Status` (Draft, Sent, Paid, Void), `Paid On`, `Amount (CAD)`, `Credit Applied (CAD)`, `Issued`, `Due`, `Month`, `Student` relation. Students & Parents: `Last Payment Date`, `Hourly Rate (CAD)`, `Lesson Cadence`, `Hours Paid (Current Month)`. Rule (OPS SYSTEM, Invoices): Paid is set by hand or by the monthly run; the tracker never writes here. Stripe Payment Links on landing (`apps/landing/app/config.ts`) have no webhook, so a deposit or full purchase is not recorded anywhere the repo can read. | `apps/tracker/lib/notion/billing.ts` (read-only, per child, filtered on one `Student`); `invoiceStatus()` in `apps/tracker/lib/domain/billing.ts` derives Paid, Due, Overdue. | No org-wide invoice listing; `Paid On` is not read. REQ-40 (structured monthly billing input, Needs Approval, High) will change the billing input but not the Invoices database contract. |
| Recurring teaching hours | `tracker.class_series` with `kind = 'weekly'`, `duration_minutes`, `start_date`, `effective_until`, `notion_student_id`, `notion_staff_id`; one-offs carry `purpose` (makeup, trial, extra). | No function computes recurring hours per week from the pattern; `weekTotals` works on a dated week per teacher. | A new pure function is needed (see section 3). |
| Content work | Notion **Work** (`3031b455-...`): `Area` (Marketing, Sales, Delivery, Admin), `State` (Inbox, Defined, Next, Doing, Waiting / Blocked, Done), `Type` (Project, Task, Recurring), `Due / Review`, `Owner` (text), `Task Type` relation, `Bet` relation, `Expected result`. On 2026-10-21 Marketing has 9 open rows. **Content Library** (`30a0e383-...`) is the curriculum store, not the marketing pipeline. | `apps/tracker/lib/notion/work.ts` writes the daily teacher-texts task and Work Log rows; its only query is by title. | No reader lists Work rows by Area, State, Owner or Due. |
| Signals and notifications | Nothing in the repo sends anything: no realtime, SSE, push, SMS or app email (Resend is auth SMTP only). What exists: the hourly GitHub cron to `/tracker/api/scheduler/daily-task/run` (bearer secret, tracker ADR 0039), `tracker.notion_outbox` (0021) with a 30 s polled strip, `tracker.sync_runs` (0022) with the owner setup page, and the Iris plan of a 15-minute poll. The Notion phone backup pattern (a Work page with a mention comment) is the only "notify Charlie" channel in use. | `apps/tracker/lib/scheduler/outbox*.ts`, `people-sync*.ts`, `apps/tracker/lib/data/setup.ts`. | Fresh-lead detection can only be bounded polling of Students & Parents (created time, Stage = New). |
| Integration health | `tracker.sync_runs`, `tracker.notion_outbox` status, `tracker.setup_checks()` (0021_setup_checks), `peopleStaleMinutes: 120` in `apps/tracker/lib/domain/tuning.ts`. | `loadSetupInput` in `apps/tracker/lib/data/setup.ts`. | No per-provider "last successful fetch" record for Notion reads other than people sync. |

Notion data source ids above are the defaults in `apps/tracker/lib/notion/config.ts`
(env vars `NOTION_STUDENTS_DATA_SOURCE_ID`, `NOTION_WORK_DATA_SOURCE_ID`,
`NOTION_INVOICES_DATA_SOURCE_ID`, `NOTION_LESSONS_DATA_SOURCE_ID`,
`NOTION_STAFF_DATA_SOURCE_ID`); Touches (`772939bd-bd88-4272-9f1f-20ce75ef2204`)
is not configured anywhere in the repo yet.

## 3. North-star metric: verified net-new recurring hours per week

**Observed**: no existing computation. The inputs exist:
- Recurring commitment: `tracker.class_series` rows with `kind = 'weekly'`,
  summed `duration_minutes` per `notion_student_id`, bounded by `start_date`
  and `effective_until`. Trials, make-ups and extras are one-offs with
  `purpose` and are excluded by `kind`.
- Payment evidence: Notion Invoices rows for that student with `Status = Paid`
  (and `Paid On` when present), or Students & Parents `Last Payment Date`
  (contract C stamps it at close).
- Stage evidence: Students & Parents `Stage` in (Onboarding, Active), already
  synced to `tracker.student_people.stage`.

**Proposed (for the metric card; the designer pins the exact rule)**
- Week boundaries: Monday 00:00 to Sunday 24:00 America/Toronto (as `weekOf`).
- Additions: weekly series whose `start_date` falls in the window, for a
  student with payment evidence; reductions: weekly series whose
  `effective_until` falls in the window (end or split without replacement),
  and series cancelled through `end_series` in `tracker.schedule_writes`.
- A series for a student with no payment evidence counts as **unverified**,
  shown separately, never as zero and never as paid.
- When the Invoices database cannot be read, the metric reports
  **unverifiable** with the reason and the counted series ids.
- Students not yet adopted into the scheduler are listed as "not in
  scheduler", not counted.

## 4. Writes (call outcomes and follow-ups)

**Observed**
- The tracker writes Notion in three places only: `writeWeeklySchedule`
  (Students & Parents, one property), `work.ts` (Work pages, Work Log), and
  `lessons.ts` (create a Lesson, patch `Class occurrence`). Workspace ADR 0004
  says "Nothing is written back to Notion except the existing generated Weekly
  Schedule summary". `apps/tracker/lib/notion/` is a `human_merge_paths` entry.
- The OPS SYSTEM page defines the allowed Stage transitions, handoff contracts
  A to D, the cadence (Attempts +1 on No answer, Next Action Due by slot) and
  the exceptions table, and for Layer 2 plans `Txn ID` on Touches and Lessons,
  `Last Txn` on Students & Parents, and a Supabase transition log.
- Contract C (Awaiting Close to Onboarding) requires `Last Payment Date`;
  "Paid" is never set from a verbal yes.

**Proposed**
- Logging a call outcome = one Touches row plus the Students & Parents updates
  the OPS SYSTEM rules prescribe for that outcome (Attempts, Last Contact,
  Next Action, Next Action Due, Stage only within the allowed transitions).
  This needs an ADR that amends ADR 0004's "nothing is written back" to list
  these two databases and these properties, a transition log table in
  Supabase (idempotency by request id, read-back after write), and Charlie's
  sign-off: Risk High, human merge.
- No outbound message is sent by the console; "Text" and "Call" are deep links
  (`tel:`, the Notion page) and the outcome is logged after the fact.

## 5. Overlaps with the board (reconciled)

| Existing card | Relation to the console |
|---|---|
| REQ-39 Done (occurrence outcomes, 0023) | The operations card reads it; readiness F07 row needs updating. |
| REQ-33 Done (owner setup page, sync_runs) | Integration health reuses `loadSetupInput`. |
| REQ-38 Done (people sync) | Stage and names come from the local copy; the console must not reintroduce live name reads. |
| REQ-40 Needs Approval, High (structured billing input) | Not a blocker: the finance readout reads the Invoices database that REQ-40 also feeds. Its design may add a Postgres billing table; the finance card's designer checks REQ-40's design before choosing a source. |
| REQ-42 In Review (Iris 2/9, PR #101, awaiting-migration, 0024 not applied) and REQ-43 to 49 Backlog | Pattern precedent only (owner pages under the tracker, bearer poll, Notion phone backup). Iris explicitly excludes "lead or sales handling". Tracker ADR numbers: PR #101 adds `0056-iris-tracker-module.md`, which clashes with `main`'s 0056; the designer's number reservation (REQ-51) handles it. |
| REQ-19 Backlog (human dashboard checklist) | Unrelated. |
| REQ-34 Blocked | Unrelated. |
| Layer 2 setter and trial cards (`/ops/setter`, `/ops/trials`, Work Log 2026-09-29) | No Dev Requirements card exists. The console's sales queue is founder-only; its ranking and write adapters should be reusable by a later setter card but no setter UI is in scope. |

## 6. Decisions for Charlie (not resolvable from code)

1. Console path: `/tracker/console` (default) rather than an apex `/console`.
2. Lead source: Students & Parents is canonical and the legacy Leads CRM
   database is ignored (OPS SYSTEM rule). Confirm, or say the June rows must be
   migrated by hand first.
3. Console writes to Notion Touches and Students & Parents (the call-outcome
   card) amend ADR 0004 and need the Notion property additions the OPS SYSTEM
   plans (`Txn ID`, `Last Txn`), added by hand in Notion.
4. Payment evidence for the north-star: Invoices `Status = Paid` is the only
   accepted proof; `Last Payment Date` alone is "reported, unverified".
5. Fresh-lead signal is polling (Notion created time), never a claim of live
   observation, until a Zapier or webhook path exists.

## 7. Stale statements in the handoff pack (do not rely on them)

- "Leads CRM" as the lead store: superseded by the OPS SYSTEM rule above.
- Any migration or ADR numbers in the pack: the pipeline assigns numbers at
  design time (REQ-51).
- The pack's reference image date, names and percentages are fiction.
