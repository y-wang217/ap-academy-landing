-- Scheduler core (REQ-3, Scheduler 2/8): teacher availability and planned
-- classes. Occurrences are never stored: they are computed from a series plus
-- one exception row per changed occurrence, so a cancellation survives any
-- regeneration. Times are local wall-clock (America/Toronto), never timestamptz.
-- Staff and student IDs are Notion page IDs, as in 0009 (tracker ADR 0033, 0034).
-- Tested by supabase/tests/scheduler_core.sql.

create table tracker.availability_windows (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references tracker.orgs on delete restrict,
  request_id uuid not null,
  notion_staff_id uuid not null,
  weekday smallint not null check (weekday between 1 and 7),
  start_time time not null,
  end_time time not null,
  effective_from date not null,
  effective_until date,
  created_by uuid not null references auth.users on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, request_id),
  check (end_time > start_time),
  check (extract(minute from start_time)::int % 5 = 0 and extract(second from start_time) = 0),
  check (extract(minute from end_time)::int % 5 = 0 and extract(second from end_time) = 0),
  check (effective_until is null or effective_until >= effective_from)
);
create index availability_windows_staff_idx on tracker.availability_windows (org_id, notion_staff_id);

create table tracker.availability_exceptions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references tracker.orgs on delete restrict,
  request_id uuid not null,
  notion_staff_id uuid not null,
  on_date date not null,
  kind text not null check (kind in ('time_off', 'extra')),
  start_time time,
  end_time time,
  created_by uuid not null references auth.users on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, request_id),
  check ((start_time is null) = (end_time is null)),
  check (kind = 'time_off' or start_time is not null),
  check (start_time is null or end_time > start_time)
);
create index availability_exceptions_staff_idx on tracker.availability_exceptions (org_id, notion_staff_id, on_date);

create table tracker.class_series (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references tracker.orgs on delete restrict,
  request_id uuid not null,
  notion_staff_id uuid not null,
  -- Notion Students & Parents page ID, not tracker.students.id.
  notion_student_id uuid not null,
  subject text not null check (char_length(subject) between 1 and 80),
  kind text not null check (kind in ('one_off', 'weekly')),
  start_date date not null,
  start_time time not null,
  duration_minutes smallint not null check (duration_minutes between 15 and 480 and duration_minutes % 5 = 0),
  effective_until date,
  split_from uuid references tracker.class_series on delete restrict,
  created_by uuid not null references auth.users on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, request_id),
  check (kind = 'weekly' or effective_until is null),
  check (extract(minute from start_time)::int % 5 = 0 and extract(second from start_time) = 0),
  check (extract(hour from start_time) * 60 + extract(minute from start_time) + duration_minutes <= 1440)
);
create index class_series_staff_idx on tracker.class_series (org_id, notion_staff_id);
create index class_series_student_idx on tracker.class_series (org_id, notion_student_id);

create table tracker.class_exceptions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references tracker.orgs on delete restrict,
  request_id uuid not null,
  series_id uuid not null references tracker.class_series on delete restrict,
  original_date date not null,
  kind text not null check (kind in ('cancelled', 'moved')),
  new_date date,
  new_start_time time,
  created_by uuid not null references auth.users on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, request_id),
  -- One exception per occurrence: what makes cancel and move idempotent.
  unique (series_id, original_date),
  check ((kind = 'cancelled' and new_date is null and new_start_time is null)
      or (kind = 'moved' and new_date is not null and new_start_time is not null))
);

do $$
declare t text;
begin
  foreach t in array array['availability_windows', 'availability_exceptions', 'class_series', 'class_exceptions'] loop
    execute format('create trigger %I before update on tracker.%I for each row execute function tracker.set_updated_at()', t || '_updated_at', t);
    execute format('create trigger %I after insert or update or delete on tracker.%I for each row execute function tracker.write_audit()', 'audit_' || t, t);
    execute format('alter table tracker.%I enable row level security', t);
  end loop;
end $$;

-- RLS -------------------------------------------------------------------------
-- Read: the org owner, or the teacher the row belongs to (tracker.my_staff_id).
-- Availability: the same rule writes. Classes: owner writes only; no deletes.

create policy "owner or that teacher reads availability windows"
  on tracker.availability_windows for select to authenticated
  using (tracker.is_org_owner(org_id) or notion_staff_id = tracker.my_staff_id(org_id));
create policy "owner or that teacher adds availability windows"
  on tracker.availability_windows for insert to authenticated
  with check ((tracker.is_org_owner(org_id) or notion_staff_id = tracker.my_staff_id(org_id)) and created_by = (select auth.uid()));
create policy "owner or that teacher edits availability windows"
  on tracker.availability_windows for update to authenticated
  using (tracker.is_org_owner(org_id) or notion_staff_id = tracker.my_staff_id(org_id))
  with check (tracker.is_org_owner(org_id) or notion_staff_id = tracker.my_staff_id(org_id));
create policy "owner or that teacher removes availability windows"
  on tracker.availability_windows for delete to authenticated
  using (tracker.is_org_owner(org_id) or notion_staff_id = tracker.my_staff_id(org_id));

create policy "owner or that teacher reads availability exceptions"
  on tracker.availability_exceptions for select to authenticated
  using (tracker.is_org_owner(org_id) or notion_staff_id = tracker.my_staff_id(org_id));
create policy "owner or that teacher adds availability exceptions"
  on tracker.availability_exceptions for insert to authenticated
  with check ((tracker.is_org_owner(org_id) or notion_staff_id = tracker.my_staff_id(org_id)) and created_by = (select auth.uid()));
create policy "owner or that teacher edits availability exceptions"
  on tracker.availability_exceptions for update to authenticated
  using (tracker.is_org_owner(org_id) or notion_staff_id = tracker.my_staff_id(org_id))
  with check (tracker.is_org_owner(org_id) or notion_staff_id = tracker.my_staff_id(org_id));
create policy "owner or that teacher removes availability exceptions"
  on tracker.availability_exceptions for delete to authenticated
  using (tracker.is_org_owner(org_id) or notion_staff_id = tracker.my_staff_id(org_id));

create policy "owner or that teacher reads class series"
  on tracker.class_series for select to authenticated
  using (tracker.is_org_owner(org_id) or notion_staff_id = tracker.my_staff_id(org_id));
create policy "owner adds class series"
  on tracker.class_series for insert to authenticated
  with check (tracker.is_org_owner(org_id) and created_by = (select auth.uid()));
create policy "owner edits class series"
  on tracker.class_series for update to authenticated
  using (tracker.is_org_owner(org_id)) with check (tracker.is_org_owner(org_id));

create policy "owner or that teacher reads class exceptions"
  on tracker.class_exceptions for select to authenticated
  using (tracker.is_org_owner(org_id) or exists (
    select 1 from tracker.class_series s
    where s.id = series_id and s.notion_staff_id = tracker.my_staff_id(s.org_id)));
create policy "owner adds class exceptions"
  on tracker.class_exceptions for insert to authenticated
  with check (tracker.is_org_owner(org_id) and created_by = (select auth.uid()));
create policy "owner edits class exceptions"
  on tracker.class_exceptions for update to authenticated
  using (tracker.is_org_owner(org_id)) with check (tracker.is_org_owner(org_id));

revoke all on tracker.availability_windows, tracker.availability_exceptions, tracker.class_series, tracker.class_exceptions from anon, authenticated;
grant select, delete on tracker.availability_windows, tracker.availability_exceptions to authenticated;
grant insert (id, org_id, request_id, notion_staff_id, weekday, start_time, end_time, effective_from, effective_until, created_by)
  on tracker.availability_windows to authenticated;
grant update (weekday, start_time, end_time, effective_from, effective_until) on tracker.availability_windows to authenticated;
grant insert (id, org_id, request_id, notion_staff_id, on_date, kind, start_time, end_time, created_by)
  on tracker.availability_exceptions to authenticated;
grant update (on_date, kind, start_time, end_time) on tracker.availability_exceptions to authenticated;
grant select on tracker.class_series, tracker.class_exceptions to authenticated;
grant insert (id, org_id, request_id, notion_staff_id, notion_student_id, subject, kind, start_date, start_time, duration_minutes, effective_until, split_from, created_by)
  on tracker.class_series to authenticated;
grant update (notion_staff_id, notion_student_id, subject, start_time, duration_minutes, effective_until) on tracker.class_series to authenticated;
grant insert (id, org_id, request_id, series_id, original_date, kind, new_date, new_start_time, created_by)
  on tracker.class_exceptions to authenticated;
grant update (request_id, series_id, original_date, kind, new_date, new_start_time) on tracker.class_exceptions to authenticated;
grant all on tracker.availability_windows, tracker.availability_exceptions, tracker.class_series, tracker.class_exceptions to service_role;

-- "This class and future" ----------------------------------------------------
-- One transaction: end the old series the day before p_from_date, start a new
-- one on its (possibly new) weekday in that week, and re-key the old series'
-- exceptions on or after p_from_date to the same ISO week of the new weekday.
-- Mirrors planSplit() in apps/tracker/lib/domain/schedule/recurrence.ts.
-- Security invoker: RLS applies, so only the org owner gets past the lock.
-- Raises 'not_found', 'stale', 'past_occurrence' or 'not_weekly'.
-- p_new_values keys (all optional): staff_id, student_id, subject, start_time,
-- duration_minutes, weekday.
create or replace function tracker.split_class_series(
  p_series_id uuid,
  p_from_date date,
  p_expected_updated_at timestamptz,
  p_request_id uuid,
  p_new_values jsonb default '{}'
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  old_s tracker.class_series;
  existing uuid;
  new_id uuid := gen_random_uuid();
  wd integer;
  new_start date;
  week_start date;
  e record;
  mapped date;
begin
  select * into old_s from tracker.class_series where id = p_series_id for update;
  if not found then
    raise exception 'not_found';
  end if;

  select id into existing from tracker.class_series where org_id = old_s.org_id and request_id = p_request_id;
  if existing is not null then
    return existing;
  end if;

  if old_s.updated_at is distinct from p_expected_updated_at then
    raise exception 'stale';
  end if;
  if p_from_date < (now() at time zone 'America/Toronto')::date then
    raise exception 'past_occurrence';
  end if;
  if old_s.kind <> 'weekly' then
    raise exception 'not_weekly';
  end if;

  wd := coalesce((p_new_values ->> 'weekday')::integer, extract(isodow from p_from_date)::integer);
  new_start := (p_from_date - (extract(isodow from p_from_date)::integer - 1)) + (wd - 1);
  if new_start < p_from_date then
    new_start := new_start + 7;
  end if;

  insert into tracker.class_series (
    id, org_id, request_id, notion_staff_id, notion_student_id, subject, kind,
    start_date, start_time, duration_minutes, effective_until, split_from, created_by
  ) values (
    new_id, old_s.org_id, p_request_id,
    coalesce((p_new_values ->> 'staff_id')::uuid, old_s.notion_staff_id),
    coalesce((p_new_values ->> 'student_id')::uuid, old_s.notion_student_id),
    coalesce(p_new_values ->> 'subject', old_s.subject),
    'weekly', new_start,
    coalesce((p_new_values ->> 'start_time')::time, old_s.start_time),
    coalesce((p_new_values ->> 'duration_minutes')::smallint, old_s.duration_minutes),
    old_s.effective_until, old_s.id, (select auth.uid())
  );

  update tracker.class_series set effective_until = p_from_date - 1 where id = old_s.id;

  for e in
    select id, original_date from tracker.class_exceptions
    where series_id = old_s.id and original_date >= p_from_date
  loop
    week_start := e.original_date - (extract(isodow from e.original_date)::integer - 1);
    mapped := week_start + (wd - 1);
    -- Before the new start there is no occurrence to attach to: left behind,
    -- inert on the old series (it ends before p_from_date).
    if mapped >= new_start then
      update tracker.class_exceptions set series_id = new_id, original_date = mapped where id = e.id;
    end if;
  end loop;

  return new_id;
end;
$$;

revoke all on function tracker.split_class_series(uuid, date, timestamptz, uuid, jsonb) from public;
grant execute on function tracker.split_class_series(uuid, date, timestamptz, uuid, jsonb) to authenticated;
