-- Scheduler identity (REQ-2, Scheduler 1/8): maps a signed-in login to a
-- canonical Notion Staff record, with an explicit approval by the org owner.
--
-- Scheduler teachers deliberately get NO tracker.memberships row. is_org_staff()
-- treats owner and teacher alike and every grade-tracker policy uses it, so a
-- membership would expose every student's grades. A separate link table keeps
-- the two apart (tracker ADR 0033). Mirrors the student invite flow (ADR 0016):
-- the magic link proves the email, the first sign-in claims the row.
-- Tested by supabase/tests/scheduler_identity.sql.

create table tracker.staff_links (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references tracker.orgs on delete restrict,
  -- The Notion Staff page ID, dashed.
  notion_staff_id uuid not null,
  email text not null check (email = lower(btrim(email)) and email like '%_@_%'),
  -- Set only by claim_staff_link(), never by hand.
  user_id uuid references auth.users on delete set null,
  approved_by uuid not null references auth.users on delete restrict,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Live rows only: a revoked row stays for history and frees the Staff record,
-- the email and the login for a new link.
create unique index staff_links_live_staff_idx on tracker.staff_links (org_id, notion_staff_id) where revoked_at is null;
create unique index staff_links_live_email_idx on tracker.staff_links (org_id, email) where revoked_at is null;
create unique index staff_links_live_user_idx on tracker.staff_links (user_id) where revoked_at is null and user_id is not null;

create trigger staff_links_updated_at before update on tracker.staff_links
  for each row execute function tracker.set_updated_at();
create trigger audit_staff_links after insert or update or delete on tracker.staff_links
  for each row execute function tracker.write_audit();

-- Helpers -------------------------------------------------------------------
-- Security definer so policies and later cards' policies can call them
-- without recursing through RLS.

create or replace function tracker.is_org_owner(target_org uuid)
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
      and m.role = 'owner'
  );
$$;

-- The caller's live Staff ID in that org, or null.
create or replace function tracker.my_staff_id(target_org uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select l.notion_staff_id from tracker.staff_links l
  where l.org_id = target_org
    and l.user_id = (select auth.uid())
    and l.revoked_at is null
  limit 1;
$$;

-- Links the signed-in user to the one live, unclaimed row with their verified
-- email. Never creates rows. Returns 1 when it claimed, else 0.
create or replace function tracker.claim_staff_link()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  mail text := lower(btrim(coalesce((select auth.email()), '')));
  claimed uuid;
begin
  if uid is null or mail = '' then
    return 0;
  end if;
  if exists (select 1 from tracker.staff_links where user_id = uid and revoked_at is null) then
    return 0;
  end if;

  update tracker.staff_links l
     set user_id = uid
   where l.id = (
     select l2.id from tracker.staff_links l2
     where l2.user_id is null
       and l2.revoked_at is null
       and l2.email = mail
     order by l2.created_at
     limit 1
   )
  returning l.id into claimed;

  return case when claimed is null then 0 else 1 end;
end;
$$;

-- RLS -----------------------------------------------------------------------

alter table tracker.staff_links enable row level security;

create policy "owner reads their org's staff links, others their own"
  on tracker.staff_links for select to authenticated
  using (tracker.is_org_owner(org_id) or user_id = (select auth.uid()));

create policy "owner approves staff links"
  on tracker.staff_links for insert to authenticated
  with check (tracker.is_org_owner(org_id) and approved_by = (select auth.uid()));

create policy "owner edits and revokes staff links"
  on tracker.staff_links for update to authenticated
  using (tracker.is_org_owner(org_id))
  with check (tracker.is_org_owner(org_id));

-- No delete policy: revoke instead. user_id is not a granted column, so it is
-- writable only through claim_staff_link().
revoke all on tracker.staff_links from anon, authenticated;
grant select on tracker.staff_links to authenticated;
grant insert (id, org_id, notion_staff_id, email, approved_by) on tracker.staff_links to authenticated;
grant update (email, revoked_at) on tracker.staff_links to authenticated;
grant all on tracker.staff_links to service_role;

revoke all on function tracker.is_org_owner(uuid) from public;
revoke all on function tracker.my_staff_id(uuid) from public;
revoke all on function tracker.claim_staff_link() from public;
grant execute on function tracker.is_org_owner(uuid) to authenticated;
grant execute on function tracker.my_staff_id(uuid) to authenticated;
grant execute on function tracker.claim_staff_link() to authenticated;
