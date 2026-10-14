-- Weekly Schedule import (REQ-4, Scheduler 3/8): one row per student the
-- scheduler has adopted, and one transactional function that adopts a student
-- by creating their class series and the row together. From adoption on the
-- scheduler writes that student's Weekly Schedule text in Notion; this table
-- tracks that write-back. Students are Notion page IDs, as in 0010.
-- Tested by supabase/tests/scheduler_import.sql.

create table tracker.schedule_summaries (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references tracker.orgs on delete restrict,
  -- Notion Students & Parents page ID, not tracker.students.id.
  notion_student_id uuid not null,
  adopted_at timestamptz not null default now(),
  -- The legacy text at import, kept for audit and a manual rollback.
  adopted_from_text text not null,
  last_written_text text,
  last_written_at timestamptz,
  sync_state text not null default 'pending' check (sync_state in ('pending', 'synced', 'failed')),
  -- A short message only, never a Notion payload.
  last_error text check (last_error is null or char_length(last_error) <= 300),
  -- What was in Notion when a sync replaced a hand edit.
  last_drift_text text,
  created_by uuid not null references auth.users on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, notion_student_id)
);

create trigger schedule_summaries_updated_at before update on tracker.schedule_summaries
  for each row execute function tracker.set_updated_at();
create trigger audit_schedule_summaries after insert or update or delete on tracker.schedule_summaries
  for each row execute function tracker.write_audit();
alter table tracker.schedule_summaries enable row level security;

-- Owner only: teachers never read or write summaries. No delete policy.
create policy "owner reads schedule summaries"
  on tracker.schedule_summaries for select to authenticated
  using (tracker.is_org_owner(org_id));
create policy "owner adds schedule summaries"
  on tracker.schedule_summaries for insert to authenticated
  with check (tracker.is_org_owner(org_id) and created_by = (select auth.uid()));
create policy "owner edits schedule summaries"
  on tracker.schedule_summaries for update to authenticated
  using (tracker.is_org_owner(org_id)) with check (tracker.is_org_owner(org_id));

revoke all on tracker.schedule_summaries from anon, authenticated;
grant select on tracker.schedule_summaries to authenticated;
grant insert (id, org_id, notion_student_id, adopted_from_text, created_by) on tracker.schedule_summaries to authenticated;
grant update (last_written_text, last_written_at, sync_state, last_error, last_drift_text) on tracker.schedule_summaries to authenticated;
grant all on tracker.schedule_summaries to service_role;

-- Adopt a student -------------------------------------------------------------
-- One transaction: insert each weekly series (a retried request_id inserts
-- nothing), then the summary row in state 'pending'. If the student is already
-- adopted it returns that row's ID and creates nothing. Security invoker: RLS
-- applies, and a caller who owns no org gets 42501 before anything is written.
-- p_series elements: request_id, staff_id, subject, start_date, start_time,
-- duration_minutes. Every series is weekly with no end date.
create or replace function tracker.adopt_student_schedule(
  p_student_id uuid,
  p_source_text text,
  p_series jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  target_org uuid;
  existing uuid;
  new_id uuid := gen_random_uuid();
  s jsonb;
begin
  select m.org_id into target_org from tracker.memberships m
    where m.user_id = caller and m.role = 'owner' order by m.created_at limit 1;
  if caller is null or target_org is null then
    raise exception 'insufficient_privilege' using errcode = '42501';
  end if;

  select id into existing from tracker.schedule_summaries where org_id = target_org and notion_student_id = p_student_id;
  if existing is not null then
    return existing;
  end if;

  for s in select * from jsonb_array_elements(coalesce(p_series, '[]'::jsonb)) loop
    insert into tracker.class_series (
      org_id, request_id, notion_staff_id, notion_student_id, subject, kind,
      start_date, start_time, duration_minutes, created_by
    ) values (
      target_org, (s ->> 'request_id')::uuid, (s ->> 'staff_id')::uuid, p_student_id, s ->> 'subject', 'weekly',
      (s ->> 'start_date')::date, (s ->> 'start_time')::time, (s ->> 'duration_minutes')::smallint, caller
    ) on conflict (org_id, request_id) do nothing;
  end loop;

  insert into tracker.schedule_summaries (id, org_id, notion_student_id, adopted_from_text, created_by)
    values (new_id, target_org, p_student_id, p_source_text, caller);
  return new_id;
end;
$$;

revoke all on function tracker.adopt_student_schedule(uuid, text, jsonb) from public;
grant execute on function tracker.adopt_student_schedule(uuid, text, jsonb) to authenticated;
