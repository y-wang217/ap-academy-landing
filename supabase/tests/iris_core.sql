-- REQ-42: the iris schema (0024). Run by run-rls.sh on a fresh copy of the
-- migrated database. Privilege-sensitive steps switch role because the runner
-- connects as a superuser. Each check raises on failure.

\set ON_ERROR_STOP on
\o /dev/null

-- Cast: O1 owner of Org One; O2 owner of Org Two; GT grade teacher; ST
-- scheduling-only teacher (live staff link, no membership); STU a student's
-- login; PAR a parent with a claimed link. Plus anon and service_role.
insert into auth.users (id, email) values
  ('a0000000-0000-0000-0000-000000000001', 'o1@example.com'),
  ('a0000000-0000-0000-0000-000000000002', 'o2@example.com'),
  ('b0000000-0000-0000-0000-000000000001', 'gt@example.com'),
  ('d0000000-0000-0000-0000-000000000001', 'st@example.com'),
  ('c0000000-0000-0000-0000-000000000001', 'stu@example.com'),
  ('e0000000-0000-0000-0000-000000000001', 'par@example.com');
insert into tracker.orgs (id, name) values
  ('10000000-0000-0000-0000-000000000001', 'Org One'),
  ('10000000-0000-0000-0000-000000000002', 'Org Two');
insert into tracker.memberships (user_id, org_id, role) values
  ('a0000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'owner'),
  ('a0000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000002', 'owner'),
  ('b0000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'teacher'),
  ('c0000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'student'),
  ('e0000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'parent');
insert into tracker.staff_links (org_id, notion_staff_id, email, user_id, approved_by) values
  ('10000000-0000-0000-0000-000000000001', '5a000000-0000-4000-8000-000000000001', 'st@example.com',
   'd0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001');
insert into tracker.students (id, org_id, teacher_id, user_id, email, first_name, last_initial, grade_level, published_at, notion_student_id) values
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001',
   'c0000000-0000-0000-0000-000000000001', 'stu@example.com', 'Sam', 'L', 11, now(), '6a000000-0000-4000-8000-000000000001');
insert into tracker.parent_links (org_id, student_id, email, parent_user_id, claimed_at, invited_by) values
  ('10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'par@example.com',
   'e0000000-0000-0000-0000-000000000001', now(), 'a0000000-0000-0000-0000-000000000001');

create schema ic;
grant usage on schema ic to public;
create function ic.expect_error(stmt text, want_state text)
returns void language plpgsql as $$
begin
  execute stmt;
  raise exception 'statement succeeded, expected %: %', want_state, stmt;
exception when others then
  if sqlerrm like 'statement succeeded%' then raise; end if;
  if sqlstate <> want_state then
    raise exception 'expected %, got % (%) for %', want_state, sqlstate, sqlerrm, stmt;
  end if;
end $$;
-- Rows a statement touched.
create function ic.touched(stmt text) returns bigint language plpgsql as $$
declare n bigint;
begin
  execute stmt;
  get diagnostics n = row_count;
  return n;
end $$;
-- Refused: 42501, or no row touched (RLS hides every row).
create function ic.refused(stmt text) returns boolean language plpgsql as $$
declare n bigint;
begin
  execute stmt;
  get diagnostics n = row_count;
  return n = 0;
exception when insufficient_privilege then
  return true;
end $$;
create function ic.audit_count() returns bigint language sql as $$
  select count(*) from tracker.audit_log
$$;
grant execute on all functions in schema ic to public;

-- Shape (AC1) ------------------------------------------------------------------
do $$ begin
  if (select array_agg(c.relname::text order by c.relname) from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'iris' and c.relkind = 'r')
     <> array['ai_calls', 'events', 'messages', 'runs', 'settings', 'threads'] then
    raise exception 'iris should have exactly the six tables';
  end if;
  if exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'iris' and c.relkind = 'r' and not c.relrowsecurity) then
    raise exception 'an iris table has RLS off';
  end if;
  if (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'iris' and p.proname in ('claim_poll', 'purge_expired', 'delete_thread', 'guard_append_only')) <> 4 then
    raise exception 'an iris function is missing';
  end if;
end $$;

-- A settings row with only org_id is paused and cannot send. These orgs were
-- created after the migration's backfill, so they get their rows here.
insert into iris.settings (org_id) values ('10000000-0000-0000-0000-000000000001'), ('10000000-0000-0000-0000-000000000002');
do $$ begin
  if exists (select 1 from iris.settings where not paused or sending_enabled) then
    raise exception 'a new settings row must be paused with sending off';
  end if;
end $$;

-- Fixtures: per org one thread with two messages, one run, one ai_call, one event.
insert into iris.threads (id, org_id, gmail_thread_id, parent_email, match_state, purge_at) values
  ('30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'g-t1', 'ann@example.com', 'matched', now() + interval '90 days'),
  ('30000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000002', 'g-t2', 'zed@example.com', 'matched', now() + interval '90 days');
insert into iris.messages (id, org_id, thread_id, gmail_message_id, direction, source, from_email, received_at, body_text, state, purge_at) values
  ('31000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', 'g-m1a', 'inbound', 'external', 'ann@example.com', now(), 'Hi', 'matched', now() + interval '90 days'),
  ('31000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', 'g-m1b', 'outbound', 'charlie_manual', 'charlie@apacademy.ca', now(), 'Hello', null, now() + interval '90 days'),
  ('31000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000002', 'g-m2a', 'inbound', 'external', 'zed@example.com', now(), 'Hi', 'matched', now() + interval '90 days'),
  ('31000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000002', 'g-m2b', 'inbound', 'external', 'zed@example.com', now(), 'Again', 'escalated', now() + interval '90 days');
insert into iris.runs (org_id, started_at, finished_at, result) values
  ('10000000-0000-0000-0000-000000000001', now(), now(), 'ok'),
  ('10000000-0000-0000-0000-000000000002', now(), now(), 'ok');
insert into iris.ai_calls (id, org_id, message_id, purpose, outcome) values
  ('32000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '31000000-0000-0000-0000-000000000001', 'classify', 'ok'),
  ('32000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000002', '31000000-0000-0000-0000-000000000003', 'classify', 'ok');
insert into iris.events (org_id, kind, message_id, actor) values
  ('10000000-0000-0000-0000-000000000001', 'message_stored', '31000000-0000-0000-0000-000000000001', 'iris'),
  ('10000000-0000-0000-0000-000000000002', 'message_stored', '31000000-0000-0000-0000-000000000003', 'iris');

-- Constraints (AC1) --------------------------------------------------------------
do $$
declare ins text := $q$insert into iris.messages (org_id, thread_id, gmail_message_id, direction, source, from_email, received_at, body_text, state, purge_at)
  values ('10000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', %L, %L, 'external', 'ann@example.com', now(), %L, %L, now())$q$;
begin
  perform ic.expect_error(format(ins, 'g-m1a', 'inbound', 'x', 'matched'), '23505');
  perform ic.expect_error(format(ins, 'g-new1', 'inbound', 'x', null), '23514');
  perform ic.expect_error(format(ins, 'g-new2', 'outbound', 'x', 'matched'), '23514');
  perform ic.expect_error(format(ins, 'g-new3', 'inbound', repeat('a', 20001), 'matched'), '23514');
  perform ic.expect_error($q$insert into iris.messages (org_id, thread_id, gmail_message_id, direction, source, from_email, received_at, state, purge_at)
    values ('10000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', 'g-new4', 'inbound', 'external', 'Ann@Example.com', now(), 'matched', now())$q$, '23514');
  perform ic.expect_error($q$insert into iris.events (org_id, kind, actor) values ('10000000-0000-0000-0000-000000000001', 'x', 'someone')$q$, '23514');
end $$;

-- Role grid: reads (AC2) -------------------------------------------------------------
do $$
declare
  tbl text;
  n_own bigint;
  n_other bigint;
  who text;
begin
  -- O1 reads O1's rows in every table and none of O2's.
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', '{"sub": "a0000000-0000-0000-0000-000000000001"}', true);
  foreach tbl in array array['settings', 'runs', 'threads', 'messages', 'ai_calls', 'events'] loop
    execute format('select count(*) filter (where org_id = %L), count(*) filter (where org_id <> %L) from iris.%I',
      '10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', tbl) into n_own, n_other;
    if n_own = 0 or n_other <> 0 then
      raise exception 'O1 on iris.%: read % own and % other rows', tbl, n_own, n_other;
    end if;
  end loop;
  -- Everyone else reads none of O1's rows.
  foreach who in array array['a0000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000001',
      'd0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000001'] loop
    perform set_config('request.jwt.claims', json_build_object('sub', who)::text, true);
    foreach tbl in array array['settings', 'runs', 'threads', 'messages', 'ai_calls', 'events'] loop
      execute format('select count(*) from iris.%I where org_id = %L', tbl, '10000000-0000-0000-0000-000000000001') into n_own;
      if n_own <> 0 then
        raise exception '% read % rows of iris.%', who, n_own, tbl;
      end if;
    end loop;
  end loop;
  -- anon has no use of the schema at all.
  perform set_config('role', 'anon', true);
  perform set_config('request.jwt.claims', '', true);
  foreach tbl in array array['settings', 'runs', 'threads', 'messages', 'ai_calls', 'events'] loop
    perform ic.expect_error(format('select 1 from iris.%I', tbl), '42501');
  end loop;
end $$;

-- Role grid: writes by everyone but the O1 owner (AC2) ---------------------------------
do $$
declare
  who text;
  stmt text;
  o1 constant text := '10000000-0000-0000-0000-000000000001';
begin
  foreach who in array array['a0000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000001',
      'd0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000001', 'anon'] loop
    if who = 'anon' then
      perform set_config('role', 'anon', true);
      perform set_config('request.jwt.claims', '', true);
    else
      perform set_config('role', 'authenticated', true);
      perform set_config('request.jwt.claims', json_build_object('sub', who)::text, true);
    end if;
    foreach stmt in array array[
      format($q$update iris.settings set paused = false where org_id = %L$q$, o1),
      format($q$insert into iris.settings (org_id) values (%L)$q$, o1),
      format($q$update iris.runs set result = 'failed' where org_id = %L$q$, o1),
      format($q$insert into iris.runs (org_id, started_at, finished_at, result) values (%L, now(), now(), 'ok')$q$, o1),
      format($q$update iris.threads set subject = 'x' where org_id = %L$q$, o1),
      format($q$insert into iris.threads (org_id, gmail_thread_id, match_state, purge_at) values (%L, 'g-x', 'unknown', now())$q$, o1),
      format($q$update iris.messages set handled_at = now() where org_id = %L$q$, o1),
      format($q$insert into iris.messages (org_id, thread_id, gmail_message_id, direction, source, from_email, received_at, state, purge_at)
        values (%L, '30000000-0000-0000-0000-000000000001', 'g-x', 'inbound', 'external', 'x@example.com', now(), 'received', now())$q$, o1),
      format($q$update iris.ai_calls set message_id = null where org_id = %L$q$, o1),
      format($q$insert into iris.ai_calls (org_id, purpose, outcome) values (%L, 'classify', 'ok')$q$, o1),
      format($q$update iris.events set message_id = null where org_id = %L$q$, o1),
      format($q$insert into iris.events (org_id, kind, actor) values (%L, 'x', %L)$q$, o1, case when who = 'anon' then 'iris' else who end)
    ] loop
      if not ic.refused(stmt) then
        raise exception '% was allowed: %', who, stmt;
      end if;
    end loop;
  end loop;
end $$;

-- Owner writes (AC2) ------------------------------------------------------------------
set role authenticated;
set request.jwt.claims = '{"sub": "a0000000-0000-0000-0000-000000000001"}';
do $$
declare tbl text;
begin
  if ic.touched($q$update iris.settings set paused = false where org_id = '10000000-0000-0000-0000-000000000001'$q$) <> 1 then
    raise exception 'owner could not unpause';
  end if;
  perform ic.expect_error($q$update iris.settings set mailbox = 'x@example.com'$q$, '42501');
  perform ic.expect_error($q$update iris.settings set poll_lease_until = now()$q$, '42501');
  if ic.touched($q$update iris.messages set handled_at = now(), handled_by = 'a0000000-0000-0000-0000-000000000001'
      where id = '31000000-0000-0000-0000-000000000001'$q$) <> 1 then
    raise exception 'owner could not mark a message handled';
  end if;
  -- handled_by must be the owner themself.
  perform ic.expect_error($q$update iris.messages set handled_by = 'a0000000-0000-0000-0000-000000000002'
      where id = '31000000-0000-0000-0000-000000000001'$q$, '42501');
  perform ic.expect_error($q$update iris.messages set body_text = 'x'$q$, '42501');
  perform ic.expect_error($q$insert into iris.threads (org_id, gmail_thread_id, match_state, purge_at)
    values ('10000000-0000-0000-0000-000000000001', 'g-x', 'unknown', now())$q$, '42501');
  perform ic.expect_error($q$insert into iris.messages (org_id, thread_id, gmail_message_id, direction, source, from_email, received_at, state, purge_at)
    values ('10000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', 'g-x', 'inbound', 'external', 'x@example.com', now(), 'received', now())$q$, '42501');
  -- Events: their own actor only, in their own org.
  perform ic.expect_error($q$insert into iris.events (org_id, kind, actor)
    values ('10000000-0000-0000-0000-000000000001', 'note', 'a0000000-0000-0000-0000-000000000002')$q$, '42501');
  perform ic.expect_error($q$insert into iris.events (org_id, kind, actor)
    values ('10000000-0000-0000-0000-000000000002', 'note', 'a0000000-0000-0000-0000-000000000001')$q$, '42501');
  perform ic.expect_error($q$insert into iris.events (org_id, kind, actor)
    values ('10000000-0000-0000-0000-000000000001', 'note', 'iris')$q$, '42501');
  insert into iris.events (org_id, kind, actor)
    values ('10000000-0000-0000-0000-000000000001', 'note', 'a0000000-0000-0000-0000-000000000001');
  -- No deletes.
  foreach tbl in array array['settings', 'runs', 'threads', 'messages', 'ai_calls', 'events'] loop
    if not ic.refused(format('delete from iris.%I', tbl)) then
      raise exception 'owner deleted from iris.%', tbl;
    end if;
  end loop;
  -- O1's update never reaches O2.
  if ic.touched($q$update iris.settings set paused = false where org_id = '10000000-0000-0000-0000-000000000002'$q$) <> 0 then
    raise exception 'O1 changed O2 settings';
  end if;
  update iris.settings set paused = true where org_id = '10000000-0000-0000-0000-000000000001';
end $$;
reset role;

-- Audit (AC3) -------------------------------------------------------------------------
do $$
declare
  before_n bigint;
  last_row record;
begin
  -- The owner's pause. Counts are taken as the superuser, who sees every row.
  before_n := ic.audit_count();
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', '{"sub": "a0000000-0000-0000-0000-000000000001"}', true);
  update iris.settings set paused = false where org_id = '10000000-0000-0000-0000-000000000001';
  perform set_config('role', 'postgres', true);
  if ic.audit_count() <> before_n + 1 then
    raise exception 'owner paused change should write one audit row';
  end if;
  select * into last_row from tracker.audit_log order by id desc limit 1;
  if last_row.table_name <> 'settings' or last_row.actor_id is distinct from 'a0000000-0000-0000-0000-000000000001'::uuid then
    raise exception 'audit row has the wrong table or actor';
  end if;

  before_n := ic.audit_count();
  perform set_config('role', 'service_role', true);
  perform set_config('request.jwt.claims', '', true);
  update iris.settings set sending_enabled = true where org_id = '10000000-0000-0000-0000-000000000001';
  if ic.audit_count() <> before_n + 1 then raise exception 'sending_enabled should write one audit row'; end if;
  update iris.settings set confidence_threshold = 0.9 where org_id = '10000000-0000-0000-0000-000000000001';
  if ic.audit_count() <> before_n + 2 then raise exception 'confidence_threshold should write one audit row'; end if;

  -- The run's own updates write nothing.
  before_n := ic.audit_count();
  update iris.settings set poll_lease_until = now() + interval '1 minute', last_poll_at = now(),
    last_poll_result = 'ok', last_error = 'x' where org_id = '10000000-0000-0000-0000-000000000001';
  update iris.settings set poll_lease_until = null where org_id = '10000000-0000-0000-0000-000000000001';
  perform iris.claim_poll('10000000-0000-0000-0000-000000000001', 300);
  update iris.settings set poll_lease_until = null where org_id = '10000000-0000-0000-0000-000000000001';
  insert into iris.runs (org_id, started_at, finished_at, result) values ('10000000-0000-0000-0000-000000000001', now(), now(), 'ok');
  update iris.runs set stored = 1 where org_id = '10000000-0000-0000-0000-000000000001';
  update iris.threads set subject = 'Re: Tuesday' where id = '30000000-0000-0000-0000-000000000001';
  update iris.messages set retry_count = 1 where id = '31000000-0000-0000-0000-000000000001';
  insert into iris.events (org_id, kind, actor) values ('10000000-0000-0000-0000-000000000001', 'x', 'iris');
  insert into iris.ai_calls (org_id, purpose, outcome) values ('10000000-0000-0000-0000-000000000001', 'classify', 'ok');
  if ic.audit_count() <> before_n then
    raise exception 'lease, last-run or non-settings writes wrote audit rows';
  end if;
  update iris.settings set sending_enabled = false, confidence_threshold = 0.85, paused = true
   where org_id = '10000000-0000-0000-0000-000000000001';
end $$;

-- Append-only (AC4) -------------------------------------------------------------------
-- The owner has no update or delete grant, so every change is refused. As
-- service_role, only setting message_id or draft_id to null passes, and a
-- delete of a row older than 365 days.
set role authenticated;
set request.jwt.claims = '{"sub": "a0000000-0000-0000-0000-000000000001"}';
select ic.expect_error($q$update iris.events set kind = 'y'$q$, '42501');
select ic.expect_error($q$update iris.events set message_id = null$q$, '42501');
select ic.expect_error($q$update iris.ai_calls set model = 'y'$q$, '42501');
select ic.expect_error($q$update iris.ai_calls set message_id = null$q$, '42501');
select ic.expect_error($q$delete from iris.events$q$, '42501');
select ic.expect_error($q$delete from iris.ai_calls$q$, '42501');
select ic.expect_error($q$truncate iris.events$q$, '42501');
select ic.expect_error($q$truncate iris.ai_calls$q$, '42501');
reset role;
reset request.jwt.claims;

set role service_role;
do $$
declare n bigint;
begin
  perform ic.expect_error($q$update iris.events set kind = 'y' where org_id = '10000000-0000-0000-0000-000000000001'$q$, '42501');
  perform ic.expect_error($q$update iris.ai_calls set model = 'y' where org_id = '10000000-0000-0000-0000-000000000001'$q$, '42501');
  perform ic.expect_error($q$update iris.events set message_id = null, kind = 'y' where message_id is not null$q$, '42501');
  perform ic.expect_error($q$update iris.ai_calls set message_id = null, model = 'y' where message_id is not null$q$, '42501');
  perform ic.expect_error($q$update iris.events set draft_id = gen_random_uuid()$q$, '42501');
  perform ic.expect_error($q$delete from iris.events where org_id = '10000000-0000-0000-0000-000000000001'$q$, '42501');
  perform ic.expect_error($q$delete from iris.ai_calls where org_id = '10000000-0000-0000-0000-000000000001'$q$, '42501');
  perform ic.expect_error($q$truncate iris.events$q$, '42501');
  perform ic.expect_error($q$truncate iris.ai_calls$q$, '42501');

  -- Setting message_id (or draft_id) to null passes.
  insert into iris.events (org_id, kind, message_id, draft_id, actor) values
    ('10000000-0000-0000-0000-000000000002', 'drafted', '31000000-0000-0000-0000-000000000004', gen_random_uuid(), 'iris');
  n := ic.touched($q$update iris.events set message_id = null where message_id = '31000000-0000-0000-0000-000000000004'$q$);
  if n <> 1 then raise exception 'setting events.message_id to null should pass'; end if;
  n := ic.touched($q$update iris.events set draft_id = null where draft_id is not null$q$);
  if n <> 1 then raise exception 'setting events.draft_id to null should pass'; end if;
  n := ic.touched($q$update iris.ai_calls set message_id = null where id = '32000000-0000-0000-0000-000000000002'$q$);
  if n <> 1 then raise exception 'setting ai_calls.message_id to null should pass'; end if;

  -- A row older than 365 days can go.
  insert into iris.events (org_id, at, kind, actor) values ('10000000-0000-0000-0000-000000000002', now() - interval '400 days', 'old', 'iris');
  insert into iris.ai_calls (org_id, purpose, outcome, created_at) values ('10000000-0000-0000-0000-000000000002', 'eval', 'ok', now() - interval '400 days');
  if ic.touched($q$delete from iris.events where kind = 'old'$q$) <> 1 then raise exception 'an old event should delete'; end if;
  if ic.touched($q$delete from iris.ai_calls where purpose = 'eval'$q$) <> 1 then raise exception 'an old ai_call should delete'; end if;
end $$;
reset role;

-- Lease (AC5) --------------------------------------------------------------------------
set role service_role;
do $$ begin
  update iris.settings set poll_lease_until = null;
  if (select count(*) from iris.claim_poll('10000000-0000-0000-0000-000000000001', 300)) <> 1 then
    raise exception 'first claim should return the row';
  end if;
  if (select count(*) from iris.claim_poll('10000000-0000-0000-0000-000000000001', 300)) <> 0 then
    raise exception 'second claim should return nothing while the lease is live';
  end if;
  if (select count(*) from iris.claim_poll('10000000-0000-0000-0000-000000000002', 300)) <> 1 then
    raise exception 'O1''s lease blocked O2';
  end if;
  update iris.settings set poll_lease_until = now() - interval '1 second' where org_id = '10000000-0000-0000-0000-000000000001';
  if (select count(*) from iris.claim_poll('10000000-0000-0000-0000-000000000001', 300)) <> 1 then
    raise exception 'an expired lease should be claimable';
  end if;
  update iris.settings set poll_lease_until = null;
end $$;
reset role;
set role authenticated;
set request.jwt.claims = '{"sub": "a0000000-0000-0000-0000-000000000001"}';
select ic.expect_error($q$select iris.claim_poll('10000000-0000-0000-0000-000000000001', 300)$q$, '42501');
select ic.expect_error($q$select iris.purge_expired('10000000-0000-0000-0000-000000000001')$q$, '42501');
reset role;
reset request.jwt.claims;

-- Purge (AC6) --------------------------------------------------------------------------
insert into iris.threads (id, org_id, gmail_thread_id, match_state, purge_at) values
  ('30000000-0000-0000-0000-0000000000e1', '10000000-0000-0000-0000-000000000001', 'g-expired', 'unknown', now() - interval '1 day');
insert into iris.messages (id, org_id, thread_id, gmail_message_id, direction, source, from_email, received_at, state, purge_at) values
  ('31000000-0000-0000-0000-0000000000e1', '10000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-0000000000e1',
   'g-expired-m', 'inbound', 'external', 'old@example.com', now() - interval '91 days', 'escalated', now() - interval '1 day');
insert into iris.events (org_id, kind, message_id, actor) values
  ('10000000-0000-0000-0000-000000000001', 'message_stored', '31000000-0000-0000-0000-0000000000e1', 'iris');
insert into iris.ai_calls (id, org_id, message_id, purpose, outcome) values
  ('32000000-0000-0000-0000-0000000000e1', '10000000-0000-0000-0000-000000000001', '31000000-0000-0000-0000-0000000000e1', 'classify', 'ok');
insert into iris.events (org_id, at, kind, actor) values ('10000000-0000-0000-0000-000000000001', now() - interval '400 days', 'ancient', 'iris');
insert into iris.ai_calls (id, org_id, purpose, outcome, created_at) values
  ('32000000-0000-0000-0000-0000000000e2', '10000000-0000-0000-0000-000000000001', 'eval', 'ok', now() - interval '400 days');
insert into iris.runs (id, org_id, started_at, finished_at, result) values
  ('33000000-0000-0000-0000-0000000000e1', '10000000-0000-0000-0000-000000000001', now() - interval '100 days', now() - interval '100 days', 'ok');

set role service_role;
do $$
declare
  counts jsonb;
  purge_detail jsonb;
begin
  counts := iris.purge_expired('10000000-0000-0000-0000-000000000001');
  if counts <> '{"messages": 1, "threads": 1, "runs": 1, "events": 1, "ai_calls": 1}'::jsonb then
    raise exception 'purge counts were %', counts;
  end if;
  if exists (select 1 from iris.messages where id = '31000000-0000-0000-0000-0000000000e1')
     or exists (select 1 from iris.threads where id = '30000000-0000-0000-0000-0000000000e1') then
    raise exception 'the expired message and its empty thread should be gone';
  end if;
  if not exists (select 1 from iris.messages where id = '31000000-0000-0000-0000-000000000001')
     or not exists (select 1 from iris.threads where id = '30000000-0000-0000-0000-000000000001') then
    raise exception 'a fresh message and its thread should stay';
  end if;
  if (select message_id from iris.ai_calls where id = '32000000-0000-0000-0000-0000000000e1') is not null
     or not exists (select 1 from iris.ai_calls where id = '32000000-0000-0000-0000-0000000000e1') then
    raise exception 'the purged message''s ai_call should survive with message_id null';
  end if;
  if not exists (select 1 from iris.events where kind = 'message_stored' and message_id is null
                   and org_id = '10000000-0000-0000-0000-000000000001') then
    raise exception 'the purged message''s event should survive with message_id null';
  end if;
  if exists (select 1 from iris.events where kind = 'ancient')
     or exists (select 1 from iris.ai_calls where id = '32000000-0000-0000-0000-0000000000e2')
     or exists (select 1 from iris.runs where id = '33000000-0000-0000-0000-0000000000e1') then
    raise exception 'old events, ai_calls and runs should be gone';
  end if;
  if (select count(*) from iris.events where kind = 'purge') <> 1 then
    raise exception 'one purge event expected';
  end if;
  select detail into purge_detail from iris.events where kind = 'purge';
  if purge_detail <> counts then
    raise exception 'purge event detail % does not match %', purge_detail, counts;
  end if;
end $$;
reset role;

-- Delete now (AC6) ---------------------------------------------------------------------
set role authenticated;
do $$
declare who text;
begin
  foreach who in array array['a0000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000001'] loop
    perform set_config('request.jwt.claims', json_build_object('sub', who)::text, true);
    perform ic.expect_error($q$select iris.delete_thread('30000000-0000-0000-0000-000000000001')$q$, '42501');
  end loop;
end $$;
reset role;
do $$ begin
  if (select count(*) from iris.messages where thread_id = '30000000-0000-0000-0000-000000000001') <> 2 then
    raise exception 'a refused delete_thread removed messages';
  end if;
end $$;
set role authenticated;
set request.jwt.claims = '{"sub": "a0000000-0000-0000-0000-000000000001"}';
do $$ begin
  if iris.delete_thread('30000000-0000-0000-0000-000000000001') <> 2 then
    raise exception 'delete_thread should return the message count';
  end if;
end $$;
reset role;
reset request.jwt.claims;
do $$ begin
  if exists (select 1 from iris.threads where id = '30000000-0000-0000-0000-000000000001')
     or exists (select 1 from iris.messages where thread_id = '30000000-0000-0000-0000-000000000001') then
    raise exception 'delete_thread left rows behind';
  end if;
  if (select count(*) from iris.events where kind = 'thread_deleted' and actor = 'a0000000-0000-0000-0000-000000000001'
        and detail = '{"thread_id": "30000000-0000-0000-0000-000000000001", "messages": 2}'::jsonb) <> 1 then
    raise exception 'one thread_deleted event expected';
  end if;
  if not exists (select 1 from iris.threads where id = '30000000-0000-0000-0000-000000000002') then
    raise exception 'O2''s thread should be untouched';
  end if;
end $$;

\o
\echo 'iris_core: ok'
