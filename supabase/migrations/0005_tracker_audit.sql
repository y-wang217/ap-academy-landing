-- Append-only audit log for the tracker (tracker ADR 0009, plan item 7).
--
-- Written only by triggers, so changes made by the app, by scripts and by
-- hand in the SQL editor are all recorded. Staff read their own org's
-- history. Nobody, not even the service role or the table owner, can update,
-- delete or truncate it.
-- Tested by supabase/tests/audit.sql.

create table tracker.audit_log (
  id bigint generated always as identity primary key,
  org_id uuid not null,
  -- null when the change did not come through a signed-in request (SQL
  -- editor, migrations, service role).
  actor_id uuid,
  table_name text not null,
  row_id text not null,
  action text not null check (action in ('INSERT', 'UPDATE', 'DELETE')),
  before jsonb,
  after jsonb,
  at timestamptz not null default now()
);

create index audit_log_org_at_idx on tracker.audit_log (org_id, at desc);
create index audit_log_row_idx on tracker.audit_log (table_name, row_id);

create or replace function tracker.write_audit()
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
  -- An update that only moved updated_at is not a change worth recording.
  if tg_op = 'UPDATE' and (before_row - 'updated_at') = (after_row - 'updated_at') then
    return null;
  end if;
  insert into tracker.audit_log (org_id, actor_id, table_name, row_id, action, before, after)
  values (
    (source ->> 'org_id')::uuid,
    (select auth.uid()),
    tg_table_name,
    source ->> 'id',
    tg_op,
    before_row,
    after_row
  );
  return null;
end;
$$;

-- Grades, syllabus and targets (the plan's list), plus the rest of the
-- student record so the history is complete.
create trigger audit_students after insert or update or delete on tracker.students
  for each row execute function tracker.write_audit();
create trigger audit_goals after insert or update or delete on tracker.goals
  for each row execute function tracker.write_audit();
create trigger audit_courses after insert or update or delete on tracker.courses
  for each row execute function tracker.write_audit();
create trigger audit_syllabus_versions after insert or update or delete on tracker.syllabus_versions
  for each row execute function tracker.write_audit();
create trigger audit_categories after insert or update or delete on tracker.categories
  for each row execute function tracker.write_audit();
create trigger audit_assessments after insert or update or delete on tracker.assessments
  for each row execute function tracker.write_audit();
create trigger audit_tasks after insert or update or delete on tracker.tasks
  for each row execute function tracker.write_audit();

-- Append-only, for every role.
create or replace function tracker.refuse_audit_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'tracker.audit_log is append-only' using errcode = 'insufficient_privilege';
end;
$$;

create trigger audit_log_append_only before update or delete on tracker.audit_log
  for each row execute function tracker.refuse_audit_change();
create trigger audit_log_no_truncate before truncate on tracker.audit_log
  for each statement execute function tracker.refuse_audit_change();

alter table tracker.audit_log enable row level security;

create policy "staff read their org's audit log" on tracker.audit_log
  for select to authenticated using (tracker.is_org_staff(org_id));

revoke all on tracker.audit_log from anon, authenticated;
grant select on tracker.audit_log to authenticated;
grant select on tracker.audit_log to service_role;
revoke all on function tracker.write_audit() from public;
revoke all on function tracker.refuse_audit_change() from public;
