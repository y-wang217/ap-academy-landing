-- People sync (REQ-38, Feedback 9): local copies of the Notion Staff and
-- Students & Parents fields the scheduler and parent views show, under
-- workspace ADR 0004 (option B). Notion stays the editor; these rows are
-- operational copies, written only by apply_people_sync().
--
-- Copied: staff name, subjects and one active boolean (computed at sync by
-- isActiveTeachingStaff), student display name and stage. Never copied:
-- parent name, parent email, phone, rate, notes, billing, staff email,
-- greeting name. Matching is by Notion page id only. Rows missing from Notion
-- are archived, never deleted, so old series keep their names.
--
-- tracker.student_people is separate from tracker.students on purpose: a
-- students row is a grade-tracker student with publish state, parent
-- policies and invites, and a scheduling-only student must never become one.
-- The migration adds no rows; the first sync is the backfill.
-- Tested by supabase/tests/people_sync.sql and supabase/tests/permission_matrix.sql.

create table tracker.staff (
  org_id uuid not null references tracker.orgs on delete restrict,
  -- The Notion Staff page ID, dashed, as in staff_links and class_series.
  notion_staff_id uuid not null,
  name text not null check (char_length(name) between 1 and 200),
  subjects text[] not null default '{}',
  active boolean not null,
  synced_at timestamptz not null,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (org_id, notion_staff_id)
);
create index staff_active_idx on tracker.staff (org_id) where active and archived_at is null;

create table tracker.student_people (
  org_id uuid not null references tracker.orgs on delete restrict,
  -- The Notion Students & Parents page ID, not tracker.students.id.
  notion_student_id uuid not null,
  name text not null check (char_length(name) between 1 and 200),
  stage text not null check (char_length(stage) <= 60),
  active boolean not null,
  synced_at timestamptz not null,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (org_id, notion_student_id)
);

-- One row per sync attempt. The error is a short reason, never a Notion payload.
create table tracker.sync_runs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references tracker.orgs on delete restrict,
  kind text not null default 'people' check (kind in ('people')),
  trigger text not null check (trigger in ('schedule', 'owner')),
  actor uuid references auth.users on delete set null,
  started_at timestamptz not null,
  finished_at timestamptz not null,
  result text not null check (result in ('ok', 'failed')),
  staff_upserted integer not null default 0 check (staff_upserted >= 0),
  staff_archived integer not null default 0 check (staff_archived >= 0),
  students_upserted integer not null default 0 check (students_upserted >= 0),
  students_archived integer not null default 0 check (students_archived >= 0),
  error text check (error is null or char_length(error) <= 300)
);
create index sync_runs_org_kind_started_idx on tracker.sync_runs (org_id, kind, started_at desc);

create trigger staff_updated_at before update on tracker.staff
  for each row execute function tracker.set_updated_at();
create trigger student_people_updated_at before update on tracker.student_people
  for each row execute function tracker.set_updated_at();

-- Audit --------------------------------------------------------------------
-- write_audit() keys a row by its `id` column; these tables are keyed by the
-- Notion id, named in the trigger argument. An hourly sync that only moves
-- synced_at writes no audit row (the WHEN clause), so audit_log is not flooded.
create or replace function tracker.write_audit_keyed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  before_row jsonb := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end;
  after_row jsonb := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end;
  source jsonb := coalesce(after_row, before_row);
begin
  insert into tracker.audit_log (org_id, actor_id, table_name, row_id, action, before, after)
  values (
    (source ->> 'org_id')::uuid,
    (select auth.uid()),
    tg_table_name,
    source ->> tg_argv[0],
    tg_op,
    before_row,
    after_row
  );
  return null;
end;
$$;

create trigger audit_staff_insert after insert on tracker.staff
  for each row execute function tracker.write_audit_keyed('notion_staff_id');
create trigger audit_staff_update after update on tracker.staff
  for each row when ((old.name, old.active, old.archived_at) is distinct from (new.name, new.active, new.archived_at))
  execute function tracker.write_audit_keyed('notion_staff_id');
create trigger audit_student_people_insert after insert on tracker.student_people
  for each row execute function tracker.write_audit_keyed('notion_student_id');
create trigger audit_student_people_update after update on tracker.student_people
  for each row when ((old.name, old.active, old.archived_at) is distinct from (new.name, new.active, new.archived_at))
  execute function tracker.write_audit_keyed('notion_student_id');

-- Helpers -------------------------------------------------------------------
-- Security definer so the policies below can call them without recursing
-- through RLS on class_series.

-- The caller teaches that student: a series in that org with the student and
-- the caller's live staff id.
create or replace function tracker.is_my_series_student(target_org uuid, target_student uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from tracker.class_series cs
     where cs.org_id = target_org
       and cs.notion_student_id = target_student
       and cs.notion_staff_id = tracker.my_staff_id(target_org)
  );
$$;

-- That staff member teaches one of the caller's published linked children.
create or replace function tracker.is_my_childs_teacher(target_org uuid, target_staff uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from tracker.class_series cs
     where cs.org_id = target_org
       and cs.notion_staff_id = target_staff
       and tracker.is_my_childs_schedule(cs.org_id, cs.notion_student_id)
  );
$$;

-- RLS: select only. Nobody but apply_people_sync() writes. ---------------------

alter table tracker.staff enable row level security;
alter table tracker.student_people enable row level security;
alter table tracker.sync_runs enable row level security;

create policy "owner, scheduling teachers and the child's parents read staff"
  on tracker.staff for select to authenticated
  using (
    tracker.is_org_owner(org_id)
    or (tracker.my_staff_id(org_id) is not null
        and ((active and archived_at is null) or notion_staff_id = tracker.my_staff_id(org_id)))
    or tracker.is_my_childs_teacher(org_id, notion_staff_id)
  );

create policy "owner, that student's teachers and parents read student people"
  on tracker.student_people for select to authenticated
  using (
    tracker.is_org_owner(org_id)
    or tracker.is_my_series_student(org_id, notion_student_id)
    or tracker.is_my_childs_schedule(org_id, notion_student_id)
  );

create policy "owner reads sync runs"
  on tracker.sync_runs for select to authenticated
  using (tracker.is_org_owner(org_id));

revoke all on tracker.staff, tracker.student_people, tracker.sync_runs from anon, authenticated;
grant select on tracker.staff, tracker.student_people, tracker.sync_runs to authenticated;
grant all on tracker.staff, tracker.student_people, tracker.sync_runs to service_role;

-- Apply one sync ----------------------------------------------------------------
-- The app reads Notion and passes what it read. In one transaction this
-- updates rows by (org, Notion id), inserts new rows that are active or
-- already referenced by the org, archives rows Notion no longer returns, and
-- records the run. With p_error, an invalid payload, or an empty list while
-- that table has active rows, it records a failed run and changes no person
-- row, so a Notion outage never empties a calendar.
--
-- p_staff:    [{ "id": uuid, "name": text, "subjects": [text], "active": bool }]
-- p_students: [{ "id": uuid, "name": text, "stage": text, "active": bool }]
create or replace function tracker.apply_people_sync(
  p_org uuid,
  p_trigger text,
  p_started_at timestamptz,
  p_staff jsonb,
  p_students jsonb,
  p_error text
)
returns tracker.sync_runs
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_error text := nullif(btrim(coalesce(p_error, '')), '');
  v_now timestamptz := now();
  n integer;
  su integer := 0;
  sa integer := 0;
  tu integer := 0;
  ta integer := 0;
  run tracker.sync_runs;
begin
  if not (tracker.is_org_owner(p_org) or coalesce((select auth.role()), '') = 'service_role') then
    raise exception 'forbidden' using errcode = 'insufficient_privilege';
  end if;
  -- Two syncs for one org (the hourly run and Sync now) apply one after the other.
  perform pg_advisory_xact_lock(hashtextextended('tracker.people_sync:' || p_org::text, 0));

  if v_error is null then
    begin
      if jsonb_typeof(p_staff) is distinct from 'array' or jsonb_typeof(p_students) is distinct from 'array' then
        raise exception 'invalid payload';
      end if;
      if exists (
        select 1 from jsonb_array_elements(p_staff) e
         where jsonb_typeof(e) <> 'object'
            or jsonb_typeof(e -> 'name') is distinct from 'string'
            or char_length(btrim(e ->> 'name')) not between 1 and 200
            or jsonb_typeof(e -> 'active') is distinct from 'boolean'
            or jsonb_typeof(e -> 'subjects') is distinct from 'array'
            or (e ->> 'id')::uuid is null
      ) or exists (
        select 1 from jsonb_array_elements(p_staff) e, jsonb_array_elements(e -> 'subjects') s
         where jsonb_typeof(s) <> 'string'
      ) or exists (
        select 1 from jsonb_array_elements(p_students) e
         where jsonb_typeof(e) <> 'object'
            or jsonb_typeof(e -> 'name') is distinct from 'string'
            or char_length(btrim(e ->> 'name')) not between 1 and 200
            or jsonb_typeof(e -> 'stage') is distinct from 'string'
            or char_length(e ->> 'stage') > 60
            or jsonb_typeof(e -> 'active') is distinct from 'boolean'
            or (e ->> 'id')::uuid is null
      ) or (select count(*) <> count(distinct (e ->> 'id')::uuid) from jsonb_array_elements(p_staff) e)
        or (select count(*) <> count(distinct (e ->> 'id')::uuid) from jsonb_array_elements(p_students) e) then
        raise exception 'invalid payload';
      end if;
    exception when others then
      v_error := 'invalid_payload';
    end;
  end if;

  if v_error is null and jsonb_array_length(p_staff) = 0
     and exists (select 1 from tracker.staff where org_id = p_org and active and archived_at is null) then
    v_error := 'empty_read';
  end if;
  if v_error is null and jsonb_array_length(p_students) = 0
     and exists (select 1 from tracker.student_people where org_id = p_org and active and archived_at is null) then
    v_error := 'empty_read';
  end if;

  if v_error is null then
    -- Staff: rename and state follow, a returning row is unarchived.
    update tracker.staff s
       set name = btrim(x.name), subjects = x.subjects, active = x.active, synced_at = v_now, archived_at = null
      from (select (e ->> 'id')::uuid as id, e ->> 'name' as name, (e ->> 'active')::boolean as active,
                   array(select jsonb_array_elements_text(e -> 'subjects')) as subjects
              from jsonb_array_elements(p_staff) e) x
     where s.org_id = p_org and s.notion_staff_id = x.id;
    get diagnostics n = row_count;
    su := su + n;

    insert into tracker.staff (org_id, notion_staff_id, name, subjects, active, synced_at)
    select p_org, x.id, btrim(x.name), x.subjects, x.active, v_now
      from (select (e ->> 'id')::uuid as id, e ->> 'name' as name, (e ->> 'active')::boolean as active,
                   array(select jsonb_array_elements_text(e -> 'subjects')) as subjects
              from jsonb_array_elements(p_staff) e) x
     where not exists (select 1 from tracker.staff s where s.org_id = p_org and s.notion_staff_id = x.id)
       and (x.active
            or exists (select 1 from tracker.class_series c where c.org_id = p_org and c.notion_staff_id = x.id)
            or exists (select 1 from tracker.staff_links l where l.org_id = p_org and l.notion_staff_id = x.id));
    get diagnostics n = row_count;
    su := su + n;

    update tracker.staff s
       set active = false, archived_at = v_now, synced_at = v_now
     where s.org_id = p_org and s.archived_at is null
       and not exists (select 1 from jsonb_array_elements(p_staff) e where (e ->> 'id')::uuid = s.notion_staff_id);
    get diagnostics sa = row_count;

    -- Students: the same rules, referenced by series or a grade-tracker link.
    update tracker.student_people p
       set name = btrim(x.name), stage = x.stage, active = x.active, synced_at = v_now, archived_at = null
      from (select (e ->> 'id')::uuid as id, e ->> 'name' as name, e ->> 'stage' as stage, (e ->> 'active')::boolean as active
              from jsonb_array_elements(p_students) e) x
     where p.org_id = p_org and p.notion_student_id = x.id;
    get diagnostics n = row_count;
    tu := tu + n;

    insert into tracker.student_people (org_id, notion_student_id, name, stage, active, synced_at)
    select p_org, x.id, btrim(x.name), x.stage, x.active, v_now
      from (select (e ->> 'id')::uuid as id, e ->> 'name' as name, e ->> 'stage' as stage, (e ->> 'active')::boolean as active
              from jsonb_array_elements(p_students) e) x
     where not exists (select 1 from tracker.student_people p where p.org_id = p_org and p.notion_student_id = x.id)
       and (x.active
            or exists (select 1 from tracker.class_series c where c.org_id = p_org and c.notion_student_id = x.id)
            or exists (select 1 from tracker.students s where s.org_id = p_org and s.notion_student_id = x.id));
    get diagnostics n = row_count;
    tu := tu + n;

    update tracker.student_people p
       set active = false, archived_at = v_now, synced_at = v_now
     where p.org_id = p_org and p.archived_at is null
       and not exists (select 1 from jsonb_array_elements(p_students) e where (e ->> 'id')::uuid = p.notion_student_id);
    get diagnostics ta = row_count;
  end if;

  insert into tracker.sync_runs (org_id, kind, trigger, actor, started_at, finished_at, result,
                                 staff_upserted, staff_archived, students_upserted, students_archived, error)
  values (p_org, 'people', p_trigger, (select auth.uid()), coalesce(p_started_at, v_now), clock_timestamp(),
          case when v_error is null then 'ok' else 'failed' end,
          su, sa, tu, ta, left(v_error, 300))
  returning * into run;
  return run;
end;
$$;

-- When the people copy was last refreshed: the latest ok run's finish time,
-- for the org owner, a live staff link or a claimed parent in that org. Null
-- for anyone else, and when there has never been a good sync.
create or replace function tracker.people_synced_at(target_org uuid)
returns timestamptz
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when tracker.is_org_owner(target_org)
      or tracker.my_staff_id(target_org) is not null
      or exists (select 1 from tracker.parent_links pl
                  where pl.org_id = target_org and pl.parent_user_id = (select auth.uid()))
    then (select max(r.finished_at) from tracker.sync_runs r
           where r.org_id = target_org and r.kind = 'people' and r.result = 'ok')
  end;
$$;

revoke all on function tracker.write_audit_keyed() from public, anon, authenticated;
revoke all on function tracker.is_my_series_student(uuid, uuid) from public, anon;
revoke all on function tracker.is_my_childs_teacher(uuid, uuid) from public, anon;
revoke all on function tracker.apply_people_sync(uuid, text, timestamptz, jsonb, jsonb, text) from public, anon;
revoke all on function tracker.people_synced_at(uuid) from public, anon;
grant execute on function tracker.is_my_series_student(uuid, uuid) to authenticated;
grant execute on function tracker.is_my_childs_teacher(uuid, uuid) to authenticated;
grant execute on function tracker.apply_people_sync(uuid, text, timestamptz, jsonb, jsonb, text) to authenticated, service_role;
grant execute on function tracker.people_synced_at(uuid) to authenticated;
