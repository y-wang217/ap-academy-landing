# Decisions

Tracker ADRs. Never edit an accepted decision; supersede it with a new ADR.
Workspace-level decisions live in the repo-root `docs/adr/`.

| # | Title | Status |
|---|---|---|
| [0001](0001-stack.md) | Stack: Next.js, Supabase and Vercel, no extra infrastructure | accepted |
| [0002](0002-security-via-rls.md) | Security via Postgres RLS, not app code | accepted |
| [0003](0003-multi-tenant-org-id.md) | Multi-tenant schema with org_id from day one | accepted |
| [0004](0004-student-record-separate-from-auth-user.md) | Student record separate from the auth user | accepted |
| [0005](0005-pure-grade-engine.md) | Pure, deterministic grade engine, normalized over scored categories | accepted |
| [0006](0006-per-category-aggregation.md) | Per-category aggregation method, default mean_of_percentages | accepted |
| [0007](0007-unmarked-zero-excused.md) | Unmarked (null), zero and excused are different | accepted |
| [0008](0008-done-independent-of-grading.md) | Done and grading are independent; assessment state is derived | accepted |
| [0009](0009-syllabus-versions-and-audit-log.md) | Syllabus versioning plus a trigger-written, append-only audit log | accepted |
| [0010](0010-six-course-progress.md) | Six-course progress shows the graded count, never a partial average as final | accepted |
| [0011](0011-ai-draft-change-sets.md) | AI produces draft change sets only (deferred to v1) | accepted |
| [0012](0012-minimal-pii-region-magic-link.md) | Minimal PII, Canada region, magic-link auth | accepted in part; region and auth location superseded by 0013 |
| [0013](0013-workspace-overrides.md) | Workspace decisions that override this app's CLAUDE.md | accepted |
| [0014](0014-denormalized-tenant-keys.md) | org_id and student_id on every child row, enforced by composite foreign keys | accepted |
| [0015](0015-student-writes-through-functions.md) | Students write only through narrow SQL functions | accepted |
| [0016](0016-invite-and-claim.md) | Invite is a prefilled email from the teacher; the login is claimed by email | accepted |
| [0017](0017-zod-at-the-data-boundary.md) | Rows are validated with Zod at the data boundary | accepted |
| [0018](0018-syllabus-editing-deferred.md) | Syllabus editing after publish is deferred | accepted |
| [0019](0019-reference-example-precision.md) | The reference example is 96.4695 at full precision | accepted |
| [0020](0020-backups.md) | Nightly encrypted pg_dump to GitHub Actions artifacts | accepted |
| [0021](0021-one-goal-per-student.md) | One goal per student | accepted |
| [0022](0022-targets-tolerance.md) | Course targets may differ from the six-course target by up to 0.5 points before warning | accepted |
| [0023](0023-local-integration-stack.md) | End-to-end tests run on Postgres, PostgREST and a mock auth server | accepted |
| [0024](0024-priority-suggestions.md) | Priority suggestions are rule-based and reach students only through the teacher | accepted |
| [0025](0025-student-grade-flags.md) | Students flag a grade with a fixed reason; the teacher resolves it | accepted |
| [0026](0026-ai-provider.md) | AI drafts use Claude through the Anthropic SDK, behind one module, off unless a key is set | accepted |
| [0027](0027-change-sets.md) | Assessment edits share one change-set shape, AI and manual alike | accepted |
| [0028](0028-intake-sources.md) | AI intake reads photos, PDFs, transcripts and instructions; notes carry a student number, not a name | accepted |
| [0029](0029-student-change-set.md) | One change set covers the whole student; every teacher edit is an item in it | accepted |
| [0030](0030-assessment-kind-and-date.md) | An assessment is an assignment with a due date or a test with a held date | accepted |
| [0031](0031-grade-history-and-trend-pills.md) | Grade history is replayed on the assessment date; the pill follows four rules | accepted |
| [0032](0032-story-line.md) | The story line is a fact chosen by rule, never a forecast | accepted |
| [0033](0033-scheduler-staff-identity.md) | Scheduler teachers are linked to Notion Staff by approval, not given a membership | accepted |
| [0034](0034-scheduler-recurrence-model.md) | Occurrences are computed from a series plus one exception row each | accepted |
| [0035](0035-weekly-schedule-import-and-summary.md) | Weekly Schedule import is all or nothing per student, and the text field becomes a generated summary | accepted |
| [0036](0036-availability-conflicts-computed.md) | Availability conflicts are computed on read, and a teacher with nothing entered is not flagged | accepted |
| [0037](0037-teachers-see-own-student-names.md) | Teachers see the names of their own scheduled students | accepted |
| [0038](0038-booking-validation.md) | Bookings are checked on the server before any write | accepted |
| [0039](0039-daily-teacher-texts-task.md) | The daily teacher-texts task is one Notion page per date, kept apart by a lease | accepted |
| [0040](0040-lesson-link-extension-point.md) | A delivered lesson will point at a class occurrence through one reference, and nothing is wired yet | accepted |
| [0041](0041-owner-unlinks-claimed-student.md) | An owner can unlink a claimed student, through a function only | accepted |
| [0042](0042-origin-check-for-scheduler-api.md) | The proxy refuses cross-site writes to the scheduler API | accepted |
| [0043](0043-daily-text-greeting-name.md) | The daily text greets a teacher by honorific and name | accepted |
| [0044](0044-server-timing-on-scheduler-get.md) | Server-Timing on the scheduler GET routes | accepted |
| [0045](0045-parent-accounts-read-only.md) | Parent accounts are read-only | accepted |
| [0046](0046-parent-email-minimal-pii.md) | A parent's email is the only new personal field | accepted |
| [0047](0047-parent-calendar-states.md) | Parent Calendar states, makeups and the not-available rule | accepted |
