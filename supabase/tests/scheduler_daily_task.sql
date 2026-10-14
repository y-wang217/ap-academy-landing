-- RLS and function checks for the daily teacher-texts task (0012). Run by
-- run-rls.sh on a fresh copy of the migrated database. Each check raises on failure.

\set ON_ERROR_STOP on

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'owner@example.com'),
  ('00000000-0000-0000-0000-0000000000d1', 't@example.com'),
  ('00000000-0000-0000-0000-0000000000c1', 'out@example.com');
insert into tracker.orgs (id, name) values ('10000000-0000-0000-0000-000000000001', 'Org One');
insert into tracker.memberships (user_id, org_id, role) values
  ('00000000-0000-0000-0000-0000000000a1', '10000000-0000-0000-0000-000000000001', 'owner');
insert into tracker.staff_links (org_id, notion_staff_id, email, approved_by, user_id, revoked_at) values
  ('10000000-0000-0000-0000-000000000001', 'e0000000-0000-4000-8000-000000000001', 't@example.com', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000d1', null);

-- Owner: claim, lease, unique key, teachers --------------------------------------------
set role authenticated;
set request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a1", "email": "owner@example.com"}';

do $$
declare
  claimed tracker.daily_tasks;
  n integer;
  task uuid;
begin
  -- AC3: the first claim returns the row and takes the lease
  select * into claimed from tracker.claim_daily_task('10000000-0000-0000-0000-000000000001', 'teacher_texts', '2030-01-07', 60);
  assert claimed.id is not null, 'claim: first claim returned nothing';
  assert claimed.state = 'pending' and claimed.refresh_count = 0, 'claim: bad defaults';
  assert claimed.lease_until > now(), 'claim: lease not set';
  task := claimed.id;

  -- AC3: a second claim returns nothing while the lease is live
  select count(*) into n from tracker.claim_daily_task('10000000-0000-0000-0000-000000000001', 'teacher_texts', '2030-01-07', 60);
  assert n = 0, 'claim: second claim won a live lease';
  assert (select count(*) from tracker.daily_tasks) = 1, 'claim: second claim added a row';

  -- releasing the lease lets the next claim through, and it is the same row
  update tracker.daily_tasks set lease_until = null where id = task;
  select * into claimed from tracker.claim_daily_task('10000000-0000-0000-0000-000000000001', 'teacher_texts', '2030-01-07', 60);
  assert claimed.id = task, 'claim: reclaim made a new row';

  -- an expired lease can be taken over
  update tracker.daily_tasks set lease_until = now() - interval '1 second' where id = task;
  select count(*) into n from tracker.claim_daily_task('10000000-0000-0000-0000-000000000001', 'teacher_texts', '2030-01-07', 60);
  assert n = 1, 'claim: expired lease not taken over';

  -- the unique key
  begin
    insert into tracker.daily_tasks (org_id, kind, local_date) values ('10000000-0000-0000-0000-000000000001', 'teacher_texts', '2030-01-07');
    raise exception 'daily_tasks: duplicate date accepted';
  exception when unique_violation then null;
  end;
  begin
    insert into tracker.daily_tasks (org_id, kind, local_date) values ('10000000-0000-0000-0000-000000000001', 'other', '2030-01-08');
    raise exception 'daily_tasks: bad kind accepted';
  exception when check_violation then null;
  end;

  -- the owner saves the page and state, with a short error only
  update tracker.daily_tasks set notion_page_id = 'a0000000-0000-4000-8000-000000000001', state = 'failed', last_error = 'Notion returned 500' where id = task;
  begin
    update tracker.daily_tasks set last_error = repeat('x', 301) where id = task;
    raise exception 'daily_tasks: long error accepted';
  exception when check_violation then null;
  end;
  begin
    update tracker.daily_tasks set local_date = '2030-02-01' where id = task;
    raise exception 'daily_tasks: local_date was updatable';
  exception when insufficient_privilege then null;
  end;

  insert into tracker.daily_task_teachers (task_id, org_id, notion_staff_id, block_id, written_fingerprint, written_at)
  values (task, '10000000-0000-0000-0000-000000000001', 'e0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001', 'abc', now());
  update tracker.daily_task_teachers set acknowledged_fingerprint = 'abc', labelled = true where task_id = task;
  assert (select labelled from tracker.daily_task_teachers where task_id = task), 'teachers: update lost';
  begin
    insert into tracker.daily_task_teachers (task_id, org_id, notion_staff_id, block_id, written_fingerprint, written_at)
    values (task, '10000000-0000-0000-0000-000000000099', 'e0000000-0000-4000-8000-000000000002', 'b0000000-0000-4000-8000-000000000002', 'abc', now());
    raise exception 'teachers: row for another org accepted';
  exception when foreign_key_violation or insufficient_privilege or check_violation then null;
  end;
  begin
    delete from tracker.daily_tasks where id = task;
    raise exception 'daily_tasks: delete allowed';
  exception when insufficient_privilege then null;
  end;
end $$;

-- Teacher: nothing -----------------------------------------------------------------------
set request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000d1", "email": "t@example.com"}';
do $$
declare n integer;
begin
  assert (select count(*) from tracker.daily_tasks) = 0, 'teacher read daily_tasks';
  assert (select count(*) from tracker.daily_task_teachers) = 0, 'teacher read daily_task_teachers';
  begin
    insert into tracker.daily_tasks (org_id, kind, local_date) values ('10000000-0000-0000-0000-000000000001', 'teacher_texts', '2030-01-09');
    raise exception 'teacher inserted a daily task';
  exception when insufficient_privilege then null;
  end;
  begin
    perform * from tracker.claim_daily_task('10000000-0000-0000-0000-000000000001', 'teacher_texts', '2030-01-07', 60);
    raise exception 'teacher claimed a lease';
  exception when insufficient_privilege then null;
  end;
  update tracker.daily_tasks set state = 'ready';
  get diagnostics n = row_count;
  assert n = 0, 'teacher updated a daily task';
end $$;

-- Anon: nothing ---------------------------------------------------------------------------
reset role;
set role anon;
do $$
begin
  begin
    perform count(*) from tracker.daily_tasks;
    raise exception 'anon read daily_tasks';
  exception when insufficient_privilege then null;
  end;
  begin
    perform count(*) from tracker.daily_task_teachers;
    raise exception 'anon read daily_task_teachers';
  exception when insufficient_privilege then null;
  end;
end $$;

-- AC15: no student names or message text columns exist.
reset role;
do $$
begin
  assert not exists (
    select 1 from information_schema.columns
    where table_schema = 'tracker' and table_name in ('daily_tasks', 'daily_task_teachers')
      and (column_name ilike '%name%' or column_name ilike '%text%' or column_name ilike '%message%' or column_name ilike '%student%')
  ), 'daily task tables must not hold names or message text';
end $$;
