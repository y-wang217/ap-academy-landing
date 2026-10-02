-- RLS checks for every table, run by run-rls.sh after all migrations apply.
-- Each check raises on failure, so psql exits non-zero (ON_ERROR_STOP).

\set ON_ERROR_STOP on

-- Two users signing up. The existing trigger must create their profiles.
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000000a', 'a@example.com', '{"marketing_consent": true}'),
  ('00000000-0000-0000-0000-00000000000b', 'b@example.com', '{}');

do $$ begin
  if (select count(*) from public.profiles) <> 2 then
    raise exception 'signup trigger: expected 2 profiles rows';
  end if;
  if not (select marketing_consent from public.profiles where email = 'a@example.com') then
    raise exception 'signup trigger: consent from metadata was not recorded';
  end if;
  raise notice 'ok: a new signup produces a profiles row';
end $$;

insert into public.attempts (user_id, word_id, correct) values
  ('00000000-0000-0000-0000-00000000000a', 1, true),
  ('00000000-0000-0000-0000-00000000000b', 2, false);

insert into tracker.orgs (id, name) values
  ('10000000-0000-0000-0000-000000000001', 'Org One'),
  ('10000000-0000-0000-0000-000000000002', 'Org Two');
insert into tracker.memberships (user_id, org_id, role) values
  ('00000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-000000000001', 'teacher'),
  ('00000000-0000-0000-0000-00000000000b', '10000000-0000-0000-0000-000000000002', 'student');

-- Signed in as user A ------------------------------------------------------
set role authenticated;
set request.jwt.claims = '{"sub": "00000000-0000-0000-0000-00000000000a", "role": "authenticated"}';

do $$ begin
  if (select count(*) from public.profiles) <> 1
     or (select email from public.profiles) <> 'a@example.com' then
    raise exception 'profiles: A can see rows other than their own';
  end if;
  if (select count(*) from public.attempts) <> 1 then
    raise exception 'attempts: A can see rows other than their own';
  end if;
  if (select count(*) from tracker.memberships) <> 1
     or (select role::text from tracker.memberships) <> 'teacher' then
    raise exception 'tracker.memberships: A can see rows other than their own';
  end if;
  if (select count(*) from tracker.orgs) <> 1
     or (select name from tracker.orgs) <> 'Org One' then
    raise exception 'tracker.orgs: A can see an org they do not belong to';
  end if;
  raise notice 'ok: A reads only their own rows';
end $$;

-- A cannot change or create anyone else's rows. Updates outside RLS match
-- zero rows rather than erroring, so B's row is checked afterwards.
update public.profiles set marketing_consent = true
  where id = '00000000-0000-0000-0000-00000000000b';

do $$ begin
  begin
    insert into public.attempts (user_id, word_id, correct)
      values ('00000000-0000-0000-0000-00000000000b', 3, true);
    raise exception 'attempts: A inserted a row for B';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into tracker.memberships (user_id, org_id, role)
      values ('00000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-000000000002', 'owner');
    raise exception 'tracker.memberships: A granted themselves a membership';
  exception when insufficient_privilege then null;
  end;
  begin
    update tracker.memberships set role = 'owner';
    raise exception 'tracker.memberships: A changed a role';
  exception when insufficient_privilege then null;
  end;
  raise notice 'ok: A cannot write rows they do not own, or any tracker rows';
end $$;

reset role;
do $$ begin
  if (select marketing_consent from public.profiles where email = 'b@example.com') then
    raise exception 'profiles: A changed B''s row';
  end if;
  if exists (select 1 from public.attempts where word_id = 3) then
    raise exception 'attempts: the cross-user insert landed';
  end if;
end $$;

-- Anonymous requests ---------------------------------------------------------
set role anon;
reset request.jwt.claims;

do $$ begin
  if (select count(*) from public.profiles) <> 0 or (select count(*) from public.attempts) <> 0 then
    raise exception 'public: anon can read rows';
  end if;
  begin
    perform 1 from tracker.memberships;
    raise exception 'tracker: anon can reach the schema';
  exception when insufficient_privilege then null;
  end;
  raise notice 'ok: anon reads nothing';
end $$;

reset role;
\echo 'RLS checks passed'
