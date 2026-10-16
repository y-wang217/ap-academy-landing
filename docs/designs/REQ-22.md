# Design: REQ-22 Parent 1/4: Parent accounts linked to students, with a read-only shell

Card: https://app.notion.com/p/3fbd6ae73dd781e59a40c7daec2b4722 (the approved design is on the card; this is the summary the reviewer reads next to the diff).

**Risk:** High (new sign-in role, new RLS read paths to a minor's grades and schedule, owner can delete links).

## Acceptance criteria
- AC1 Migrations add `parent` to `membership_role`, `tracker.parent_links` (RLS on), `students.notion_student_id` unique per org.
- AC2 `claim_parent_invites()` links an unclaimed row by verified email, adds a `parent` membership, claims for an unpublished child too.
- AC3 A parent reads the linked, published child's rows in students, goals, courses, syllabus_versions, categories, assessments, tasks, class_series, class_exceptions, and 0 rows of an unlinked student.
- AC4 A parent reads 0 rows of grade_flags, ai_drafts, audit_log, staff_links, availability_windows, availability_exceptions, schedule_summaries, daily_tasks, daily_task_teachers, and nothing of an unpublished child.
- AC5 Every parent write is refused or touches 0 rows; `set_assessment_done` and `set_task_done` raise.
- AC6 A student, a non-owner teacher and a foreign owner read 0 `parent_links` rows.
- AC7 An owner adds links; a student's email is refused (`23514`); `remove_parent_link` deletes the link, the membership with the last link, and audits; non-owner gets `42501`.
- AC8 `my_children()` returns only the caller's children: id, first name, last initial, published.
- AC9 A parent opening `/tracker` lands on `/tracker/parent` then the first child's grades; no children shows "Nothing here yet".
- AC10 Shell: top bar, pills only with more than one child, Grades / Calendar / Billing tabs as routes, placeholders, no input elements.
- AC11 A child id that is not the caller's gives not-found.
- AC12 An unpublished child shows "Not ready yet" and no tab content.
- AC13 Teacher, owner and student opening `/tracker/parent` go back to `/tracker`.
- AC14 Owner-only Parent section on the student page: emails with Invited or Signed in, Add parent, Open invite email, Remove with confirm, Students & Parents record picker.
- AC15 No horizontal scroll at 375px.
- AC16 ADRs for parent accounts and parent email exist, are indexed, and `apps/tracker/CLAUDE.md` cites the first.

## Deviations from the card
- ADR numbers are **0045** and **0046**, not 0044 and 0045: 0044 is already Server-Timing on `main`.
- `packages/db/src/tracker.types.ts`: `MembershipRole` gains `"parent"` so `getViewer` typechecks.
- Pushing is two PRs: the migration (0015, 0016 with `supabase/tests/parent_links.sql`) and this feature PR based on it.
