-- RLS and function checks for the people sync (0021, REQ-38). Run by
-- run-rls.sh on a fresh copy of the migrated database. Each check raises on
-- failure and prints "ok: ..." when it passes.
--
-- Cast: owner O1, scheduling teacher T1 (live link, one series with student
-- S1), teacher T2 (live link, no series), membership teacher M1 (no link),
-- parent P1 (claimed link to a published child whose notion_student_id is
-- S1), student U1, and O2, the owner of Org Two.

\set ON_ERROR_STOP on

insert into auth.users (id, email) values
  ('a0000000-0000-0000-0000-0000000000a1', 'o1@example.com'),
  ('a0000000-0000-0000-0000-0000000000a2', 'o2@example.com'),
  ('d0000000-0000-0000-0000-0000000000d1', 't1@example.com'),
  ('d0000000-0000-0000-0000-0000000000d2', 't2@example.com'),
  ('b0000000-0000-0000-0000-0000000000b1', 'm1@example.com'),
  ('e0000000-0000-0000-0000-0000000000e1', 'p1@example.com'),
  ('c0000000-0000-0000-0000-0000000000c1', 'u1@example.com');
insert into tracker.orgs (id, name) values
  ('10000000-0000-0000-0000-000000000001', 'Org One'),
  ('10000000-0000-0000-0000-000000000002', 'Org Two');
insert into tracker.memberships (user_id, org_id, role) values
  ('a0000000-0000-0000-0000-0000000000a1', '10000000-0000-0000-0000-000000000001', 'owner'),
  ('a0000000-0000-0000-0000-0000000000a2', '10000000-0000-0000-0000-000000000002', 'owner'),
  ('b0000000-0000-0000-0000-0000000000b1', '10000000-0000-0000-0000-000000000001', 'teacher'),
  ('c0000000-0000-0000-0000-0000000000c1', '10000000-0000-0000-0000-000000000001', 'student'),
  ('e0000000-0000-0000-0000-0000000000e1', '10000000-0000-0000-0000-000000000001', 'parent');
insert into tracker.staff_links (org_id, notion_staff_id, email, user_id, approved_by) values
  ('10000000-0000-0000-0000-000000000001', '5a000000-0000-4000-8000-000000000001', 't1@example.com', 'd0000000-0000-0000-0000-0000000000d1', 'a0000000-0000-0000-0000-0000000000a1'),
  ('10000000-0000-0000-0000-000000000001', '5a000000-0000-4000-8000-000000000002', 't2@example.com', 'd0000000-0000-0000-0000-0000000000d2', 'a0000000-0000-0000-0000-0000000000a1');
-- S1 is a published grade-tracker student linked to P1 and claimed by U1.
insert into tracker.students (id, org_id, teacher_id, user_id, email, first_name, last_initial, grade_level, published_at, notion_student_id) values
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-0000000000a1',
   'c0000000-0000-0000-0000-0000000000c1', 's1@example.com', 'Ada', 'L', 11, now(), '6a000000-0000-4000-8000-000000000001');
insert into tracker.parent_links (org_id, student_id, email, parent_user_id, claimed_at, invited_by) values
  ('10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'p1@example.com',
   'e0000000-0000-0000-0000-0000000000e1', now(), 'a0000000-0000-0000-0000-0000000000a1');
-- T1 teaches S1. S9 (Org Two) is taught by staff 9 there.
insert into tracker.class_series (org_id, request_id, notion_staff_id, notion_student_id, subject, kind, start_date, start_time, duration_minutes, created_by) values
  ('10000000-0000-0000-0000-000000000001', gen_random_uuid(), '5a000000-0000-4000-8000-000000000001', '6a000000-0000-4000-8000-000000000001',
   'Math', 'weekly', '2026-09-07', '17:00', 60, 'a0000000-0000-0000-0000-0000000000a1'),
  ('10000000-0000-0000-0000-000000000002', gen_random_uuid(), '5a000000-0000-4000-8000-000000000009', '6a000000-0000-4000-8000-000000000009',
   'Math', 'weekly', '2026-09-07', '17:00', 60, 'a0000000-0000-0000-0000-0000000000a2');

-- AC1: the exact columns, and the migration added no rows ------------------------
do $$
declare
  got text[];
begin
  select array_agg(column_name::text order by ordinal_position) into got
    from information_schema.columns where table_schema = 'tracker' and table_name = 'staff';
  assert got = array['org_id', 'notion_staff_id', 'name', 'subjects', 'active', 'synced_at', 'archived_at', 'created_at', 'updated_at'],
    format('staff columns are %s', got);
  select array_agg(column_name::text order by ordinal_position) into got
    from information_schema.columns where table_schema = 'tracker' and table_name = 'student_people';
  assert got = array['org_id', 'notion_student_id', 'name', 'stage', 'active', 'synced_at', 'archived_at', 'created_at', 'updated_at'],
    format('student_people columns are %s', got);
  assert not exists (
    select 1 from information_schema.columns
     where table_schema = 'tracker' and table_name in ('staff', 'student_people')
       and column_name ~ '(parent|email|phone|rate|note|bill|greeting)'
  ), 'a people table has a parent, email, phone, rate, notes, billing or greeting column';
  assert (select count(*) from tracker.staff) = 0 and (select count(*) from tracker.student_people) = 0
     and (select count(*) from tracker.sync_runs) = 0, 'the migration added rows';
  raise notice 'ok: staff and student_people have exactly the copied columns and no rows (AC1)';
end $$;

-- AC4: the owner applies the first sync (the backfill) ---------------------------
set role authenticated;
set request.jwt.claims = '{"sub": "a0000000-0000-0000-0000-0000000000a1", "email": "o1@example.com", "role": "authenticated"}';
do $$
declare
  run tracker.sync_runs;
begin
  run := tracker.apply_people_sync('10000000-0000-0000-0000-000000000001', 'owner', now(),
    '[{"id": "5a000000-0000-4000-8000-000000000001", "name": "Ryan Lee", "subjects": ["Math"], "active": true},
      {"id": "5a000000-0000-4000-8000-000000000002", "name": "Tess Wu", "subjects": [], "active": true},
      {"id": "5a000000-0000-4000-8000-000000000003", "name": "Gone Staff", "subjects": [], "active": true},
      {"id": "5a000000-0000-4000-8000-000000000004", "name": "Never Taught", "subjects": [], "active": false}]',
    '[{"id": "6a000000-0000-4000-8000-000000000001", "name": "Ada L.", "stage": "Active", "active": true},
      {"id": "6a000000-0000-4000-8000-000000000002", "name": "Bo Q.", "stage": "Onboarding", "active": true},
      {"id": "6a000000-0000-4000-8000-000000000003", "name": "Old Lead", "stage": "Lost", "active": false}]',
    null);
  assert run.result = 'ok' and run.trigger = 'owner' and run.actor = 'a0000000-0000-0000-0000-0000000000a1', 'first sync: bad run row';
  assert run.staff_upserted = 3 and run.staff_archived = 0 and run.students_upserted = 2 and run.students_archived = 0,
    format('first sync: counts %s', run);
  assert run.finished_at >= run.started_at, 'first sync: finished before it started';
  -- An inactive id nobody references is not copied.
  assert not exists (select 1 from tracker.staff where notion_staff_id = '5a000000-0000-4000-8000-000000000004'), 'inactive unreferenced staff copied';
  assert not exists (select 1 from tracker.student_people where notion_student_id = '6a000000-0000-4000-8000-000000000003'), 'inactive unreferenced student copied';
  assert (select subjects from tracker.staff where notion_staff_id = '5a000000-0000-4000-8000-000000000001') = array['Math'], 'subjects not copied';
  raise notice 'ok: first sync copies active rows, skips inactive unreferenced ones, records the run (AC4, AC5)';
end $$;
reset role;

-- A referenced inactive id is copied: S3 gets a series, staff 4 a link.
insert into tracker.class_series (org_id, request_id, notion_staff_id, notion_student_id, subject, kind, start_date, start_time, duration_minutes, created_by) values
  ('10000000-0000-0000-0000-000000000001', gen_random_uuid(), '5a000000-0000-4000-8000-000000000002', '6a000000-0000-4000-8000-000000000003',
   'Math', 'one_off', '2026-09-08', '17:00', 60, 'a0000000-0000-0000-0000-0000000000a1');
insert into tracker.staff_links (org_id, notion_staff_id, email, approved_by) values
  ('10000000-0000-0000-0000-000000000001', '5a000000-0000-4000-8000-000000000004', 'nt@example.com', 'a0000000-0000-0000-0000-0000000000a1');

set role authenticated;
set request.jwt.claims = '{"sub": "a0000000-0000-0000-0000-0000000000a1", "email": "o1@example.com", "role": "authenticated"}';
do $$
declare
  run tracker.sync_runs;
  ryan_created timestamptz := (select created_at from tracker.staff where notion_staff_id = '5a000000-0000-4000-8000-000000000001');
  audit_before bigint := (select count(*) from tracker.audit_log);
begin
  -- Ryan renamed, Gone Staff missing from Notion, staff 4 and S3 referenced now.
  run := tracker.apply_people_sync('10000000-0000-0000-0000-000000000001', 'owner', now(),
    '[{"id": "5a000000-0000-4000-8000-000000000001", "name": "  Ryan Leigh ", "subjects": ["Math"], "active": true},
      {"id": "5a000000-0000-4000-8000-000000000002", "name": "Tess Wu", "subjects": [], "active": true},
      {"id": "5a000000-0000-4000-8000-000000000004", "name": "Never Taught", "subjects": [], "active": false}]',
    '[{"id": "6a000000-0000-4000-8000-000000000001", "name": "Ada L.", "stage": "Active", "active": true},
      {"id": "6a000000-0000-4000-8000-000000000003", "name": "Old Lead", "stage": "Lost", "active": false}]',
    null);
  assert run.result = 'ok', 'second sync failed';
  assert run.staff_upserted = 3 and run.staff_archived = 1 and run.students_upserted = 2 and run.students_archived = 1,
    format('second sync: counts %s', run);
  -- Rename keeps the row.
  assert (select name from tracker.staff where notion_staff_id = '5a000000-0000-4000-8000-000000000001') = 'Ryan Leigh', 'rename not applied or not trimmed';
  assert (select created_at from tracker.staff where notion_staff_id = '5a000000-0000-4000-8000-000000000001') = ryan_created, 'rename made a new row';
  -- Missing ids are archived, not deleted.
  assert (select archived_at is not null and not active from tracker.staff where notion_staff_id = '5a000000-0000-4000-8000-000000000003'),
    'missing staff not archived';
  assert (select archived_at is not null and not active from tracker.student_people where notion_student_id = '6a000000-0000-4000-8000-000000000002'),
    'missing student not archived';
  -- Referenced inactive ids are copied.
  assert (select not active from tracker.staff where notion_staff_id = '5a000000-0000-4000-8000-000000000004'), 'referenced inactive staff not copied';
  assert (select not active from tracker.student_people where notion_student_id = '6a000000-0000-4000-8000-000000000003'), 'referenced inactive student not copied';
  -- Audit: the rename, two archives and two inserts.
  assert (select count(*) from tracker.audit_log) - audit_before = 5,
    format('second sync wrote %s audit rows, expected 5', (select count(*) from tracker.audit_log) - audit_before);
  raise notice 'ok: rename keeps the row, missing ids archive, referenced inactive ids are copied (AC4)';

  -- An unchanged re-sync touches synced_at only and writes no audit row.
  audit_before := (select count(*) from tracker.audit_log);
  run := tracker.apply_people_sync('10000000-0000-0000-0000-000000000001', 'schedule', now(),
    '[{"id": "5a000000-0000-4000-8000-000000000001", "name": "Ryan Leigh", "subjects": ["Math"], "active": true},
      {"id": "5a000000-0000-4000-8000-000000000002", "name": "Tess Wu", "subjects": [], "active": true},
      {"id": "5a000000-0000-4000-8000-000000000004", "name": "Never Taught", "subjects": [], "active": false}]',
    '[{"id": "6a000000-0000-4000-8000-000000000001", "name": "Ada L.", "stage": "Active", "active": true},
      {"id": "6a000000-0000-4000-8000-000000000003", "name": "Old Lead", "stage": "Lost", "active": false}]',
    null);
  assert run.result = 'ok' and run.staff_archived = 0 and run.students_archived = 0, 'unchanged re-sync archived something';
  assert (select count(*) from tracker.audit_log) = audit_before, 'unchanged re-sync wrote an audit row';
  raise notice 'ok: an unchanged re-sync writes no audit row';

  -- A row that comes back is unarchived.
  run := tracker.apply_people_sync('10000000-0000-0000-0000-000000000001', 'owner', now(),
    '[{"id": "5a000000-0000-4000-8000-000000000001", "name": "Ryan Leigh", "subjects": ["Math"], "active": true},
      {"id": "5a000000-0000-4000-8000-000000000002", "name": "Tess Wu", "subjects": [], "active": true},
      {"id": "5a000000-0000-4000-8000-000000000003", "name": "Gone Staff", "subjects": [], "active": true},
      {"id": "5a000000-0000-4000-8000-000000000004", "name": "Never Taught", "subjects": [], "active": false}]',
    '[{"id": "6a000000-0000-4000-8000-000000000001", "name": "Ada L.", "stage": "Active", "active": true},
      {"id": "6a000000-0000-4000-8000-000000000003", "name": "Old Lead", "stage": "Lost", "active": false}]',
    null);
  assert (select archived_at is null and active from tracker.staff where notion_staff_id = '5a000000-0000-4000-8000-000000000003'),
    'returning staff row not unarchived';
  raise notice 'ok: a row that comes back is unarchived (AC4)';
end $$;
reset role;

-- AC6: a failed sync keeps every row ------------------------------------------------
set role authenticated;
set request.jwt.claims = '{"sub": "a0000000-0000-0000-0000-0000000000a1", "email": "o1@example.com", "role": "authenticated"}';
do $$
declare
  run tracker.sync_runs;
  staff_before text := (select md5(string_agg(to_jsonb(s)::text, ',' order by s.notion_staff_id)) from tracker.staff s);
  people_before text := (select md5(string_agg(to_jsonb(p)::text, ',' order by p.notion_student_id)) from tracker.student_people p);
  runs_before bigint := (select count(*) from tracker.sync_runs);
begin
  run := tracker.apply_people_sync('10000000-0000-0000-0000-000000000001', 'schedule', now(), '[]',
    '[{"id": "6a000000-0000-4000-8000-000000000001", "name": "Ada L.", "stage": "Active", "active": true}]', null);
  assert run.result = 'failed' and run.error = 'empty_read', format('empty staff read: %s', run);
  run := tracker.apply_people_sync('10000000-0000-0000-0000-000000000001', 'schedule', now(),
    '[{"id": "5a000000-0000-4000-8000-000000000001", "name": "Ryan Leigh", "subjects": [], "active": true}]', '[]', null);
  assert run.result = 'failed' and run.error = 'empty_read', format('empty students read: %s', run);
  run := tracker.apply_people_sync('10000000-0000-0000-0000-000000000001', 'schedule', now(), null, null, 'notion_unavailable');
  assert run.result = 'failed' and run.error = 'notion_unavailable' and run.staff_upserted = 0, format('p_error: %s', run);
  run := tracker.apply_people_sync('10000000-0000-0000-0000-000000000001', 'schedule', now(),
    '[{"id": "not-a-uuid", "name": "X", "subjects": [], "active": true}]', '[]', null);
  assert run.result = 'failed' and run.error = 'invalid_payload', format('bad id: %s', run);
  run := tracker.apply_people_sync('10000000-0000-0000-0000-000000000001', 'schedule', now(),
    '[{"id": "5a000000-0000-4000-8000-000000000001", "name": "", "subjects": [], "active": true}]', '[]', null);
  assert run.result = 'failed' and run.error = 'invalid_payload', format('empty name: %s', run);
  run := tracker.apply_people_sync('10000000-0000-0000-0000-000000000001', 'schedule', now(),
    '{"id": "5a000000-0000-4000-8000-000000000001"}', '[]', null);
  assert run.result = 'failed' and run.error = 'invalid_payload', format('not an array: %s', run);
  run := tracker.apply_people_sync('10000000-0000-0000-0000-000000000001', 'schedule', now(),
    '[{"id": "5a000000-0000-4000-8000-000000000001", "name": "A", "subjects": [], "active": true},
      {"id": "5a000000-0000-4000-8000-000000000001", "name": "B", "subjects": [], "active": true}]',
    '[{"id": "6a000000-0000-4000-8000-000000000001", "name": "Ada L.", "stage": "Active", "active": true}]', null);
  assert run.result = 'failed' and run.error = 'invalid_payload', format('duplicate id: %s', run);
  run := tracker.apply_people_sync('10000000-0000-0000-0000-000000000001', 'schedule', now(), null, null, repeat('x', 400));
  assert run.result = 'failed' and char_length(run.error) = 300, 'long error not cut to 300';
  assert (select md5(string_agg(to_jsonb(s)::text, ',' order by s.notion_staff_id)) from tracker.staff s) = staff_before, 'a failed sync changed staff';
  assert (select md5(string_agg(to_jsonb(p)::text, ',' order by p.notion_student_id)) from tracker.student_people p) = people_before,
    'a failed sync changed student_people';
  assert (select count(*) from tracker.sync_runs) = runs_before + 8, 'a failed sync recorded no run';
  raise notice 'ok: empty reads, p_error and invalid payloads record a failed run and change no person row (AC5, AC6)';
end $$;
reset role;

-- Who may apply ---------------------------------------------------------------------
do $$
declare
  who text;
  runs_before bigint := (select count(*) from tracker.sync_runs);
begin
  foreach who in array array['d0000000-0000-0000-0000-0000000000d1', 'e0000000-0000-0000-0000-0000000000e1',
                             'b0000000-0000-0000-0000-0000000000b1', 'a0000000-0000-0000-0000-0000000000a2'] loop
    perform set_config('request.jwt.claims', json_build_object('sub', who, 'role', 'authenticated')::text, true);
    set local role authenticated;
    begin
      perform tracker.apply_people_sync('10000000-0000-0000-0000-000000000001', 'owner', now(), '[]', '[]', null);
      raise exception 'apply_people_sync ran for %', who;
    exception when insufficient_privilege then null;
    end;
    reset role;
  end loop;
  assert (select count(*) from tracker.sync_runs) = runs_before, 'a refused apply recorded a run';
  raise notice 'ok: teacher, parent, membership teacher and another org''s owner cannot apply (AC2)';
end $$;

-- A claimed role of authenticated cannot pose as the service role.
set role authenticated;
set request.jwt.claims = '{"sub": "d0000000-0000-0000-0000-0000000000d1", "role": "authenticated"}';
do $$ begin
  begin
    perform tracker.apply_people_sync('10000000-0000-0000-0000-000000000001', 'schedule', now(), '[]', '[]', null);
    raise exception 'teacher applied a sync';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

-- The service role (the hourly run) applies.
set role service_role;
set request.jwt.claims = '{"role": "service_role"}';
do $$
declare run tracker.sync_runs;
begin
  run := tracker.apply_people_sync('10000000-0000-0000-0000-000000000002', 'schedule', now(),
    '[{"id": "5a000000-0000-4000-8000-000000000009", "name": "Nine Staff", "subjects": [], "active": true}]',
    '[{"id": "6a000000-0000-4000-8000-000000000009", "name": "Zed Q.", "stage": "Active", "active": true}]', null);
  assert run.result = 'ok' and run.actor is null and run.trigger = 'schedule', format('service role sync: %s', run);
  raise notice 'ok: the service role applies a scheduled sync (AC7)';
end $$;
reset role;
set request.jwt.claims = '';

-- AC2: who reads what ---------------------------------------------------------------
-- O1 state now: staff 1 (Ryan, active), 2 (Tess, active), 3 (Gone Staff,
-- active again), 4 (Never Taught, inactive); students S1 (active), S2
-- (archived), S3 (inactive). T1 teaches S1, T2 teaches S3.
-- Archive staff 3 again so the teacher rule has an archived row to skip.
update tracker.staff set archived_at = now(), active = false where notion_staff_id = '5a000000-0000-4000-8000-000000000003';

create function pg_temp.seen(who uuid, tbl text) returns text[]
language plpgsql as $$
declare
  out text[];
  key text := case tbl when 'staff' then 'notion_staff_id' when 'student_people' then 'notion_student_id' else 'id' end;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', who, 'role', 'authenticated')::text, true);
  set local role authenticated;
  execute format('select coalesce(array_agg(right(%I::text, 1) order by %I), ''{}'') from tracker.%I where org_id = %L',
                 key, key, tbl, '10000000-0000-0000-0000-000000000001') into out;
  reset role;
  return out;
end;
$$;

do $$
declare
  n bigint;
begin
  -- Owner: every row of the org.
  assert pg_temp.seen('a0000000-0000-0000-0000-0000000000a1', 'staff') = array['1', '2', '3', '4'], 'owner staff';
  assert pg_temp.seen('a0000000-0000-0000-0000-0000000000a1', 'student_people') = array['1', '2', '3'], 'owner students';
  assert cardinality(pg_temp.seen('a0000000-0000-0000-0000-0000000000a1', 'sync_runs')) > 0, 'owner reads no sync runs';
  -- T1: active non-archived staff plus own row; only S1.
  assert pg_temp.seen('d0000000-0000-0000-0000-0000000000d1', 'staff') = array['1', '2'],
    format('T1 staff %s', pg_temp.seen('d0000000-0000-0000-0000-0000000000d1', 'staff'));
  assert pg_temp.seen('d0000000-0000-0000-0000-0000000000d1', 'student_people') = array['1'], 'T1 students';
  assert pg_temp.seen('d0000000-0000-0000-0000-0000000000d1', 'sync_runs') = '{}', 'T1 reads sync runs';
  -- T2 teaches S3 only; an inactive own row stays visible to its owner.
  assert pg_temp.seen('d0000000-0000-0000-0000-0000000000d2', 'student_people') = array['3'], 'T2 students';
  update tracker.staff set active = false where notion_staff_id = '5a000000-0000-4000-8000-000000000002';
  assert pg_temp.seen('d0000000-0000-0000-0000-0000000000d2', 'staff') = array['1', '2'], 'T2 lost sight of their own inactive row';
  assert pg_temp.seen('d0000000-0000-0000-0000-0000000000d1', 'staff') = array['1'], 'T1 reads an inactive colleague';
  update tracker.staff set active = true where notion_staff_id = '5a000000-0000-4000-8000-000000000002';
  -- T2 with no series reads no students.
  delete from tracker.class_series where notion_staff_id = '5a000000-0000-4000-8000-000000000002';
  assert pg_temp.seen('d0000000-0000-0000-0000-0000000000d2', 'student_people') = '{}', 'T2 with no series reads students';
  -- P1: only S1, and only T1's staff row (the teacher on S1's series).
  assert pg_temp.seen('e0000000-0000-0000-0000-0000000000e1', 'student_people') = array['1'], 'P1 students';
  assert pg_temp.seen('e0000000-0000-0000-0000-0000000000e1', 'staff') = array['1'], 'P1 staff';
  assert pg_temp.seen('e0000000-0000-0000-0000-0000000000e1', 'sync_runs') = '{}', 'P1 reads sync runs';
  -- M1, U1 and O2 read nothing of Org One.
  assert pg_temp.seen('b0000000-0000-0000-0000-0000000000b1', 'staff') = '{}' and pg_temp.seen('b0000000-0000-0000-0000-0000000000b1', 'student_people') = '{}'
     and pg_temp.seen('b0000000-0000-0000-0000-0000000000b1', 'sync_runs') = '{}', 'membership teacher reads people rows';
  assert pg_temp.seen('c0000000-0000-0000-0000-0000000000c1', 'staff') = '{}' and pg_temp.seen('c0000000-0000-0000-0000-0000000000c1', 'student_people') = '{}'
     and pg_temp.seen('c0000000-0000-0000-0000-0000000000c1', 'sync_runs') = '{}', 'student reads people rows';
  assert pg_temp.seen('a0000000-0000-0000-0000-0000000000a2', 'staff') = '{}' and pg_temp.seen('a0000000-0000-0000-0000-0000000000a2', 'student_people') = '{}'
     and pg_temp.seen('a0000000-0000-0000-0000-0000000000a2', 'sync_runs') = '{}', 'another org''s owner reads Org One rows';
  -- anon reads nothing at all.
  set local role anon;
  begin
    select count(*) into n from tracker.staff;
    raise exception 'anon read staff';
  exception when insufficient_privilege then null;
  end;
  reset role;
  raise notice 'ok: owner, scheduling teacher, parent, membership teacher, student, other org and anon read as specified (AC2)';
end $$;

-- AC2: authenticated has no direct writes on the three tables -------------------------
set role authenticated;
set request.jwt.claims = '{"sub": "a0000000-0000-0000-0000-0000000000a1", "role": "authenticated"}';
do $$
declare
  stmt text;
begin
  foreach stmt in array array[
    'insert into tracker.staff (org_id, notion_staff_id, name, active, synced_at) values (''10000000-0000-0000-0000-000000000001'', gen_random_uuid(), ''X'', true, now())',
    'update tracker.staff set name = ''X''',
    'delete from tracker.staff',
    'insert into tracker.student_people (org_id, notion_student_id, name, stage, active, synced_at) values (''10000000-0000-0000-0000-000000000001'', gen_random_uuid(), ''X'', ''Active'', true, now())',
    'update tracker.student_people set name = ''X''',
    'delete from tracker.student_people',
    'insert into tracker.sync_runs (org_id, trigger, started_at, finished_at, result) values (''10000000-0000-0000-0000-000000000001'', ''owner'', now(), now(), ''ok'')',
    'update tracker.sync_runs set error = ''x''',
    'delete from tracker.sync_runs'
  ] loop
    begin
      execute stmt;
      raise exception 'owner ran: %', stmt;
    exception when insufficient_privilege then null;
    end;
  end loop;
  raise notice 'ok: authenticated cannot insert, update or delete staff, student_people or sync_runs (AC2)';
end $$;
reset role;

-- people_synced_at ---------------------------------------------------------------------
do $$
declare
  who text;
  got timestamptz;
  want timestamptz := (select max(finished_at) from tracker.sync_runs
                        where org_id = '10000000-0000-0000-0000-000000000001' and result = 'ok');
begin
  foreach who in array array['a0000000-0000-0000-0000-0000000000a1', 'd0000000-0000-0000-0000-0000000000d1', 'e0000000-0000-0000-0000-0000000000e1'] loop
    perform set_config('request.jwt.claims', json_build_object('sub', who, 'role', 'authenticated')::text, true);
    set local role authenticated;
    got := tracker.people_synced_at('10000000-0000-0000-0000-000000000001');
    reset role;
    assert got = want, format('people_synced_at for %s is %s, expected %s', who, got, want);
  end loop;
  foreach who in array array['c0000000-0000-0000-0000-0000000000c1', 'a0000000-0000-0000-0000-0000000000a2', 'b0000000-0000-0000-0000-0000000000b1'] loop
    perform set_config('request.jwt.claims', json_build_object('sub', who, 'role', 'authenticated')::text, true);
    set local role authenticated;
    got := tracker.people_synced_at('10000000-0000-0000-0000-000000000001');
    reset role;
    assert got is null, format('people_synced_at returned %s to %s', got, who);
  end loop;
  -- Failed runs never count as the last good sync.
  assert want < (select max(finished_at) from tracker.sync_runs where org_id = '10000000-0000-0000-0000-000000000001'),
    'fixture: the latest run should be a failed one';
  raise notice 'ok: people_synced_at answers the owner, a linked teacher and a parent, null to others (AC11, AC13)';
end $$;

-- anon executes nothing.
set role anon;
do $$ begin
  begin
    perform tracker.people_synced_at('10000000-0000-0000-0000-000000000001');
    raise exception 'anon ran people_synced_at';
  exception when insufficient_privilege then null;
  end;
  begin
    perform tracker.apply_people_sync('10000000-0000-0000-0000-000000000001', 'owner', now(), '[]', '[]', null);
    raise exception 'anon ran apply_people_sync';
  exception when insufficient_privilege then null;
  end;
  raise notice 'ok: anon cannot execute the people functions';
end $$;
reset role;
