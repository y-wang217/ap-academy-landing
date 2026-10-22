-- RLS and function checks for the Weekly Schedule import (0011). Run by
-- run-rls.sh on a fresh copy of the migrated database. Each check raises on failure.

\set ON_ERROR_STOP on

-- Cast: OWN owner of Org One; OW2 owner of Org Two; TCH a scheduler teacher; OUT outsider.
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'owner@example.com'),
  ('00000000-0000-0000-0000-0000000000d1', 't@example.com'),
  ('00000000-0000-0000-0000-0000000000c1', 'out@example.com'),
  ('00000000-0000-0000-0000-0000000000b1', 'owner2@example.com');
insert into tracker.orgs (id, name) values
  ('10000000-0000-0000-0000-000000000001', 'Org One'),
  ('10000000-0000-0000-0000-000000000002', 'Org Two');
insert into tracker.memberships (user_id, org_id, role) values
  ('00000000-0000-0000-0000-0000000000a1', '10000000-0000-0000-0000-000000000001', 'owner'),
  ('00000000-0000-0000-0000-0000000000b1', '10000000-0000-0000-0000-000000000002', 'owner');
insert into tracker.staff_links (org_id, notion_staff_id, email, approved_by, user_id, revoked_at) values
  ('10000000-0000-0000-0000-000000000001', 'e0000000-0000-4000-8000-000000000001', 't@example.com', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000d1', null);

-- Owner: adopt -----------------------------------------------------------------------
set role authenticated;
set request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a1", "email": "owner@example.com"}';

do $$
declare
  first_id uuid;
  again uuid;
  series_json jsonb := '[
    {"request_id": "a0000000-0000-4000-8000-000000000001", "staff_id": "e0000000-0000-4000-8000-000000000001", "subject": "MPM2D Math", "start_date": "2030-01-07", "start_time": "17:30", "duration_minutes": 60},
    {"request_id": "a0000000-0000-4000-8000-000000000002", "staff_id": "e0000000-0000-4000-8000-000000000001", "subject": "MPM2D Math", "start_date": "2030-01-11", "start_time": "17:30", "duration_minutes": 60}
  ]';
begin
  -- AC7: one call creates both series and the summary row, in state pending
  first_id := tracker.adopt_student_schedule('f0000000-0000-4000-8000-000000000001', 'Tue 17:30-18:30 | MPM2D Math', series_json);
  assert (select count(*) from tracker.class_series where notion_student_id = 'f0000000-0000-4000-8000-000000000001' and kind = 'weekly') = 2, 'adopt: series not created';
  assert (select sync_state from tracker.schedule_summaries where id = first_id) = 'pending', 'adopt: summary not pending';
  assert (select adopted_from_text from tracker.schedule_summaries where id = first_id) = 'Tue 17:30-18:30 | MPM2D Math', 'adopt: source text not kept';
  assert (select created_by from tracker.schedule_summaries where id = first_id) = '00000000-0000-0000-0000-0000000000a1', 'adopt: created_by is not the caller';

  -- AC7: a second call returns the same ID and adds nothing
  again := tracker.adopt_student_schedule('f0000000-0000-4000-8000-000000000001', 'changed text', series_json);
  assert again = first_id, 'adopt: second call returned a different ID';
  assert (select count(*) from tracker.class_series where notion_student_id = 'f0000000-0000-4000-8000-000000000001') = 2, 'adopt: second call added series';
  assert (select count(*) from tracker.schedule_summaries) = 1, 'adopt: second call added a summary row';
  assert (select adopted_from_text from tracker.schedule_summaries where id = first_id) = 'Tue 17:30-18:30 | MPM2D Math', 'adopt: second call overwrote the source text';

  -- an adoption with no series (a student with an empty legacy field)
  perform tracker.adopt_student_schedule('f0000000-0000-4000-8000-000000000003', '', '[]');
  assert (select count(*) from tracker.schedule_summaries) = 2, 'adopt: empty adoption not recorded';

  -- AC7: a failure part way leaves no series and no summary row for that student
  begin
    perform tracker.adopt_student_schedule('f0000000-0000-4000-8000-000000000002', 'x', '[
      {"request_id": "a0000000-0000-4000-8000-000000000010", "staff_id": "e0000000-0000-4000-8000-000000000001", "subject": "Good", "start_date": "2030-01-07", "start_time": "17:30", "duration_minutes": 60},
      {"request_id": "a0000000-0000-4000-8000-000000000011", "staff_id": "e0000000-0000-4000-8000-000000000001", "subject": "Bad", "start_date": "2030-01-08", "start_time": "23:30", "duration_minutes": 60}
    ]');
    raise exception 'adopt: bad series accepted';
  exception when check_violation then null;
  end;
  assert (select count(*) from tracker.class_series where notion_student_id = 'f0000000-0000-4000-8000-000000000002') = 0, 'failed adopt left series behind';
  assert (select count(*) from tracker.schedule_summaries where notion_student_id = 'f0000000-0000-4000-8000-000000000002') = 0, 'failed adopt left a summary row';

  -- the owner may update the sync fields but not the identity fields
  update tracker.schedule_summaries set sync_state = 'synced', last_written_text = 'a', last_written_at = now() where id = first_id;
  begin
    update tracker.schedule_summaries set notion_student_id = 'f0000000-0000-4000-8000-0000000000ff' where id = first_id;
    raise exception 'summary: notion_student_id was updatable';
  exception when insufficient_privilege then null;
  end;
  begin
    update tracker.schedule_summaries set sync_state = 'bogus' where id = first_id;
    raise exception 'summary: bad sync_state accepted';
  exception when check_violation then null;
  end;
  begin
    update tracker.schedule_summaries set last_error = repeat('x', 301) where id = first_id;
    raise exception 'summary: long error accepted';
  exception when check_violation then null;
  end;
  begin
    delete from tracker.schedule_summaries;
    raise exception 'summary: delete allowed';
  exception when insufficient_privilege then null;
  end;
end $$;

-- Drift seen markers (0026, REQ-34 AC12) --------------------------------------------------
do $$
declare
  sid uuid := 'f0000000-0000-4000-8000-000000000001';
  n integer;
begin
  -- null on a new adoption
  assert (select last_drift_at is null and drift_seen_at is null from tracker.schedule_summaries where notion_student_id = sid), 'drift: columns not null on adoption';

  -- the owner can set both columns on its own rows
  update tracker.schedule_summaries set last_drift_text = 'typed', last_drift_at = '2030-01-01 10:00+00' where notion_student_id = sid;
  get diagnostics n = row_count;
  assert n = 1, 'drift: owner could not set last_drift_at';
  update tracker.schedule_summaries set drift_seen_at = now()
    where notion_student_id = sid and last_drift_at is not distinct from '2030-01-01 10:00+00'::timestamptz;
  get diagnostics n = row_count;
  assert n = 1, 'drift: owner could not mark seen';
  update tracker.schedule_summaries set drift_seen_at = null where notion_student_id = sid;

  -- a stale marker matches nothing: drift moved later after the page loaded
  update tracker.schedule_summaries set last_drift_at = '2030-01-02 10:00+00' where notion_student_id = sid;
  update tracker.schedule_summaries set drift_seen_at = now()
    where notion_student_id = sid and last_drift_at is not distinct from '2030-01-01 10:00+00'::timestamptz;
  get diagnostics n = row_count;
  assert n = 0, 'drift: stale last_drift_at still matched';
  assert (select drift_seen_at is null from tracker.schedule_summaries where notion_student_id = sid), 'drift: stale mark changed drift_seen_at';
end $$;

-- Teacher TCH: no summaries, no writes, no adopt (AC19) -----------------------------------
set request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000d1", "email": "t@example.com"}';
do $$
declare n integer;
begin
  assert (select count(*) from tracker.schedule_summaries) = 0, 'teacher reads summaries';
  begin
    insert into tracker.schedule_summaries (org_id, notion_student_id, adopted_from_text, created_by)
      values ('10000000-0000-0000-0000-000000000001', 'f0000000-0000-4000-8000-000000000009', 'x', '00000000-0000-0000-0000-0000000000d1');
    raise exception 'teacher inserted a summary';
  exception when insufficient_privilege then null;
  end;
  update tracker.schedule_summaries set sync_state = 'failed'; get diagnostics n = row_count;
  assert n = 0, 'teacher updated a summary';
  update tracker.schedule_summaries set drift_seen_at = now(), last_drift_at = now(); get diagnostics n = row_count;
  assert n = 0, 'teacher updated drift markers';
  begin
    perform tracker.adopt_student_schedule('f0000000-0000-4000-8000-000000000009', 'x', '[]');
    raise exception 'teacher adopted a student';
  exception when insufficient_privilege then null;
  end;
end $$;

-- Owner of another org: cannot read or update Org One's drift markers -------------------
set request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000b1", "email": "owner2@example.com"}';
do $$
declare n integer;
begin
  assert (select count(*) from tracker.schedule_summaries) = 0, 'other owner reads summaries';
  update tracker.schedule_summaries set drift_seen_at = now(), last_drift_at = now(); get diagnostics n = row_count;
  assert n = 0, 'other owner updated drift markers';
end $$;

-- Outsider sees nothing and cannot adopt -------------------------------------------------
set request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000c1", "email": "out@example.com"}';
do $$ begin
  assert (select count(*) from tracker.schedule_summaries) = 0, 'outsider reads summaries';
  begin
    perform tracker.adopt_student_schedule('f0000000-0000-4000-8000-000000000009', 'x', '[]');
    raise exception 'outsider adopted a student';
  exception when insufficient_privilege then null;
  end;
end $$;

reset role;
do $$ begin
  assert (select count(*) from tracker.audit_log where table_name = 'schedule_summaries') >= 2, 'schedule_summaries not audited';
end $$;
