# ADR 0004: Notion edits people, Supabase holds synced operational copies, the app reads local

- **Status:** Accepted
- **Date:** 2026-10-16
- **Decided by:** Charlie
- **Implemented by:** REQ-38 (Feedback 9)
- **Supersedes:** parts of tracker ADR 0033 and tracker ADR 0037, once REQ-38 ships
- **Card:** REQ-36 (Feedback 0), from the 2026-10-16 readiness review

## Context

People are edited in Notion: the Staff database and the Students & Parents
database. The tracker reads them live today:

- `apps/tracker/lib/notion/cached.ts` wraps `fetchStaff`
  (`lib/notion/staff.ts`) and `fetchStudentNames` (`lib/notion/students.ts`)
  in a 300 second `unstable_cache`.
- `lib/scheduler/deps.ts` hands those reads to every scheduler handler.
- `lib/scheduler/identity.ts` checks teacher scope against the cached staff
  list.

A Notion failure past the cache gives teachers `503 scheduler_unavailable`,
cards show "Teacher" and "Student" placeholders, and nothing records that the
data is stale. The readiness review set out three options. Charlie chose B on
2026-10-16.

## Decision

- Notion stays the editor of record for people. Nobody edits a person in the
  tracker.
- The tracker keeps synced copies of only the fields marked Copied: Yes in
  the table below, and reads those copies instead of Notion.
- Matching is by Notion page id only, never by name.
- Notion page ids are the join key everywhere: `tracker.class_series.notion_student_id`, `tracker.students.notion_student_id`, `tracker.staff_links.notion_staff_id` and `tracker.schedule_summaries.notion_student_id` hold Notion ids, and Supabase row ids are local.
- Copies are operational, not a second source of truth. Nothing is written
  back to Notion except the existing generated Weekly Schedule summary
  (tracker ADR 0035).
- Parent name and parent email are never copied. The Iris spec (Notion,
  "Spec: Iris", decision 28) reads them live and uncached so parent addresses
  never persist outside Notion and Gmail, and nothing in the scheduler needs
  them.

## Options rejected

- **A (keep live Notion reads with a cache):** a Notion outage removes names
  and teacher scope, and staleness is invisible to the owner.
- **C (Supabase owns people, with a roster UI):** the right later
  destination, but it needs an editing UI and moves the monthly-admin and
  onboarding skills off Notion. Not now.

## Field ownership

| Field | Editor of record | Readers | Copied | Retention |
|---|---|---|---|---|
| Staff name | Notion Staff | identity, week views, parent calendar, daily task | Yes | Kept while the Notion page exists; the archived row is kept afterwards so old series still name the teacher |
| Staff greeting name | Derived from the staff name by `greetingName` in `lib/domain/schedule/daily-texts.ts` (tracker ADR 0043), never edited separately | daily task, parent calendar, calendar text | No, computed at read time from the copied staff name, as `lib/data/parent-calendar.ts` and `lib/view/calendar-text.ts` already do | Not stored |
| Staff active | Notion Staff Status and Function, combined by `isActiveTeachingStaff` in `lib/domain/staff.ts` | identity, staff pickers | Yes, as one boolean computed at sync; raw Status and Function are not copied | As staff name |
| Staff subjects | Notion Staff | identity, week views | Yes | As staff name |
| Staff email | Notion Staff.Email | owner views only (`StaffRecord`) | No. The sign-in address is `tracker.staff_links.email`, entered by the owner (tracker ADR 0033), an access record, not a copy | Not stored |
| Student display name | Notion Students & Parents, Student Name | week views, parent calendar, daily task, import | Yes | Kept while the Notion page exists; the archived row is kept afterwards |
| Student stage | Notion Students & Parents, Stage | pickers, names filter | Yes; active means Active or Onboarding, as in tracker ADR 0037 | As student display name |
| Student Notion page id | Notion | every join | Yes; it is the key | As student display name |
| Student grade | The tracker (`tracker.students.grade_level`, tracker ADR 0012); the app reads no grade from Notion | grade tracker | No, not a Notion copy | Tracker data, unchanged |
| Parent name | Notion Students & Parents | Iris (planned `lib/notion/parents.ts`) | No. Read live and uncached (Iris spec decision 28) | Never stored |
| Parent email | Notion Students & Parents | Iris (planned `lib/notion/parents.ts`) | No. Read live and uncached (Iris spec decision 28). `tracker.parent_links.email` is the parent's sign-in address entered by the owner (tracker ADR 0046), an access allowlist entry, never synced from or to Notion | Never stored |

Billing fields (rate, cadence, family, invoices, credits, sibling names) stay
live and uncached in `lib/notion/billing.ts` (tracker ADR 0049) and are not
copied. Weekly Schedule text stays a live read for import
(`fetchScheduledStudents`, `fetchStudentSchedule`) and for the summary write
(`writeWeeklySchedule`).

## Readers and writers

| Path | Role | Data | State |
|---|---|---|---|
| `apps/tracker/lib/notion/staff.ts` | reader | Notion Staff | exists |
| `apps/tracker/lib/notion/students.ts` | reader, and the one Notion people writer (Weekly Schedule summary) | student names, stage, Weekly Schedule | exists |
| `apps/tracker/lib/notion/cached.ts` | reader (five-minute cache) | staff list, student names | exists |
| `apps/tracker/lib/notion/billing.ts` | reader, live and uncached | billing fields, sibling names | exists |
| `apps/tracker/lib/domain/staff.ts` | pure rule | staff active | exists |
| `apps/tracker/lib/scheduler/deps.ts` | reader (`fetchStaff`, `studentNames`) | staff list, student names | exists |
| `apps/tracker/lib/scheduler/identity.ts` | reader | staff list for teacher scope | exists |
| `apps/tracker/lib/scheduler/import-handlers.ts` | reader | scheduled students, Weekly Schedule | exists |
| `apps/tracker/lib/scheduler/daily-task-wiring.ts` | reader | staff and student names | exists |
| `apps/tracker/app/api/scheduler/daily-task/run/route.ts` | reader | staff and student names | exists |
| `apps/tracker/lib/data/schedule.ts` | reader and writer | series and summaries keyed by Notion ids | exists |
| `apps/tracker/lib/data/parent-calendar.ts` | reader | staff and student names | exists |
| `apps/tracker/app/parent/[studentId]/calendar/page.tsx` | reader | parent calendar | exists |
| `apps/tracker/app/schedule/page.tsx` | reader | week views | exists |
| `apps/tracker/app/students/[studentId]/page.tsx` | reader | student Notion link | exists |
| `apps/tracker/app/actions/teacher.ts` | writer of `students.notion_student_id`, owner only (tracker ADR 0048) | Notion page id | exists |
| `supabase/seed/scheduler-staff-link.sql` | writer of `staff_links` | Notion staff id, sign-in email | exists |
| `apps/tracker/lib/notion/parents.ts` | reader, live and uncached (Iris) | parent name, parent email | planned |
| monthly-admin skill | edits and reads Notion people pages | students, parents, billing | outside repo |
| onboarding skill | creates and edits Notion people pages | students, parents | outside repo |

The two skills are consumers that must keep working under B: they edit
Notion, and the next sync carries their changes into the tracker.

## Lifecycle

- **Rename:** the copy follows on the next sync. Old series and parent views
  show the new name.
- **Archive, or stage Lost or Churned:** the row is kept and marked inactive.
  It is hidden from pickers, existing series are untouched, and names still
  show on old series and parent views.
- **Staff deactivated:** the sync marks the staff row inactive. The
  next request loses teacher scope even if the `staff_links` row is
  unrevoked, because `identity.ts` checks the local row.
- **Delete in Notion:** soft delete locally (`archived_at` set). Never a row
  delete, and never cascade to series.

## Consequences

- **Freshness lag.** The sync runs hourly on the existing daily-task cron
  (`.github/workflows/daily-teacher-texts.yml`, at :05, calling
  `/tracker/api/scheduler/daily-task/run`) and on demand from the owner. A
  Notion edit shows in the app within one sync. Both numbers are defaults in
  `TUNING`.
- **Notion down.** The app serves the last synced copy. Teachers keep scope
  and names. Weekly Schedule import and Billing still need live Notion and say
  unavailable, as today.
- **Revocation path.** The immediate cut is revoking the staff link
  (`revoked_at`, tracker ADR 0033), unchanged. Setting a teacher Inactive in
  Notion now takes effect at the next sync (up to one hour, or at once with
  the owner's sync now), not within five minutes. This is an accepted
  trade-off.
- **Stale or failed sync.** Each run writes a `tracker.sync_runs` row. The
  owner's setup page (Feedback 6) shows the last success and the last error.
  Any page showing people data shows one notice, such as "Names last updated
  3 hours ago", past a threshold (`TUNING`, default 2 hours), and still
  renders. A failed sync never empties rows.
- **Personal data.** Staff names and student display names are now stored in
  Postgres. This is the ADR that tracker `CLAUDE.md` rule 9 and tracker ADR
  0012 require for that. Tracker ADR 0037's "never stored" no longer holds
  once REQ-38 ships.
- **Planned tables.** Named as REQ-38 proposes (`tracker.staff`, a student
  people table or `tracker.students` columns, `tracker.sync_runs`). The
  migration file REQ-38 ships wins over these names.

## Numbering

Migration and ADR numbers written in specs are placeholders. The Iris spec
reserves migrations 0018 to 0020 and tracker ADRs 0050 to 0058; today those
are also the next free numbers. The pipeline assigns the next free number at
build time, and the file on `main` wins.
