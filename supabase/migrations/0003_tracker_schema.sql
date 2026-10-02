-- Student Tracker: its own schema (ADR 0002), starting with the two tables the
-- placeholder page needs. Everything else in the tracker data model arrives in
-- later migrations, each with its own RLS.
--
-- Permissions come only from tracker.memberships. There is no global role.
-- Writes have no policies yet, so only the service role and the SQL editor can
-- create orgs and memberships. Teacher-facing write policies come with the
-- teacher flows.
--
-- After applying this to the live project, add `tracker` under
-- API settings > Exposed schemas, or supabase-js cannot reach these tables.

create schema if not exists tracker;

create type tracker.membership_role as enum ('owner', 'teacher', 'student');

create table tracker.orgs (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  logo_url text,
  created_at timestamptz not null default now()
);

create table tracker.memberships (
  user_id uuid not null references auth.users on delete cascade,
  org_id uuid not null references tracker.orgs on delete cascade,
  role tracker.membership_role not null,
  created_at timestamptz not null default now(),
  primary key (user_id, org_id)
);

create index memberships_org_idx on tracker.memberships (org_id);

-- Row level security -------------------------------------------------------
-- Verified by supabase/tests/rls.sql: a user reads only their own
-- memberships, and only the orgs they belong to.

alter table tracker.orgs enable row level security;
alter table tracker.memberships enable row level security;

create policy "memberships are self-readable"
  on tracker.memberships for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "orgs are readable by their members"
  on tracker.orgs for select
  to authenticated
  using (
    exists (
      select 1 from tracker.memberships m
      where m.org_id = orgs.id and m.user_id = (select auth.uid())
    )
  );

-- Grants -------------------------------------------------------------------
-- New schemas get no default grants. Signed-in users may read (RLS narrows
-- it to their rows); anonymous requests get nothing.

grant usage on schema tracker to authenticated, service_role;
grant select on all tables in schema tracker to authenticated;
grant all on all tables in schema tracker to service_role;
