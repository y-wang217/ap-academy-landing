-- REQ-30: locked class writes (0018). Run by run-rls.sh on a fresh copy of the
-- migrated database. A second session through dblink (created in this check
-- database only) proves that two clashing writes cannot both commit.
-- Each check raises on failure.

\set ON_ERROR_STOP on
\o /dev/null

-- Cast: OWN owner; TCH teacher (staff E1); REV revoked teacher (staff E3);
-- PAR parent; STU student; OUT outsider.
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'owner@example.com'),
  ('00000000-0000-0000-0000-0000000000d1', 't@example.com'),
  ('00000000-0000-0000-0000-0000000000d3', 'rev@example.com'),
  ('00000000-0000-0000-0000-0000000000e1', 'parent@example.com'),
  ('00000000-0000-0000-0000-0000000000b1', 'student@example.com'),
  ('00000000-0000-0000-0000-0000000000c1', 'out@example.com');
insert into tracker.orgs (id, name) values ('10000000-0000-0000-0000-000000000001', 'Org One');
insert into tracker.memberships (user_id, org_id, role) values
  ('00000000-0000-0000-0000-0000000000a1', '10000000-0000-0000-0000-000000000001', 'owner'),
  ('00000000-0000-0000-0000-0000000000e1', '10000000-0000-0000-0000-000000000001', 'parent'),
  ('00000000-0000-0000-0000-0000000000b1', '10000000-0000-0000-0000-000000000001', 'student');
insert into tracker.staff_links (org_id, notion_staff_id, email, approved_by, user_id, revoked_at) values
  ('10000000-0000-0000-0000-000000000001', 'e0000000-0000-4000-8000-000000000001', 't@example.com', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000d1', null),
  ('10000000-0000-0000-0000-000000000001', 'e0000000-0000-4000-8000-000000000003', 'rev@example.com', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000d3', now());

-- S1: weekly, teacher E1, student F1, Mondays 17:00 from 2030-01-07.
-- O1: one-off, teacher E2, student F4, 2030-01-09 15:00.
insert into tracker.class_series (id, org_id, request_id, notion_staff_id, notion_student_id, subject, kind, start_date, start_time, duration_minutes, created_by) values
  ('50000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000000001',
   'e0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000001', 'MHF4U', 'weekly', '2030-01-07', '17:00', 60, '00000000-0000-0000-0000-0000000000a1'),
  ('50000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000000002',
   'e0000000-0000-4000-8000-000000000002', 'f0000000-0000-4000-8000-000000000004', 'SCH4U', 'one_off', '2030-01-09', '15:00', 60, '00000000-0000-0000-0000-0000000000a1');

create extension dblink;
create schema lw;
grant usage on schema lw to authenticated;

-- The second session: a superuser connection that then acts as the owner.
create function lw.open_b() returns void language plpgsql as $$
begin
  perform dblink_connect('b', format('host=%s port=%s dbname=%s user=postgres',
    split_part(current_setting('unix_socket_directories'), ',', 1), current_setting('port'), current_database()));
  perform dblink_exec('b', 'set role authenticated');
  perform dblink_exec('b', $q$set request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a1"}'$q$);
end;
$$;

-- Starts a schedule_write in session B without waiting for it.
create function lw.send_b(req uuid, op text, stamps jsonb, args jsonb) returns void language plpgsql as $$
begin
  perform dblink_send_query('b', format('select tracker.schedule_write(%L, %L, %L, %L::jsonb, %L::jsonb)::text',
    '10000000-0000-0000-0000-000000000001', req, op, stamps, args));
end;
$$;

-- Waits a moment and reports whether B is still waiting on a lock.
create function lw.b_blocked() returns boolean language plpgsql as $$
begin
  perform pg_sleep(0.5);
  return dblink_is_busy('b') = 1;
end;
$$;

-- B's outcome: its result as jsonb, or { "error": <message> }.
create function lw.b_result() returns jsonb language plpgsql as $$
declare r text; got jsonb;
begin
  select x into r from dblink_get_result('b', false) as t(x text);
  if r is null then
    -- "ERROR:  booking_changed\nCONTEXT: ..." -> "booking_changed"
    got := jsonb_build_object('error', regexp_replace(split_part(dblink_error_message('b'), E'\n', 1), '^ERROR:\s+', ''));
  else
    got := r::jsonb;
  end if;
  perform 1 from dblink_get_result('b', false) as t(x text);
  return got;
end;
$$;

-- The owner's view of the stamps for these keys, as schedule_write expects them.
create function lw.stamps(keys jsonb) returns jsonb language sql as $$
  select tracker.schedule_write_context('10000000-0000-0000-0000-000000000001', gen_random_uuid(), keys) -> 'stamps'
$$;

create function lw.expect_error(q text, msg text) returns void language plpgsql as $$
begin
  execute q;
  raise exception 'expected error % from: %', msg, q;
exception when others then
  if sqlerrm <> msg then raise; end if;
end;
$$;
grant execute on all functions in schema lw to authenticated;

select lw.open_b();

-- Owner from here unless noted.
set role authenticated;
set request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a1"}';

-- AC1: two overlapping creates for teacher E1 with the same stamps ---------------
create temp table s1 as select lw.stamps('[{"kind":"staff","id":"e0000000-0000-4000-8000-000000000001"},
  {"kind":"student","id":"f0000000-0000-4000-8000-000000000002"},{"kind":"student","id":"f0000000-0000-4000-8000-000000000003"}]') as st;

begin;
select tracker.schedule_write('10000000-0000-0000-0000-000000000001', 'a1000000-0000-4000-8000-000000000001', 'create', (select st from s1),
  '{"staff_id":"e0000000-0000-4000-8000-000000000001","student_id":"f0000000-0000-4000-8000-000000000002","subject":"MCV4U","kind":"one_off","start_date":"2030-02-04","start_time":"17:00","duration_minutes":60}');
reset role;
select lw.send_b('a1000000-0000-4000-8000-000000000002', 'create', (select st from s1),
  '{"staff_id":"e0000000-0000-4000-8000-000000000001","student_id":"f0000000-0000-4000-8000-000000000003","subject":"MCV4U","kind":"one_off","start_date":"2030-02-04","start_time":"17:30","duration_minutes":60}');
do $$ begin if not lw.b_blocked() then raise exception 'AC1: B did not wait for the teacher lock'; end if; end $$;
commit;
do $$
declare r jsonb := lw.b_result();
begin
  if r ->> 'error' is distinct from 'booking_changed' then raise exception 'AC1: B should fail booking_changed, got %', r; end if;
  if (select count(*) from tracker.class_series where start_date = '2030-02-04') <> 1 then raise exception 'AC1: both creates landed'; end if;
  if (select count(*) from tracker.schedule_writes) <> 1 then raise exception 'AC1: refused write left a schedule_writes row'; end if;
end $$;

-- AC2: a move into a slot another transaction is booking -------------------------
set role authenticated;
set request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a1"}';
create temp table s2 as select lw.stamps('[{"kind":"staff","id":"e0000000-0000-4000-8000-000000000001"},
  {"kind":"student","id":"f0000000-0000-4000-8000-000000000001"},{"kind":"student","id":"f0000000-0000-4000-8000-000000000005"}]') as st,
  (select updated_at from tracker.class_series where id = '50000000-0000-0000-0000-000000000001') as s1_updated;
begin;
select tracker.schedule_write('10000000-0000-0000-0000-000000000001', 'a2000000-0000-4000-8000-000000000001', 'create', (select st from s2),
  '{"staff_id":"e0000000-0000-4000-8000-000000000001","student_id":"f0000000-0000-4000-8000-000000000005","subject":"MCV4U","kind":"one_off","start_date":"2030-03-05","start_time":"10:00","duration_minutes":60}');
reset role;
select lw.send_b('a2000000-0000-4000-8000-000000000002', 'move', (select st from s2), jsonb_build_object(
  'series_id', '50000000-0000-0000-0000-000000000001', 'original_date', '2030-01-14', 'new_date', '2030-03-05', 'new_start_time', '10:00',
  'expected_updated_at', (select s1_updated from s2),
  'expected_position', jsonb_build_object('status', 'scheduled', 'date', '2030-01-14', 'start_time', '17:00')));
do $$ begin if not lw.b_blocked() then raise exception 'AC2: move did not wait'; end if; end $$;
commit;
do $$
declare r jsonb := lw.b_result();
begin
  if r ->> 'error' is distinct from 'booking_changed' then raise exception 'AC2: move should fail booking_changed, got %', r; end if;
  if exists (select 1 from tracker.class_exceptions where series_id = '50000000-0000-0000-0000-000000000001' and original_date = '2030-01-14') then
    raise exception 'AC2: the refused move wrote an exception';
  end if;
end $$;

-- AC2: a split (series edit) while another transaction edits the same series ----
set role authenticated;
set request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a1"}';
create temp table s3 as select lw.stamps('[{"kind":"staff","id":"e0000000-0000-4000-8000-000000000001"},
  {"kind":"student","id":"f0000000-0000-4000-8000-000000000001"}]') as st,
  (select updated_at from tracker.class_series where id = '50000000-0000-0000-0000-000000000001') as s1_updated;
begin;
select tracker.schedule_write('10000000-0000-0000-0000-000000000001', 'a3000000-0000-4000-8000-000000000001', 'move', (select st from s3), jsonb_build_object(
  'series_id', '50000000-0000-0000-0000-000000000001', 'original_date', '2030-01-28', 'new_date', '2030-01-29', 'new_start_time', '10:00',
  'expected_updated_at', (select s1_updated from s3),
  'expected_position', jsonb_build_object('status', 'scheduled', 'date', '2030-01-28', 'start_time', '17:00')));
reset role;
select lw.send_b('a3000000-0000-4000-8000-000000000002', 'split', (select st from s3), jsonb_build_object(
  'series_id', '50000000-0000-0000-0000-000000000001', 'from_date', '2030-02-11', 'expected_updated_at', (select s1_updated from s3),
  'new_values', jsonb_build_object('start_time', '18:00')));
do $$ begin if not lw.b_blocked() then raise exception 'AC2: split did not wait'; end if; end $$;
commit;
do $$
declare r jsonb := lw.b_result();
begin
  if r ->> 'error' is distinct from 'booking_changed' then raise exception 'AC2: split should fail booking_changed, got %', r; end if;
  if exists (select 1 from tracker.class_series where split_from = '50000000-0000-0000-0000-000000000001') then raise exception 'AC2: the refused split landed'; end if;
end $$;

-- AC3: an availability change between the context read and the write ------------
set role authenticated;
set request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a1"}';
create temp table s4 as select lw.stamps('[{"kind":"staff","id":"e0000000-0000-4000-8000-000000000001"},
  {"kind":"student","id":"f0000000-0000-4000-8000-000000000006"}]') as st;
set request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000d1"}';
insert into tracker.availability_windows (org_id, request_id, notion_staff_id, weekday, start_time, end_time, effective_from, created_by) values
  ('10000000-0000-0000-0000-000000000001', gen_random_uuid(), 'e0000000-0000-4000-8000-000000000001', 3, '09:00', '12:00', '2030-01-01', '00000000-0000-0000-0000-0000000000d1');
set request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a1"}';
select lw.expect_error(format($q$select tracker.schedule_write('10000000-0000-0000-0000-000000000001', 'a4000000-0000-4000-8000-000000000001', 'create', %L::jsonb,
  '{"staff_id":"e0000000-0000-4000-8000-000000000001","student_id":"f0000000-0000-4000-8000-000000000006","subject":"X","kind":"one_off","start_date":"2030-04-03","start_time":"09:00","duration_minutes":60}')$q$,
  (select st from s4)), 'booking_changed');

-- AC8a: a replay after commit returns the first result and writes nothing ------
do $$
declare
  first jsonb;
  again jsonb;
  st jsonb := lw.stamps('[{"kind":"staff","id":"e0000000-0000-4000-8000-000000000002"},{"kind":"student","id":"f0000000-0000-4000-8000-000000000007"}]');
  args jsonb := '{"staff_id":"e0000000-0000-4000-8000-000000000002","student_id":"f0000000-0000-4000-8000-000000000007","subject":"X","kind":"weekly","start_date":"2030-05-06","start_time":"12:00","duration_minutes":45}';
  n_series bigint;
  n_writes bigint;
begin
  first := tracker.schedule_write('10000000-0000-0000-0000-000000000001', 'a5000000-0000-4000-8000-000000000001', 'create', st, args);
  if (first ->> 'replay')::boolean then raise exception 'AC8a: first write reported as replay'; end if;
  select count(*) into n_series from tracker.class_series;
  select count(*) into n_writes from tracker.schedule_writes;
  -- stale stamps on purpose: the replay is found before the compare
  again := tracker.schedule_write('10000000-0000-0000-0000-000000000001', 'a5000000-0000-4000-8000-000000000001', 'create', '[]', args);
  if not (again ->> 'replay')::boolean or again #>> '{result,id}' <> first #>> '{result,id}' then raise exception 'AC8a: replay %', again; end if;
  if (select count(*) from tracker.class_series) <> n_series or (select count(*) from tracker.schedule_writes) <> n_writes then
    raise exception 'AC8a: the replay wrote rows';
  end if;
  if tracker.schedule_write_context('10000000-0000-0000-0000-000000000001', 'a5000000-0000-4000-8000-000000000001', '[]') #>> '{replay,result,id}'
    <> first #>> '{result,id}' then
    raise exception 'AC8a: context does not return the replay';
  end if;
  -- a move retried after it finished is a replay, not a stale
  first := tracker.schedule_write('10000000-0000-0000-0000-000000000001', 'a5000000-0000-4000-8000-000000000002', 'move',
    lw.stamps('[{"kind":"staff","id":"e0000000-0000-4000-8000-000000000002"},{"kind":"student","id":"f0000000-0000-4000-8000-000000000007"}]'),
    jsonb_build_object('series_id', first #>> '{result,id}', 'original_date', '2030-05-13', 'new_date', '2030-05-14', 'new_start_time', '12:00',
      'expected_updated_at', first #>> '{result,updated_at}',
      'expected_position', jsonb_build_object('status', 'scheduled', 'date', '2030-05-13', 'start_time', '12:00')));
  again := tracker.schedule_write('10000000-0000-0000-0000-000000000001', 'a5000000-0000-4000-8000-000000000002', 'move', '[]',
    jsonb_build_object('series_id', first #>> '{result,id}', 'original_date', '2030-05-13', 'new_date', '2030-05-14', 'new_start_time', '12:00',
      'expected_updated_at', first #>> '{result,updated_at}',
      'expected_position', jsonb_build_object('status', 'scheduled', 'date', '2030-05-13', 'start_time', '12:00')));
  if not (again ->> 'replay')::boolean then raise exception 'AC8a: retried move was not a replay'; end if;

  -- AC9: the same request ID for another op is refused
  perform lw.expect_error(format($q$select tracker.schedule_write('10000000-0000-0000-0000-000000000001', 'a5000000-0000-4000-8000-000000000001', 'cancel', '[]',
    '{"series_id":"50000000-0000-0000-0000-000000000001","original_date":"2030-01-21","expected_updated_at":"2000-01-01T00:00:00Z"}')$q$), 'request_reused');
end $$;

-- AC8b: two sessions, one request ID, at the same time ----------------------------
create temp table s5 as select lw.stamps('[{"kind":"staff","id":"e0000000-0000-4000-8000-000000000002"},
  {"kind":"student","id":"f0000000-0000-4000-8000-000000000008"}]') as st;
begin;
create temp table a5 as select tracker.schedule_write('10000000-0000-0000-0000-000000000001', 'a6000000-0000-4000-8000-000000000001', 'create', (select st from s5),
  '{"staff_id":"e0000000-0000-4000-8000-000000000002","student_id":"f0000000-0000-4000-8000-000000000008","subject":"X","kind":"one_off","start_date":"2030-06-03","start_time":"09:00","duration_minutes":60}') as r;
reset role;
select lw.send_b('a6000000-0000-4000-8000-000000000001', 'create', (select st from s5),
  '{"staff_id":"e0000000-0000-4000-8000-000000000002","student_id":"f0000000-0000-4000-8000-000000000008","subject":"X","kind":"one_off","start_date":"2030-06-03","start_time":"09:00","duration_minutes":60}');
do $$ begin if not lw.b_blocked() then raise exception 'AC8b: duplicate did not wait'; end if; end $$;
commit;
do $$
declare r jsonb := lw.b_result();
begin
  if r ? 'error' or not (r ->> 'replay')::boolean then raise exception 'AC8b: duplicate should replay, got %', r; end if;
  if r #>> '{result,id}' <> (select a5.r #>> '{result,id}' from a5) then raise exception 'AC8b: replay returned another series'; end if;
  if (select count(*) from tracker.class_series where request_id = 'a6000000-0000-4000-8000-000000000001') <> 1 then raise exception 'AC8b: two classes'; end if;
  if (select count(*) from tracker.schedule_writes where request_id = 'a6000000-0000-4000-8000-000000000001') <> 1 then raise exception 'AC8b: two log rows'; end if;
end $$;

-- AC11: a one-off edit is one transaction ------------------------------------------
set role authenticated;
set request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a1"}';
do $$
declare
  st jsonb := lw.stamps('[{"kind":"staff","id":"e0000000-0000-4000-8000-000000000002"},{"kind":"student","id":"f0000000-0000-4000-8000-000000000004"}]');
  upd timestamptz := (select updated_at from tracker.class_series where id = '50000000-0000-0000-0000-000000000002');
begin
  begin
    perform tracker.schedule_write('10000000-0000-0000-0000-000000000001', 'a7000000-0000-4000-8000-000000000001', 'edit_one_off', st, jsonb_build_object(
      'series_id', '50000000-0000-0000-0000-000000000002', 'original_date', '2030-01-09', 'new_date', '2030-01-10', 'new_start_time', '15:00',
      'fields', jsonb_build_object('duration_minutes', 7), 'expected_updated_at', upd,
      'expected_position', jsonb_build_object('status', 'scheduled', 'date', '2030-01-09', 'start_time', '15:00')));
    raise exception 'AC11: a bad duration was accepted';
  exception when check_violation then null;
  end;
  if exists (select 1 from tracker.class_exceptions where series_id = '50000000-0000-0000-0000-000000000002') then
    raise exception 'AC11: the exception survived the failed series update';
  end if;
  -- and a good one changes both rows
  perform tracker.schedule_write('10000000-0000-0000-0000-000000000001', 'a7000000-0000-4000-8000-000000000002', 'edit_one_off', st, jsonb_build_object(
    'series_id', '50000000-0000-0000-0000-000000000002', 'original_date', '2030-01-09', 'new_date', '2030-01-10', 'new_start_time', '15:00',
    'fields', jsonb_build_object('duration_minutes', 90), 'expected_updated_at', upd,
    'expected_position', jsonb_build_object('status', 'scheduled', 'date', '2030-01-09', 'start_time', '15:00')));
  if (select duration_minutes from tracker.class_series where id = '50000000-0000-0000-0000-000000000002') <> 90
    or not exists (select 1 from tracker.class_exceptions where series_id = '50000000-0000-0000-0000-000000000002' and new_date = '2030-01-10') then
    raise exception 'AC11: one-off edit did not change both rows';
  end if;
  -- AC7: a stale position under the lock is refused
  perform lw.expect_error(format($q$select tracker.schedule_write('10000000-0000-0000-0000-000000000001', gen_random_uuid(), 'cancel', %L::jsonb, %L::jsonb)$q$,
    lw.stamps('[{"kind":"staff","id":"e0000000-0000-4000-8000-000000000002"},{"kind":"student","id":"f0000000-0000-4000-8000-000000000004"}]'),
    jsonb_build_object('series_id', '50000000-0000-0000-0000-000000000002', 'original_date', '2030-01-09',
      'expected_updated_at', (select updated_at from tracker.class_series where id = '50000000-0000-0000-0000-000000000002'),
      'expected_position', jsonb_build_object('status', 'scheduled', 'date', '2030-01-09', 'start_time', '15:00'))), 'stale');
end $$;

-- AC10: nobody but the owner calls the functions or reads the tables --------------
do $$
declare
  who text;
  n_stamps bigint;
  n_writes bigint;
  n_series bigint;
begin
  select count(*) into n_stamps from tracker.booking_stamps;
  select count(*) into n_writes from tracker.schedule_writes;
  select count(*) into n_series from tracker.class_series;
  if n_stamps = 0 or n_writes = 0 then raise exception 'AC10: owner reads no stamps or writes'; end if;
  foreach who in array array['00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000d3',
    '00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000c1'] loop
    perform set_config('request.jwt.claims', jsonb_build_object('sub', who)::text, true);
    perform lw.expect_error($q$select tracker.schedule_write('10000000-0000-0000-0000-000000000001', gen_random_uuid(), 'create', '[]',
      '{"staff_id":"e0000000-0000-4000-8000-000000000001","student_id":"f0000000-0000-4000-8000-000000000009","subject":"X","kind":"one_off","start_date":"2030-07-01","start_time":"09:00","duration_minutes":60}')$q$, 'forbidden');
    perform lw.expect_error($q$select tracker.schedule_write_context('10000000-0000-0000-0000-000000000001', gen_random_uuid(), '[]')$q$, 'forbidden');
    if (select count(*) from tracker.booking_stamps) <> 0 then raise exception 'AC10: % reads booking_stamps', who; end if;
    if (select count(*) from tracker.schedule_writes) <> 0 then raise exception 'AC10: % reads schedule_writes', who; end if;
    begin
      insert into tracker.booking_stamps (org_id, key_kind, key_id, version) values ('10000000-0000-0000-0000-000000000001', 'staff', gen_random_uuid(), 99);
      raise exception 'AC10: % wrote booking_stamps', who;
    exception when insufficient_privilege then null;
    end;
    begin
      insert into tracker.schedule_writes (org_id, request_id, op, created_by) values ('10000000-0000-0000-0000-000000000001', gen_random_uuid(), 'create', who::uuid);
      raise exception 'AC10: % claimed a schedule write', who;
    exception when insufficient_privilege then null;
    end;
  end loop;
  perform set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-0000000000a1"}', true);
  if (select count(*) from tracker.booking_stamps) <> n_stamps or (select count(*) from tracker.schedule_writes) <> n_writes
    or (select count(*) from tracker.class_series) <> n_series then
    raise exception 'AC10: a refused caller changed a table';
  end if;
end $$;

-- AC10: a teacher's own availability edit still works and bumps their stamp
do $$
declare before bigint; after bigint;
begin
  before := (lw.stamps('[{"kind":"staff","id":"e0000000-0000-4000-8000-000000000001"}]') -> 0 ->> 'version')::bigint;
  perform set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-0000000000d1"}', true);
  insert into tracker.availability_exceptions (org_id, request_id, notion_staff_id, on_date, kind, created_by) values
    ('10000000-0000-0000-0000-000000000001', gen_random_uuid(), 'e0000000-0000-4000-8000-000000000001', '2030-08-01', 'time_off', '00000000-0000-0000-0000-0000000000d1');
  perform set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-0000000000a1"}', true);
  after := (lw.stamps('[{"kind":"staff","id":"e0000000-0000-4000-8000-000000000001"}]') -> 0 ->> 'version')::bigint;
  if after <> before + 1 then raise exception 'AC10: teacher availability edit did not bump the stamp (% -> %)', before, after; end if;
end $$;

-- AC14: a lock held past lock_timeout fails with 55P03 and writes nothing --------
reset role;
select * from dblink('b', 'begin') as t(x text);
select * from dblink('b', $q$select tracker.lock_booking_key('10000000-0000-0000-0000-000000000001', 'staff', 'e0000000-0000-4000-8000-000000000001')::text$q$) as t(x text);
set role authenticated;
set request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a1"}';
do $$
declare n bigint := (select count(*) from tracker.class_series);
begin
  begin
    perform tracker.schedule_write('10000000-0000-0000-0000-000000000001', gen_random_uuid(), 'create', '[]',
      '{"staff_id":"e0000000-0000-4000-8000-000000000001","student_id":"f0000000-0000-4000-8000-00000000000a","subject":"X","kind":"one_off","start_date":"2030-09-02","start_time":"09:00","duration_minutes":60}');
    raise exception 'AC14: write went through a held lock';
  exception when lock_not_available then null;
  end;
  if (select count(*) from tracker.class_series) <> n then raise exception 'AC14: wrote under a timeout'; end if;
end $$;
reset role;
select * from dblink('b', 'rollback') as t(x text);
select dblink_disconnect('b');
