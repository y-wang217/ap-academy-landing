# REQ-15: Unlink a wrongly claimed student and show who claimed it

Copied from the approved Notion card: https://app.notion.com/p/3f9d6ae73dd781459f2cdefcc13341e9
Risk: High (changes who can clear `students.user_id`; deletes a `memberships` row). Blocked by REQ-14 (Done).

**Summary:** An org owner sees which login claimed each student and can unlink a wrong one from the student page (supplying the corrected email in the same form), without the SQL editor; teachers see the claim state without the address.

**Shaping finding:** clearing `user_id` alone fixes nothing, because the student's `email` still matches the stranger's login and `claim_student_invites()` would re-claim on the next request. The function therefore refuses while the email is unchanged.

## Acceptance criteria
- AC1: `tracker.unlink_student(uuid)` and `tracker.student_logins(uuid)` exist as `security definer`, `search_path = ''`; execute true for `authenticated`, false for `anon`.
- AC2: a teacher of the org gets `42501`; nothing changes.
- AC3: an owner of another org, or an unknown id, gets `42501`.
- AC4: unlinking an unclaimed student gives `P0002` "student is not linked to a login".
- AC5: unlinking while `students.email` equals the login email gives `23514` "change the student email before unlinking".
- AC6: after the email is changed, unlink clears `user_id` and deletes the former user's `student` membership in that org; `owner`/`teacher` memberships stay.
- AC7: `audit_log` gets an UPDATE row for `students` and a DELETE row for `memberships`, both with `actor_id` = the owner.
- AC8: the former user reads zero rows of the student across eight tables; `claim_student_invites()` returns 0 for them.
- AC9: a login with the corrected email claims the student and reads it.
- AC10: `student_logins(org)` returns `(student_id, login_email)` to an owner of that org; zero rows to a teacher or other-org owner. No grant on `auth.users` changes.
- AC11: staff list shows "Not claimed yet" / "Signed in as <email>" (owner) / "Signed in" (teacher) for published students; nothing for students in setup.
- AC12: the Invite card shows the same state; owners also get an Unlink form with a required "Correct email" and a confirm prompt.
- AC13: `unlinkStudent` rejects a non-owner, an invalid email, an unchanged email and an unclaimed student without writing; any database refusal returns a failed `Result`.
- AC14: the wizard review step shows the student email in bold, the sentence "The first person to sign in with this address will see this student's grades." and a link to fix the email.

## Migration
`supabase/migrations/0014_unlink_student.sql` (own PR `req/REQ-15-migration`, human-merged and applied). Check: `supabase/tests/tracker_unlink.sql`.

## Tracker app
`getViewer` gains `role` (owner preferred); `listLoginEmails`; pure `lib/view/claim-text.ts` and `lib/data/unlink.ts`; `UnlinkInput`; error copy in `errors.ts`; `unlinkStudent` action; `InvitePanel` props `loginEmail`/`canUnlink`; list page, student page and review step updated; ADR 0041, decisions README row, PLAN line.

## Test plan
SQL (`pnpm test:rls`) for AC1 to AC10; vitest for `claim-text`, `unlink`, `errors`, `schemas`; `e2e/tracker/flows.mjs` for AC6, AC8, AC9, AC11, AC12, AC14.

## Decisions (defaults accepted)
No new dependencies; `tracker` schema, two definer functions; corrected email required (function-enforced); teachers see "Signed in" without the address; email changed by a prior update through the existing grant; Viewer gains `role`; pure helpers; revoke names `anon`; static confirm text; ADR 0041; archived students can be unlinked.
