# REQ-13: Migration 0013: lock down handle_new_user

Copied from the Notion card (https://app.notion.com/p/3f9d6ae73dd781e295afd8779fac5fa8).

**Summary:** A one-statement migration, `supabase/migrations/0013_lock_down_handle_new_user.sql`, takes away `anon`'s and `authenticated`'s right to execute `public.handle_new_user()`. Signups still create a `public.profiles` row. A new RLS check file proves both, and that `unsubscribe_by_token` keeps its grant.

**Risk:** High. Database migration on the function behind the signup trigger. `supabase/` is in `human_merge_paths`; only Charlie applies it.

## Acceptance criteria
- AC1: `0013_lock_down_handle_new_user.sql` exists with a header comment and exactly one statement: `revoke all on function public.handle_new_user() from public, anon, authenticated;`. No other migration changes.
- AC2: After all migrations, `anon` and `authenticated` lack EXECUTE on `public.handle_new_user()`.
- AC3: As `anon` and as `authenticated`, `select public.handle_new_user()` raises SQLSTATE 42501.
- AC4: A non-superuser with only usage on `auth` and insert on `auth.users` inserts a user; exactly one `public.profiles` row is created with email and `marketing_consent` from metadata.
- AC5: `anon` still has EXECUTE on `public.unsubscribe_by_token(uuid)`.
- AC6: The new check fails without 0013 (red) and passes with it (green); both in the PR body.
- AC7: PR has `needs-human-merge`; body says the pipeline must not apply the migration, Charlie applies it via Supabase MCP `apply_migration` named `0013_lock_down_handle_new_user`, and lists the post-apply steps (re-run Security advisor, test magic-link signup).

## Approach
New files only: the migration and `supabase/tests/handle_new_user_grants.sql` (picked up by `run-rls.sh`). Privilege-sensitive steps run under `set role` because the runner connects as superuser. A direct call errors today with 0A000, so the test requires 42501 exactly.

## Out of scope
Other advisor warnings, `service_role`, function body/trigger changes, default privileges, the "Applied so far" line in root CLAUDE.md.
