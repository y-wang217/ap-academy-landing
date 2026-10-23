-- Console call outcomes (REQ-61, Console 7/12), under tracker ADR 0076 and
-- workspace ADR 0007.
--
-- Additive only. One row per outcome the founder logs from the console: the
-- transition log that makes the two Notion writes (a Students & Parents PATCH
-- and a Touches create) idempotent by request_id and resumable after a
-- timeout. Rows hold the absolute values written and the read-back result,
-- never the note text: only its length and SHA-256 (Notion keeps the note,
-- ADR 0004). The owner writes rows through their own client; RLS decides.
-- Rows are never deleted. Each move to done, failed or uncertain is audited.
-- Tested by supabase/tests/console_transitions.sql.

create table tracker.console_transitions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references tracker.orgs on delete restrict,
  request_id uuid not null unique,
  -- The Students & Parents page the outcome is for.
  notion_page_id uuid not null,
  outcome text not null check (outcome in (
    'no_answer', 'call_back', 'follow_up', 'trial_booked', 'not_interested', 'wrong_number', 'do_not_contact', 'won')),
  -- The absolute Notion values the patch sets. No free text.
  patch jsonb not null check (jsonb_typeof(patch) = 'object'),
  -- Type, outcome, title, staff id, note_chars and note_sha256. Never the note.
  touch jsonb not null check (jsonb_typeof(touch) = 'object' and not (touch ? 'note')),
  -- What the founder's screen showed: stage, attempts, last_edited_at.
  expected jsonb not null check (jsonb_typeof(expected) = 'object'),
  state text not null default 'running' check (state in ('running', 'done', 'failed', 'uncertain')),
  attempts integer not null default 1 check (attempts >= 1),
  lease_until timestamptz,
  patch_sent_at timestamptz,
  patch_verified_at timestamptz,
  touch_sent_at timestamptz,
  touch_page_id uuid,
  -- The read-back values.
  result jsonb,
  last_error text check (last_error is null or char_length(last_error) <= 300),
  created_by uuid not null default auth.uid() references auth.users on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  finished_at timestamptz
);
-- One open transition per lead.
create unique index console_transitions_one_open_idx on tracker.console_transitions (org_id, notion_page_id)
  where state in ('running', 'uncertain');
create index console_transitions_org_created_idx on tracker.console_transitions (org_id, created_at);

create trigger console_transitions_updated_at before update on tracker.console_transitions
  for each row execute function tracker.set_updated_at();

-- What a row is never allowed to become, for every role. The request and its
-- intended writes are fixed at insert; a finished row never moves again.
create or replace function tracker.console_transitions_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (new.org_id, new.request_id, new.notion_page_id, new.outcome, new.patch, new.touch, new.expected, new.created_by, new.created_at)
     is distinct from
     (old.org_id, old.request_id, old.notion_page_id, old.outcome, old.patch, old.touch, old.expected, old.created_by, old.created_at) then
    raise exception 'console_transitions: the request is fixed at insert' using errcode = 'check_violation';
  end if;
  if not ((old.state = 'running' and new.state in ('running', 'done', 'failed', 'uncertain'))
          or (old.state = 'uncertain' and new.state = 'running')) then
    raise exception 'console_transitions: % cannot move to %', old.state, new.state using errcode = 'check_violation';
  end if;
  return new;
end;
$$;
create trigger console_transitions_guard before update on tracker.console_transitions
  for each row execute function tracker.console_transitions_guard();

-- Audit: one row per move to done, failed or uncertain, keyed by the Notion page.
create trigger audit_console_transitions after update on tracker.console_transitions
  for each row when (old.state is distinct from new.state and new.state in ('done', 'failed', 'uncertain'))
  execute function tracker.write_audit_keyed('notion_page_id');

-- RLS: the org owner reads, inserts (as themselves, running) and updates. No delete.
alter table tracker.console_transitions enable row level security;

create policy "owner reads console transitions" on tracker.console_transitions
  for select to authenticated using (tracker.is_org_owner(org_id));
create policy "owner logs console transitions" on tracker.console_transitions
  for insert to authenticated
  with check (tracker.is_org_owner(org_id) and created_by = (select auth.uid()) and state = 'running');
create policy "owner moves console transitions" on tracker.console_transitions
  for update to authenticated
  using (tracker.is_org_owner(org_id)) with check (tracker.is_org_owner(org_id));

revoke all on tracker.console_transitions from anon, authenticated;
grant select, insert on tracker.console_transitions to authenticated;
grant update (state, lease_until, attempts, patch_sent_at, patch_verified_at, touch_sent_at, touch_page_id, result, last_error, finished_at)
  on tracker.console_transitions to authenticated;
grant all on tracker.console_transitions to service_role;

-- Claim ------------------------------------------------------------------------
-- Takes an uncertain row, or a running row whose lease ran out, for a retry:
-- running again, a new lease, one more attempt. Returns the row, or nothing
-- when it is done, failed, held by a live lease or not visible to the caller.
-- Security invoker: RLS and the column grants apply.
create or replace function tracker.claim_console_transition(p_request_id uuid, p_lease_seconds integer)
returns setof tracker.console_transitions
language plpgsql
security invoker
set search_path = ''
as $$
begin
  return query
  update tracker.console_transitions t
     set state = 'running', lease_until = now() + make_interval(secs => p_lease_seconds), attempts = t.attempts + 1
   where t.request_id = p_request_id
     and (t.state = 'uncertain' or (t.state = 'running' and (t.lease_until is null or t.lease_until < now())))
  returning t.*;
end;
$$;
revoke all on function tracker.claim_console_transition(uuid, integer) from public, anon;
grant execute on function tracker.claim_console_transition(uuid, integer) to authenticated;
