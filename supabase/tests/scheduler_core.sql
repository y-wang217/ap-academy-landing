-- RLS and function checks for the scheduler core tables (0010). Run by
-- run-rls.sh on a fresh copy of the migrated database. Each check raises on failure.

\set ON_ERROR_STOP on

-- Cast: OWN owner of Org One; TCH / TC2 scheduler teachers; REV revoked; OUT outsider.
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'owner@example.com'),
  ('00000000-0000-0000-0000-0000000000d1', 't@example.com'),
  ('00000000-0000-0000-0000-0000000000d2', 't2@example.com'),
  ('00000000-0000-0000-0000-0000000000d3', 'rev@example.com'),
  ('00000000-0000-0000-0000-0000000000c1', 'out@example.com');
insert into tracker.orgs (id, name) values ('10000000-0000-0000-0000-000000000001', 'Org One');
insert into tracker.memberships (user_id, org_id, role) values
  ('00000000-0000-0000-0000-0000000000a1', '10000000-0000-0000-0000-000000000001', 'owner');
-- Links are written as the table owner (setup), then claimed by each teacher.
insert into tracker.staff_links (org_id, notion_staff_id, email, approved_by, user_id, revoked_at) values
  ('10000000-0000-0000-0000-000000000001', 'e0000000-0000-4000-8000-000000000001', 't@example.com', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000d1', null),
  ('10000000-0000-0000-0000-000000000001', 'e0000000-0000-4000-8000-000000000002', 't2@example.com', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000d2', null),
  ('10000000-0000-0000-0000-000000000001', 'e0000000-0000-4000-8000-000000000003', 'rev@example.com', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000d3', now());

-- Owner: classes, exceptions, split ------------------------------------------------
set role authenticated;
set request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a1", "email": "owner@example.com"}';

-- Far-future Mondays keep "today" checks out of the way. 2030-01-07 is a Monday.
insert into tracker.class_series (id, org_id, request_id, notion_staff_id, notion_student_id, subject, kind, start_date, start_time, duration_minutes, created_by) values
  ('50000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000000001',
   'e0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000001', 'MHF4U', 'weekly', '2030-01-07', '17:00', 60, '00000000-0000-0000-0000-0000000000a1'),
  ('50000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000000002',
   'e0000000-0000-4000-8000-000000000002', 'f0000000-0000-4000-8000-000000000002', 'SCH4U', 'weekly', '2030-01-08', '16:00', 60, '00000000-0000-0000-0000-0000000000a1');

insert into tracker.class_exceptions (org_id, request_id, series_id, original_date, kind, created_by) values
  ('10000000-0000-0000-0000-000000000001', '70000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000001', '2030-01-14', 'cancelled', '00000000-0000-0000-0000-0000000000a1');
insert into tracker.class_exceptions (org_id, request_id, series_id, original_date, kind, new_date, new_start_time, created_by) values
  ('10000000-0000-0000-0000-000000000001', '70000000-0000-0000-0000-000000000002', '50000000-0000-0000-0000-000000000001', '2030-01-21', 'moved', '2030-01-22', '10:00', '00000000-0000-0000-0000-0000000000a1');

do $$
declare n integer;
begin
  -- AC8: a retried create (same request_id) conflicts instead of duplicating
  begin
    insert into tracker.class_series (org_id, request_id, notion_staff_id, notion_student_id, subject, kind, start_date, start_time, duration_minutes, created_by)
      values ('10000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000000001', 'e0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000001', 'MHF4U', 'weekly', '2030-01-07', '17:00', 60, '00000000-0000-0000-0000-0000000000a1');
    raise exception 'class_series: duplicate request_id accepted';
  exception when unique_violation then null;
  end;
  -- AC3: one exception per occurrence
  begin
    insert into tracker.class_exceptions (org_id, request_id, series_id, original_date, kind, created_by)
      values ('10000000-0000-0000-0000-000000000001', '70000000-0000-0000-0000-000000000009', '50000000-0000-0000-0000-000000000001', '2030-01-14', 'cancelled', '00000000-0000-0000-0000-0000000000a1');
    raise exception 'class_exceptions: second exception for one occurrence';
  exception when unique_violation then null;
  end;
  -- shape checks
  begin
    insert into tracker.class_series (org_id, request_id, notion_staff_id, notion_student_id, subject, kind, start_date, start_time, duration_minutes, created_by)
      values ('10000000-0000-0000-0000-000000000001', gen_random_uuid(), 'e0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000001', 'X', 'one_off', '2030-01-07', '23:30', 60, '00000000-0000-0000-0000-0000000000a1');
    raise exception 'class_series: class crossing midnight accepted';
  exception when check_violation then null;
  end;
  begin
    insert into tracker.class_exceptions (org_id, request_id, series_id, original_date, kind, new_date, created_by)
      values ('10000000-0000-0000-0000-000000000001', gen_random_uuid(), '50000000-0000-0000-0000-000000000002', '2030-01-15', 'moved', '2030-01-16', '00000000-0000-0000-0000-0000000000a1');
    raise exception 'class_exceptions: moved without a new time accepted';
  exception when check_violation then null;
  end;
  begin
    insert into tracker.availability_windows (org_id, request_id, notion_staff_id, weekday, start_time, end_time, effective_from, created_by)
      values ('10000000-0000-0000-0000-000000000001', gen_random_uuid(), 'e0000000-0000-4000-8000-000000000001', 1, '12:00', '09:00', '2030-01-01', '00000000-0000-0000-0000-0000000000a1');
    raise exception 'availability_windows: end before start accepted';
  exception when check_violation then null;
  end;
  -- created_by must be the caller
  begin
    insert into tracker.availability_windows (org_id, request_id, notion_staff_id, weekday, start_time, end_time, effective_from, created_by)
      values ('10000000-0000-0000-0000-000000000001', gen_random_uuid(), 'e0000000-0000-4000-8000-000000000001', 1, '09:00', '12:00', '2030-01-01', '00000000-0000-0000-0000-0000000000d1');
    raise exception 'availability_windows: created_by was not the caller';
  exception when insufficient_privilege then null;
  end;
  -- the owner can add availability for any teacher
  insert into tracker.availability_windows (org_id, request_id, notion_staff_id, weekday, start_time, end_time, effective_from, created_by)
    values ('10000000-0000-0000-0000-000000000001', '80000000-0000-0000-0000-000000000002', 'e0000000-0000-4000-8000-000000000002', 2, '09:00', '12:00', '2030-01-01', '00000000-0000-0000-0000-0000000000a1');
end $$;

-- Split: AC5, AC6, AC8, AC9, AC7 ------------------------------------------------------
do $$
declare
  s1 uuid := '50000000-0000-0000-0000-000000000001';
  stamp timestamptz;
  new_id uuid;
  again uuid;
begin
  select updated_at into stamp from tracker.class_series where id = s1;

  -- AC9: a stale token writes nothing
  begin
    perform tracker.split_class_series(s1, '2030-01-14', stamp - interval '1 second', '90000000-0000-0000-0000-000000000001', '{}');
    raise exception 'split: stale token accepted';
  exception when raise_exception then
    assert sqlerrm = 'stale', 'split: wrong error for stale: ' || sqlerrm;
  end;
  assert (select effective_until from tracker.class_series where id = s1) is null, 'stale split changed the old series';

  -- AC7: a past date is refused
  begin
    perform tracker.split_class_series(s1, '2020-01-06', stamp, '90000000-0000-0000-0000-000000000002', '{}');
    raise exception 'split: past date accepted';
  exception when raise_exception then
    assert sqlerrm = 'past_occurrence', 'split: wrong error for past: ' || sqlerrm;
  end;

  -- AC5 + AC6: split at 2030-01-14, new weekday Wednesday (3), new time 16:00
  new_id := tracker.split_class_series(s1, '2030-01-14', stamp, '90000000-0000-0000-0000-000000000003', '{"weekday": 3, "start_time": "16:00"}');
  assert (select effective_until from tracker.class_series where id = s1) = '2030-01-13', 'old series not ended the day before';
  assert (select start_date from tracker.class_series where id = new_id) = '2030-01-16', 'new series not on Wednesday of that week';
  assert (select start_time from tracker.class_series where id = new_id) = '16:00', 'new time not applied';
  assert (select split_from from tracker.class_series where id = new_id) = s1, 'split_from not set';
  assert (select effective_until from tracker.class_series where id = new_id) is null, 'new series lost the open end';
  -- the cancelled 01-14 maps to Wednesday 01-16; the move (01-21 -> 01-22) is re-keyed to 01-23
  assert (select count(*) from tracker.class_exceptions where series_id = new_id) = 2, 'exceptions not moved to the new series';
  assert exists (select 1 from tracker.class_exceptions where series_id = new_id and original_date = '2030-01-16' and kind = 'cancelled'), 'cancellation not mapped by ISO week';
  assert exists (select 1 from tracker.class_exceptions where series_id = new_id and original_date = '2030-01-23' and kind = 'moved' and new_date = '2030-01-22' and new_start_time = '10:00'), 'move lost its absolute time';
  assert (select count(*) from tracker.class_exceptions where series_id = s1) = 0, 'old series kept exceptions at or after the split';

  -- AC8: the same request_id returns the same new series, even though the old stamp is now stale
  again := tracker.split_class_series(s1, '2030-01-14', stamp, '90000000-0000-0000-0000-000000000003', '{"weekday": 3, "start_time": "16:00"}');
  assert again = new_id, 'retried split created a second series';
  assert (select count(*) from tracker.class_series where split_from = s1) = 1, 'retried split duplicated rows';

  -- A split that fails midway leaves both series unchanged (the invalid time aborts the insert)
  select updated_at into stamp from tracker.class_series where id = new_id;
  begin
    perform tracker.split_class_series(new_id, '2030-02-04', stamp, '90000000-0000-0000-0000-000000000004', '{"start_time": "23:30"}');
    raise exception 'split: class crossing midnight accepted';
  exception when check_violation then null;
  end;
  assert (select effective_until from tracker.class_series where id = new_id) is null, 'failed split changed the series';
  assert (select count(*) from tracker.class_series where split_from = new_id) = 0, 'failed split left a new series';
end $$;

-- Teacher TCH: own availability and classes only (AC12) ----------------------------------
set request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000d1", "email": "t@example.com"}';
do $$
declare n integer;
begin
  assert (select count(*) from tracker.class_series) = 2, 'teacher should see only their own series (old + split)';
  assert (select count(*) from tracker.class_series where notion_staff_id <> 'e0000000-0000-4000-8000-000000000001') = 0, 'teacher sees another teacher''s series';
  assert (select count(*) from tracker.class_exceptions) = 2, 'teacher exceptions: own series only';
  assert (select count(*) from tracker.availability_windows) = 0, 'teacher sees another teacher''s availability';

  insert into tracker.availability_windows (org_id, request_id, notion_staff_id, weekday, start_time, end_time, effective_from, created_by)
    values ('10000000-0000-0000-0000-000000000001', '80000000-0000-0000-0000-000000000001', 'e0000000-0000-4000-8000-000000000001', 1, '09:00', '12:00', '2030-01-01', '00000000-0000-0000-0000-0000000000d1');
  assert (select count(*) from tracker.availability_windows) = 1, 'teacher cannot read their own window';
  begin
    insert into tracker.availability_windows (org_id, request_id, notion_staff_id, weekday, start_time, end_time, effective_from, created_by)
      values ('10000000-0000-0000-0000-000000000001', gen_random_uuid(), 'e0000000-0000-4000-8000-000000000002', 1, '09:00', '12:00', '2030-01-01', '00000000-0000-0000-0000-0000000000d1');
    raise exception 'teacher wrote another teacher''s availability';
  exception when insufficient_privilege then null;
  end;
  insert into tracker.availability_exceptions (org_id, request_id, notion_staff_id, on_date, kind, created_by)
    values ('10000000-0000-0000-0000-000000000001', gen_random_uuid(), 'e0000000-0000-4000-8000-000000000001', '2030-01-09', 'time_off', '00000000-0000-0000-0000-0000000000d1');
  delete from tracker.availability_exceptions; get diagnostics n = row_count;
  assert n = 1, 'teacher cannot delete their own exception';

  -- class writes: refused or zero rows
  begin
    insert into tracker.class_series (org_id, request_id, notion_staff_id, notion_student_id, subject, kind, start_date, start_time, duration_minutes, created_by)
      values ('10000000-0000-0000-0000-000000000001', gen_random_uuid(), 'e0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000001', 'X', 'one_off', '2030-03-04', '10:00', 60, '00000000-0000-0000-0000-0000000000d1');
    raise exception 'teacher created a class';
  exception when insufficient_privilege then null;
  end;
  update tracker.class_series set subject = 'hacked'; get diagnostics n = row_count;
  assert n = 0, 'teacher edited a class series';
  update tracker.class_exceptions set kind = 'cancelled', new_date = null, new_start_time = null; get diagnostics n = row_count;
  assert n = 0, 'teacher edited a class exception';
  begin
    insert into tracker.class_exceptions (org_id, request_id, series_id, original_date, kind, created_by)
      values ('10000000-0000-0000-0000-000000000001', gen_random_uuid(), '50000000-0000-0000-0000-000000000001', '2030-01-28', 'cancelled', '00000000-0000-0000-0000-0000000000d1');
    raise exception 'teacher cancelled a class';
  exception when insufficient_privilege then null;
  end;
  begin
    delete from tracker.class_series;
    raise exception 'teacher deleted a class series';
  exception when insufficient_privilege then null;
  end;
  begin
    perform tracker.split_class_series('50000000-0000-0000-0000-000000000001', '2030-03-04', now(), gen_random_uuid(), '{}');
    raise exception 'teacher split a series';
  exception when raise_exception then
    assert sqlerrm = 'not_found', 'teacher split: unexpected error ' || sqlerrm;
  end;
end $$;

-- Second teacher sees only theirs; revoked and outsider see nothing ----------------------
set request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000d2", "email": "t2@example.com"}';
do $$ begin
  assert (select count(*) from tracker.class_series) = 1, 'teacher 2 should see only their own series';
  assert (select count(*) from tracker.availability_windows) = 1, 'teacher 2 should see only their own window';
  assert (select count(*) from tracker.class_exceptions) = 0, 'teacher 2 sees another teacher''s exceptions';
end $$;

set request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000d3", "email": "rev@example.com"}';
do $$ begin
  assert (select count(*) from tracker.class_series) = 0, 'revoked teacher sees classes';
  assert (select count(*) from tracker.availability_windows) = 0, 'revoked teacher sees availability';
end $$;

set request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000c1", "email": "out@example.com"}';
do $$ begin
  assert (select count(*) from tracker.class_series) = 0, 'outsider sees classes';
  assert (select count(*) from tracker.class_exceptions) = 0, 'outsider sees exceptions';
  assert (select count(*) from tracker.availability_windows) = 0, 'outsider sees availability';
  assert (select count(*) from tracker.availability_exceptions) = 0, 'outsider sees availability exceptions';
end $$;

reset role;
-- Audit rows exist for schedule changes
do $$ begin
  assert (select count(*) from tracker.audit_log where table_name = 'class_series') >= 3, 'class_series not audited';
end $$;
