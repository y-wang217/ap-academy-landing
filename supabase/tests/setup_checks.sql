-- REQ-33: tracker.setup_checks(org) reports the 0017 Notion link guard to the
-- org's owner only. Run by run-rls.sh on a fresh copy of the migrated
-- database. Privilege-sensitive steps run under set role because the runner
-- connects as a superuser.

\set ON_ERROR_STOP on

-- Cast ------------------------------------------------------------------------
--   O1 owner of Org One   T1 teacher of Org One   P1 parent of Org One
--   O2 owner of Org Two
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'o1@example.com'),
  ('00000000-0000-0000-0000-0000000000a2', 't1@example.com'),
  ('00000000-0000-0000-0000-0000000000a3', 'o2@example.com'),
  ('00000000-0000-0000-0000-0000000000c1', 'p1@example.com');
insert into tracker.orgs (id, name) values
  ('10000000-0000-0000-0000-000000000001', 'Org One'),
  ('10000000-0000-0000-0000-000000000002', 'Org Two');
insert into tracker.memberships (user_id, org_id, role) values
  ('00000000-0000-0000-0000-0000000000a1', '10000000-0000-0000-0000-000000000001', 'owner'),
  ('00000000-0000-0000-0000-0000000000a2', '10000000-0000-0000-0000-000000000001', 'teacher'),
  ('00000000-0000-0000-0000-0000000000c1', '10000000-0000-0000-0000-000000000001', 'parent'),
  ('00000000-0000-0000-0000-0000000000a3', '10000000-0000-0000-0000-000000000002', 'owner');

create schema setup_helpers;
grant usage on schema setup_helpers to public;
create table setup_helpers.seen (who text, check_name text, ok boolean);
grant insert on setup_helpers.seen to public;

-- AC12: the owner sees the guard as present ------------------------------------
set role authenticated;
set request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a1", "email": "o1@example.com"}';
insert into setup_helpers.seen
  select 'o1_before', check_name, ok from tracker.setup_checks('10000000-0000-0000-0000-000000000001');

-- Teacher, parent and another org's owner get zero rows for Org One.
set request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a2", "email": "t1@example.com"}';
insert into setup_helpers.seen
  select 't1', check_name, ok from tracker.setup_checks('10000000-0000-0000-0000-000000000001');
set request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000c1", "email": "p1@example.com"}';
insert into setup_helpers.seen
  select 'p1', check_name, ok from tracker.setup_checks('10000000-0000-0000-0000-000000000001');
set request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a3", "email": "o2@example.com"}';
insert into setup_helpers.seen
  select 'o2', check_name, ok from tracker.setup_checks('10000000-0000-0000-0000-000000000001');
reset role;

do $$ begin
  if (select count(*) from setup_helpers.seen where who = 'o1_before') <> 1
     or not exists (select 1 from setup_helpers.seen
                     where who = 'o1_before' and check_name = 'notion_link_guard' and ok) then
    raise exception 'owner did not get (notion_link_guard, true)';
  end if;
  if exists (select 1 from setup_helpers.seen where who in ('t1', 'p1', 'o2')) then
    raise exception 'a non-owner got rows from setup_checks';
  end if;
  raise notice 'ok: owner sees the guard, teacher, parent and other owner see nothing (AC12)';
end $$;

-- anon cannot execute ---------------------------------------------------------
set role anon;
do $$ begin
  perform * from tracker.setup_checks('10000000-0000-0000-0000-000000000001');
  raise exception 'anon executed setup_checks';
exception when insufficient_privilege then
  raise notice 'ok: anon has no execute (AC12)';
end $$;
reset role;

-- Disabled trigger reads false, dropped trigger reads false --------------------
alter table tracker.students disable trigger students_guard_notion_link;
set role authenticated;
set request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a1", "email": "o1@example.com"}';
insert into setup_helpers.seen
  select 'o1_disabled', check_name, ok from tracker.setup_checks('10000000-0000-0000-0000-000000000001');
reset role;

drop trigger students_guard_notion_link on tracker.students;
set role authenticated;
set request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a1", "email": "o1@example.com"}';
insert into setup_helpers.seen
  select 'o1_dropped', check_name, ok from tracker.setup_checks('10000000-0000-0000-0000-000000000001');
reset role;

do $$ begin
  if not exists (select 1 from setup_helpers.seen
                  where who = 'o1_disabled' and check_name = 'notion_link_guard' and ok = false) then
    raise exception 'disabled trigger did not read false';
  end if;
  if not exists (select 1 from setup_helpers.seen
                  where who = 'o1_dropped' and check_name = 'notion_link_guard' and ok = false) then
    raise exception 'dropped trigger did not read false';
  end if;
  raise notice 'ok: disabled and dropped guard read false (AC7, AC12)';
end $$;

-- Function shape: stable, invoker ---------------------------------------------
do $$ begin
  if not exists (
    select 1 from pg_catalog.pg_proc p
      join pg_catalog.pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'tracker' and p.proname = 'setup_checks'
       and p.provolatile = 's' and p.prosecdef = false
  ) then
    raise exception 'setup_checks is not stable security invoker';
  end if;
  raise notice 'ok: setup_checks is stable and security invoker';
end $$;
