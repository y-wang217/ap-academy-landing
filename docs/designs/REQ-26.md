# REQ-26: Only owners can change a student's Notion record link

Card: https://app.notion.com/p/3fbd6ae73dd781e7b1c7c3a7390a54a4 (design approved there; this is the build copy).

**Summary:** The database refuses any change to `tracker.students.notion_student_id` unless the caller owns the student's org, so a teacher can no longer repoint a child's schedule (and with it, what a parent sees) through a direct API call.

**Risk:** High (it changes what a signed-in teacher can change on `tracker.students`, and that column decides which class schedules a parent can read through `tracker.is_my_childs_schedule()`).

## Problem
`supabase/migrations/0016_parent_links.sql` added `tracker.students.notion_student_id` and put it in the column-level update grant for `authenticated`. Row access comes from policy "staff update students" in `supabase/migrations/0004_tracker_core.sql`, which uses `tracker.is_org_staff()` (owner or teacher). Only the app limits the column to owners: `setScheduleRecord` in `apps/tracker/app/actions/teacher.ts` checks `v.role !== "owner"`. A teacher calling PostgREST directly can set the column to another child's Students & Parents page ID, and `tracker.is_my_childs_schedule()` then shows that child's `class_series` and `class_exceptions` to the wrong parent.

## Acceptance criteria
- AC1: As a teacher of the org, `update tracker.students set notion_student_id = <x>` raises SQLSTATE `42501`, and the stored value is unchanged.
- AC2: As the same teacher, clearing it (`set notion_student_id = null`) also raises `42501`, and the value is unchanged.
- AC3: As the same teacher, updating `first_name`, `grade_level`, `status`, `email` and `published_at` still succeeds, including an update that writes `notion_student_id` back to its current value in the same statement.
- AC4: As the org owner, setting `notion_student_id` to a new ID and clearing it to null both succeed.
- AC5: As the org owner, setting it to an ID another student in the same org already holds raises `23505`, so `setScheduleRecord` still returns "That record is already linked to another student."
- AC6: An owner of a different org cannot change it either (the update touches 0 rows, value unchanged).
- AC7: `service_role` and the superuser (seed scripts, `e2e/tracker/flows.mjs` via `psql`) can still set it.
- AC8: A refused teacher update writes no `tracker.audit_log` row; an owner change writes the normal `audit_students` row.
- AC9: `pnpm test:rls`, `pnpm --filter tracker test` and `pnpm test:tracker` pass with no edits to existing assertions.

## Approach
**Chosen mechanism: a `before update` trigger** (Decision 3).
- Migration `supabase/migrations/0017_student_notion_link_owner_only.sql` adds `tracker.guard_student_notion_link()` and a trigger on `tracker.students`. The column grant from 0016 and the "staff update students" policy stay as they are.
- The trigger is `before update of notion_student_id ... for each row when (old.notion_student_id is distinct from new.notion_student_id)`.
- The function is plain plpgsql, not security definer, with `set search_path = ''`, so `current_user` is the API role that ran the statement. It allows the change when `tracker.is_org_owner(old.org_id)` is true, or when `current_user` has `rolsuper or rolbypassrls`. Otherwise it raises with errcode `insufficient_privilege` (`42501`). Fail-closed for any future API role.
- `revoke all on function tracker.guard_student_notion_link() from public, anon, authenticated;`
- No app code changes. A one-line comment above `setScheduleRecord` says the database enforces owner-only too (migration 0017).
- ADR `apps/tracker/docs/decisions/0048-notion-link-owner-only.md`, listed in the decisions README.
- Feature PR (based on the migration branch): the ADR, the README index line and the comment. `awaiting-migration`, and `needs-human-merge` because the card is High.

## Migration
- File: `supabase/migrations/0017_student_notion_link_owner_only.sql`.
- Check: `supabase/tests/student_notion_link.sql`, run by `supabase/tests/run-rls.sh`. Proves AC1 to AC8.
- Ships first on its own PR (`req/REQ-26-migration`, `needs-human-merge`), applied by Charlie through the Supabase MCP `apply_migration` as `0017_student_notion_link_owner_only`.

## Test plan
| Test | Type | Covers |
|---|---|---|
| `supabase/tests/student_notion_link.sql`: teacher set and clear raise `42501`, value unchanged | integration (RLS) | AC1, AC2 |
| same file: teacher updates other columns and a same-value write succeed | integration (RLS) | AC3 |
| same file: owner sets and clears; owner duplicate raises `23505` | integration (RLS) | AC4, AC5 |
| same file: O2 update touches 0 rows | integration (RLS) | AC6 |
| same file: `service_role` and superuser updates succeed | integration (RLS) | AC7 |
| same file: audit count unchanged after the refused update, +1 after the owner update | integration (RLS) | AC8 |
| existing `pnpm test:rls`, `pnpm --filter tracker test`, `pnpm test:tracker` unchanged | integration + unit + e2e | AC5, AC7, AC9 |

## Out of scope
Any other column or policy on `tracker.students`. `tracker.class_series`. Moving `setScheduleRecord` to an RPC. UI changes. Any audit of values written before 0017.

## Decisions (defaults accepted)
1. No new dependencies.
2. `tracker` schema, migration 0017, one guard trigger; no table, policy or grant change.
3. Trigger, not a column revoke plus a security-definer setter: no change to `setScheduleRecord`, follows `guard_parent_email`, keeps `psql` seeding working.
4. Exempt: org owners plus roles with `rolsuper or rolbypassrls`.
5. Error code `42501`.
6. A small feature PR with the ADR, its README line and the comment.
7. No backfill or audit of current values.
