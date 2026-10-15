# 0041: An owner can unlink a claimed student, through a function only
Status: accepted
Date: 2026-10-15

## Context
`claim_student_invites()` links the first login whose email matches a published, unclaimed student (ADR 0016). A mistyped address hands that student's grades to a stranger, and `user_id` is not in the staff update grant, so undoing it needed the SQL editor. Staff also could not see who had claimed a student.

## Decision
- **Refines ADR 0016.** An org owner may clear a claim, only through `tracker.unlink_student(student_id)` (security definer, `search_path = ''`). No grant or RLS policy changes; `user_id` stays out of the staff update grant.
- **The email changes first.** The function refuses (`23514`) while `students.email` still equals the linked login's email, because otherwise the next tracker request would claim the student again. `claim_student_invites` is untouched. The action saves the corrected email through the existing grant, then calls the function; a retry after a partial failure only repeats the call.
- **What it removes.** `user_id` is set to null and the former user's `student` membership in that org is deleted when they hold no other student row there. `owner` and `teacher` memberships stay. The `students` change is audited by the existing trigger; the membership delete has no trigger, so the function writes its own `audit_log` row.
- **Who can see the login.** `tracker.student_logins(target_org)` returns login emails to owners of that org only, so no grant on `auth.users` is widened. Teachers see "Signed in" without the address.
- **Same error for unknown and foreign ids** (`42501`), so the function does not reveal whether a student id exists.

## Alternatives considered
- A per-student "do not auto-claim" flag. Changes the matcher, which is out of scope.
- One atomic `unlink_student(student_id, new_email)`. Fewer round trips, but a wider signature than the card specified.

## Consequences
- Migration 0014 must be applied to the live database before the UI works; until then the owner's pages cannot load login emails.
- The stranger's open session stays valid but RLS hides every row, so their next request resolves to no access.
