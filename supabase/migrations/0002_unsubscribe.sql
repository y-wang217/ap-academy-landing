-- CASL: every commercial message needs a working unsubscribe, honoured within
-- 10 days. A per-profile token keeps that to one click with no sign-in and no
-- way to enumerate or unsubscribe somebody else by guessing their address.

alter table public.profiles
  add column if not exists unsubscribe_token uuid not null default gen_random_uuid();

create unique index if not exists profiles_unsubscribe_token_idx
  on public.profiles (unsubscribe_token);

-- Security definer so an anonymous request can act on exactly one row, chosen
-- by a token it must already hold. Nothing else is readable or writable.
create or replace function public.unsubscribe_by_token(token uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  target uuid;
begin
  select id into target from public.profiles where unsubscribe_token = token;
  if target is null then
    return false;
  end if;

  update public.profiles
     set marketing_consent = false,
         consent_timestamp = null
   where id = target;

  -- Consent also lives in the auth user's metadata, which /auth/callback reads
  -- on every sign-in. Without clearing it here, the next sign-in would silently
  -- resubscribe someone who had just opted out.
  update auth.users
     set raw_user_meta_data =
           coalesce(raw_user_meta_data, '{}'::jsonb)
           || '{"marketing_consent": false}'::jsonb
   where id = target;

  return true;
end;
$$;

revoke all on function public.unsubscribe_by_token(uuid) from public;
grant execute on function public.unsubscribe_by_token(uuid) to anon, authenticated;
