-- REQ-26: only an owner of the org (or an RLS-bypassing role) can change
-- tracker.students.notion_student_id. Run by run-rls.sh on a fresh copy of the
-- migrated database. Privilege-sensitive steps run under set role because the
-- runner connects as a superuser.

\set ON_ERROR_STOP on

-- Cast ------------------------------------------------------------------------
--   O1 owner of Org One   T1 teacher of Org One   O2 owner of Org Two
-- Students of Org One: Sam (notion N1), Bea (notion N2)
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'o1@example.com'),
  ('00000000-0000-0000-0000-0000000000a2', 't1@example.com'),
  ('00000000-0000-0000-0000-0000000000a3', 'o2@example.com');
insert into tracker.orgs (id, name) values
  ('10000000-0000-0000-0000-000000000001', 'Org One'),
  ('10000000-0000-0000-0000-000000000002', 'Org Two');
insert into tracker.memberships (user_id, org_id, role) values
  ('00000000-0000-0000-0000-0000000000a1', '10000000-0000-0000-0000-000000000001', 'owner'),
  ('00000000-0000-0000-0000-0000000000a2', '10000000-0000-0000-0000-000000000001', 'teacher'),
  ('00000000-0000-0000-0000-0000000000a3', '10000000-0000-0000-0000-000000000002', 'owner');

-- Seeded by the superuser, which the guard exempts.
insert into tracker.students (id, org_id, teacher_id, email, first_name, last_initial, grade_level, notion_student_id) values
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1', 'sam@example.com', 'Sam', 'L', 11, '70000000-0000-0000-0000-000000000001'),
  ('20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1', 'bea@example.com', 'Bea', 'K', 11, '70000000-0000-0000-0000-000000000002');

-- Helpers: run a statement and expect a SQLSTATE; read Sam's link and audit count.
create schema link_helpers;
grant usage on schema link_helpers to public;
create function link_helpers.expect_state(stmt text, want_state text)
returns void language plpgsql as $$
begin
  execute stmt;
  raise exception 'statement succeeded, expected %: %', want_state, stmt;
exception when others then
  if sqlstate = 'P0001' and sqlerrm like 'statement succeeded%' then raise; end if;
  if sqlstate <> want_state then
    raise exception 'expected %, got % (%)', want_state, sqlstate, sqlerrm;
  end if;
end $$;
grant execute on function link_helpers.expect_state(text, text) to public;

create function link_helpers.sam_link() returns uuid
language sql security definer set search_path = '' as $$
  select notion_student_id from tracker.students where id = '20000000-0000-0000-0000-000000000001';
$$;
grant execute on function link_helpers.sam_link() to public;

create function link_helpers.sam_audit_count() returns bigint
language sql security definer set search_path = '' as $$
  select count(*) from tracker.audit_log
   where table_name = 'students' and row_id = '20000000-0000-0000-0000-000000000001';
$$;
grant execute on function link_helpers.sam_audit_count() to public;

create table link_helpers.marks (k text primary key, n bigint);

-- AC1, AC2, AC8: teacher set and clear refused, value and audit unchanged --------
insert into link_helpers.marks values ('before_teacher', link_helpers.sam_audit_count());
set role authenticated;
set request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a2", "email": "t1@example.com"}';
select link_helpers.expect_state(
  $s$update tracker.students set notion_student_id = '70000000-0000-0000-0000-000000000099' where id = '20000000-0000-0000-0000-000000000001'$s$,
  '42501');
select link_helpers.expect_state(
  $s$update tracker.students set notion_student_id = null where id = '20000000-0000-0000-0000-000000000001'$s$,
  '42501');
reset role;
do $$ begin
  if link_helpers.sam_link() is distinct from '70000000-0000-0000-0000-000000000001'::uuid then
    raise exception 'teacher attempt changed notion_student_id';
  end if;
  if link_helpers.sam_audit_count() <> (select n from link_helpers.marks where k = 'before_teacher') then
    raise exception 'refused teacher update wrote an audit row';
  end if;
  raise notice 'ok: teacher set and clear refused, no audit row (AC1, AC2, AC8)';
end $$;

-- AC3: teacher keeps every other column, and a same-value write passes ----------
set role authenticated;
set request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a2", "email": "t1@example.com"}';
update tracker.students
   set first_name = 'Samuel', grade_level = 12, status = 'active',
       email = 'samuel@example.com', published_at = now()
 where id = '20000000-0000-0000-0000-000000000001';
update tracker.students
   set first_name = 'Sammy', notion_student_id = '70000000-0000-0000-0000-000000000001'
 where id = '20000000-0000-0000-0000-000000000001';
reset role;
do $$ begin
  if (select first_name || ':' || grade_level || ':' || status || ':' || email || ':' || (published_at is not null)
        from tracker.students where id = '20000000-0000-0000-0000-000000000001')
     <> 'Sammy:12:active:samuel@example.com:true' then
    raise exception 'teacher edits of other columns did not apply';
  end if;
  if link_helpers.sam_link() is distinct from '70000000-0000-0000-0000-000000000001'::uuid then
    raise exception 'same-value write changed notion_student_id';
  end if;
  raise notice 'ok: teacher edits other columns and same-value write (AC3)';
end $$;

-- AC6: an owner of another org touches 0 rows ------------------------------------
set role authenticated;
set request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a3", "email": "o2@example.com"}';
do $$ declare n int; begin
  update tracker.students set notion_student_id = '70000000-0000-0000-0000-000000000098'
   where id = '20000000-0000-0000-0000-000000000001';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'other-org owner updated % rows', n; end if;
end $$;
reset role;
do $$ begin
  if link_helpers.sam_link() is distinct from '70000000-0000-0000-0000-000000000001'::uuid then
    raise exception 'other-org owner changed notion_student_id';
  end if;
  raise notice 'ok: other-org owner touches 0 rows (AC6)';
end $$;

-- AC4, AC5, AC8: owner sets, clears; duplicate raises 23505; audit row written ---
insert into link_helpers.marks values ('before_owner', link_helpers.sam_audit_count());
set role authenticated;
set request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a1", "email": "o1@example.com"}';
update tracker.students set notion_student_id = '70000000-0000-0000-0000-000000000011'
 where id = '20000000-0000-0000-0000-000000000001';
reset role;
do $$ begin
  if link_helpers.sam_link() is distinct from '70000000-0000-0000-0000-000000000011'::uuid then
    raise exception 'owner could not set notion_student_id';
  end if;
  if link_helpers.sam_audit_count() <> (select n from link_helpers.marks where k = 'before_owner') + 1 then
    raise exception 'owner change did not write exactly one audit row';
  end if;
  if not exists (select 1 from tracker.audit_log where table_name = 'students' and action = 'UPDATE'
        and row_id = '20000000-0000-0000-0000-000000000001'
        and before->>'notion_student_id' = '70000000-0000-0000-0000-000000000001'
        and after->>'notion_student_id' = '70000000-0000-0000-0000-000000000011'
        and actor_id = '00000000-0000-0000-0000-0000000000a1') then
    raise exception 'missing owner audit row';
  end if;
end $$;
set role authenticated;
set request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a1", "email": "o1@example.com"}';
update tracker.students set notion_student_id = null
 where id = '20000000-0000-0000-0000-000000000001';
select link_helpers.expect_state(
  $s$update tracker.students set notion_student_id = '70000000-0000-0000-0000-000000000002' where id = '20000000-0000-0000-0000-000000000001'$s$,
  '23505');
reset role;
do $$ begin
  if link_helpers.sam_link() is not null then
    raise exception 'owner could not clear notion_student_id';
  end if;
  raise notice 'ok: owner sets, clears, duplicate is 23505, audit row (AC4, AC5, AC8)';
end $$;

-- AC7: service_role and the superuser can set it ---------------------------------
set role service_role;
update tracker.students set notion_student_id = '70000000-0000-0000-0000-000000000021'
 where id = '20000000-0000-0000-0000-000000000001';
reset role;
do $$ begin
  if link_helpers.sam_link() is distinct from '70000000-0000-0000-0000-000000000021'::uuid then
    raise exception 'service_role could not set notion_student_id';
  end if;
end $$;
update tracker.students set notion_student_id = '70000000-0000-0000-0000-000000000022'
 where id = '20000000-0000-0000-0000-000000000001';
do $$ begin
  if link_helpers.sam_link() is distinct from '70000000-0000-0000-0000-000000000022'::uuid then
    raise exception 'superuser could not set notion_student_id';
  end if;
  raise notice 'ok: service_role and superuser exempt (AC7)';
end $$;
