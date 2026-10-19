-- REQ-35: the Notion export outbox (0021). Run by run-rls.sh on a fresh copy of
-- the migrated database. Each check raises on failure.

\set ON_ERROR_STOP on
\o /dev/null

-- Cast: OWN owner of Org One; TCH teacher (staff E1); PAR parent; STU student;
-- OTH owner of Org Two.
-- Students: F1, F2 and F5 adopted (F5 by adopt_student_schedule below), F3 not.
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'owner@example.com'),
  ('00000000-0000-0000-0000-0000000000d1', 't@example.com'),
  ('00000000-0000-0000-0000-0000000000e1', 'parent@example.com'),
  ('00000000-0000-0000-0000-0000000000b1', 'student@example.com'),
  ('00000000-0000-0000-0000-0000000000c2', 'other@example.com');
insert into tracker.orgs (id, name) values
  ('10000000-0000-0000-0000-000000000001', 'Org One'),
  ('10000000-0000-0000-0000-000000000002', 'Org Two');
insert into tracker.memberships (user_id, org_id, role) values
  ('00000000-0000-0000-0000-0000000000a1', '10000000-0000-0000-0000-000000000001', 'owner'),
  ('00000000-0000-0000-0000-0000000000e1', '10000000-0000-0000-0000-000000000001', 'parent'),
  ('00000000-0000-0000-0000-0000000000b1', '10000000-0000-0000-0000-000000000001', 'student'),
  ('00000000-0000-0000-0000-0000000000c2', '10000000-0000-0000-0000-000000000002', 'owner');
insert into tracker.staff_links (org_id, notion_staff_id, email, approved_by, user_id, revoked_at) values
  ('10000000-0000-0000-0000-000000000001', 'e0000000-0000-4000-8000-000000000001', 't@example.com', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000d1', null);
insert into tracker.schedule_summaries (org_id, notion_student_id, adopted_from_text, created_by) values
  ('10000000-0000-0000-0000-000000000001', 'f0000000-0000-4000-8000-000000000001', '', '00000000-0000-0000-0000-0000000000a1'),
  ('10000000-0000-0000-0000-000000000001', 'f0000000-0000-4000-8000-000000000002', '', '00000000-0000-0000-0000-0000000000a1');

-- Helpers, run as the table owner so they see every row whoever calls them.
create schema nt;
grant usage on schema nt to authenticated, anon, service_role;

-- Every pending row as "key:version", sorted.
create function nt.pending() returns text[] language sql security definer set search_path = '' as $$
  select coalesce(array_agg(o.dedupe_key || ':' || o.version order by o.dedupe_key), '{}')
  from tracker.notion_outbox o where o.status = 'pending'
$$;
-- Every row as "key:status:version", for "unchanged" checks.
create function nt.snapshot() returns text[] language sql security definer set search_path = '' as $$
  select coalesce(array_agg(o.dedupe_key || ':' || o.status || ':' || o.version order by o.id), '{}')
  from tracker.notion_outbox o
$$;
-- Marks every open row done, so the next event is seen on its own.
create function nt.close_all() returns void language sql security definer set search_path = '' as $$
  update tracker.notion_outbox set status = 'done', lease_until = null, finished_at = now()
  where status in ('pending', 'running')
$$;
create function nt.id_of(p_key text, p_status text) returns uuid language sql security definer set search_path = '' as $$
  select o.id from tracker.notion_outbox o where o.dedupe_key = p_key and o.status = p_status order by o.requested_at desc limit 1
$$;
create function nt.status_of(p_id uuid) returns text language sql security definer set search_path = '' as $$
  select o.status from tracker.notion_outbox o where o.id = p_id
$$;
create function nt.set_status(p_id uuid, p_status text) returns void language sql security definer set search_path = '' as $$
  update tracker.notion_outbox set status = p_status where id = p_id
$$;
create function nt.expire(p_id uuid) returns void language sql security definer set search_path = '' as $$
  update tracker.notion_outbox set lease_until = now() - interval '1 minute' where id = p_id
$$;
-- Runs q and requires it to fail with SQLSTATE code.
create function nt.expect_code(q text, code text) returns void language plpgsql as $$
begin
  execute q;
  raise exception 'expected SQLSTATE % from: %', code, q;
exception when others then
  if sqlstate <> code then raise; end if;
end;
$$;
grant execute on all functions in schema nt to authenticated, anon, service_role;

-- The setup above enqueued the two adoptions; start from a closed outbox.
select nt.close_all();

-- Enqueue (owner) ------------------------------------------------------------------
set role authenticated;
set request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a1"}';

do $$
declare
  f1 text := 'summary:f0000000-0000-4000-8000-000000000001';
  f2 text := 'summary:f0000000-0000-4000-8000-000000000002';
  dt text := 'daily_task:10000000-0000-0000-0000-000000000001';
begin
  -- AC1: an owner insert for an adopted student enqueues its summary and the daily task
  insert into tracker.class_series (id, org_id, request_id, notion_staff_id, notion_student_id, subject, kind, start_date, start_time, duration_minutes, created_by)
    values ('50000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000000001',
      'e0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000001', 'MHF4U', 'weekly', '2030-01-07', '17:00', 60,
      '00000000-0000-0000-0000-0000000000a1');
  assert nt.pending() = array[dt || ':1', f1 || ':1'], format('insert: got %s', nt.pending());
  assert (select request_id from tracker.notion_outbox where dedupe_key = f1 and status = 'pending') = '60000000-0000-0000-0000-000000000001',
    'insert: request_id not carried';

  -- AC1, AC2: an owner update enqueues again onto the same pending rows
  update tracker.class_series set subject = 'MHF4U Functions' where id = '50000000-0000-0000-0000-000000000001';
  assert nt.pending() = array[dt || ':2', f1 || ':2'], format('update: got %s', nt.pending());

  -- AC2: two updates in a row leave one pending row per key with version 2
  perform nt.close_all();
  update tracker.class_series set duration_minutes = 90 where id = '50000000-0000-0000-0000-000000000001';
  update tracker.class_series set duration_minutes = 60 where id = '50000000-0000-0000-0000-000000000001';
  assert nt.pending() = array[dt || ':2', f1 || ':2'], format('two updates: got %s', nt.pending());

  -- AC1: changing notion_student_id enqueues both students
  perform nt.close_all();
  update tracker.class_series set notion_student_id = 'f0000000-0000-4000-8000-000000000002' where id = '50000000-0000-0000-0000-000000000001';
  assert nt.pending() = array[dt || ':1', f1 || ':1', f2 || ':1'], format('student change: got %s', nt.pending());
  update tracker.class_series set notion_student_id = 'f0000000-0000-4000-8000-000000000001' where id = '50000000-0000-0000-0000-000000000001';

  -- AC1: a student with no schedule_summaries row gets no summary row
  perform nt.close_all();
  insert into tracker.class_series (id, org_id, request_id, notion_staff_id, notion_student_id, subject, kind, start_date, start_time, duration_minutes, created_by)
    values ('50000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000000003',
      'e0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000003', 'SCH4U', 'one_off', '2030-01-09', '15:00', 60,
      '00000000-0000-0000-0000-0000000000a1');
  assert nt.pending() = array[dt || ':1'], format('non-adopted: got %s', nt.pending());

  -- AC1: an exception insert (a cancel) enqueues
  perform nt.close_all();
  insert into tracker.class_exceptions (id, org_id, request_id, series_id, original_date, kind, created_by)
    values ('70000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000000011',
      '50000000-0000-0000-0000-000000000001', '2030-01-14', 'cancelled', '00000000-0000-0000-0000-0000000000a1');
  assert nt.pending() = array[dt || ':1', f1 || ':1'], format('exception insert: got %s', nt.pending());

  -- AC1: an exception update (a move) enqueues
  perform nt.close_all();
  update tracker.class_exceptions set kind = 'moved', new_date = '2030-01-15', new_start_time = '17:00'
    where id = '70000000-0000-0000-0000-000000000001';
  assert nt.pending() = array[dt || ':1', f1 || ':1'], format('exception update: got %s', nt.pending());
end $$;

-- AC1: deletes run as service_role (authenticated has no delete grant on classes)
reset role;
set role service_role;
do $$
declare
  f1 text := 'summary:f0000000-0000-4000-8000-000000000001';
  dt text := 'daily_task:10000000-0000-0000-0000-000000000001';
begin
  perform nt.close_all();
  delete from tracker.class_exceptions where id = '70000000-0000-0000-0000-000000000001';
  assert nt.pending() = array[dt || ':1', f1 || ':1'], format('exception delete: got %s', nt.pending());

  perform nt.close_all();
  insert into tracker.class_series (id, org_id, request_id, notion_staff_id, notion_student_id, subject, kind, start_date, start_time, duration_minutes, created_by)
    values ('50000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000000004',
      'e0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000001', 'ENG4U', 'one_off', '2030-01-10', '15:00', 60,
      '00000000-0000-0000-0000-0000000000a1');
  perform nt.close_all();
  delete from tracker.class_series where id = '50000000-0000-0000-0000-000000000004';
  assert nt.pending() = array[dt || ':1', f1 || ':1'], format('series delete: got %s', nt.pending());
end $$;
reset role;

-- Owner again: split, schedule_write and adopt ------------------------------------
set role authenticated;
set request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a1"}';

do $$
declare
  f1 text := 'summary:f0000000-0000-4000-8000-000000000001';
  f5 text := 'summary:f0000000-0000-4000-8000-000000000005';
  dt text := 'daily_task:10000000-0000-0000-0000-000000000001';
  stamps jsonb;
begin
  -- AC1: a successful split enqueues one pending summary and one daily task
  perform nt.close_all();
  perform tracker.split_class_series('50000000-0000-0000-0000-000000000001', '2030-02-04',
    (select updated_at from tracker.class_series where id = '50000000-0000-0000-0000-000000000001'),
    '60000000-0000-0000-0000-000000000021', '{"start_time": "18:00"}');
  assert nt.pending() = array[dt || ':2', f1 || ':2'], format('split: got %s', nt.pending());

  -- AC1: a write through REQ-30's schedule_write enqueues
  perform nt.close_all();
  stamps := tracker.schedule_write_context('10000000-0000-0000-0000-000000000001', gen_random_uuid(),
    '[{"kind":"staff","id":"e0000000-0000-4000-8000-000000000001"},{"kind":"student","id":"f0000000-0000-4000-8000-000000000001"}]') -> 'stamps';
  perform tracker.schedule_write('10000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000000031', 'create', stamps,
    '{"staff_id":"e0000000-0000-4000-8000-000000000001","student_id":"f0000000-0000-4000-8000-000000000001","subject":"MCV4U","kind":"one_off","start_date":"2030-03-04","start_time":"17:00","duration_minutes":60}');
  assert nt.pending() = array[dt || ':1', f1 || ':1'], format('schedule_write: got %s', nt.pending());

  -- AC1: adopting a student enqueues their summary
  perform nt.close_all();
  perform tracker.adopt_student_schedule('f0000000-0000-4000-8000-000000000005', 'Mon 17:00', '[
    {"request_id": "60000000-0000-0000-0000-000000000041", "staff_id": "e0000000-0000-4000-8000-000000000001", "subject": "MPM2D", "start_date": "2030-01-07", "start_time": "19:00", "duration_minutes": 60}]');
  assert nt.pending() = array[dt || ':2', f5 || ':1'], format('adopt: got %s', nt.pending());
end $$;

-- AC1: refused or empty statements leave the outbox unchanged -----------------------
select nt.close_all();
create temp table before_refused as select nt.snapshot() as s;
grant select on before_refused to authenticated;

-- A unique (org_id, request_id) violation
select nt.expect_code($q$insert into tracker.class_series (org_id, request_id, notion_staff_id, notion_student_id, subject, kind, start_date, start_time, duration_minutes, created_by)
  values ('10000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000000001', 'e0000000-0000-4000-8000-000000000001',
    'f0000000-0000-4000-8000-000000000001', 'Dup', 'one_off', '2030-01-11', '15:00', 60, '00000000-0000-0000-0000-0000000000a1')$q$, '23505');
-- An update with an out-of-date updated_at matches zero rows
update tracker.class_series set subject = 'Stale' where id = '50000000-0000-0000-0000-000000000001' and updated_at = '2000-01-01';
-- split_class_series with a stale token raises 'stale'
do $$
begin
  perform tracker.split_class_series('50000000-0000-0000-0000-000000000003', '2030-02-04', '2000-01-01', gen_random_uuid(), '{}');
  raise exception 'stale split accepted';
exception when raise_exception then
  if sqlerrm <> 'stale' then raise; end if;
end $$;

-- A teacher insert into class_series or class_exceptions is refused by RLS
set request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000d1"}';
select nt.expect_code($q$insert into tracker.class_series (org_id, request_id, notion_staff_id, notion_student_id, subject, kind, start_date, start_time, duration_minutes, created_by)
  values ('10000000-0000-0000-0000-000000000001', gen_random_uuid(), 'e0000000-0000-4000-8000-000000000001',
    'f0000000-0000-4000-8000-000000000001', 'Teacher', 'one_off', '2030-01-11', '15:00', 60, '00000000-0000-0000-0000-0000000000d1')$q$, '42501');
select nt.expect_code($q$insert into tracker.class_exceptions (org_id, request_id, series_id, original_date, kind, created_by)
  values ('10000000-0000-0000-0000-000000000001', gen_random_uuid(), '50000000-0000-0000-0000-000000000001', '2030-01-21', 'cancelled',
    '00000000-0000-0000-0000-0000000000d1')$q$, '42501');

do $$
begin
  assert nt.snapshot() = (select s from before_refused), 'refused statements changed the outbox';
end $$;

-- enqueue_summary_sync ---------------------------------------------------------------
set request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a1"}';
do $$
declare
  ids uuid[];
begin
  ids := array(select tracker.enqueue_summary_sync('10000000-0000-0000-0000-000000000001',
    array['f0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000002', 'f0000000-0000-4000-8000-000000000003']::uuid[]));
  assert cardinality(ids) = 2, format('sync: expected 2 ids, got %s', cardinality(ids));
  assert nt.pending() = array['summary:f0000000-0000-4000-8000-000000000001:1', 'summary:f0000000-0000-4000-8000-000000000002:1'],
    format('sync: got %s', nt.pending());
  assert (select bool_and(id = any(ids)) from tracker.notion_outbox where status = 'pending'), 'sync: returned ids are not the pending rows';
end $$;

select nt.close_all();
create temp table before_sync as select nt.snapshot() as s;
grant select on before_sync to authenticated;
set request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000d1"}';
select nt.expect_code($q$select tracker.enqueue_summary_sync('10000000-0000-0000-0000-000000000001', array['f0000000-0000-4000-8000-000000000001']::uuid[])$q$, '42501');
set request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000c2"}';
select nt.expect_code($q$select tracker.enqueue_summary_sync('10000000-0000-0000-0000-000000000001', array['f0000000-0000-4000-8000-000000000001']::uuid[])$q$, '42501');
do $$
begin
  assert nt.snapshot() = (select s from before_sync), 'a refused enqueue_summary_sync changed the outbox';
end $$;
reset role;
do $$
begin
  assert not has_function_privilege('anon', 'tracker.enqueue_summary_sync(uuid, uuid[])', 'execute'), 'anon can run enqueue_summary_sync';
  assert not has_function_privilege('authenticated', 'tracker.upsert_notion_outbox(uuid, text, uuid, uuid)', 'execute'), 'authenticated can run upsert_notion_outbox';
  assert not has_function_privilege('anon', 'tracker.upsert_notion_outbox(uuid, text, uuid, uuid)', 'execute'), 'anon can run upsert_notion_outbox';
  assert not has_function_privilege('anon', 'tracker.claim_notion_outbox(uuid, uuid[], integer, integer)', 'execute'), 'anon can claim';
  assert not has_function_privilege('anon', 'tracker.retry_notion_outbox(uuid)', 'execute'), 'anon can retry';
end $$;

-- Claim ---------------------------------------------------------------------------------
set role authenticated;
set request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a1"}';
do $$
declare
  f1 text := 'summary:f0000000-0000-4000-8000-000000000001';
  dt text := 'daily_task:10000000-0000-0000-0000-000000000001';
  got tracker.notion_outbox[];
  first_f1 uuid;
  first_dt uuid;
begin
  perform nt.close_all();
  update tracker.class_series set subject = 'Claim me' where id = '50000000-0000-0000-0000-000000000003';
  update tracker.class_series set subject = 'Claim me' where id = '50000000-0000-0000-0000-000000000001';
  first_f1 := nt.id_of(f1, 'pending');
  first_dt := nt.id_of(dt, 'pending');

  -- AC3: claim by ids marks the row running with a lease and counts the attempt
  got := array(select c from tracker.claim_notion_outbox('10000000-0000-0000-0000-000000000001', array[first_f1], 10, 60) c);
  assert cardinality(got) = 1 and got[1].id = first_f1, 'claim: wrong rows';
  assert got[1].status = 'running' and got[1].attempts = 1 and got[1].lease_until > now(), 'claim: not running';

  -- AC3: a newer change while F1 is running makes a new pending row, which no claim takes until the lease ends
  update tracker.class_series set subject = 'Newer' where id = '50000000-0000-0000-0000-000000000001';
  assert nt.id_of(f1, 'pending') is not null and nt.id_of(f1, 'pending') <> first_f1, 'claim: newer change did not get its own row';
  got := array(select c from tracker.claim_notion_outbox('10000000-0000-0000-0000-000000000001', null, 10, 60) c);
  assert not exists (select 1 from unnest(got) g where g.dedupe_key = f1), 'claim: took a key with a live running row';
  assert exists (select 1 from unnest(got) g where g.dedupe_key = dt), 'claim: did not take the due daily task';

  -- AC7: an expired daily-task lease becomes uncertain, never re-run
  perform nt.expire(first_dt);
  got := array(select c from tracker.claim_notion_outbox('10000000-0000-0000-0000-000000000001', null, 10, 60) c);
  assert nt.status_of(first_dt) = 'uncertain', format('claim: expired daily task is %s', nt.status_of(first_dt));
  assert not exists (select 1 from unnest(got) g where g.id = first_dt), 'claim: re-ran an expired daily task';

  -- An expired summary lease with a newer pending row is superseded by it; the pending row is claimed
  perform nt.expire(first_f1);
  got := array(select c from tracker.claim_notion_outbox('10000000-0000-0000-0000-000000000001', null, 10, 60) c);
  assert nt.status_of(first_f1) = 'superseded', format('claim: expired summary is %s', nt.status_of(first_f1));
  assert (select superseded_by from tracker.notion_outbox where id = first_f1) = got[1].id, 'claim: superseded_by is not the claimed row';
  assert cardinality(got) = 1 and got[1].dedupe_key = f1, 'claim: did not take the newer F1 row';
end $$;

-- An expired summary lease with no pending sibling is claimed again
do $$
declare
  f1 text := 'summary:f0000000-0000-4000-8000-000000000001';
  rid uuid := nt.id_of('summary:f0000000-0000-4000-8000-000000000001', 'running');
  got tracker.notion_outbox[];
begin
  perform nt.expire(rid);
  got := array(select c from tracker.claim_notion_outbox('10000000-0000-0000-0000-000000000001', null, 10, 60) c);
  assert cardinality(got) = 1 and got[1].id = rid and got[1].attempts = 2, 'claim: expired summary not reclaimed';
end $$;

-- A claim for another org's id returns nothing (RLS), even for that org's owner by mistake
reset role;
insert into tracker.schedule_summaries (org_id, notion_student_id, adopted_from_text, created_by) values
  ('10000000-0000-0000-0000-000000000002', 'f0000000-0000-4000-8000-000000000009', '', '00000000-0000-0000-0000-0000000000c2');
set role authenticated;
set request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a1"}';
do $$
begin
  assert (select count(*) from tracker.claim_notion_outbox('10000000-0000-0000-0000-000000000002', null, 10, 60)) = 0, 'claim: owner claimed another org';
end $$;
reset role;
do $$
begin
  assert nt.status_of(nt.id_of('summary:f0000000-0000-4000-8000-000000000009', 'pending')) = 'pending', 'claim: other org row changed';
end $$;

-- Retry ---------------------------------------------------------------------------------
set role authenticated;
set request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a1"}';
do $$
declare
  f2 text := 'summary:f0000000-0000-4000-8000-000000000002';
  failed_id uuid;
  pending_id uuid;
  r record;
begin
  perform nt.close_all();
  perform tracker.enqueue_summary_sync('10000000-0000-0000-0000-000000000001', array['f0000000-0000-4000-8000-000000000002']::uuid[]);
  failed_id := nt.id_of(f2, 'pending');
  perform nt.set_status(failed_id, 'failed');

  -- AC12: a failed row with no pending sibling goes back to pending
  select * into r from tracker.retry_notion_outbox(failed_id);
  assert r.id = failed_id and r.status = 'pending' and r.superseded_by is null, format('retry: got %s', r);
  assert nt.status_of(failed_id) = 'pending', 'retry: row not pending';
  assert (select next_attempt_at <= now() and last_error is null and attempts = 0 from tracker.notion_outbox where id = failed_id), 'retry: row not due now';

  -- AC12: a failed row while a pending row exists is superseded by the pending row
  perform nt.set_status(failed_id, 'failed');
  perform tracker.enqueue_summary_sync('10000000-0000-0000-0000-000000000001', array['f0000000-0000-4000-8000-000000000002']::uuid[]);
  pending_id := nt.id_of(f2, 'pending');
  select * into r from tracker.retry_notion_outbox(failed_id);
  assert r.id = pending_id and r.status = 'pending' and r.superseded_by = failed_id, format('retry with pending: got %s', r);
  assert nt.status_of(failed_id) = 'superseded', 'retry with pending: failed row not superseded';
  assert (select superseded_by from tracker.notion_outbox where id = failed_id) = pending_id, 'retry with pending: superseded_by wrong';
  assert (select count(*) from tracker.notion_outbox where dedupe_key = f2 and status = 'pending') = 1, 'retry with pending: not exactly one pending row';

  -- AC12: an uncertain row can be retried too
  perform nt.close_all();
  perform nt.set_status(pending_id, 'uncertain');
  select * into r from tracker.retry_notion_outbox(pending_id);
  assert r.id = pending_id and r.status = 'pending', 'retry: uncertain row not retried';

  -- AC12: a done row is not retryable
  perform nt.close_all();
  begin
    perform tracker.retry_notion_outbox(pending_id);
    raise exception 'retry of a done row accepted';
  exception when raise_exception then
    if sqlerrm <> 'not_retryable' then raise; end if;
  end;
end $$;

-- AC12: a teacher cannot see the row, so retry raises P0002
select nt.close_all();
reset role;
select nt.set_status(nt.id_of('summary:f0000000-0000-4000-8000-000000000002', 'done'), 'failed');
set role authenticated;
set request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000d1"}';
select nt.expect_code(format('select * from tracker.retry_notion_outbox(%L)', nt.id_of('summary:f0000000-0000-4000-8000-000000000002', 'failed')), 'P0002');

-- AC14: supersede and column grants -------------------------------------------------------
set request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a1"}';
create temp table target_row as select nt.id_of('summary:f0000000-0000-4000-8000-000000000002', 'failed') as id,
  nt.id_of('summary:f0000000-0000-4000-8000-000000000001', 'done') as other;
do $$
declare t uuid := (select id from target_row); o uuid := (select other from target_row);
begin
  update tracker.notion_outbox set status = 'superseded', superseded_by = o where id = t;
  assert nt.status_of(t) = 'superseded', 'owner could not supersede';
end $$;
select nt.expect_code(format('update tracker.notion_outbox set org_id = %L where id = %L', '10000000-0000-0000-0000-000000000002', (select id from target_row)), '42501');
select nt.expect_code(format('update tracker.notion_outbox set kind = %L where id = %L', 'daily_task', (select id from target_row)), '42501');
select nt.expect_code(format('update tracker.notion_outbox set target_id = gen_random_uuid() where id = %L', (select id from target_row)), '42501');
select nt.expect_code(format('update tracker.notion_outbox set dedupe_key = %L where id = %L', 'x', (select id from target_row)), '42501');
select nt.expect_code(format('update tracker.notion_outbox set request_id = gen_random_uuid() where id = %L', (select id from target_row)), '42501');
select nt.expect_code(format('update tracker.notion_outbox set version = 99 where id = %L', (select id from target_row)), '42501');

-- AC14: RLS --------------------------------------------------------------------------------
do $$
begin
  assert (select count(*) from tracker.notion_outbox) > 0, 'owner reads nothing';
  assert (select count(*) from tracker.notion_outbox where org_id = '10000000-0000-0000-0000-000000000002') = 0, 'owner reads another org';
end $$;
select nt.expect_code($q$insert into tracker.notion_outbox (org_id, kind, target_id, dedupe_key) values ('10000000-0000-0000-0000-000000000001', 'daily_task', '10000000-0000-0000-0000-000000000001', 'x')$q$, '42501');
select nt.expect_code($q$delete from tracker.notion_outbox$q$, '42501');

create temp table before_rls as select nt.snapshot() as s;
grant select on before_rls to authenticated;
do $$
declare
  who text;
  n integer;
begin
  foreach who in array array['00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000e1',
                             '00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000c2'] loop
    perform set_config('request.jwt.claims', json_build_object('sub', who)::text, true);
    assert (select count(*) from tracker.notion_outbox where org_id = '10000000-0000-0000-0000-000000000001') = 0, format('%s reads org one outbox', who);
    update tracker.notion_outbox set status = 'pending' where org_id = '10000000-0000-0000-0000-000000000001';
    get diagnostics n = row_count;
    assert n = 0, format('%s updated outbox rows', who);
    begin
      delete from tracker.notion_outbox;
      raise exception '% deleted outbox rows', who;
    exception when insufficient_privilege then null;
    end;
  end loop;
  assert nt.snapshot() = (select s from before_rls), 'other roles changed the outbox';
end $$;

reset role;
set role anon;
select nt.expect_code('select count(*) from tracker.notion_outbox', '42501');
reset role;
