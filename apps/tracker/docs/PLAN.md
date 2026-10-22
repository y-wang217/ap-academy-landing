# Student Tracker: build progress

The work plan is [`spec/tracker-plan.md`](spec/tracker-plan.md); the build order is
in [`../CLAUDE.md`](../CLAUDE.md). Decisions: [`decisions/`](decisions/README.md).
Each step is done only when lint, typecheck and tests pass.

Deployment and readiness, finding by finding: [`../../../docs/readiness.md`](../../../docs/readiness.md).

| Step | What | Status |
|---|---|---|
| 1 | Scaffold, Supabase clients, env, CI, seed ADRs | done |
| 2 | Migrations and RLS, with RLS tests | done: `0004_tracker_core.sql`, `supabase/tests/tracker.sql` (applied 2026-10-04) |
| 3 | Grade engine and tests | done: `lib/domain/`, 35 tests incl. the six required |
| 4 | Teacher onboarding wizard | done: `/students/new`, `/students/[id]/setup/[step]` |
| 5 | Teacher course view | done: `/students/[id]/courses/[courseId]`, priorities on `/students/[id]` |
| 6 | Student dashboard, drill-down, Done | done: `/`, `/courses/[courseId]` |
| 7 | Reliability: audit, stamps, states, errors, backups, restore | done: `0005_tracker_audit.sql`, `scripts/backup.sh`, [`docs/RESTORE.md`](../../../docs/RESTORE.md) |
| 8 | v1: suggestions, flags, AI paste (go-ahead 2026-10-05, [`spec/build-step-8.md`](spec/build-step-8.md)) | done: `0006_tracker_v1.sql` (live 2026-10-05), ADRs 0024 to 0027 |
| 9 | AI intake: photos, PDFs, transcripts and requests; one change set for the whole student (go-ahead 2026-10-05, [`spec/build-step-9.md`](spec/build-step-9.md)) | done: `0007_tracker_intake.sql` (live 2026-10-05), ADRs 0028, 0029 |
| 10 | Student dashboard redesign: tests vs assignments with one date each, grade history charts, trend pills, a factual story line (go-ahead 2026-10-06, [`spec/build-step-10.md`](spec/build-step-10.md), mock [`spec/build-step-10-mock.webp`](spec/build-step-10-mock.webp)) | done in code: `0008_tracker_assessment_kind.sql` (not yet live), ADRs 0030 to 0032 |

## Notes
- Step 3: the brief's reference example is 96.4695 at full precision, not
  96.4709; both display as 96.47 (ADR 0019).
- Step 2: student user_id is set only by `claim_student_invites()`; a
  confirmed syllabus version is read-only in the database, not just the UI.
- Steps 4 to 6: verified end to end in Chromium on Postgres, PostgREST 14.5 and
  a mock Auth server (`e2e/tracker/flows.mjs`, 37 checks). Invites are a
  prefilled email from the teacher (ADR 0016). Syllabus editing after publish
  is deferred (ADR 0018).
- Step 7: the audit log is written by triggers and append-only for every
  role, including the table owner. Last-updated stamps on every screen. The
  restore drill (`pnpm test:restore`) passes locally and runs in CI; a drill
  against a scratch Supabase project waits on the backup secrets.

- Step 8: suggestions are teacher-only and become tasks with a stored reason
  (ADR 0024). Flags are fixed-choice, written through two functions, resolved
  by staff (ADR 0025). AI paste is off without `ANTHROPIC_API_KEY`; the model
  sees refs, not ids, and no name or email; nothing is written until the
  teacher saves the ticked changes (ADRs 0026, 0027). Verified: RLS
  (`supabase/tests/tracker_v1.sql`), unit tests, and 21 more end-to-end checks
  (55 in all) including the AI flow against a mock model.

- Step 9: the composer on the student page, every setup step and the
  course page takes words (material or a request) and attachments (photos,
  PDFs, `.vtt`/`.srt`/`.txt` transcripts), and drafts changes to anything the
  wizard and the course page can write: goal, courses, targets, categories,
  assessments, tasks (ADR 0029). Items the model is not certain of start
  unticked. Every manual form now builds a one-item change set and takes the
  same path. Students get a per-org number (`S-0012`) to write on notes in
  place of a name (ADR 0028). Verified: RLS (`supabase/tests/tracker_intake.sql`),
  81 unit tests, and 61 end-to-end checks (`e2e/tracker/flows.mjs`) against the mock model.

  Fix 2026-10-05: every live draft failed with a 400, files or not, because
  the answer schema had 26 nullable fields and the API compiles at most 16
  union-typed ones. The mock model never compiles a schema, so nothing caught
  it. Text and choice fields now say "not given" with `""` (`AiWireOutput`),
  turned back into null by `fromWire`; a unit test holds the schema to the
  API's limits. A 400 now blames files only when files were sent, and the API's
  reason goes to the Vercel log.

  Fix 2026-10-06: "add biology and english" drafted no courses. The tutor gave
  subjects, not codes, the model left `code` empty, and `add_course` failed
  with a bare "Required"; every category hung off those courses then failed
  as "no course for this category". The model now gets the student's grade
  level and is told to give the usual Ontario code (SBI4U) with certain false
  when only a subject is named. A course without a code says so in the notes,
  and items that hang off a failed add say that instead of a vaguer reason.

  Same day: the prompt told the model to put anything it couldn't place in
  unmatched "instead of guessing", so a full transcript left most of its work
  for the tutor to type. It now drafts its best guess as an uncertain change
  (unticked, "Check this one") with a short `check` line saying what to
  confirm, and keeps unmatched for what no change can hold: no place in the
  tracker, a confirmed syllabus, or contradictory material. The e2e mock now
  answers in the wire shape ("" for not given).

- Step 10: the student dashboard follows the owner's mock
  (`spec/build-step-10-mock.webp`): a header strip, the honest partial
  average with its gap, one factual sentence, a row per top-6 course with a
  grade-over-time line against its target and a status pill, then
  priorities and upcoming. An assessment is now an assignment with a due
  date or a test with the day it is held, never both, and the teacher's
  form toggles between them (ADR 0030); `graded_at` is an entry stamp and
  nothing a student sees reads it. The chart replays the grade engine on
  each assessment's date, so every point is reproducible (ADR 0031). The
  sentence is a fact chosen by rule from a pool in one copy file, never a
  forecast (ADR 0032). Every top-6 course is listed whatever its status;
  before, a completed course was averaged in but never shown. Verified:
  constraints and RLS (`supabase/tests/tracker_dashboard.sql`), 119 unit
  tests, and 70 end-to-end checks (`e2e/tracker/flows.mjs`).

## Before step 10 goes live

1. ~~Apply `0008_tracker_assessment_kind` to the live project with sign-off.~~
   Done 2026-10-06 with sign-off, through the Supabase MCP: `kind`, `held_on`,
   the one-date check and the index are in place. No assessments existed yet,
   so nothing was backfilled. Still to do: regenerate types.
2. Tell the tutor: tests get the day they are written, assignments their
   due date; an item with no date stays off the student's chart.

## Before step 9 goes live

1. ~~Apply `0007_tracker_intake` to the live project with sign-off.~~ Done
   2026-10-05 with sign-off: the one existing student is S-0001, both
   triggers are in place, `ai_drafts.course_id` is nullable. Still to do:
   regenerate types.
2. For AI drafting: add `ANTHROPIC_API_KEY` to the tracker's Vercel project
   (server-only, no `NEXT_PUBLIC_`), with a monthly spend limit on the key.
   Without it the composer stays hidden. Still not set as of 2026-10-05.
3. Privacy policy: text, photos and transcripts a teacher sends (with the
   student's name and emails removed from text; photos and PDFs as they are)
   go to Anthropic's API.
4. Operating procedure: write the student number, never the name, on
   trial-lesson notes; save the Zoom transcript; say the goal, the six
   courses, current marks and known weights out loud in one block near the
   end of the lesson.

## Before step 8 goes live

1. ~~Apply `0006_tracker_v1` to the live project before merging.~~ Done
   2026-10-05 with sign-off; RLS on all 12 tracker tables, students can write
   flags only through the two functions, anon cannot call them.
2. ~~For AI paste: add `ANTHROPIC_API_KEY`.~~ Carried into the step 9 list.
3. ~~Privacy policy: pasted grades.~~ Carried into the step 9 list.

## Before real students (outside the code)

1. ~~Apply `0003`, `0004`, `0005` to the live project and run
   `supabase/seed/tracker-bootstrap.sql`.~~ Done 2026-10-04 with sign-off;
   y.wang217@gmail.com owns the AP Academy org. Still to do: add `tracker`
   under API settings > Exposed schemas, then regenerate types.
2. Add the `SUPABASE_DB_URL` and `BACKUP_PUBLIC_KEY` repository secrets, run the
   backup workflow once, and drill a restore into a scratch project.
3. Move Supabase to Pro (no pausing, daily backups).
4. Privacy policy: student data is stored in the US (workspace ADR 0001).
5. Decide whether under-16 students need a parent-consent path.

## To do

- Scheduler 2/8 (REQ-3): availability and class tables (migration 0010), recurrence engine and JSON endpoints are built. 0010 applied 2026-10-14. No UI yet (ADR 0034).
- Scheduler 3/8 (REQ-4): Weekly Schedule import, generated summary write-back and monthly review are built (migration 0011, ADR 0035, admin page `/scheduler/schedules`). Operator steps, in order: grant the Notion integration read and update on Students & Parents; Charlie signs off and 0011 is applied; add `| Teacher Name` to each live line (and a time to any `Tue 1h` line); press Check, then Import.

Ideas with a go-ahead but no spec yet. Each becomes a step, with its prompt
committed to `spec/` first, before any code.

- **Field help on the teacher's pages.** A short "how to fill this in" beside
  each field: what a category weight is and where to find it on the school
  syllabus, when an item is a test (the day it is written) and when an
  assignment (the day it is due), what "needs review" means, what a course
  target does, what the benchmark note is for. One sentence per field, from a
  single copy file, shown as a hint under the field or behind a small "?".
  Owner's words (2026-10-06): "write a 'help' into the pages that teach a user
  how to fill out each field."

## Not built (v0 scope or later)

- Syllabus edits after publish (ADR 0018).
- An audit history screen. The log is complete; nothing shows it yet.
- An org-wide AI usage screen. Each student's page lists their drafts; nothing adds them up per org yet.
- Changing an assessment's kind or date after it is created, other than through an AI draft (ADR 0030).
- A photo of the marked test attached to its score. Deferred by the owner to its own spec: it needs file storage, a migration and a personal-data ADR.
- Parent writes (out of scope, ADR 0045). Parent reads are being built as REQ-22 to REQ-25.
- Scheduler 4/8 (REQ-5): teacher availability editor at `/tracker/schedule/availability` (phone-first, copy a day, days off and extra hours, 14-day preview), computed conflicts list at `/tracker/schedule/conflicts` and a badge on the owner's home (ADR 0036). No migration.
- Scheduler 5/8 (REQ-6): read-only week calendar at `/tracker/schedule` (teacher week, admin teacher picker, All teachers view with hours, class details dialog) and `GET /api/scheduler/week` (ADR 0037). No migration.
- Scheduler 6/8 (REQ-7): admin booking on `/tracker/schedule`: book one-off and weekly classes, edit, cancel (this or this and future), and drag a class to another day or time with a scope prompt and rollback. Server checks teacher and student double-booking and availability (ADR 0038). No migration.
- Scheduler 7/8 (REQ-8): a daily "Text teachers their schedules" task in Notion's Work database, one checkbox and copyable message per active teacher, refreshed when today's classes change, with a Resend label for a teacher already ticked. Hourly GitHub Actions trigger, bearer-protected endpoint, service role key confined to that route (ADR 0039). Migration 0012 (applied 2026-10-14). Nothing is sent automatically.
- Scheduler 8/8 (REQ-9): closes the module with no new behaviour. A pure lesson-link extension point (`lesson-link.ts`, ADR 0040, not wired), tests and an e2e check proving booking, moving and cancelling never touch Lessons, payouts or other tracker tables, a verification record (`scheduler-report.md`) and an operator guide (`scheduler-operations.md`). No migration.
- Security 6/9 (REQ-15): owners see which login claimed each student and can unlink a wrong one from the student page, with a corrected email (ADR 0041). The review step now shows the student email and who will see the grades. Migration 0014 (applied 2026-10-15).
- Parent 1/4 (REQ-22): parent accounts linked to students by an owner, claimed on first sign-in, and a read-only shell at `/tracker/parent` (child pills, Grades, Calendar and Billing placeholders). Parent read policies in the database, owner Parent section on the student page (ADRs 0045, 0046). Migrations 0015 and 0016 (applied 2026-10-16). ADR numbers are 0045 and 0046 because 0044 was taken by Server-Timing.
- Scheduler tutorial: `scheduler-tutorial.md` walks each view (week calendar, booking and moving, availability, conflicts, import, daily task) with a numbered live test checklist per view and a results table, for the first live run. Docs only.
- Parent 2/4 (REQ-23): the parent Grades tab shows the child's student dashboard read-only (same view model, no flags, no Done buttons, no course links, no Extra practice) plus a "Recent marks" card with the 5 newest scored marks by test or due date. No migration, no new ADR.
- Parent 3/4 (REQ-24): the parent Calendar tab shows one month of the child's scheduler classes (dots at 375px, blocks from 640px), a month switcher with a pending state, the summary line and This week, each class Scheduled, Moved, Cancelled or Makeup (ADR 0047). Reads under the 0016 parent policies; no migration. The shared parent forbidden-pattern list lives in `test/parent-guardrails.ts`.
- 2026-10-16: pipeline event chaining is live (ADR 0003). This line was added by the pipeline's first end-to-end run.
- Security (REQ-26): only an org owner can change `students.notion_student_id`; a guard trigger refuses teachers with `42501` (ADR 0048). Migration 0017 (applied 2026-10-16).
- Parent 4/4 (REQ-25): the parent Billing tab shows this month's invoice (Paid, Due or Overdue, the credit applied and a shared-invoice line), the child's credits with the Open total, past invoices and the rate line, read-only from the Notion Invoices, Missed Sessions & Credits and Students & Parents databases. Invoice PDFs open through a no-store tracker route that never exposes the Notion file link (ADR 0049). No migration. The Notion integration must be shared with Invoices and Missed Sessions & Credits before deploy.
- Feedback 3 (REQ-30): every class write goes through one locked database function that refuses if any teacher or student booking stamp changed since the check, so two clashing saves cannot both land; a retried or doubled request returns its first result (ADR 0050). Migration 0018 (applied 2026-10-17).
- Feedback 4 (REQ-31): the parent calendar says "past", not "done", and a one-off class is labelled by the purpose the owner declares (Makeup, Trial, Extra, or "Class" when none is set), with an optional "Makeup for Tue Oct 13" link to the cancellation it replaces; the booking form asks for the purpose, and the week cards and class dialog show it (ADR 0051, superseding parts of 0047). Migration 0019 (applied 2026-10-17).
- Feedback 5 (REQ-32): one permission matrix (`docs/permission-matrix.md`) for the owner, grade teacher, scheduling-only teacher, student, parent and the four multi-role logins, across every `tracker` table and the Notion-backed reads, proven cell by cell by `supabase/tests/permission_matrix.sql` and kept in step with the doc by a Vitest drift check. A grade teacher now reads only the grade tables' audit rows (ADR 0052). Migration 0020 (applied 2026-10-19).
- Feedback 6 (REQ-33): an owner-only setup checklist at `/tracker/scheduler/setup` shows seven steps (teachers approved, availability, schedules adopted, parent links, Notion records, daily task, the 0017 guard) with a live count, Done, Partial, Missing or Not checked, who is affected and where to fix it. Reads only, through the owner's client, the new `tracker.setup_checks` function and a names-only Notion query; a failed read shows "Could not read Notion" or "Could not check", never a zero (ADR 0053). Migration 0021_setup_checks (applied 2026-10-19).
- Feedback 7 (REQ-35): every class save records the Notion exports it owes (the Weekly Schedule, today's task) in `tracker.notion_outbox` through a trigger in the same transaction, delivers them right away, and leaves anything undelivered to later owner requests and the hourly run, with backoff, read-before-write and never a repeated append; the week editor's "Notion exports" strip shows failed, uncertain and stale exports with a Retry (ADR 0054). Migration 0021_notion_outbox (applied 2026-10-20).
- Feedback 9 (REQ-38): staff and student names come from a local copy (`tracker.staff`, `tracker.student_people`) synced from Notion hourly and on the owner's Sync now, read under RLS on every scheduler page, the daily task and the parent calendar, with a "Names last updated" notice when stale; a teacher whose local staff row is inactive loses scope on the next request (ADR 0055, workspace ADR 0004). Migration 0022 (applied 2026-10-20).
- Feedback 11 (REQ-39): a teacher presses Log this class on a past class to create (or find) its Notion Lessons row carrying a `Class occurrence` ref, or Mark no-show, kept only in the tracker; the owner links form-logged rows on Unlinked lessons and can clear a wrong link or no-show. A logged class is frozen against cancel and move. No payout field is read or written (ADR 0054, superseding 0040). Migration 0023 (not yet applied); Lessons needs the `Class occurrence` Text property first.
- Iris 2/9 (REQ-42): Iris gets its home in the tracker. A bearer-protected run every 15 minutes reads charlie@apacademy.ca with a read-only Gmail service account, stores each message once in the new `iris` schema, matches the sender to a family in Students & Parents (live, uncached, four properties), and lists unknown senders under Needs you on the owner-only `/tracker/iris`. `/tracker/iris/settings` has Pause, Unpause (with the privacy tick) and Run now. Iris starts paused; nothing is classified, drafted or sent (ADRs 0057 to 0059, workspace ADR 0005, `docs/iris-operations.md`). Migration 0024 (not yet applied).
- Feedback 12 (REQ-40): an owner-only month export at `/api/scheduler/monthly-billing-input` lists every class per adopted student with its scheduler state, outcome and a charge state from one pure rule set (`lib/domain/billing/charge-state.ts`, rules version 1), versioned against a checked-in fixture month; `/tracker/scheduler/billing` sets the Weekly Schedule text count next to the structured count and explains every difference. Read only, no Notion request, no migration (ADR 0060, `docs/billing-input.md`).
- Iris 3/9 (REQ-43): each matched message is classified once by Claude (intents, confidence, flags, child) and routed by a pure rule set in `lib/iris/route.ts`: anything sensitive (model flag or keyword backstop), mixed, under the 0.85 threshold, money-related, or about an unnamed sibling escalates to Needs you with a reason; thank-yous are marked handled; the rest waits at `classified` for drafting. New owner-only `/tracker/iris/messages/[id]` with Mark handled. One `iris.ai_calls` row per call, tokens only; no prompt or answer text stored. POLICY_VERSION 2. No migration (ADR 0061).
