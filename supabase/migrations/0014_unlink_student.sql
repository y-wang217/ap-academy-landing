-- REQ-15 (Security 6/9): an org owner can unlink a wrongly claimed student and
-- see which login claimed each student. Tested by supabase/tests/tracker_unlink.sql.
--
-- Clearing students.user_id alone would not help: the student's email still
-- matches the stranger's login, so claim_student_invites() would link them again
-- on their next request. unlink_student therefore refuses while the stored email
-- still equals the linked login's email; the caller changes the email first.

create or replace function tracker.unlink_student(student_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  s record;
  login_email text;
  removed tracker.memberships;
begin
  -- The lock stops a parallel claim between the checks and the update.
  select st.id, st.org_id, st.user_id, st.email into s
    from tracker.students st
   where st.id = unlink_student.student_id
   for update;

  -- Same error for a missing row and a foreign org, so ids are not probeable.
  if not found or not tracker.is_org_owner(s.org_id) then
    raise exception 'only an owner of this student''s org can unlink'
      using errcode = 'insufficient_privilege';
  end if;
  if s.user_id is null then
    raise exception 'student is not linked to a login' using errcode = 'no_data_found';
  end if;

  select lower(btrim(coalesce(u.email, ''))) into login_email
    from auth.users u where u.id = s.user_id;
  if login_email = s.email then
    raise exception 'change the student email before unlinking'
      using errcode = 'check_violation';
  end if;

  update tracker.students set user_id = null where id = s.id;

  if not exists (
    select 1 from tracker.students o
    where o.org_id = s.org_id and o.user_id = s.user_id
  ) then
    delete from tracker.memberships m
     where m.user_id = s.user_id and m.org_id = s.org_id and m.role = 'student'
    returning m.* into removed;
    if found then
      insert into tracker.audit_log (org_id, actor_id, table_name, row_id, action, before, after)
      values (s.org_id, (select auth.uid()), 'memberships', s.user_id::text, 'DELETE',
              to_jsonb(removed), null);
    end if;
  end if;
end;
$$;

-- Owner-only login emails, without widening any grant on auth.users.
create or replace function tracker.student_logins(target_org uuid)
returns table (student_id uuid, login_email text)
language sql
stable
security definer
set search_path = ''
as $$
  select s.id, u.email::text
    from tracker.students s
    join auth.users u on u.id = s.user_id
   where s.org_id = target_org
     and tracker.is_org_owner(target_org);
$$;

revoke all on function tracker.unlink_student(uuid) from public, anon;
revoke all on function tracker.student_logins(uuid) from public, anon;
grant execute on function tracker.unlink_student(uuid) to authenticated;
grant execute on function tracker.student_logins(uuid) to authenticated;
