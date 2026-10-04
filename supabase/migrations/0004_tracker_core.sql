-- Student Tracker core schema (tracker CLAUDE.md "Data model", step 2).
--
-- Every child row carries org_id and student_id, and composite foreign keys
-- make an inconsistent copy impossible (tracker ADR 0014). RLS policies then
-- check one row's own columns:
--   * staff (owner, teacher) in the row's org may read and write it;
--   * a student may read rows of their own student record, once published;
--   * students never write tables directly. They mark work done through two
--     security-definer functions that touch only the done timestamp
--     (tracker ADR 0015).
-- Tested by supabase/tests/tracker.sql.

-- Helpers -------------------------------------------------------------------
-- Security definer so policies can call them without recursing through RLS.

create or replace function tracker.is_org_staff(target_org uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from tracker.memberships m
    where m.org_id = target_org
      and m.user_id = (select auth.uid())
      and m.role in ('owner', 'teacher')
  );
$$;

create or replace function tracker.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- Types ---------------------------------------------------------------------

create type tracker.student_status as enum ('setup', 'active', 'archived');
create type tracker.course_status as enum ('planned', 'active', 'completed');
create type tracker.aggregation_method as enum ('mean_of_percentages', 'pooled_points');
create type tracker.task_kind as enum ('school', 'supplemental');

-- Tables --------------------------------------------------------------------

-- Minimal PII only (tracker ADR 0012): first name, last initial, grade level,
-- email. user_id is linked by tracker.claim_student_invites(), never by hand.
create table tracker.students (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references tracker.orgs on delete restrict,
  teacher_id uuid not null references auth.users on delete restrict,
  user_id uuid unique references auth.users on delete set null,
  email text not null check (email = lower(btrim(email)) and email like '%_@_%'),
  first_name text not null check (length(btrim(first_name)) between 1 and 50),
  last_initial text not null check (last_initial ~ '^[A-Z]$'),
  grade_level smallint not null check (grade_level between 9 and 12),
  status tracker.student_status not null default 'setup',
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, org_id),
  unique (org_id, email)
);

-- One goal per student (tracker ADR 0021).
create table tracker.goals (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  student_id uuid not null unique,
  school text not null check (length(btrim(school)) between 1 and 120),
  program text not null check (length(btrim(program)) between 1 and 120),
  application_year smallint check (application_year between 2020 and 2100),
  target_six_avg numeric(5, 2) not null check (target_six_avg between 0 and 100),
  benchmark_note text check (length(benchmark_note) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (student_id, org_id) references tracker.students (id, org_id) on delete cascade
);

create table tracker.courses (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  student_id uuid not null,
  code text not null check (length(btrim(code)) between 1 and 20),
  name text not null check (length(btrim(name)) between 1 and 120),
  term text not null default '' check (length(term) <= 40),
  status tracker.course_status not null default 'active',
  in_six_plan boolean not null default true,
  target_grade numeric(5, 2) check (target_grade between 0 and 100),
  active_syllabus_version_id uuid,
  position smallint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, student_id),
  foreign key (student_id, org_id) references tracker.students (id, org_id) on delete cascade
);

create table tracker.syllabus_versions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  student_id uuid not null,
  course_id uuid not null,
  version integer not null check (version >= 1),
  confirmed_by uuid references auth.users on delete set null,
  confirmed_at timestamptz,
  notes text check (length(notes) <= 500),
  created_at timestamptz not null default now(),
  unique (course_id, version),
  unique (id, course_id),
  foreign key (course_id, student_id) references tracker.courses (id, student_id) on delete cascade,
  foreign key (student_id, org_id) references tracker.students (id, org_id) on delete cascade
);

alter table tracker.courses
  add constraint courses_active_syllabus_version_fkey
  foreign key (active_syllabus_version_id, id)
  references tracker.syllabus_versions (id, course_id)
  deferrable initially deferred;

create table tracker.categories (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  student_id uuid not null,
  course_id uuid not null,
  syllabus_version_id uuid not null,
  name text not null check (length(btrim(name)) between 1 and 60),
  weight numeric(7, 3) not null check (weight between 0 and 100),
  aggregation_method tracker.aggregation_method not null default 'mean_of_percentages',
  needs_review boolean not null default false,
  position smallint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, course_id),
  foreign key (syllabus_version_id, course_id) references tracker.syllabus_versions (id, course_id) on delete cascade,
  foreign key (course_id, student_id) references tracker.courses (id, student_id) on delete cascade,
  foreign key (student_id, org_id) references tracker.students (id, org_id) on delete cascade
);

-- Unmarked (null) is not zero; excused is neither (tracker ADR 0007). Done
-- never awards marks: student_done_at and score_earned are independent
-- (tracker ADR 0008). graded_at is maintained by a trigger.
create table tracker.assessments (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  student_id uuid not null,
  course_id uuid not null,
  category_id uuid not null,
  title text not null check (length(btrim(title)) between 1 and 120),
  due_date date,
  student_done_at timestamptz,
  score_earned numeric(8, 3) check (score_earned >= 0),
  score_possible numeric(8, 3) not null check (score_possible > 0),
  excused boolean not null default false,
  graded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (category_id, course_id) references tracker.categories (id, course_id) on delete restrict,
  foreign key (course_id, student_id) references tracker.courses (id, student_id) on delete cascade,
  foreign key (student_id, org_id) references tracker.students (id, org_id) on delete cascade
);

create table tracker.tasks (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  student_id uuid not null,
  course_id uuid,
  title text not null check (length(btrim(title)) between 1 and 160),
  kind tracker.task_kind not null default 'school',
  pinned boolean not null default false,
  rank integer not null default 0,
  reason text check (length(reason) <= 300),
  done_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (course_id, student_id) references tracker.courses (id, student_id) on delete cascade,
  foreign key (student_id, org_id) references tracker.students (id, org_id) on delete cascade
);

create index students_org_idx on tracker.students (org_id);
create index courses_student_idx on tracker.courses (student_id);
create index syllabus_versions_course_idx on tracker.syllabus_versions (course_id);
create index categories_version_idx on tracker.categories (syllabus_version_id);
create index assessments_course_idx on tracker.assessments (course_id);
create index assessments_student_due_idx on tracker.assessments (student_id, due_date);
create index tasks_student_idx on tracker.tasks (student_id);

-- Student-side helper, defined once students exists.

create or replace function tracker.is_my_published_student(target_student uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from tracker.students s
    where s.id = target_student
      and s.user_id = (select auth.uid())
      and s.published_at is not null
  );
$$;

-- Integrity triggers ----------------------------------------------------------

create trigger students_updated_at before update on tracker.students
  for each row execute function tracker.set_updated_at();
create trigger goals_updated_at before update on tracker.goals
  for each row execute function tracker.set_updated_at();
create trigger courses_updated_at before update on tracker.courses
  for each row execute function tracker.set_updated_at();
create trigger categories_updated_at before update on tracker.categories
  for each row execute function tracker.set_updated_at();
create trigger assessments_updated_at before update on tracker.assessments
  for each row execute function tracker.set_updated_at();
create trigger tasks_updated_at before update on tracker.tasks
  for each row execute function tracker.set_updated_at();

-- graded_at follows the score: set when a score is entered or changed,
-- cleared when the score is removed.
create or replace function tracker.stamp_graded_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.score_earned is null then
    new.graded_at := null;
  elsif tg_op = 'INSERT'
     or new.score_earned is distinct from old.score_earned
     or new.score_possible is distinct from old.score_possible then
    new.graded_at := now();
  end if;
  return new;
end;
$$;

create trigger assessments_graded_at before insert or update on tracker.assessments
  for each row execute function tracker.stamp_graded_at();

-- A confirmed syllabus version is history: its categories are read-only, and
-- it can only be confirmed when its weights sum to 100 (tracker ADRs 0009,
-- 0018). A new version is how weights change after publish.
create or replace function tracker.guard_confirmed_categories()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  version_ids uuid[];
begin
  if tg_op = 'DELETE' then
    version_ids := array[old.syllabus_version_id];
  elsif tg_op = 'UPDATE' then
    version_ids := array[old.syllabus_version_id, new.syllabus_version_id];
  else
    version_ids := array[new.syllabus_version_id];
  end if;
  if exists (
    select 1 from tracker.syllabus_versions v
    where v.id = any (version_ids) and v.confirmed_at is not null
  ) then
    raise exception 'categories of a confirmed syllabus version are read-only'
      using errcode = 'check_violation';
  end if;
  return coalesce(new, old);
end;
$$;

create trigger categories_confirmed_guard
  before insert or update or delete on tracker.categories
  for each row execute function tracker.guard_confirmed_categories();

create or replace function tracker.guard_syllabus_confirm()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  total numeric;
begin
  if old.confirmed_at is not null then
    raise exception 'a confirmed syllabus version is read-only'
      using errcode = 'check_violation';
  end if;
  if new.confirmed_at is not null then
    select coalesce(sum(c.weight), 0) into total
    from tracker.categories c where c.syllabus_version_id = new.id;
    if abs(total - 100) > 0.001 then
      raise exception 'category weights must sum to 100 (got %)', total
        using errcode = 'check_violation';
    end if;
  end if;
  return new;
end;
$$;

create trigger syllabus_versions_confirm_guard
  before update on tracker.syllabus_versions
  for each row execute function tracker.guard_syllabus_confirm();

-- Row level security ------------------------------------------------------------

alter table tracker.students enable row level security;
alter table tracker.goals enable row level security;
alter table tracker.courses enable row level security;
alter table tracker.syllabus_versions enable row level security;
alter table tracker.categories enable row level security;
alter table tracker.assessments enable row level security;
alter table tracker.tasks enable row level security;

-- Students: staff in the org manage them; a student reads their own record
-- once published. No delete policy: students are archived, never deleted.
create policy "staff read students" on tracker.students
  for select to authenticated using (tracker.is_org_staff(org_id));
create policy "staff create students" on tracker.students
  for insert to authenticated with check (tracker.is_org_staff(org_id));
create policy "staff update students" on tracker.students
  for update to authenticated
  using (tracker.is_org_staff(org_id)) with check (tracker.is_org_staff(org_id));
create policy "student reads own published record" on tracker.students
  for select to authenticated
  using (user_id = (select auth.uid()) and published_at is not null);

-- Every child table gets the same four staff policies and one student read
-- policy. Written out per table so each is visible in the schema.
do $$
declare
  t text;
begin
  foreach t in array array['goals', 'courses', 'syllabus_versions', 'categories', 'assessments', 'tasks'] loop
    execute format(
      'create policy "staff read %1$s" on tracker.%1$I for select to authenticated using (tracker.is_org_staff(org_id))', t);
    execute format(
      'create policy "staff create %1$s" on tracker.%1$I for insert to authenticated with check (tracker.is_org_staff(org_id))', t);
    execute format(
      'create policy "staff update %1$s" on tracker.%1$I for update to authenticated using (tracker.is_org_staff(org_id)) with check (tracker.is_org_staff(org_id))', t);
    execute format(
      'create policy "staff delete %1$s" on tracker.%1$I for delete to authenticated using (tracker.is_org_staff(org_id))', t);
    execute format(
      'create policy "student reads own %1$s" on tracker.%1$I for select to authenticated using (tracker.is_my_published_student(student_id))', t);
  end loop;
end;
$$;

-- Student actions (tracker ADR 0015) ----------------------------------------------

create or replace function tracker.set_assessment_done(assessment_id uuid, done boolean)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  result timestamptz;
begin
  update tracker.assessments a
     set student_done_at = case when done then coalesce(a.student_done_at, now()) else null end
   where a.id = assessment_id
     and exists (
       select 1 from tracker.students s
       where s.id = a.student_id
         and s.user_id = (select auth.uid())
         and s.published_at is not null
         and s.status <> 'archived'
     )
  returning a.student_done_at into result;
  if not found then
    raise exception 'assessment not found' using errcode = 'no_data_found';
  end if;
  return result;
end;
$$;

create or replace function tracker.set_task_done(task_id uuid, done boolean)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  result timestamptz;
begin
  update tracker.tasks t
     set done_at = case when done then coalesce(t.done_at, now()) else null end
   where t.id = task_id
     and exists (
       select 1 from tracker.students s
       where s.id = t.student_id
         and s.user_id = (select auth.uid())
         and s.published_at is not null
         and s.status <> 'archived'
     )
  returning t.done_at into result;
  if not found then
    raise exception 'task not found' using errcode = 'no_data_found';
  end if;
  return result;
end;
$$;

-- Invite claim (tracker ADR 0016): links the signed-in user to an unclaimed,
-- published student record with the same (verified, magic-link) email, and
-- adds a student membership. A login links to at most one student record.
create or replace function tracker.claim_student_invites()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  mail text := lower(btrim(coalesce((select auth.email()), '')));
  claimed_org uuid;
begin
  if uid is null or mail = '' then
    return 0;
  end if;
  if exists (select 1 from tracker.students where user_id = uid) then
    return 0;
  end if;

  update tracker.students s
     set user_id = uid
   where s.id = (
     select s2.id from tracker.students s2
     where s2.user_id is null
       and s2.email = mail
       and s2.published_at is not null
       and s2.status <> 'archived'
     order by s2.published_at
     limit 1
   )
  returning s.org_id into claimed_org;

  if claimed_org is null then
    return 0;
  end if;

  insert into tracker.memberships (user_id, org_id, role)
  values (uid, claimed_org, 'student')
  on conflict (user_id, org_id) do nothing;
  return 1;
end;
$$;

-- Grants ---------------------------------------------------------------------
-- RLS narrows every grant to the caller's rows. user_id on students is not
-- writable by any API role: only claim_student_invites() sets it.

grant select, insert, update, delete
  on tracker.goals, tracker.courses, tracker.syllabus_versions,
     tracker.categories, tracker.assessments, tracker.tasks
  to authenticated;
grant select on tracker.students to authenticated;
grant insert (id, org_id, teacher_id, email, first_name, last_initial, grade_level, status)
  on tracker.students to authenticated;
grant update (teacher_id, email, first_name, last_initial, grade_level, status, published_at)
  on tracker.students to authenticated;
grant all on all tables in schema tracker to service_role;

revoke all on function tracker.is_org_staff(uuid) from public;
revoke all on function tracker.is_my_published_student(uuid) from public;
revoke all on function tracker.set_assessment_done(uuid, boolean) from public;
revoke all on function tracker.set_task_done(uuid, boolean) from public;
revoke all on function tracker.claim_student_invites() from public;
grant execute on function tracker.is_org_staff(uuid) to authenticated;
grant execute on function tracker.is_my_published_student(uuid) to authenticated;
grant execute on function tracker.set_assessment_done(uuid, boolean) to authenticated;
grant execute on function tracker.set_task_done(uuid, boolean) to authenticated;
grant execute on function tracker.claim_student_invites() to authenticated;
