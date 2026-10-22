-- Iris sends (REQ-48, Iris 8/9): one row per approved draft that Iris sends
-- from the mailbox, under tracker ADR 0069. A reply goes out at most once.
--
-- Additive only. A send goes with its draft and its message (on delete
-- cascade), so it never outlives retention. It holds ids, states and a
-- status-only error line, never an address or body text; the sent text is
-- the draft's, and the outbound copy is an iris.messages row. Not audited
-- (decision 16: events are the record).
--
-- The owner never writes the table directly. approve_draft_for_send approves
-- the draft and creates its send in one statement, with the message row
-- locked, so a double click or two tabs create one send. claim_send,
-- finish_send and fail_send_attempt move a send through its attempts, for the
-- owner (Approve, Retry) or the run (service_role). retry_send is the owner's
-- Retry. The tracker stops calling approve_draft with this card; it stays
-- granted here so the app deployed before this card keeps working while
-- this file is live and the card is not, and a follow-up migration revokes
-- it once the card is live.
-- Tested by supabase/tests/iris_sends.sql.

-- Table ----------------------------------------------------------------------------

create table iris.sends (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references tracker.orgs on delete restrict,
  draft_id uuid not null unique references iris.drafts on delete cascade,
  message_id uuid not null references iris.messages on delete cascade,
  -- Our own Message-ID, <iris-<id>@apacademy.ca>, set when the row is made.
  rfc_message_id text not null unique check (char_length(rfc_message_id) <= 200),
  gmail_message_id text unique check (char_length(gmail_message_id) <= 64),
  state text not null check (state in ('sending', 'sent', 'failed')),
  mode text not null check (mode in ('manual', 'auto')),
  attempts integer not null default 0 check (attempts >= 0),
  lease_until timestamptz,
  last_error text check (char_length(last_error) <= 300),
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index sends_org_state_idx on iris.sends (org_id, state);

create trigger sends_updated_at before update on iris.sends
  for each row execute function tracker.set_updated_at();

-- Functions ------------------------------------------------------------------------

-- The org owner, or the run.
create or replace function iris.may_send(p_org uuid)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select tracker.is_org_owner(p_org) or coalesce((select auth.role()), '') = 'service_role'
$$;

-- Paused, or no settings row (Iris starts paused).
create or replace function iris.is_paused(p_org uuid)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce((select s.paused from iris.settings s where s.org_id = p_org), true)
$$;

-- Marks a send, its draft and its message failed, with one event.
create or replace function iris.mark_send_failed(p_send uuid, p_error text)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  s iris.sends;
begin
  update iris.sends
     set state = 'failed', lease_until = null, last_error = left(p_error, 300)
   where id = p_send
  returning * into s;
  update iris.drafts set state = 'failed' where id = s.draft_id;
  update iris.messages
     set state = 'failed', state_changed_at = now(), last_error = left(p_error, 300)
   where id = s.message_id;
  insert into iris.events (org_id, kind, message_id, draft_id, actor, detail)
  values (s.org_id, 'send_failed', s.message_id, s.draft_id, 'iris',
          jsonb_build_object('send_id', s.id, 'attempts', s.attempts, 'error', left(p_error, 300)));
end;
$$;

-- Approve and create the send. Returns {"result": "ok" | "existing" |
-- "conflict" | "not_found" | "paused", "send_id", "state"}. A second call for
-- the same draft returns the first send as "existing". A draft outside the
-- caller's own org reads as not_found.
create or replace function iris.approve_draft_for_send(p_draft uuid, p_version integer, p_lease_seconds integer)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  d iris.drafts;
  m iris.messages;
  s iris.sends;
  v_id uuid := gen_random_uuid();
begin
  select * into d from iris.drafts where id = p_draft;
  if d.id is null or not tracker.is_org_owner(d.org_id) then
    return jsonb_build_object('result', 'not_found');
  end if;
  select * into m from iris.messages where id = d.message_id for update;
  select * into s from iris.sends where draft_id = d.id;
  if s.id is not null then
    return jsonb_build_object('result', 'existing', 'send_id', s.id, 'state', s.state);
  end if;
  if iris.is_paused(d.org_id) then
    return jsonb_build_object('result', 'paused');
  end if;
  select * into d from iris.drafts where id = p_draft;
  if d.state <> 'proposed' or d.version <> p_version
     or m.state not in ('drafted', 'escalated') then
    return jsonb_build_object('result', 'conflict');
  end if;

  update iris.drafts
     set state = 'approved', approval_mode = 'manual', approved_by = (select auth.uid()), approved_at = now()
   where id = d.id;
  update iris.messages set state = 'approved', state_changed_at = now() where id = m.id;
  perform iris.count_review(d.org_id, d.reply_type, 'approve', d.edited, d.policy_version);
  insert into iris.events (org_id, kind, message_id, draft_id, actor, detail)
  values (d.org_id, 'approved', m.id, d.id, (select auth.uid())::text,
          jsonb_build_object('version', d.version, 'reply_type', d.reply_type, 'edited', d.edited));

  insert into iris.sends (id, org_id, draft_id, message_id, rfc_message_id, state, mode, attempts, lease_until)
  values (v_id, d.org_id, d.id, m.id, '<iris-' || v_id || '@apacademy.ca>', 'sending', 'manual', 1,
          now() + make_interval(secs => p_lease_seconds));
  insert into iris.events (org_id, kind, message_id, draft_id, actor, detail)
  values (d.org_id, 'send_started', m.id, d.id, (select auth.uid())::text,
          jsonb_build_object('send_id', v_id, 'attempt', 1));
  return jsonb_build_object('result', 'ok', 'send_id', v_id, 'state', 'sending');
end;
$$;

-- Take the next attempt of a send whose lease has passed. Returns "claimed",
-- "busy" (a lease is live), "done" (sent or failed), "exhausted" (the attempt
-- limit was reached: the send is now failed), "paused" or "not_found".
create or replace function iris.claim_send(p_send uuid, p_lease_seconds integer, p_max_attempts integer)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  s iris.sends;
begin
  select * into s from iris.sends where id = p_send;
  if s.id is null or not iris.may_send(s.org_id) then
    return 'not_found';
  end if;
  perform 1 from iris.messages where id = s.message_id for update;
  select * into s from iris.sends where id = p_send for update;
  if s.state <> 'sending' then
    return 'done';
  end if;
  if iris.is_paused(s.org_id) then
    return 'paused';
  end if;
  if s.lease_until is not null and s.lease_until > now() then
    return 'busy';
  end if;
  if s.attempts >= p_max_attempts then
    perform iris.mark_send_failed(s.id, coalesce(s.last_error, 'Send did not finish'));
    return 'exhausted';
  end if;
  update iris.sends
     set attempts = s.attempts + 1, lease_until = now() + make_interval(secs => p_lease_seconds)
   where id = s.id;
  insert into iris.events (org_id, kind, message_id, draft_id, actor, detail)
  values (s.org_id, 'send_attempt', s.message_id, s.draft_id, 'iris',
          jsonb_build_object('send_id', s.id, 'attempt', s.attempts + 1));
  return 'claimed';
end;
$$;

-- Record a send Gmail accepted, idempotently: the send, the draft and the
-- message sent, one outbound message row, the thread's last_outbound_at and
-- one event. An outbound row the poll already stored for the same Gmail
-- message (as charlie_manual) becomes source iris. Returns "ok", "done"
-- (already sent) or "not_found".
create or replace function iris.finish_send(p_send uuid, p_gmail_message_id text, p_from text, p_body text, p_sent_at timestamptz)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  s iris.sends;
  m iris.messages;
begin
  select * into s from iris.sends where id = p_send;
  if s.id is null or not iris.may_send(s.org_id) then
    return 'not_found';
  end if;
  select * into m from iris.messages where id = s.message_id for update;
  select * into s from iris.sends where id = p_send for update;
  if s.state = 'sent' then
    return 'done';
  end if;

  update iris.sends
     set state = 'sent', gmail_message_id = p_gmail_message_id, sent_at = p_sent_at,
         lease_until = null, last_error = null
   where id = s.id;
  update iris.drafts set state = 'sent' where id = s.draft_id;
  update iris.messages
     set state = 'sent', state_changed_at = now(), last_error = null
   where id = m.id;
  insert into iris.messages (org_id, thread_id, gmail_message_id, rfc_message_id, direction, source,
                             from_email, received_at, body_text, body_truncated, snippet, purge_at)
  values (s.org_id, m.thread_id, p_gmail_message_id, s.rfc_message_id, 'outbound', 'iris',
          lower(p_from), p_sent_at, left(p_body, 20000), char_length(p_body) > 20000,
          left(p_body, 200), m.purge_at)
  on conflict (org_id, gmail_message_id) do update set source = 'iris';
  update iris.threads
     set last_outbound_at = greatest(coalesce(last_outbound_at, p_sent_at), p_sent_at)
   where id = m.thread_id;
  insert into iris.events (org_id, kind, message_id, draft_id, actor, detail)
  values (s.org_id, 'sent', m.id, s.draft_id, 'iris',
          jsonb_build_object('send_id', s.id, 'attempts', s.attempts));
  return 'ok';
end;
$$;

-- One failed attempt. Below the limit the lease clears and the send stays
-- sending, for the next run or Retry; at the limit the send, the draft and
-- the message are failed. Returns "retrying", "failed", "done" or
-- "not_found". p_error is a status line, never body text.
create or replace function iris.fail_send_attempt(p_send uuid, p_error text, p_max_attempts integer)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  s iris.sends;
begin
  select * into s from iris.sends where id = p_send;
  if s.id is null or not iris.may_send(s.org_id) then
    return 'not_found';
  end if;
  perform 1 from iris.messages where id = s.message_id for update;
  select * into s from iris.sends where id = p_send for update;
  if s.state <> 'sending' then
    return 'done';
  end if;
  if s.attempts >= p_max_attempts then
    perform iris.mark_send_failed(s.id, p_error);
    return 'failed';
  end if;
  update iris.sends set lease_until = null, last_error = left(p_error, 300) where id = s.id;
  insert into iris.events (org_id, kind, message_id, draft_id, actor, detail)
  values (s.org_id, 'send_attempt_failed', s.message_id, s.draft_id, 'iris',
          jsonb_build_object('send_id', s.id, 'attempt', s.attempts, 'error', left(p_error, 300)));
  return 'retrying';
end;
$$;

-- The owner's Retry on a failed send: back to sending with a fresh attempt
-- count and the caller's lease, the draft and the message back to approved.
-- Returns {"result": "ok" | "not_failed" | "paused" | "not_found", "state"}.
create or replace function iris.retry_send(p_send uuid, p_lease_seconds integer)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  s iris.sends;
begin
  select * into s from iris.sends where id = p_send;
  if s.id is null or not tracker.is_org_owner(s.org_id) then
    return jsonb_build_object('result', 'not_found');
  end if;
  perform 1 from iris.messages where id = s.message_id for update;
  select * into s from iris.sends where id = p_send for update;
  if s.state <> 'failed' then
    return jsonb_build_object('result', 'not_failed', 'state', s.state);
  end if;
  if iris.is_paused(s.org_id) then
    return jsonb_build_object('result', 'paused');
  end if;
  update iris.sends
     set state = 'sending', attempts = 1, last_error = null,
         lease_until = now() + make_interval(secs => p_lease_seconds)
   where id = s.id;
  update iris.drafts set state = 'approved' where id = s.draft_id;
  update iris.messages
     set state = 'approved', state_changed_at = now(), last_error = null
   where id = s.message_id;
  insert into iris.events (org_id, kind, message_id, draft_id, actor, detail)
  values (s.org_id, 'send_retried', s.message_id, s.draft_id, (select auth.uid())::text,
          jsonb_build_object('send_id', s.id));
  return jsonb_build_object('result', 'ok', 'state', 'sending');
end;
$$;

revoke all on function iris.may_send(uuid) from public;
revoke all on function iris.is_paused(uuid) from public;
revoke all on function iris.mark_send_failed(uuid, text) from public;
revoke all on function iris.approve_draft_for_send(uuid, integer, integer) from public;
revoke all on function iris.claim_send(uuid, integer, integer) from public;
revoke all on function iris.finish_send(uuid, text, text, text, timestamptz) from public;
revoke all on function iris.fail_send_attempt(uuid, text, integer) from public;
revoke all on function iris.retry_send(uuid, integer) from public;
grant execute on function iris.approve_draft_for_send(uuid, integer, integer) to authenticated;
grant execute on function iris.retry_send(uuid, integer) to authenticated;
grant execute on function iris.claim_send(uuid, integer, integer) to authenticated, service_role;
grant execute on function iris.finish_send(uuid, text, text, text, timestamptz) to authenticated, service_role;
grant execute on function iris.fail_send_attempt(uuid, text, integer) to authenticated, service_role;

-- RLS: the org owner reads; service_role does the rest. ---------------------------------

alter table iris.sends enable row level security;

create policy "owner reads iris sends" on iris.sends for select to authenticated
  using (tracker.is_org_owner(org_id));

revoke all on iris.sends from anon, authenticated;
grant all on iris.sends to service_role;
grant select on iris.sends to authenticated;
