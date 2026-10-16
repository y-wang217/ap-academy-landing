# 0048: Only an owner can change a student's Notion record link
Status: accepted
Date: 2026-10-16

## Context
`tracker.students.notion_student_id` (ADR 0046, migration 0016) holds the child's Students & Parents page ID. It decides which class schedules a parent reads through `tracker.is_my_childs_schedule()`, and the Billing tab will use it the same way. The app only lets an owner set it (`setScheduleRecord`), but 0016 put it in the `authenticated` update grant and the "staff update students" policy lets any teacher of the org update the row. A teacher calling the API directly could point a student at another child's record and show that child's classes to the wrong parent.

## Decision
- **The database enforces owner-only.** Migration 0017 adds trigger `students_guard_notion_link`, `before update of notion_student_id` and only when the value actually changes. Its function `tracker.guard_student_notion_link()` raises `42501` unless the caller is an owner of the student's org (`tracker.is_org_owner(old.org_id)`).
- **A trigger, not a column revoke.** Revoking the column and adding a security-definer setter is the stricter grant-level shape, but it changes `setScheduleRecord`, its `23505` mapping and the e2e `psql` seed path. The trigger keeps all three as they are and follows the existing guard triggers (`guard_parent_email`, `guard_syllabus_confirm`).
- **Invoker, fail closed.** The function is not security definer, so it sees the role that ran the statement. Roles that already bypass RLS (`rolsuper` or `rolbypassrls`: `service_role`, the superuser used by seed and e2e scripts) are exempt; every other role must be an owner, so a new API role is covered without editing the function.
- **Same-value writes pass.** A full-row update that writes the current value back never reaches the check, so teachers keep every other column they could edit.

## Consequences
- A refused update aborts the statement, so it writes no audit row and does not bump `updated_at`.
- Values set before 0017 are not re-checked; the owner can see and correct them in the schedule-record control.
- Revisit if another column gains the same role in parent visibility: it needs the same guard.
