-- One-off, after 0003 and 0004 are applied to the live project: create the
-- AP Academy org and make Charlie its owner (tracker ADR 0003). There is no UI
-- for this by design (multi-teacher management is out of scope). Safe to run
-- twice: it does nothing if the org already exists.
--
-- The owner must have signed in at least once, so the auth.users row exists.

do $$
declare
  owner uuid := (select id from auth.users where email = 'y.wang217@gmail.com');
  org uuid;
begin
  if owner is null then
    raise exception 'Sign in once at www.apacademy.ca/login with y.wang217@gmail.com, then rerun.';
  end if;
  select id into org from tracker.orgs where name = 'AP Academy';
  if org is null then
    insert into tracker.orgs (name) values ('AP Academy') returning id into org;
  end if;
  insert into tracker.memberships (user_id, org_id, role)
  values (owner, org, 'owner')
  on conflict (user_id, org_id) do update set role = 'owner';
end;
$$;
