-- Notion export outbox (REQ-35). Every class write records the Notion exports
-- it owes (a student's Weekly Schedule, today's teacher-texts task) in the same
-- transaction, through an after-row trigger, so a crash between the save and
-- the Notion call can no longer lose them. The app delivers rows later and
-- renders from current state, so no payload is stored, and later edits win.
-- Operational state only, like daily_tasks (0012): no audit trigger, and rows
-- are never deleted (tracker ADR 0054).
-- Tested by supabase/tests/notion_outbox.sql.

create table tracker.notion_outbox (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references tracker.orgs on delete restrict,
  kind text not null check (kind in ('summary', 'daily_task')),
  -- The Notion Students & Parents page ID for 'summary', the org ID for 'daily_task'.
  target_id uuid not null,
  -- 'summary:<target_id>' or 'daily_task:<org_id>'.
  dedupe_key text not null,
  -- Bumped each time a change lands on a row that is still pending.
  version integer not null default 1,
  -- sha-256 hex of what the last delivery rendered.
  payload_hash text,
  status text not null default 'pending'
    check (status in ('pending', 'running', 'done', 'failed', 'uncertain', 'superseded')),
  attempts integer not null default 0 check (attempts >= 0),
  next_attempt_at timestamptz not null default now(),
  lease_until timestamptz,
  -- A short message only, never a Notion payload.
  last_error text check (last_error is null or char_length(last_error) <= 300),
  -- The request_id of the class row whose write enqueued this.
  request_id uuid,
  superseded_by uuid references tracker.notion_outbox on delete restrict,
  requested_at timestamptz not null default now(),
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- At most one pending row per target: a second change updates it instead.
create unique index notion_outbox_one_pending_idx on tracker.notion_outbox (org_id, dedupe_key) where status = 'pending';
create index notion_outbox_due_idx on tracker.notion_outbox (org_id, status, next_attempt_at);

create trigger notion_outbox_updated_at before update on tracker.notion_outbox
  for each row execute function tracker.set_updated_at();
alter table tracker.notion_outbox enable row level security;

-- RLS: the org owner reads and moves rows through their states. No insert or
-- delete for any client: rows come only from the functions below.
create policy "owner reads notion outbox"
  on tracker.notion_outbox for select to authenticated using (tracker.is_org_owner(org_id));
create policy "owner edits notion outbox"
  on tracker.notion_outbox for update to authenticated
  using (tracker.is_org_owner(org_id)) with check (tracker.is_org_owner(org_id));

revoke all on tracker.notion_outbox from anon, authenticated;
grant select on tracker.notion_outbox to authenticated;
grant update (status, attempts, next_attempt_at, lease_until, last_error, payload_hash, superseded_by, finished_at)
  on tracker.notion_outbox to authenticated;
grant all on tracker.notion_outbox to service_role;

-- Enqueue -----------------------------------------------------------------------
-- The one insert. No ownership check of its own, so no client may call it:
-- only the trigger and enqueue_summary_sync do.
create or replace function tracker.upsert_notion_outbox(p_org uuid, p_kind text, p_target uuid, p_request uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  row_id uuid;
begin
  insert into tracker.notion_outbox (org_id, kind, target_id, dedupe_key, request_id)
    values (p_org, p_kind, p_target, p_kind || ':' || p_target, p_request)
    on conflict (org_id, dedupe_key) where status = 'pending'
    do update set version = tracker.notion_outbox.version + 1, request_id = excluded.request_id,
                  requested_at = now(), next_attempt_at = now()
    returning id into row_id;
  return row_id;
end;
$$;
revoke all on function tracker.upsert_notion_outbox(uuid, text, uuid, uuid) from public, anon, authenticated;

-- After any class write: one summary row per affected adopted student (old and
-- new student when it changes) and one daily-task row for the org. Org,
-- students and request come from the row, which RLS on that table has already
-- checked. A statement that fails or changes no row fires nothing.
create or replace function tracker.enqueue_notion_exports()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  org uuid;
  req uuid;
  students uuid[] := '{}';
  st uuid;
begin
  -- schedule_summaries has no request_id; each field is read only in its branch.
  if tg_op = 'DELETE' then
    org := old.org_id;
    req := old.request_id;
  elsif tg_table_name = 'schedule_summaries' then
    org := new.org_id;
  else
    org := new.org_id;
    req := new.request_id;
  end if;

  if tg_table_name = 'class_series' then
    if tg_op <> 'INSERT' then students := students || old.notion_student_id; end if;
    if tg_op <> 'DELETE' then students := students || new.notion_student_id; end if;
  elsif tg_table_name = 'class_exceptions' then
    select coalesce(array_agg(c.notion_student_id), '{}') into students from tracker.class_series c
      where c.id in (
        case when tg_op <> 'INSERT' then old.series_id end,
        case when tg_op <> 'DELETE' then new.series_id end);
  elsif tg_table_name = 'schedule_summaries' then
    students := array[new.notion_student_id];
  end if;

  for st in
    select distinct x from unnest(students) x
    where exists (select 1 from tracker.schedule_summaries s where s.org_id = org and s.notion_student_id = x)
    order by x
  loop
    perform tracker.upsert_notion_outbox(org, 'summary', st, req);
  end loop;
  perform tracker.upsert_notion_outbox(org, 'daily_task', org, req);
  return null;
end;
$$;
revoke all on function tracker.enqueue_notion_exports() from public, anon, authenticated;

create trigger notion_outbox_enqueue after insert or update or delete on tracker.class_series
  for each row execute function tracker.enqueue_notion_exports();
create trigger notion_outbox_enqueue after insert or update or delete on tracker.class_exceptions
  for each row execute function tracker.enqueue_notion_exports();
create trigger notion_outbox_enqueue after insert on tracker.schedule_summaries
  for each row execute function tracker.enqueue_notion_exports();

-- "Sync all" on the Schedules page: one summary row per adopted student given.
-- Returns the row ids. Owner of p_org_id only, checked before any write.
create or replace function tracker.enqueue_summary_sync(p_org_id uuid, p_students uuid[])
returns setof uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  st uuid;
begin
  if not tracker.is_org_owner(p_org_id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  for st in
    select distinct x from unnest(coalesce(p_students, '{}')) x
    where exists (select 1 from tracker.schedule_summaries s where s.org_id = p_org_id and s.notion_student_id = x)
    order by x
  loop
    return next tracker.upsert_notion_outbox(p_org_id, 'summary', st, null);
  end loop;
end;
$$;
revoke all on function tracker.enqueue_summary_sync(uuid, uuid[]) from public, anon;
grant execute on function tracker.enqueue_summary_sync(uuid, uuid[]) to authenticated;

-- Claim -----------------------------------------------------------------------------
-- Takes due rows for delivery: sets them running with a lease and counts the
-- attempt. Never takes a row whose key has a live running row, so an older
-- delivery cannot land after a newer one. An expired daily-task lease becomes
-- uncertain (its Notion append may have landed) and is never re-run. An
-- expired summary lease is reclaimed, or superseded when a newer pending row
-- exists for the key. p_ids limits the claim to those rows when given.
-- Security invoker: RLS applies to the owner; the hourly run passes its org
-- with the service role, and every step filters on p_org_id.
create or replace function tracker.claim_notion_outbox(p_org_id uuid, p_ids uuid[], p_limit integer, p_lease_seconds integer)
returns setof tracker.notion_outbox
language plpgsql
security invoker
set search_path = ''
as $$
begin
  update tracker.notion_outbox o
     set status = 'uncertain', lease_until = null, finished_at = now(),
         last_error = 'The run stopped before Notion answered. Check today''s task, then retry.'
   where o.org_id = p_org_id and o.kind = 'daily_task' and o.status = 'running' and o.lease_until < now();

  update tracker.notion_outbox o
     set status = 'superseded', lease_until = null, finished_at = now(), superseded_by = p.id
    from tracker.notion_outbox p
   where o.org_id = p_org_id and o.kind = 'summary' and o.status = 'running' and o.lease_until < now()
     and p.org_id = o.org_id and p.dedupe_key = o.dedupe_key and p.status = 'pending';

  return query
  with picked as (
    select c.id from tracker.notion_outbox c
     where c.org_id = p_org_id
       and (p_ids is null or c.id = any(p_ids))
       and ((c.status = 'pending' and c.next_attempt_at <= now())
         or (c.status = 'running' and c.kind = 'summary' and c.lease_until < now()))
       and not exists (
         select 1 from tracker.notion_outbox r
          where r.org_id = c.org_id and r.dedupe_key = c.dedupe_key and r.id <> c.id
            and r.status = 'running' and r.lease_until >= now())
     order by c.requested_at
     limit greatest(p_limit, 0)
     for update skip locked
  )
  update tracker.notion_outbox o
     set status = 'running', lease_until = now() + make_interval(secs => p_lease_seconds), attempts = o.attempts + 1
    from picked
   where o.id = picked.id
  returning o.*;
end;
$$;
revoke all on function tracker.claim_notion_outbox(uuid, uuid[], integer, integer) from public, anon;
grant execute on function tracker.claim_notion_outbox(uuid, uuid[], integer, integer) to authenticated, service_role;

-- Retry ------------------------------------------------------------------------------
-- The operator's Retry on a failed or uncertain row. With no pending row on the
-- key, the row goes back to pending, due now. With one, the retried row is
-- superseded by it and the pending row is made due now; its id is returned.
-- A pending row waiting for its next attempt is made due now ("Retry now").
-- Raises P0002 'not_found' when the caller cannot see the row and
-- 'not_retryable' for any other state. Security invoker: RLS and the column
-- grants apply.
create or replace function tracker.retry_notion_outbox(p_id uuid)
returns table (id uuid, status text, superseded_by uuid)
language plpgsql
security invoker
set search_path = ''
as $$
#variable_conflict use_column
declare
  r tracker.notion_outbox;
  pending_id uuid;
begin
  select * into r from tracker.notion_outbox o where o.id = p_id for update;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if r.status = 'pending' then
    update tracker.notion_outbox o set next_attempt_at = now() where o.id = p_id;
    return query select p_id, 'pending'::text, null::uuid;
    return;
  end if;
  if r.status not in ('failed', 'uncertain') then
    raise exception 'not_retryable';
  end if;

  select o.id into pending_id from tracker.notion_outbox o
    where o.org_id = r.org_id and o.dedupe_key = r.dedupe_key and o.status = 'pending';
  if pending_id is null then
    begin
      update tracker.notion_outbox o
         set status = 'pending', next_attempt_at = now(), last_error = null, attempts = 0,
             lease_until = null, finished_at = null
       where o.id = p_id;
      return query select p_id, 'pending'::text, null::uuid;
      return;
    exception when unique_violation then
      -- A class write enqueued a pending row in between: hand over to it.
      select o.id into pending_id from tracker.notion_outbox o
        where o.org_id = r.org_id and o.dedupe_key = r.dedupe_key and o.status = 'pending';
    end;
  end if;

  update tracker.notion_outbox o
     set status = 'superseded', superseded_by = pending_id, finished_at = now()
   where o.id = p_id;
  update tracker.notion_outbox o set next_attempt_at = now() where o.id = pending_id;
  return query select pending_id, 'pending'::text, p_id;
end;
$$;
revoke all on function tracker.retry_notion_outbox(uuid) from public, anon;
grant execute on function tracker.retry_notion_outbox(uuid) to authenticated;
