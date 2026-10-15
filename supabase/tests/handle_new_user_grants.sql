-- REQ-13: handle_new_user() must not be callable through the API roles, and
-- signups must still create a profiles row. Privilege-sensitive steps run under
-- set role because the runner connects as a superuser.

\set ON_ERROR_STOP on

do $$ begin
  if has_function_privilege('anon', 'public.handle_new_user()', 'execute') then
    raise exception 'anon can still execute handle_new_user';
  end if;
  if has_function_privilege('authenticated', 'public.handle_new_user()', 'execute') then
    raise exception 'authenticated can still execute handle_new_user';
  end if;
  if not has_function_privilege('anon', 'public.unsubscribe_by_token(uuid)', 'execute') then
    raise exception 'anon lost unsubscribe_by_token';
  end if;
  raise notice 'ok: handle_new_user is closed to API roles, unsubscribe_by_token still open';
end $$;

-- Stand-in for supabase_auth_admin: usage on auth and insert on auth.users only.
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'test_auth_inserter') then
    create role test_auth_inserter nologin;
  end if;
end $$;
grant usage on schema auth to test_auth_inserter;
grant insert on auth.users to test_auth_inserter;

set role test_auth_inserter;
insert into auth.users (id, email, raw_user_meta_data)
  values ('00000000-0000-0000-0000-0000000000c1', 'c1@example.com', '{"marketing_consent": true}');
reset role;

do $$ begin
  if (select count(*) from public.profiles where id = '00000000-0000-0000-0000-0000000000c1') <> 1 then
    raise exception 'signup by non-superuser did not create exactly one profiles row';
  end if;
  if not exists (select 1 from public.profiles
      where id = '00000000-0000-0000-0000-0000000000c1'
        and email = 'c1@example.com' and marketing_consent and consent_timestamp is not null) then
    raise exception 'profiles row missing email or consent';
  end if;
  raise notice 'ok: signup by a non-superuser still creates a profiles row';
end $$;

set role anon;
do $$ begin
  begin
    perform public.handle_new_user();
    raise exception 'anon called handle_new_user without error';
  exception
    when insufficient_privilege then null;
    when others then raise exception 'anon: expected 42501, got %', sqlstate;
  end;
  raise notice 'ok: anon cannot call handle_new_user';
end $$;
reset role;

set role authenticated;
set request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000c1", "role": "authenticated"}';
do $$ begin
  begin
    perform public.handle_new_user();
    raise exception 'authenticated called handle_new_user without error';
  exception
    when insufficient_privilege then null;
    when others then raise exception 'authenticated: expected 42501, got %', sqlstate;
  end;
  raise notice 'ok: authenticated cannot call handle_new_user';
end $$;
reset role;
