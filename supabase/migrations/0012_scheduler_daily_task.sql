-- Daily "Text teachers their schedules" task (REQ-8, Scheduler 7/8). Operational
-- state only: which Notion page is today's task, the lease that keeps two runs
-- apart, and one row per teacher block with hashes of what we last wrote. No
-- student names and no message text live here (tracker ADR 0039). No audit
-- trigger: the hourly run would flood audit_log with rows that hold no
-- personal data. Staff IDs are Notion page IDs, as in 0009 and 0010.
-- Tested by supabase/tests/scheduler_daily_task.sql.

create table tracker.daily_tasks (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references tracker.orgs on delete restrict,
  kind text not null check (kind in ('teacher_texts')),
  local_date date not null,
  -- The Work page and its Work Log entry in Notion.
  notion_page_id uuid,
  notion_page_url text,
  notion_log_id uuid,
  state text not null default 'pending' check (state in ('pending', 'ready', 'failed')),
  -- A short message only, never a Notion payload.
  last_error text check (last_error is null or char_length(last_error) <= 300),
  refresh_count integer not null default 0 check (refresh_count >= 0),
  lease_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- The dedupe key: one task per org, kind and local date.
  unique (org_id, kind, local_date),
  unique (id, org_id)
);

create table tracker.daily_task_teachers (
  task_id uuid not null,
  org_id uuid not null,
  notion_staff_id uuid not null,
  block_id uuid not null,
  -- sha-256 hex of the teacher's rendered day.
  written_fingerprint text not null,
  -- The block's last_edited_time Notion returned after our last write.
  written_at timestamptz not null,
  acknowledged_fingerprint text,
  labelled boolean not null default false,
  primary key (task_id, notion_staff_id),
  foreign key (task_id, org_id) references tracker.daily_tasks (id, org_id) on delete restrict
);

create trigger daily_tasks_updated_at before update on tracker.daily_tasks
  for each row execute function tracker.set_updated_at();
alter table tracker.daily_tasks enable row level security;
alter table tracker.daily_task_teachers enable row level security;

-- RLS: the org owner only. Teachers and anon read and write nothing. No deletes.
create policy "owner reads daily tasks"
  on tracker.daily_tasks for select to authenticated using (tracker.is_org_owner(org_id));
create policy "owner adds daily tasks"
  on tracker.daily_tasks for insert to authenticated with check (tracker.is_org_owner(org_id));
create policy "owner edits daily tasks"
  on tracker.daily_tasks for update to authenticated
  using (tracker.is_org_owner(org_id)) with check (tracker.is_org_owner(org_id));

create policy "owner reads daily task teachers"
  on tracker.daily_task_teachers for select to authenticated using (tracker.is_org_owner(org_id));
create policy "owner adds daily task teachers"
  on tracker.daily_task_teachers for insert to authenticated with check (tracker.is_org_owner(org_id));
create policy "owner edits daily task teachers"
  on tracker.daily_task_teachers for update to authenticated
  using (tracker.is_org_owner(org_id)) with check (tracker.is_org_owner(org_id));

revoke all on tracker.daily_tasks, tracker.daily_task_teachers from anon, authenticated;
grant select on tracker.daily_tasks, tracker.daily_task_teachers to authenticated;
grant insert (id, org_id, kind, local_date) on tracker.daily_tasks to authenticated;
grant update (notion_page_id, notion_page_url, notion_log_id, state, last_error, refresh_count, lease_until) on tracker.daily_tasks to authenticated;
grant insert (task_id, org_id, notion_staff_id, block_id, written_fingerprint, written_at, acknowledged_fingerprint, labelled)
  on tracker.daily_task_teachers to authenticated;
grant update (block_id, written_fingerprint, written_at, acknowledged_fingerprint, labelled) on tracker.daily_task_teachers to authenticated;
grant all on tracker.daily_tasks, tracker.daily_task_teachers to service_role;

-- Claim a date's task ------------------------------------------------------------
-- Creates the row if it is missing, then takes the lease only if nobody holds a
-- live one. Returns the row when this caller got the lease and nothing when
-- someone else has it. Two callers at the same moment cannot both win: the
-- second waits on the row lock, then re-checks lease_until. Security invoker:
-- RLS applies, so only the org owner (or service_role) gets a row.
create or replace function tracker.claim_daily_task(
  p_org uuid,
  p_kind text,
  p_date date,
  p_lease_seconds integer
)
returns setof tracker.daily_tasks
language plpgsql
security invoker
set search_path = ''
as $$
begin
  insert into tracker.daily_tasks (org_id, kind, local_date)
  values (p_org, p_kind, p_date)
  on conflict (org_id, kind, local_date) do nothing;

  return query
  update tracker.daily_tasks t
     set lease_until = now() + make_interval(secs => p_lease_seconds)
   where t.org_id = p_org and t.kind = p_kind and t.local_date = p_date
     and (t.lease_until is null or t.lease_until < now())
  returning t.*;
end;
$$;

revoke all on function tracker.claim_daily_task(uuid, text, date, integer) from public;
grant execute on function tracker.claim_daily_task(uuid, text, date, integer) to authenticated, service_role;
