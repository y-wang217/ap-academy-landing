-- SAT trainer, Phase 2: accounts and attempt logging.
--
-- Everything the dashboard and study sheet need is derived from `attempts`;
-- do not add tables for aggregate stats.

create table if not exists public.profiles (
  id uuid primary key references auth.users on delete cascade,
  email text not null,
  marketing_consent boolean not null default false,
  consent_timestamp timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.attempts (
  id bigserial primary key,
  user_id uuid not null references auth.users on delete cascade,
  word_id int not null,
  correct boolean not null,
  created_at timestamptz not null default now()
);

create index if not exists attempts_user_word_idx
  on public.attempts (user_id, word_id);
create index if not exists attempts_user_created_idx
  on public.attempts (user_id, created_at desc);

-- Row level security -------------------------------------------------------
-- A gap here exposes every user's data. Verify with a second test account
-- before trusting this: sign in as user B and confirm that selecting from
-- either table returns zero of user A's rows.

alter table public.profiles enable row level security;
alter table public.attempts enable row level security;

drop policy if exists "profiles are self-readable" on public.profiles;
create policy "profiles are self-readable"
  on public.profiles for select
  using ((select auth.uid()) = id);

drop policy if exists "profiles are self-writable" on public.profiles;
create policy "profiles are self-writable"
  on public.profiles for update
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

drop policy if exists "profiles are self-insertable" on public.profiles;
create policy "profiles are self-insertable"
  on public.profiles for insert
  with check ((select auth.uid()) = id);

drop policy if exists "attempts are self-readable" on public.attempts;
create policy "attempts are self-readable"
  on public.attempts for select
  using ((select auth.uid()) = user_id);

drop policy if exists "attempts are self-insertable" on public.attempts;
create policy "attempts are self-insertable"
  on public.attempts for insert
  with check ((select auth.uid()) = user_id);

-- Profile bootstrap --------------------------------------------------------
-- Consent is collected at sign-in and travels in the user's metadata. Creating
-- the profile in a trigger means a row always exists, even if the browser
-- closes before the callback finishes.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  consented boolean := coalesce(
    (new.raw_user_meta_data ->> 'marketing_consent')::boolean, false
  );
begin
  insert into public.profiles (id, email, marketing_consent, consent_timestamp)
  values (
    new.id,
    coalesce(new.email, ''),
    consented,
    case when consented then now() else null end
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
