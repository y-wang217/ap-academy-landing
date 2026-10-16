-- REQ-26: only an owner of the org can change tracker.students.notion_student_id.
-- Tested by supabase/tests/student_notion_link.sql. Tracker ADR 0048.
--
-- 0016 put notion_student_id in the update grant, and the "staff update
-- students" policy (0004) lets any teacher of the org update the row. The
-- column decides which class schedules a parent reads through
-- tracker.is_my_childs_schedule(), so a teacher calling the API directly could
-- point a student at another child's record. This trigger refuses that change
-- unless the caller owns the student's org. Roles that already bypass RLS
-- (service_role, the superuser used by seed and e2e scripts) stay exempt.
-- The grant and the policy are unchanged.

-- Invoker on purpose: current_user is the role that ran the statement.
create or replace function tracker.guard_student_notion_link()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if exists (
    select 1 from pg_catalog.pg_roles r
    where r.rolname = current_user and (r.rolsuper or r.rolbypassrls)
  ) then
    return new;
  end if;
  if tracker.is_org_owner(old.org_id) then
    return new;
  end if;
  raise exception 'only an owner of this org can change a student''s schedule record'
    using errcode = 'insufficient_privilege';
end;
$$;

create trigger students_guard_notion_link
  before update of notion_student_id on tracker.students
  for each row
  when (old.notion_student_id is distinct from new.notion_student_id)
  execute function tracker.guard_student_notion_link();

revoke all on function tracker.guard_student_notion_link() from public, anon, authenticated;
