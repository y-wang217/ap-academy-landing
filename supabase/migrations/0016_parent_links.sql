-- REQ-22 (Parent 1/4): parent accounts linked to students, read-only.
-- Tested by supabase/tests/parent_links.sql. Tracker ADR 0045 and 0046.
--
-- A parent reads the published rows of their linked children and writes
-- nothing. The only write paths are the owner's insert on parent_links and
-- tracker.remove_parent_link(). Only plpgsql bodies mention the 'parent'
-- literal, so this file also applies if run in one transaction with 0015.

-- The Notion Students & Parents page ID, the same key as class_series.notion_student_id.
alter table tracker.students add column notion_student_id uuid;
alter table tracker.students
  add constraint students_org_notion_student_key unique (org_id, notion_student_id);
grant update (notion_student_id) on tracker.students to authenticated;

create table tracker.parent_links (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references tracker.orgs on delete restrict,
  student_id uuid not null,
  email text not null check (email = lower(btrim(email)) and email like '%_@_%'),
  parent_user_id uuid references auth.users on delete cascade,
  claimed_at timestamptz,
  invited_by uuid not null references auth.users on delete restrict,
  created_at timestamptz not null default now(),
  foreign key (student_id, org_id) references tracker.students (id, org_id) on delete restrict,
  unique (student_id, email),
  check ((parent_user_id is null) = (claimed_at is null))
);
create index parent_links_parent_idx on tracker.parent_links (parent_user_id);
create index parent_links_org_idx on tracker.parent_links (org_id);

create trigger audit_parent_links after insert or update or delete on tracker.parent_links
  for each row execute function tracker.write_audit();

-- A parent address may not equal a student address in the org: the student
-- claim would take that login first (ADR 0044).
create or replace function tracker.guard_parent_email()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1 from tracker.students s
    where s.org_id = new.org_id and s.email = new.email
  ) then
    raise exception 'that email belongs to a student' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;
create trigger parent_links_guard_email before insert on tracker.parent_links
  for each row execute function tracker.guard_parent_email();

alter table tracker.parent_links enable row level security;

create policy "owner reads parent_links" on tracker.parent_links
  for select to authenticated using (tracker.is_org_owner(org_id));
create policy "parent reads own parent_links" on tracker.parent_links
  for select to authenticated using (parent_user_id = (select auth.uid()));
create policy "owner adds parent_links" on tracker.parent_links
  for insert to authenticated
  with check (tracker.is_org_owner(org_id) and invited_by = (select auth.uid())
              and parent_user_id is null);

grant select on tracker.parent_links to authenticated;
grant insert (id, org_id, student_id, email, invited_by) on tracker.parent_links to authenticated;
grant all on tracker.parent_links to service_role;

-- Helpers ---------------------------------------------------------------------

create or replace function tracker.is_my_linked_student(target_student uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from tracker.parent_links pl
      join tracker.students s on s.id = pl.student_id and s.org_id = pl.org_id
     where pl.parent_user_id = (select auth.uid())
       and pl.student_id = target_student
       and s.published_at is not null
  );
$$;

create or replace function tracker.is_my_childs_schedule(target_org uuid, target_notion uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select target_notion is not null and exists (
    select 1
      from tracker.parent_links pl
      join tracker.students s on s.id = pl.student_id and s.org_id = pl.org_id
     where pl.parent_user_id = (select auth.uid())
       and pl.org_id = target_org
       and s.notion_student_id = target_notion
       and s.published_at is not null
  );
$$;

-- Read policies: select only, published linked children only ---------------------

create policy "parent reads linked students" on tracker.students
  for select to authenticated using (tracker.is_my_linked_student(id));

do $$
declare t text;
begin
  foreach t in array array['goals', 'courses', 'syllabus_versions', 'categories', 'assessments', 'tasks'] loop
    execute format(
      'create policy "parent reads linked %1$s" on tracker.%1$I for select to authenticated using (tracker.is_my_linked_student(student_id))', t);
  end loop;
end $$;

create policy "parent reads linked class_series" on tracker.class_series
  for select to authenticated
  using (tracker.is_my_childs_schedule(org_id, notion_student_id));

create or replace function tracker.is_my_childs_series(target_series uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from tracker.class_series cs
     where cs.id = target_series
       and tracker.is_my_childs_schedule(cs.org_id, cs.notion_student_id)
  );
$$;

create policy "parent reads linked class_exceptions" on tracker.class_exceptions
  for select to authenticated using (tracker.is_my_childs_series(series_id));

-- Claim, list, remove ---------------------------------------------------------

-- Links every unclaimed row whose email equals the verified login email, in any
-- org, published child or not. Returns how many rows it claimed.
create or replace function tracker.claim_parent_invites()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  mail text := lower(btrim(coalesce((select auth.email()), '')));
  n integer;
begin
  if uid is null or mail = '' then
    return 0;
  end if;

  with claimed as (
    update tracker.parent_links pl
       set parent_user_id = uid, claimed_at = now()
     where pl.parent_user_id is null and pl.email = mail
    returning pl.org_id
  ), orgs as (
    select distinct org_id from claimed
  ), added as (
    insert into tracker.memberships (user_id, org_id, role)
    select uid, o.org_id, 'parent' from orgs o
    on conflict (user_id, org_id) do nothing
    returning 1
  )
  select count(*) into n from claimed;
  return coalesce(n, 0);
end;
$$;

create or replace function tracker.my_children()
returns table (id uuid, org_id uuid, first_name text, last_initial text, published boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select s.id, s.org_id, s.first_name, s.last_initial, (s.published_at is not null)
    from tracker.parent_links pl
    join tracker.students s on s.id = pl.student_id and s.org_id = pl.org_id
   where pl.parent_user_id = (select auth.uid())
   order by s.first_name, s.id;
$$;

create or replace function tracker.remove_parent_link(link_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  l record;
  removed tracker.memberships;
begin
  select pl.id, pl.org_id, pl.parent_user_id into l
    from tracker.parent_links pl
   where pl.id = remove_parent_link.link_id
   for update;

  -- Same error for a missing row and a foreign org, so ids are not probeable.
  if not found or not tracker.is_org_owner(l.org_id) then
    raise exception 'only an owner of this org can remove a parent'
      using errcode = 'insufficient_privilege';
  end if;

  delete from tracker.parent_links where id = l.id;

  if l.parent_user_id is not null and not exists (
    select 1 from tracker.parent_links o
     where o.org_id = l.org_id and o.parent_user_id = l.parent_user_id
  ) then
    delete from tracker.memberships m
     where m.user_id = l.parent_user_id and m.org_id = l.org_id and m.role = 'parent'
    returning m.* into removed;
    if found then
      insert into tracker.audit_log (org_id, actor_id, table_name, row_id, action, before, after)
      values (l.org_id, (select auth.uid()), 'memberships', l.parent_user_id::text, 'DELETE',
              to_jsonb(removed), null);
    end if;
  end if;
end;
$$;

revoke all on function tracker.guard_parent_email() from public, anon, authenticated;
revoke all on function tracker.is_my_linked_student(uuid) from public, anon;
revoke all on function tracker.is_my_childs_schedule(uuid, uuid) from public, anon;
revoke all on function tracker.is_my_childs_series(uuid) from public, anon;
revoke all on function tracker.claim_parent_invites() from public, anon;
revoke all on function tracker.my_children() from public, anon;
revoke all on function tracker.remove_parent_link(uuid) from public, anon;
grant execute on function tracker.is_my_linked_student(uuid) to authenticated;
grant execute on function tracker.is_my_childs_schedule(uuid, uuid) to authenticated;
grant execute on function tracker.is_my_childs_series(uuid) to authenticated;
grant execute on function tracker.claim_parent_invites() to authenticated;
grant execute on function tracker.my_children() to authenticated;
grant execute on function tracker.remove_parent_link(uuid) to authenticated;
