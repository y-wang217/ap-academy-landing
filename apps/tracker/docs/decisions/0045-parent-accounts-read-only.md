# 0045: Parent accounts are read-only
Status: accepted
Date: 2026-10-16

## Context
`CLAUDE.md` listed "parent accounts or views" as out of scope. The owner now wants a parent to check a child's grades, classes and invoices on a phone in under a minute (REQ-22 to REQ-25). A parent is a second audience for a minor's data.

## Decision
- **Supersedes the out-of-scope line for parent views.** Parent writes stay out of scope.
- **Read-only, in the database.** A parent has no insert, update or delete grant or policy on any table, and `set_assessment_done` and `set_task_done` already refuse anyone who is not the student. Hiding a button is never the control (non-negotiable 1).
- **A new `parent` membership role plus `tracker.parent_links`.** Links are made by an owner only, from a parent email, and claimed on the parent's first request after a magic-link sign-in, the way student invites work (ADR 0016). The first claim adds the `parent` membership; `tracker.remove_parent_link` deletes the link and, with the last link in an org, the membership, and audits both.
- **Published children only.** `is_my_linked_student` is true only while the child is published, so a parent who claims early sees "Not ready yet" and no rows.
- **Teacher-only tables stay hidden.** Flags, AI drafts, the audit log, staff links, availability and the scheduler's summaries and daily tasks have no parent policy.
- **Landing is by page, not by `proxy.ts`.** `app/page.tsx` sends a parent to `/parent`, and every `/parent` page sends anyone else back to `/`. The proxy does no data lookups today and a membership read on every request would add one.
- **Staff wins.** A login with a staff or student record never sees the parent shell. A parent address equal to a student address in the org is refused, because the student claim would take that login first.

## Alternatives considered
- A parent seeing the student's own dashboard. Rejected: the student view carries flags and write controls.
- Teachers managing parents. Rejected for now: owners only, as REQ-15.

## Consequences
- Migrations 0015 and 0016 must be live before the parent shell or the owner's Parent section works.
- Tabs 2/4 to 4/4 add read paths only; none may add a write.
