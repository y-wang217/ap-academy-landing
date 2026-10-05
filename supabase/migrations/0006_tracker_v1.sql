-- Student Tracker v1 (build step 8): priority suggestions, student grade
-- flags and AI draft records.
--   * tasks.suggestion_key: which rule suggested a task (tracker ADR 0024).
--   * grade_flags: a student's fixed-reason flag on one of their own grades,
--     resolved by staff (tracker ADR 0025). Students write it only through
--     two security-definer functions (tracker ADR 0015).
--   * ai_drafts: one row per AI draft request, for the per-org daily limit and
--     for confirm to load the validated draft (tracker ADR 0026). The full
--     pasted text is never stored, only each change's source line, after
--     names and emails were removed.
-- Tested by supabase/tests/tracker_v1.sql.

-- Suggestions -------------------------------------------------------------------

alter table tracker.tasks
  add column suggestion_key text check (length(suggestion_key) between 1 and 200);

create index tasks_suggestion_key_idx on tracker.tasks (student_id, suggestion_key)
  where suggestion_key is not null;

-- Grade flags ---------------------------------------------------------------------

create type tracker.flag_reason as enum ('score_differs', 'returned', 'other');

-- Target of the composite foreign key below (tracker ADR 0014).
alter table tracker.assessments
  add constraint assessments_id_student_key unique (id, student_id);

create table tracker.grade_flags (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  student_id uuid not null,
  assessment_id uuid not null,
  reason tracker.flag_reason not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references auth.users on delete set null,
  foreign key (assessment_id, student_id) references tracker.assessments (id, student_id) on delete cascade,
  foreign key (student_id, org_id) references tracker.students (id, org_id) on delete cascade
);

-- At most one open flag per assessment.
create unique index grade_flags_one_open_idx on tracker.grade_flags (assessment_id)
  where resolved_at is null;
create index grade_flags_org_open_idx on tracker.grade_flags (org_id)
  where resolved_at is null;

create trigger grade_flags_updated_at before update on tracker.grade_flags
  for each row execute function tracker.set_updated_at();

-- Who resolved a flag comes from the session, not from the app.
create or replace function tracker.stamp_flag_resolved()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.resolved_at is null then
    new.resolved_by := null;
  elsif old.resolved_at is null then
    new.resolved_by := (select auth.uid());
  else
    new.resolved_at := old.resolved_at;
    new.resolved_by := old.resolved_by;
  end if;
  return new;
end;
$$;

create trigger grade_flags_resolved before update on tracker.grade_flags
  for each row execute function tracker.stamp_flag_resolved();

create trigger audit_grade_flags after insert or update or delete on tracker.grade_flags
  for each row execute function tracker.write_audit();

alter table tracker.grade_flags enable row level security;

create policy "staff read grade_flags" on tracker.grade_flags
  for select to authenticated using (tracker.is_org_staff(org_id));
create policy "staff update grade_flags" on tracker.grade_flags
  for update to authenticated
  using (tracker.is_org_staff(org_id)) with check (tracker.is_org_staff(org_id));
create policy "student reads own grade_flags" on tracker.grade_flags
  for select to authenticated using (tracker.is_my_published_student(student_id));

-- Raise or change the open flag on one of the caller's own assessments.
create or replace function tracker.flag_assessment(assessment_id uuid, reason tracker.flag_reason)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  target record;
  flag_id uuid;
begin
  select a.id, a.org_id, a.student_id into target
    from tracker.assessments a
    join tracker.students s on s.id = a.student_id
   where a.id = flag_assessment.assessment_id
     and s.user_id = (select auth.uid())
     and s.published_at is not null
     and s.status <> 'archived';
  if target.id is null then
    raise exception 'assessment not found' using errcode = 'no_data_found';
  end if;

  update tracker.grade_flags f
     set reason = flag_assessment.reason
   where f.assessment_id = target.id and f.resolved_at is null
  returning f.id into flag_id;
  if flag_id is null then
    insert into tracker.grade_flags (org_id, student_id, assessment_id, reason)
    values (target.org_id, target.student_id, target.id, flag_assessment.reason)
    returning id into flag_id;
  end if;
  return flag_id;
end;
$$;

-- Withdraw the caller's open flag. Resolved flags stay as history.
create or replace function tracker.unflag_assessment(assessment_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from tracker.grade_flags f
   where f.assessment_id = unflag_assessment.assessment_id
     and f.resolved_at is null
     and exists (
       select 1 from tracker.students s
       where s.id = f.student_id
         and s.user_id = (select auth.uid())
         and s.published_at is not null
         and s.status <> 'archived'
     );
  if not found then
    raise exception 'flag not found' using errcode = 'no_data_found';
  end if;
end;
$$;

-- AI drafts ---------------------------------------------------------------------

create table tracker.ai_drafts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  student_id uuid not null,
  course_id uuid not null,
  requested_by uuid not null default auth.uid() references auth.users on delete restrict,
  input_chars integer not null check (input_chars between 1 and 100000),
  status text not null default 'requested' check (status in ('requested', 'drafted', 'failed', 'applied', 'discarded')),
  model text check (length(model) <= 100),
  input_tokens integer check (input_tokens >= 0),
  output_tokens integer check (output_tokens >= 0),
  draft jsonb,
  error text check (length(error) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (course_id, student_id) references tracker.courses (id, student_id) on delete cascade,
  foreign key (student_id, org_id) references tracker.students (id, org_id) on delete cascade
);

create index ai_drafts_org_created_idx on tracker.ai_drafts (org_id, created_at desc);

create trigger ai_drafts_updated_at before update on tracker.ai_drafts
  for each row execute function tracker.set_updated_at();

alter table tracker.ai_drafts enable row level security;

-- Staff only. requested_by must be the caller, so the daily count can't be
-- dodged by writing someone else's id.
create policy "staff read ai_drafts" on tracker.ai_drafts
  for select to authenticated using (tracker.is_org_staff(org_id));
create policy "staff create ai_drafts" on tracker.ai_drafts
  for insert to authenticated
  with check (tracker.is_org_staff(org_id) and requested_by = (select auth.uid()));
create policy "staff update ai_drafts" on tracker.ai_drafts
  for update to authenticated
  using (tracker.is_org_staff(org_id)) with check (tracker.is_org_staff(org_id));

-- Grants ---------------------------------------------------------------------------

grant select on tracker.grade_flags to authenticated;
grant update (resolved_at) on tracker.grade_flags to authenticated;
grant select on tracker.ai_drafts to authenticated;
grant insert (org_id, student_id, course_id, input_chars) on tracker.ai_drafts to authenticated;
grant update (status, model, input_tokens, output_tokens, draft, error) on tracker.ai_drafts to authenticated;
grant all on tracker.grade_flags, tracker.ai_drafts to service_role;

revoke all on function tracker.stamp_flag_resolved() from public;
revoke all on function tracker.flag_assessment(uuid, tracker.flag_reason) from public;
revoke all on function tracker.unflag_assessment(uuid) from public;
grant execute on function tracker.flag_assessment(uuid, tracker.flag_reason) to authenticated;
grant execute on function tracker.unflag_assessment(uuid) to authenticated;
