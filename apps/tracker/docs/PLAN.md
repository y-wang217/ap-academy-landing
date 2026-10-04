# Student Tracker: build progress

The work plan is [`spec/tracker-plan.md`](spec/tracker-plan.md); the build order is
in [`../CLAUDE.md`](../CLAUDE.md). Decisions: [`decisions/`](decisions/README.md).
Each step is done only when lint, typecheck and tests pass.

| Step | What | Status |
|---|---|---|
| 1 | Scaffold, Supabase clients, env, CI, seed ADRs | done |
| 2 | Migrations and RLS, with RLS tests | done: `0004_tracker_core.sql`, `supabase/tests/tracker.sql` (not applied to live) |
| 3 | Grade engine and tests | done: `lib/domain/`, 35 tests incl. the six required |
| 4 | Teacher onboarding wizard | done: `/students/new`, `/students/[id]/setup/[step]` |
| 5 | Teacher course view | done: `/students/[id]/courses/[courseId]`, priorities on `/students/[id]` |
| 6 | Student dashboard, drill-down, Done | done: `/`, `/courses/[courseId]` |
| 7 | Reliability: audit, stamps, states, errors, backups, restore | done: `0005_tracker_audit.sql`, `scripts/backup.sh`, [`docs/RESTORE.md`](../../../docs/RESTORE.md) |
| 8 | Stop. v1 needs explicit go-ahead | stopped here |

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

## Before real students (outside the code)

1. Apply `0003`, `0004`, `0005` to the live project (needs sign-off), add
   `tracker` under API settings > Exposed schemas, run
   `supabase/seed/tracker-bootstrap.sql`, regenerate types.
2. Add the `SUPABASE_DB_URL` and `BACKUP_PASSPHRASE` repository secrets, run the
   backup workflow once, and drill a restore into a scratch project.
3. Move Supabase to Pro (no pausing, daily backups).
4. Privacy policy: student data is stored in the US (workspace ADR 0001).
5. Decide whether under-16 students need a parent-consent path.

## Not built (v0 scope or later)

- Syllabus edits after publish (ADR 0018).
- An audit history screen. The log is complete; nothing shows it yet.
- v1: AI drafts, student flags on a grade, rule-based priorities (step 8).
