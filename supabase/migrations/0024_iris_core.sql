-- Iris core (REQ-42, Iris 2/9): the `iris` schema that holds the mail Iris
-- reads from charlie@apacademy.ca, under tracker ADRs 0056 to 0058 and
-- workspace ADR 0005.
--
-- Parent email addresses and message bodies live here for at most
-- settings.retention_days (90), owner-only by RLS. They are never copied to
-- tracker.audit_log (only settings is audited) and never into events or
-- ai_calls, which keep ids and reason codes only. Mail from an unknown or
-- automated sender is stored without a body.
--
-- Writes come from the bearer-protected run (service_role). The org owner
-- reads everything in their org, toggles a few settings, marks messages
-- handled and logs their own events. Nobody else reads anything. Deletion is
-- only through purge_expired (service_role) and delete_thread (the owner).
-- Iris starts paused: a settings row created with only org_id is paused.
-- Tested by supabase/tests/iris_core.sql.

create schema iris;
grant usage on schema iris to authenticated, service_role;

-- Tables -----------------------------------------------------------------------

create table iris.settings (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null unique references tracker.orgs on delete restrict,
  paused boolean not null default true,
  sending_enabled boolean not null default false,
  confidence_threshold numeric(3,2) not null default 0.85 check (confidence_threshold between 0 and 1),
  retention_days integer not null default 90 check (retention_days between 1 and 365),
  quiet_start time not null default '21:00',
  quiet_end time not null default '07:00',
  mailbox text check (mailbox = lower(mailbox)),
  -- The poll lease (claim_poll) and the last run, written by the run only.
  poll_lease_until timestamptz,
  last_poll_at timestamptz,
  last_poll_result text check (last_poll_result in ('ok', 'busy', 'failed', 'paused')),
  last_error text check (char_length(last_error) <= 300),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table iris.runs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references tracker.orgs on delete restrict,
  started_at timestamptz not null,
  finished_at timestamptz not null,
  result text not null check (result in ('ok', 'busy', 'failed', 'paused')),
  seen integer not null default 0,
  stored integer not null default 0,
  matched integer not null default 0,
  escalated integer not null default 0,
  skipped integer not null default 0,
  failed integer not null default 0,
  classified integer not null default 0,
  drafted integer not null default 0,
  sent integer not null default 0,
  purged integer not null default 0,
  error text check (char_length(error) <= 300)
);
create index runs_org_started_idx on iris.runs (org_id, started_at desc);

create table iris.threads (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references tracker.orgs on delete restrict,
  gmail_thread_id text not null,
  channel text not null default 'email' check (channel in ('email')),
  parent_email text check (parent_email = lower(parent_email)),
  match_state text not null check (match_state in ('matched', 'unknown', 'ambiguous')),
  -- Notion Students & Parents page ids. Never a name or an address.
  notion_student_ids uuid[] not null default '{}',
  subject text check (char_length(subject) <= 500),
  first_received_at timestamptz,
  last_inbound_at timestamptz,
  last_outbound_at timestamptz,
  purge_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, gmail_thread_id)
);
create index threads_purge_idx on iris.threads (purge_at);

create table iris.messages (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references tracker.orgs on delete restrict,
  thread_id uuid not null references iris.threads on delete cascade,
  gmail_message_id text not null,
  rfc_message_id text,
  direction text not null check (direction in ('inbound', 'outbound')),
  source text not null check (source in ('external', 'charlie_manual', 'iris')),
  from_email text not null check (from_email = lower(from_email)),
  from_name text check (char_length(from_name) <= 200),
  received_at timestamptz not null,
  -- Null for unknown and automated senders, and while a match is pending.
  body_text text check (char_length(body_text) <= 20000),
  body_truncated boolean not null default false,
  snippet text check (char_length(snippet) <= 200),
  state text check (state in ('received', 'matched', 'classified', 'escalated', 'drafted', 'approved', 'sent', 'failed')),
  state_changed_at timestamptz,
  intent text,
  confidence numeric(3,2),
  flags text[] not null default '{}',
  escalation_reason text check (char_length(escalation_reason) <= 64),
  policy_version integer,
  handled_at timestamptz,
  handled_by uuid references auth.users on delete set null,
  retry_count integer not null default 0,
  last_error text check (char_length(last_error) <= 300),
  purge_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Inbound mail moves through states; outbound rows are a record only.
  check ((direction = 'inbound') = (state is not null)),
  unique (org_id, gmail_message_id)
);
create index messages_org_state_idx on iris.messages (org_id, state, received_at desc);
create index messages_thread_idx on iris.messages (thread_id);
create index messages_purge_idx on iris.messages (purge_at);

-- One row per model call. No prompt or answer column.
create table iris.ai_calls (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references tracker.orgs on delete restrict,
  message_id uuid references iris.messages on delete set null,
  purpose text not null check (purpose in ('classify', 'draft', 'eval')),
  model text,
  input_tokens integer,
  output_tokens integer,
  policy_version integer,
  outcome text not null check (outcome in ('ok', 'refused', 'error')),
  error text check (char_length(error) <= 500),
  created_at timestamptz not null default now()
);
create index ai_calls_org_created_idx on iris.ai_calls (org_id, created_at desc);

-- The Iris record: ids, states and reason codes in detail, never an address,
-- a name or body text.
create table iris.events (
  id bigint generated always as identity primary key,
  org_id uuid not null references tracker.orgs on delete restrict,
  at timestamptz not null default now(),
  kind text not null check (char_length(kind) <= 64),
  message_id uuid references iris.messages on delete set null,
  -- No foreign key yet: the drafts table arrives with Iris 4/9.
  draft_id uuid,
  actor text not null check (actor in ('iris', 'gate') or actor ~ '^[0-9a-f-]{36}$'),
  detail jsonb not null default '{}'
);
create index events_org_at_idx on iris.events (org_id, at desc);

-- One settings row per existing org. Iris starts paused.
insert into iris.settings (org_id) select id from tracker.orgs on conflict do nothing;

-- Append-only events and ai_calls ------------------------------------------------
-- Allowed: an update that only sets message_id or draft_id to null (the
-- `on delete set null` cascade when a message is purged), and a delete of a
-- row older than 365 days (the purge). Everything else raises 42501, for
-- every role including service_role.
create or replace function iris.guard_append_only()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  before_row jsonb;
  after_row jsonb;
  born timestamptz;
begin
  if tg_op = 'TRUNCATE' then
    raise exception 'iris.% is append-only', tg_table_name using errcode = 'insufficient_privilege';
  end if;
  before_row := to_jsonb(old);
  if tg_op = 'UPDATE' then
    after_row := to_jsonb(new);
    if (after_row - 'message_id' - 'draft_id') = (before_row - 'message_id' - 'draft_id')
       and (after_row -> 'message_id' = 'null'::jsonb or after_row -> 'message_id' is not distinct from before_row -> 'message_id')
       and (after_row -> 'draft_id' = 'null'::jsonb or after_row -> 'draft_id' is not distinct from before_row -> 'draft_id') then
      return new;
    end if;
  elsif tg_op = 'DELETE' then
    born := coalesce(before_row ->> 'at', before_row ->> 'created_at')::timestamptz;
    if born < now() - interval '365 days' then
      return old;
    end if;
  end if;
  raise exception 'iris.% is append-only', tg_table_name using errcode = 'insufficient_privilege';
end;
$$;

create trigger events_append_only before update or delete on iris.events
  for each row execute function iris.guard_append_only();
create trigger events_no_truncate before truncate on iris.events
  for each statement execute function iris.guard_append_only();
create trigger ai_calls_append_only before update or delete on iris.ai_calls
  for each row execute function iris.guard_append_only();
create trigger ai_calls_no_truncate before truncate on iris.ai_calls
  for each statement execute function iris.guard_append_only();

-- Timestamps and audit ---------------------------------------------------------------
create trigger settings_updated_at before update on iris.settings
  for each row execute function tracker.set_updated_at();
create trigger threads_updated_at before update on iris.threads
  for each row execute function tracker.set_updated_at();
create trigger messages_updated_at before update on iris.messages
  for each row execute function tracker.set_updated_at();

-- Only the owner-facing settings are audited. The run's lease and last-run
-- updates never name these columns, so they write no audit row. No other
-- Iris table is audited: an audit copy would keep parent data past retention.
create trigger audit_settings
  after insert or delete or update of paused, sending_enabled, confidence_threshold, retention_days, quiet_start, quiet_end, mailbox
  on iris.settings
  for each row execute function tracker.write_audit();

-- Functions ------------------------------------------------------------------------

-- The poll lease: the settings row to the first caller, nothing to a second
-- caller while the lease is live. A crashed run's lease lapses on its own.
create or replace function iris.claim_poll(p_org uuid, p_lease_seconds integer)
returns setof iris.settings
language plpgsql
security invoker
set search_path = ''
as $$
begin
  return query
  update iris.settings s
     set poll_lease_until = now() + make_interval(secs => p_lease_seconds)
   where s.org_id = p_org
     and (s.poll_lease_until is null or s.poll_lease_until < now())
  returning s.*;
end;
$$;

-- Retention. Messages past purge_at, then threads left empty, runs older than
-- 90 days, events and ai_calls older than 365 days. Surviving events and
-- ai_calls lose their message_id through the foreign key. One purge event
-- records the counts.
create or replace function iris.purge_expired(p_org uuid)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  n_messages integer;
  n_threads integer;
  n_runs integer;
  n_events integer;
  n_ai_calls integer;
  counts jsonb;
begin
  delete from iris.messages m where m.org_id = p_org and m.purge_at < now();
  get diagnostics n_messages = row_count;

  delete from iris.threads t
   where t.org_id = p_org and t.purge_at < now()
     and not exists (select 1 from iris.messages m where m.thread_id = t.id);
  get diagnostics n_threads = row_count;

  delete from iris.runs r where r.org_id = p_org and r.started_at < now() - interval '90 days';
  get diagnostics n_runs = row_count;

  delete from iris.events e where e.org_id = p_org and e.at < now() - interval '365 days';
  get diagnostics n_events = row_count;

  delete from iris.ai_calls a where a.org_id = p_org and a.created_at < now() - interval '365 days';
  get diagnostics n_ai_calls = row_count;

  counts := jsonb_build_object('messages', n_messages, 'threads', n_threads, 'runs', n_runs,
                               'events', n_events, 'ai_calls', n_ai_calls);
  insert into iris.events (org_id, kind, actor, detail) values (p_org, 'purge', 'iris', counts);
  return counts;
end;
$$;

-- Delete one family's thread now, for its org owner only.
create or replace function iris.delete_thread(p_thread uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_org uuid;
  n integer;
begin
  select t.org_id into target_org from iris.threads t where t.id = p_thread;
  if target_org is null or not tracker.is_org_owner(target_org) then
    raise exception 'not allowed' using errcode = 'insufficient_privilege';
  end if;
  delete from iris.messages m where m.thread_id = p_thread;
  get diagnostics n = row_count;
  delete from iris.threads t where t.id = p_thread;
  insert into iris.events (org_id, kind, actor, detail)
  values (target_org, 'thread_deleted', (select auth.uid())::text,
          jsonb_build_object('thread_id', p_thread, 'messages', n));
  return n;
end;
$$;

revoke all on function iris.guard_append_only() from public;
revoke all on function iris.claim_poll(uuid, integer) from public;
revoke all on function iris.purge_expired(uuid) from public;
revoke all on function iris.delete_thread(uuid) from public;
grant execute on function iris.claim_poll(uuid, integer) to service_role;
grant execute on function iris.purge_expired(uuid) to service_role;
grant execute on function iris.delete_thread(uuid) to authenticated;

-- RLS: the org owner reads; service_role does the rest. ---------------------------------

alter table iris.settings enable row level security;
alter table iris.runs enable row level security;
alter table iris.threads enable row level security;
alter table iris.messages enable row level security;
alter table iris.ai_calls enable row level security;
alter table iris.events enable row level security;

create policy "owner reads iris settings" on iris.settings for select to authenticated
  using (tracker.is_org_owner(org_id));
create policy "owner updates iris settings" on iris.settings for update to authenticated
  using (tracker.is_org_owner(org_id)) with check (tracker.is_org_owner(org_id));

create policy "owner reads iris runs" on iris.runs for select to authenticated
  using (tracker.is_org_owner(org_id));

create policy "owner reads iris threads" on iris.threads for select to authenticated
  using (tracker.is_org_owner(org_id));

create policy "owner reads iris messages" on iris.messages for select to authenticated
  using (tracker.is_org_owner(org_id));
create policy "owner handles iris messages" on iris.messages for update to authenticated
  using (tracker.is_org_owner(org_id))
  with check (tracker.is_org_owner(org_id) and (handled_by is null or handled_by = (select auth.uid())));

create policy "owner reads iris ai calls" on iris.ai_calls for select to authenticated
  using (tracker.is_org_owner(org_id));

create policy "owner reads iris events" on iris.events for select to authenticated
  using (tracker.is_org_owner(org_id));
create policy "owner logs own iris events" on iris.events for insert to authenticated
  with check (tracker.is_org_owner(org_id) and actor = (select auth.uid())::text);

revoke all on all tables in schema iris from anon, authenticated;
grant all on all tables in schema iris to service_role;
grant usage on all sequences in schema iris to service_role;

grant select on iris.settings, iris.runs, iris.threads, iris.messages, iris.ai_calls, iris.events to authenticated;
grant update (paused, sending_enabled, confidence_threshold) on iris.settings to authenticated;
grant update (state, state_changed_at, handled_at, handled_by) on iris.messages to authenticated;
grant insert (org_id, kind, message_id, draft_id, actor, detail) on iris.events to authenticated;
