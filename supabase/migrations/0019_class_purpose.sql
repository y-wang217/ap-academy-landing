-- Class purpose and makeup link (REQ-31). A one-off class says why it exists:
-- makeup, trial or extra. Null means not declared, and the calendars show
-- "Class", never "Makeup". A makeup may name the cancelled occurrence it
-- replaces; that is a label, not a credit (tracker ADR 0051).
-- Tested by supabase/tests/class_purpose.sql.

alter table tracker.class_series
  add column purpose text check (purpose in ('makeup', 'trial', 'extra')),
  -- No path deletes an exception today (no delete grant or policy for
  -- authenticated). If one ever does, the makeup keeps its purpose and only
  -- loses the link.
  add column makeup_for uuid references tracker.class_exceptions (id) on delete set null,
  add constraint class_series_purpose_one_off check (purpose is null or kind = 'one_off'),
  add constraint class_series_makeup_for_makeup check (makeup_for is null or purpose = 'makeup');

create index class_series_makeup_for_idx on tracker.class_series (makeup_for) where makeup_for is not null;

-- Policies are unchanged: only the org owner inserts or updates series.
grant insert (purpose, makeup_for), update (purpose, makeup_for) on tracker.class_series to authenticated;

-- schedule_write (0018) carries the two columns on create and edit_one_off.
-- Everything else is as 0018 wrote it.
-- The one class write. Security invoker: RLS and the class grants apply, and
-- only the org owner gets past the first check. In one transaction:
-- lock, claim the request ID, compare stamps, stale checks, write, record.
-- Raises 'forbidden', 'not_found', 'request_reused', 'booking_changed',
-- 'stale', and from split_class_series 'past_occurrence' or 'not_weekly'.
-- Returns { "replay": boolean, "result": <class_series row> }.
--
-- p_stamps: [{ "kind", "id", "version" }] as read by schedule_write_context.
-- p_args by op (dates YYYY-MM-DD, times HH:MM):
--   create        staff_id, student_id, subject, kind, start_date, start_time, duration_minutes, effective_until,
--                 [purpose, makeup_for]
--   move          series_id, original_date, new_date, new_start_time, expected_updated_at, expected_position
--   cancel        series_id, original_date, expected_updated_at, expected_position
--   edit_one_off  series_id, original_date, [new_date, new_start_time],
--                 fields { staff_id, subject, duration_minutes, purpose, makeup_for },
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
      org_id, request_id, notion_staff_id, notion_student_id, subject, kind, start_date, start_time, duration_minutes, effective_until,
      purpose, makeup_for, created_by
    ) values (
      p_org_id, p_request_id, (p_args ->> 'staff_id')::uuid, (p_args ->> 'student_id')::uuid, p_args ->> 'subject', p_args ->> 'kind',
      (p_args ->> 'start_date')::date, (p_args ->> 'start_time')::time, (p_args ->> 'duration_minutes')::smallint,
      (p_args ->> 'effective_until')::date, p_args ->> 'purpose', (p_args ->> 'makeup_for')::uuid, (select auth.uid())
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
        duration_minutes = coalesce((p_args #>> '{fields,duration_minutes}')::smallint, duration_minutes),
        -- A present key sets the value, null included; an absent key keeps it.
        purpose = case when p_args -> 'fields' ? 'purpose' then p_args #>> '{fields,purpose}' else purpose end,
        makeup_for = case when p_args -> 'fields' ? 'makeup_for' then (p_args #>> '{fields,makeup_for}')::uuid else makeup_for end
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
