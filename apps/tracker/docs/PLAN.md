# Student Tracker: build progress

The work plan is [`spec/tracker-plan.md`](spec/tracker-plan.md); the build order is
in [`../CLAUDE.md`](../CLAUDE.md). Decisions: [`decisions/`](decisions/README.md).
Each step is done only when lint, typecheck and tests pass.

| Step | What | Status |
|---|---|---|
| 1 | Scaffold, Supabase clients, env, CI, seed ADRs | done |
| 2 | Migrations and RLS, with RLS tests | done: `0004_tracker_core.sql`, `supabase/tests/tracker.sql` (not applied to live) |
| 3 | Grade engine and tests | done: `lib/domain/`, 35 tests incl. the six required |
| 4 | Teacher onboarding wizard | not started |
| 5 | Teacher course view | not started |
| 6 | Student dashboard, drill-down, Done | not started |
| 7 | Reliability: audit, stamps, states, errors, backups, restore | not started |
| 8 | Stop. v1 needs explicit go-ahead | |

## Notes
- Step 3: the brief's reference example is 96.4695 at full precision, not
  96.4709; both display as 96.47 (ADR 0019).
- Step 2: student user_id is set only by `claim_student_invites()`; a
  confirmed syllabus version is read-only in the database, not just the UI.
