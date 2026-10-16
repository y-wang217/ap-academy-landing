-- Locked class writes (REQ-30). Every class write (create, move, cancel,
-- one-off edit, series edit by split, end series) goes through
-- tracker.schedule_write, which takes a per-teacher and per-student advisory
-- lock, then refuses to write if any booking stamp the caller read has moved.
-- The clash and availability check stays in TypeScript; this proves its
-- inputs are unchanged at the moment of the write (tracker ADR 0050).
-- Tested by supabase/tests/scheduler_locked_writes.sql.

-- One version per (org, staff or student). Bumped by a trigger on every write
-- to the four scheduling tables; never written by a client.
create table tracker.booking_stamps (
  org_id uuid not null references tracker.orgs on delete restrict,
  key_kind text not null check (key_kind in ('staff', 'student')),
  -- A Notion page ID, as in class_series.
  key_id uuid not null,
  version bigint not null default 0,
  updated_at timestamptz not null default now(),
  primary key (org_id, key_kind, key_id)
);
alter table tracker.booking_stamps enable row level security;
create policy "owner reads booking stamps"
  on tracker.booking_stamps for select to authenticated
  using (tracker.is_org_owner(org_id));
revoke all on tracker.booking_stamps from anon, authenticated;
grant select on tracker.booking_stamps to authenticated;
grant all on tracker.booking_stamps to service_role;

-- The request log: one row per class write, claimed before the write, so a
-- retried or doubled request returns its first result. series_id is the
-- series the write targets (for a create, the series it made).
create table tracker.schedule_writes (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references tracker.orgs on delete restrict,
  request_id uuid not null,
  op text not null check (op in ('create', 'move', 'cancel', 'edit_one_off', 'split', 'end_series')),
  series_id uuid references tracker.class_series on delete restrict,
  result jsonb,
  created_by uuid not null references auth.users on delete restrict,
  created_at timestamptz not null default now(),
  unique (org_id, request_id)
);
alter table tracker.schedule_writes enable row level security;
create policy "owner reads schedule writes"
  on tracker.schedule_writes for select to authenticated
  using (tracker.is_org_owner(org_id));
create policy "owner claims schedule writes"
  on tracker.schedule_writes for insert to authenticated
  with check (tracker.is_org_owner(org_id) and created_by = (select auth.uid()));
create policy "owner records schedule write results"
  on tracker.schedule_writes for update to authenticated
  using (tracker.is_org_owner(org_id) and created_by = (select auth.uid()))
  with check (tracker.is_org_owner(org_id) and created_by = (select auth.uid()));
revoke all on tracker.schedule_writes from anon, authenticated;
grant select on tracker.schedule_writes to authenticated;
grant insert (org_id, request_id, op, series_id, created_by) on tracker.schedule_writes to authenticated;
grant update (series_id, result) on tracker.schedule_writes to authenticated;
grant all on tracker.schedule_writes to service_role;

-- Locks ------------------------------------------------------------------------

create or replace function tracker.lock_booking_key(p_org uuid, p_kind text, p_id uuid)
returns void
language plpgsql
volatile
security invoker
set search_path = ''
as $$
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_org::text || ':' || p_kind || ':' || p_id::text, 0));
end;
$$;
revoke all on function tracker.lock_booking_key(uuid, text, uuid) from public;
grant execute on function tracker.lock_booking_key(uuid, text, uuid) to authenticated, service_role;

-- Takes each affected key's lock, then bumps its stamp. Taking the same lock
-- as schedule_write means a write from outside it (availability edits, the
-- import) waits for an in-flight locked write instead of slipping between its
-- compare and its commit. Definer: it writes only booking_stamps.
create or replace function tracker.bump_booking_stamps()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  org uuid;
  keys text[] := '{}';
  k text;
  s record;
begin
  if tg_op = 'INSERT' then org := new.org_id; else org := old.org_id; end if;

  if tg_table_name in ('availability_windows', 'availability_exceptions') then
    if tg_op <> 'INSERT' then keys := keys || ('staff:' || old.notion_staff_id); end if;
    if tg_op <> 'DELETE' then keys := keys || ('staff:' || new.notion_staff_id); end if;
  elsif tg_table_name = 'class_series' then
    if tg_op <> 'INSERT' then keys := keys || ('staff:' || old.notion_staff_id) || ('student:' || old.notion_student_id); end if;
    if tg_op <> 'DELETE' then keys := keys || ('staff:' || new.notion_staff_id) || ('student:' || new.notion_student_id); end if;
  elsif tg_table_name = 'class_exceptions' then
    for s in
      select c.notion_staff_id, c.notion_student_id from tracker.class_series c
      where c.id in (
        case when tg_op <> 'INSERT' then old.series_id end,
        case when tg_op <> 'DELETE' then new.series_id end)
    loop
      keys := keys || ('staff:' || s.notion_staff_id) || ('student:' || s.notion_student_id);
    end loop;
  end if;

  for k in select distinct x from unnest(keys) x order by x loop
    perform tracker.lock_booking_key(org, split_part(k, ':', 1), split_part(k, ':', 2)::uuid);
    insert into tracker.booking_stamps (org_id, key_kind, key_id, version, updated_at)
      values (org, split_part(k, ':', 1), split_part(k, ':', 2)::uuid, 1, now())
      on conflict (org_id, key_kind, key_id)
      do update set version = tracker.booking_stamps.version + 1, updated_at = now();
  end loop;
  return null;
end;
$$;
revoke all on function tracker.bump_booking_stamps() from public;

do $$
declare t text;
begin
  foreach t in array array['availability_windows', 'availability_exceptions', 'class_series', 'class_exceptions'] loop
    execute format('create trigger %I after insert or update or delete on tracker.%I for each row execute function tracker.bump_booking_stamps()', 'booking_stamps_' || t, t);
  end loop;
end $$;

-- Read: the stamps of the given keys (0 when never bumped) and any earlier
-- result for this request ID. p_keys: [{ "kind": "staff" | "student", "id": uuid }].
create or replace function tracker.schedule_write_context(p_org_id uuid, p_request_id uuid, p_keys jsonb)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  stamps jsonb;
  replay jsonb;
begin
  if not tracker.is_org_owner(p_org_id) then
    raise exception 'forbidden';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('kind', k.kind, 'id', k.id, 'version', coalesce(b.version, 0)) order by k.kind, k.id), '[]'::jsonb)
    into stamps
    from (select distinct e ->> 'kind' as kind, (e ->> 'id')::uuid as id from jsonb_array_elements(coalesce(p_keys, '[]'::jsonb)) e) k
    left join tracker.booking_stamps b on b.org_id = p_org_id and b.key_kind = k.kind and b.key_id = k.id;
  select jsonb_build_object('op', w.op, 'series_id', w.series_id, 'result', w.result)
    into replay
    from tracker.schedule_writes w
    where w.org_id = p_org_id and w.request_id = p_request_id and w.result is not null;
  return jsonb_build_object('stamps', stamps, 'replay', replay);
end;
$$;
revoke all on function tracker.schedule_write_context(uuid, uuid, jsonb) from public;
grant execute on function tracker.schedule_write_context(uuid, uuid, jsonb) to authenticated;

-- The one class write. Security invoker: RLS and the class grants apply, and
-- only the org owner gets past the first check. In one transaction:
-- lock, claim the request ID, compare stamps, stale checks, write, record.
-- Raises 'forbidden', 'not_found', 'request_reused', 'booking_changed',
-- 'stale', and from split_class_series 'past_occurrence' or 'not_weekly'.
-- Returns { "replay": boolean, "result": <class_series row> }.
--
-- p_stamps: [{ "kind", "id", "version" }] as read by schedule_write_context.
-- p_args by op (dates YYYY-MM-DD, times HH:MM):
--   create        staff_id, student_id, subject, kind, start_date, start_time, duration_minutes, effective_until
--   move          series_id, original_date, new_date, new_start_time, expected_updated_at, expected_position
--   cancel        series_id, original_date, expected_updated_at, expected_position
--   edit_one_off  series_id, original_date, [new_date, new_start_time], fields { staff_id, subject, duration_minutes },
--                 expected_updated_at, expected_position
--   split         series_id, from_date, expected_updated_at, new_values (as split_class_series)
--   end_series    series_id, last_date, expected_updated_at
-- expected_position (optional): { "status": "scheduled" | "moved" | "cancelled", "date", "start_time" }.
create or replace function tracker.schedule_write(p_org_id uuid, p_request_id uuid, p_op text, p_stamps jsonb, p_args jsonb)
returns jsonb
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  s tracker.class_series;
  target uuid := (p_args ->> 'series_id')::uuid;
  keys text[] := '{}';
  k text;
  prior tracker.schedule_writes;
  claim uuid;
  have bigint;
  seen bigint;
  e tracker.class_exceptions;
  pos jsonb;
  result_id uuid;
  out jsonb;
begin
  if not tracker.is_org_owner(p_org_id) then
    raise exception 'forbidden';
  end if;
  if p_op is null or p_op not in ('create', 'move', 'cancel', 'edit_one_off', 'split', 'end_series') then
    raise exception 'invalid_op';
  end if;
  perform pg_catalog.set_config('lock_timeout', '5s', true);

  -- 1. Keys come from the series row and the args, never from the caller's list.
  if p_op = 'create' then
    keys := array['staff:' || (p_args ->> 'staff_id')::uuid, 'student:' || (p_args ->> 'student_id')::uuid];
  else
    select * into s from tracker.class_series where id = target and org_id = p_org_id for update;
    if not found then
      raise exception 'not_found';
    end if;
    keys := array['staff:' || s.notion_staff_id, 'student:' || s.notion_student_id];
    if p_op = 'edit_one_off' and p_args #>> '{fields,staff_id}' is not null then
      keys := keys || ('staff:' || (p_args #>> '{fields,staff_id}')::uuid);
    end if;
    if p_op = 'split' then
      if p_args #>> '{new_values,staff_id}' is not null then
        keys := keys || ('staff:' || (p_args #>> '{new_values,staff_id}')::uuid);
      end if;
      if p_args #>> '{new_values,student_id}' is not null then
        keys := keys || ('student:' || (p_args #>> '{new_values,student_id}')::uuid);
      end if;
    end if;
  end if;
  for k in select distinct x from unnest(keys) x order by x loop
    perform tracker.lock_booking_key(p_org_id, split_part(k, ':', 1), split_part(k, ':', 2)::uuid);
  end loop;

  -- 2. Claim the request ID. A duplicate in flight blocks on the unique index
  -- until the first commits, then replays it here.
  begin
    insert into tracker.schedule_writes (org_id, request_id, op, series_id, created_by)
      values (p_org_id, p_request_id, p_op, case when p_op = 'create' then null else target end, (select auth.uid()))
      returning id into claim;
  exception when unique_violation then
    select * into prior from tracker.schedule_writes where org_id = p_org_id and request_id = p_request_id;
    if prior.op = p_op and (p_op = 'create' or prior.series_id = target) and prior.result is not null then
      return jsonb_build_object('replay', true, 'result', prior.result);
    end if;
    raise exception 'request_reused';
  end;

  -- 3. Every stamp the caller's check read must be unchanged.
  for k in select distinct x from unnest(keys) x loop
    select b.version into have from tracker.booking_stamps b
      where b.org_id = p_org_id and b.key_kind = split_part(k, ':', 1) and b.key_id = split_part(k, ':', 2)::uuid;
    select (x ->> 'version')::bigint into seen from jsonb_array_elements(coalesce(p_stamps, '[]'::jsonb)) x
      where x ->> 'kind' = split_part(k, ':', 1) and (x ->> 'id')::uuid = split_part(k, ':', 2)::uuid
      limit 1;
    if seen is null or seen <> coalesce(have, 0) then
      raise exception 'booking_changed';
    end if;
  end loop;

  -- 4. Stale checks, repeated under the lock.
  if p_op <> 'create' then
    if s.updated_at is distinct from (p_args ->> 'expected_updated_at')::timestamptz then
      raise exception 'stale';
    end if;
    if p_args ? 'expected_position' then
      select * into e from tracker.class_exceptions where series_id = s.id and original_date = (p_args ->> 'original_date')::date;
      if found and e.kind = 'moved' then
        pos := jsonb_build_object('status', 'moved', 'date', e.new_date, 'start_time', e.new_start_time);
      elsif found then
        pos := jsonb_build_object('status', 'cancelled', 'date', e.original_date, 'start_time', s.start_time);
      else
        pos := jsonb_build_object('status', 'scheduled', 'date', (p_args ->> 'original_date')::date, 'start_time', s.start_time);
      end if;
      if pos ->> 'status' <> p_args #>> '{expected_position,status}'
        or (pos ->> 'date')::date <> (p_args #>> '{expected_position,date}')::date
        or (pos ->> 'start_time')::time <> (p_args #>> '{expected_position,start_time}')::time then
        raise exception 'stale';
      end if;
    end if;
  end if;

  -- 5. The write.
  if p_op = 'create' then
    insert into tracker.class_series (
      org_id, request_id, notion_staff_id, notion_student_id, subject, kind, start_date, start_time, duration_minutes, effective_until, created_by
    ) values (
      p_org_id, p_request_id, (p_args ->> 'staff_id')::uuid, (p_args ->> 'student_id')::uuid, p_args ->> 'subject', p_args ->> 'kind',
      (p_args ->> 'start_date')::date, (p_args ->> 'start_time')::time, (p_args ->> 'duration_minutes')::smallint,
      (p_args ->> 'effective_until')::date, (select auth.uid())
    ) returning id into result_id;
  elsif p_op = 'split' then
    result_id := tracker.split_class_series(
      s.id, (p_args ->> 'from_date')::date, (p_args ->> 'expected_updated_at')::timestamptz, p_request_id, coalesce(p_args -> 'new_values', '{}'::jsonb));
  elsif p_op = 'end_series' then
    update tracker.class_series set effective_until = (p_args ->> 'last_date')::date where id = s.id;
    result_id := s.id;
  else
    if p_op = 'cancel' then
      insert into tracker.class_exceptions (org_id, request_id, series_id, original_date, kind, new_date, new_start_time, created_by)
        values (p_org_id, p_request_id, s.id, (p_args ->> 'original_date')::date, 'cancelled', null, null, (select auth.uid()))
        on conflict (series_id, original_date) do update
          set kind = excluded.kind, new_date = excluded.new_date, new_start_time = excluded.new_start_time, request_id = excluded.request_id;
    elsif p_args ? 'new_date' then
      insert into tracker.class_exceptions (org_id, request_id, series_id, original_date, kind, new_date, new_start_time, created_by)
        values (p_org_id, p_request_id, s.id, (p_args ->> 'original_date')::date, 'moved',
          (p_args ->> 'new_date')::date, (p_args ->> 'new_start_time')::time, (select auth.uid()))
        on conflict (series_id, original_date) do update
          set kind = excluded.kind, new_date = excluded.new_date, new_start_time = excluded.new_start_time, request_id = excluded.request_id;
    end if;
    if p_op = 'edit_one_off' and coalesce(p_args -> 'fields', '{}'::jsonb) <> '{}'::jsonb then
      update tracker.class_series set
        notion_staff_id = coalesce((p_args #>> '{fields,staff_id}')::uuid, notion_staff_id),
        subject = coalesce(p_args #>> '{fields,subject}', subject),
        duration_minutes = coalesce((p_args #>> '{fields,duration_minutes}')::smallint, duration_minutes)
      where id = s.id;
    end if;
    result_id := s.id;
  end if;

  -- 6. Record the result on the claim.
  select to_jsonb(c) into out from tracker.class_series c where c.id = result_id;
  update tracker.schedule_writes set result = out, series_id = coalesce(series_id, result_id) where id = claim;
  return jsonb_build_object('replay', false, 'result', out);
end;
$$;
revoke all on function tracker.schedule_write(uuid, uuid, text, jsonb, jsonb) from public;
grant execute on function tracker.schedule_write(uuid, uuid, text, jsonb, jsonb) to authenticated;
