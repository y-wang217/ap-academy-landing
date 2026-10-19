-- REQ-33: read-only health checks for the owner setup page
-- (/tracker/scheduler/setup). Tested by supabase/tests/setup_checks.sql.
-- Tracker ADR 0053.
--
-- One row today: whether the 0017 guard trigger students_guard_notion_link is
-- present and enabled on tracker.students. Security invoker on purpose:
-- pg_catalog.pg_trigger is readable by authenticated, and the whole select is
-- filtered by tracker.is_org_owner(target_org), so anyone but that org's owner
-- gets zero rows. No table, column, policy or trigger changes. Later guards add
-- rows to the same function.

create or replace function tracker.setup_checks(target_org uuid)
returns table (check_name text, ok boolean)
language sql
stable
security invoker
set search_path = ''
as $$
  select 'notion_link_guard'::text,
         exists (
           select 1
             from pg_catalog.pg_trigger t
             join pg_catalog.pg_class c on c.oid = t.tgrelid
             join pg_catalog.pg_namespace n on n.oid = c.relnamespace
            where n.nspname = 'tracker'
              and c.relname = 'students'
              and t.tgname = 'students_guard_notion_link'
              and not t.tgisinternal
              and t.tgenabled <> 'D'
         )
   where tracker.is_org_owner(target_org);
$$;

revoke all on function tracker.setup_checks(uuid) from public, anon;
grant execute on function tracker.setup_checks(uuid) to authenticated;
