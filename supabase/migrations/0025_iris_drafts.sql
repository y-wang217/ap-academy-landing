-- Iris drafts (REQ-44, Iris 4/9): reply drafts, the owner's review of them,
-- the per-type unedited streak, the Notion phone-backup record and the
-- evaluation tables Iris 5/9 fills, under tracker ADRs 0063 and 0064.
--
-- Additive only. Drafts hold reply text Iris wrote (never the parent's
-- message) and go with their message (on delete cascade), so they never
-- outlive retention; they are not audited, for the same reason as messages
-- (ADR 0058). reply_types holds counts only and is audited.
--
-- The owner never inserts or updates a draft directly: approve_draft,
-- save_draft_edit and reject_draft do the draft, the message, the streak and
-- the event in one statement, with the message row locked, so a double click
-- or two tabs write once. The run (service_role) writes everything else.
-- Tested by supabase/tests/iris_drafts.sql.

-- The chosen child (a Notion Students & Parents page id), written by the run.
alter table iris.messages add column notion_student_id uuid;

-- Tables -----------------------------------------------------------------------

create table iris.drafts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references tracker.orgs on delete restrict,
  message_id uuid not null references iris.messages on delete cascade,
  version integer not null check (version >= 1),
  reply_type text not null check (char_length(reply_type) <= 64),
  -- The reply body without the signature, which code appends.
  body_text text not null check (char_length(body_text) between 1 and 5000),
  policy_version integer not null,
  state text not null check (state in ('proposed', 'approved', 'rejected', 'superseded', 'sent', 'failed')),
  created_by text not null check (created_by in ('iris', 'owner')),
  edited boolean not null default false,
  approval_mode text check (approval_mode in ('manual', 'auto')),
  approved_by uuid references auth.users on delete set null,
  approved_at timestamptz,
  rejected_reason text check (char_length(rejected_reason) between 1 and 300),
  send_after timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (message_id, version)
);
-- At most one proposed draft per message.
create unique index drafts_one_proposed_idx on iris.drafts (message_id) where state = 'proposed';
create index drafts_org_state_idx on iris.drafts (org_id, state);

create table iris.reply_types (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references tracker.orgs on delete restrict,
  type text not null check (char_length(type) <= 64),
  auto_send_eligible boolean not null default false,
  auto_send_enabled boolean not null default false,
  unedited_streak integer not null default 0 check (unedited_streak >= 0),
  approved_unedited_total integer not null default 0,
  edited_total integer not null default 0,
  rejected_total integer not null default 0,
  streak_policy_version integer,
  enabled_at timestamptz,
  enabled_by uuid references auth.users on delete set null,
  disabled_at timestamptz,
  disabled_reason text check (char_length(disabled_reason) <= 64),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, type)
);

-- Filled by Iris 5/9. Labels go with their message.
create table iris.eval_labels (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references tracker.orgs on delete restrict,
  message_id uuid not null unique references iris.messages on delete cascade,
  gold_intent text check (char_length(gold_intent) <= 64),
  gold_reply_type text check (char_length(gold_reply_type) <= 64),
  gold_escalate boolean,
  draft_rating smallint check (draft_rating between 1 and 5),
  note text check (char_length(note) <= 1000),
  labelled_by uuid references auth.users on delete set null,
  labelled_at timestamptz not null default now()
);

-- Aggregates only, kept permanently.
create table iris.eval_runs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references tracker.orgs on delete restrict,
  ran_at timestamptz not null default now(),
  policy_version integer not null,
  model text,
  labelled_count integer not null default 0,
  per_type jsonb not null default '{}',
  sensitive_recall numeric(4,3),
  mean_rating_per_type jsonb not null default '{}'
);

-- One row per message pushed to the Notion day page. Ids and codes only.
-- message_id goes null on purge or delete_thread so the run can still delete
-- the Notion block.
create table iris.pushes (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references tracker.orgs on delete restrict,
  message_id uuid unique references iris.messages on delete set null,
  draft_id uuid references iris.drafts on delete set null,
  day date not null,
  notion_block_id text check (char_length(notion_block_id) <= 64),
  comment_done boolean not null default false,
  state text not null default 'pending' check (state in ('pending', 'pushed', 'failed')),
  attempts integer not null default 0,
  last_error text check (char_length(last_error) <= 300),
  purge_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index pushes_org_state_idx on iris.pushes (org_id, state);

create table iris.push_days (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references tracker.orgs on delete restrict,
  day date not null,
  work_page_id text check (char_length(work_page_id) <= 64),
  log_entry_id text check (char_length(log_entry_id) <= 64),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, day)
);

-- events.draft_id was left without a key in 0024. The append-only guard
-- already allows the set-null this cascade performs.
alter table iris.events
  add constraint events_draft_id_fkey foreign key (draft_id) references iris.drafts on delete set null;

-- Timestamps and audit ---------------------------------------------------------------
create trigger drafts_updated_at before update on iris.drafts
  for each row execute function tracker.set_updated_at();
create trigger reply_types_updated_at before update on iris.reply_types
  for each row execute function tracker.set_updated_at();
create trigger pushes_updated_at before update on iris.pushes
  for each row execute function tracker.set_updated_at();
create trigger push_days_updated_at before update on iris.push_days
  for each row execute function tracker.set_updated_at();

create trigger audit_reply_types after insert or update or delete on iris.reply_types
  for each row execute function tracker.write_audit();

-- Owner review -----------------------------------------------------------------------
-- Each returns {"result": "ok" | "conflict" | "not_found"}; save_draft_edit
-- adds "draft_id". A draft outside the caller's own org reads as not_found.
-- Only the latest version of a message's drafts can be acted on, and only
-- while it is proposed.

-- The streak, shared by the three functions. p_kind is 'approve', 'edit' or
-- 'reject'. An unedited approval at the type's streak version adds 1; at a
-- newer policy version it restarts the streak at 1 under that version; at an
-- older one it counts in the total only. An edit or a reject resets it.
create or replace function iris.count_review(p_org uuid, p_type text, p_kind text, p_edited boolean, p_policy_version integer)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  -- Mirrors TUNING.irisAutoSendStreak (apps/tracker/lib/domain/tuning.ts).
  streak_threshold constant integer := 20;
  rt iris.reply_types;
begin
  insert into iris.reply_types (org_id, type) values (p_org, p_type)
  on conflict (org_id, type) do nothing;
  select * into rt from iris.reply_types where org_id = p_org and type = p_type for update;

  if p_kind = 'approve' and p_edited then
    rt.edited_total := rt.edited_total + 1;
  elsif p_kind = 'approve' then
    rt.approved_unedited_total := rt.approved_unedited_total + 1;
    if rt.streak_policy_version is null or p_policy_version > rt.streak_policy_version then
      rt.streak_policy_version := p_policy_version;
      rt.unedited_streak := 1;
    elsif p_policy_version = rt.streak_policy_version then
      rt.unedited_streak := rt.unedited_streak + 1;
    end if;
  else
    rt.unedited_streak := 0;
    if p_kind = 'reject' then
      rt.rejected_total := rt.rejected_total + 1;
    end if;
  end if;

  update iris.reply_types
     set unedited_streak = rt.unedited_streak,
         approved_unedited_total = rt.approved_unedited_total,
         edited_total = rt.edited_total,
         rejected_total = rt.rejected_total,
         streak_policy_version = rt.streak_policy_version,
         auto_send_eligible = rt.unedited_streak >= streak_threshold
   where id = rt.id;
end;
$$;

create or replace function iris.approve_draft(p_draft uuid, p_version integer)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  d iris.drafts;
  m iris.messages;
begin
  select * into d from iris.drafts where id = p_draft;
  if d.id is null or not tracker.is_org_owner(d.org_id) then
    return jsonb_build_object('result', 'not_found');
  end if;
  select * into m from iris.messages where id = d.message_id for update;
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
  return jsonb_build_object('result', 'ok');
end;
$$;

create or replace function iris.save_draft_edit(p_draft uuid, p_version integer, p_body text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  d iris.drafts;
  m iris.messages;
  new_id uuid;
begin
  select * into d from iris.drafts where id = p_draft;
  if d.id is null or not tracker.is_org_owner(d.org_id) then
    return jsonb_build_object('result', 'not_found');
  end if;
  select * into m from iris.messages where id = d.message_id for update;
  select * into d from iris.drafts where id = p_draft;
  if d.state <> 'proposed' or d.version <> p_version
     or m.state not in ('drafted', 'escalated') then
    return jsonb_build_object('result', 'conflict');
  end if;

  update iris.drafts set state = 'superseded' where id = d.id;
  insert into iris.drafts (org_id, message_id, version, reply_type, body_text, policy_version, state, created_by, edited)
  values (d.org_id, d.message_id, d.version + 1, d.reply_type, p_body, d.policy_version, 'proposed', 'owner', true)
  returning id into new_id;
  perform iris.count_review(d.org_id, d.reply_type, 'edit', true, d.policy_version);
  insert into iris.events (org_id, kind, message_id, draft_id, actor, detail)
  values (d.org_id, 'draft_edited', m.id, new_id, (select auth.uid())::text,
          jsonb_build_object('version', d.version + 1, 'reply_type', d.reply_type));
  return jsonb_build_object('result', 'ok', 'draft_id', new_id);
end;
$$;

create or replace function iris.reject_draft(p_draft uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  d iris.drafts;
  m iris.messages;
begin
  select * into d from iris.drafts where id = p_draft;
  if d.id is null or not tracker.is_org_owner(d.org_id) then
    return jsonb_build_object('result', 'not_found');
  end if;
  select * into m from iris.messages where id = d.message_id for update;
  select * into d from iris.drafts where id = p_draft;
  if d.state <> 'proposed' or m.state not in ('drafted', 'escalated') then
    return jsonb_build_object('result', 'conflict');
  end if;

  update iris.drafts set state = 'rejected', rejected_reason = p_reason where id = d.id;
  update iris.messages
     set state = 'escalated', escalation_reason = 'draft_rejected', state_changed_at = now(),
         handled_at = null, handled_by = null
   where id = m.id;
  perform iris.count_review(d.org_id, d.reply_type, 'reject', d.edited, d.policy_version);
  -- The reason is the owner's free text: it stays on the draft, not the event.
  insert into iris.events (org_id, kind, message_id, draft_id, actor, detail)
  values (d.org_id, 'draft_rejected', m.id, d.id, (select auth.uid())::text,
          jsonb_build_object('version', d.version, 'reply_type', d.reply_type));
  return jsonb_build_object('result', 'ok');
end;
$$;

revoke all on function iris.count_review(uuid, text, text, boolean, integer) from public;
revoke all on function iris.approve_draft(uuid, integer) from public;
revoke all on function iris.save_draft_edit(uuid, integer, text) from public;
revoke all on function iris.reject_draft(uuid, text) from public;
grant execute on function iris.approve_draft(uuid, integer) to authenticated;
grant execute on function iris.save_draft_edit(uuid, integer, text) to authenticated;
grant execute on function iris.reject_draft(uuid, text) to authenticated;

-- RLS: the org owner reads; service_role does the rest. ---------------------------------

alter table iris.drafts enable row level security;
alter table iris.reply_types enable row level security;
alter table iris.eval_labels enable row level security;
alter table iris.eval_runs enable row level security;
alter table iris.pushes enable row level security;
alter table iris.push_days enable row level security;

create policy "owner reads iris drafts" on iris.drafts for select to authenticated
  using (tracker.is_org_owner(org_id));

create policy "owner reads iris reply types" on iris.reply_types for select to authenticated
  using (tracker.is_org_owner(org_id));
create policy "owner switches iris reply types" on iris.reply_types for update to authenticated
  using (tracker.is_org_owner(org_id)) with check (tracker.is_org_owner(org_id));

create policy "owner reads iris eval labels" on iris.eval_labels for select to authenticated
  using (tracker.is_org_owner(org_id));
create policy "owner labels iris messages" on iris.eval_labels for insert to authenticated
  with check (tracker.is_org_owner(org_id) and labelled_by = (select auth.uid()));
create policy "owner relabels iris messages" on iris.eval_labels for update to authenticated
  using (tracker.is_org_owner(org_id))
  with check (tracker.is_org_owner(org_id) and labelled_by = (select auth.uid()));

create policy "owner reads iris eval runs" on iris.eval_runs for select to authenticated
  using (tracker.is_org_owner(org_id));
create policy "owner records iris eval runs" on iris.eval_runs for insert to authenticated
  with check (tracker.is_org_owner(org_id));

create policy "owner reads iris pushes" on iris.pushes for select to authenticated
  using (tracker.is_org_owner(org_id));

create policy "owner reads iris push days" on iris.push_days for select to authenticated
  using (tracker.is_org_owner(org_id));

revoke all on iris.drafts, iris.reply_types, iris.eval_labels, iris.eval_runs, iris.pushes, iris.push_days
  from anon, authenticated;
grant all on iris.drafts, iris.reply_types, iris.eval_labels, iris.eval_runs, iris.pushes, iris.push_days
  to service_role;

grant select on iris.drafts, iris.reply_types, iris.eval_labels, iris.eval_runs, iris.pushes, iris.push_days
  to authenticated;
grant update (auto_send_enabled) on iris.reply_types to authenticated;
grant insert (org_id, message_id, gold_intent, gold_reply_type, gold_escalate, draft_rating, note, labelled_by)
  on iris.eval_labels to authenticated;
grant update (gold_intent, gold_reply_type, gold_escalate, draft_rating, note, labelled_by, labelled_at)
  on iris.eval_labels to authenticated;
grant insert (org_id, policy_version, model, labelled_count, per_type, sensitive_recall, mean_rating_per_type)
  on iris.eval_runs to authenticated;
