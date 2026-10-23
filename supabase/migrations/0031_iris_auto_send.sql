-- Iris auto-send (REQ-49, Iris 9/9): a reply type that passed the eval gate
-- and its 20-approval streak may send on its own, behind a per-type switch
-- and the global Sending switch, both off by default, held to quiet hours,
-- and switched off the moment Charlie disagrees with it. Tracker ADR 0078.
--
-- Additive, with replaced function bodies. No new table or column.
--
-- Who may switch a type on: the owner's raw column grant on
-- reply_types.auto_send_enabled is revoked. set_auto_send is the only way,
-- and it enforces the floor in SQL (never list, streak 20 at the caller's
-- policy version); the route runs the full TS gate first. The policy
-- "owner switches iris reply types" stays and does nothing without a grant.
--
-- The run (service_role) auto-approves with auto_approve_draft, which
-- re-checks every switch under the message lock, and resets streaks on a
-- policy change with reset_for_policy. claim_send withdraws a held auto send
-- whose switch went off. count_review and mark_send_failed carry the
-- fail-safes. Tested by supabase/tests/iris_auto_send.sql.

-- The streak, as in 0025, plus the edit/reject fail-safe: an edit or a reject
-- of a type that is switched on switches it off, with one event.
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
  switch_off boolean := false;
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
    switch_off := rt.auto_send_enabled;
  end if;

  update iris.reply_types
     set unedited_streak = rt.unedited_streak,
         approved_unedited_total = rt.approved_unedited_total,
         edited_total = rt.edited_total,
         rejected_total = rt.rejected_total,
         streak_policy_version = rt.streak_policy_version,
         auto_send_eligible = rt.unedited_streak >= streak_threshold,
         auto_send_enabled = case when switch_off then false else auto_send_enabled end,
         disabled_reason = case when switch_off then 'edited_after_enable' else disabled_reason end,
         disabled_at = case when switch_off then now() else disabled_at end
   where id = rt.id;

  if switch_off then
    insert into iris.events (org_id, kind, actor, detail)
    values (p_org, 'auto_send_disabled', coalesce((select auth.uid())::text, 'iris'),
            jsonb_build_object('reply_type', p_type, 'reason', 'edited_after_enable'));
  end if;
end;
$$;

-- As in 0028, plus: a failed auto send switches its type off. The streak stays,
-- so a Gmail outage does not cost 20 approvals.
create or replace function iris.mark_send_failed(p_send uuid, p_error text)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  s iris.sends;
  v_type text;
begin
  update iris.sends
     set state = 'failed', lease_until = null, last_error = left(p_error, 300)
   where id = p_send
  returning * into s;
  update iris.drafts set state = 'failed' where id = s.draft_id
  returning reply_type into v_type;
  update iris.messages
     set state = 'failed', state_changed_at = now(), last_error = left(p_error, 300)
   where id = s.message_id;
  insert into iris.events (org_id, kind, message_id, draft_id, actor, detail)
  values (s.org_id, 'send_failed', s.message_id, s.draft_id, 'iris',
          jsonb_build_object('send_id', s.id, 'attempts', s.attempts, 'error', left(p_error, 300)));

  if s.mode = 'auto' then
    update iris.reply_types
       set auto_send_enabled = false, disabled_reason = 'send_failed', disabled_at = now()
     where org_id = s.org_id and type = v_type and auto_send_enabled;
    if found then
      insert into iris.events (org_id, kind, message_id, draft_id, actor, detail)
      values (s.org_id, 'auto_send_disabled', s.message_id, s.draft_id, 'iris',
              jsonb_build_object('reply_type', v_type, 'reason', 'send_failed'));
    end if;
  end if;
end;
$$;

-- The gate's approval, for the run only. Re-checks the switches and the draft
-- under the message lock. Returns {"result": "ok", "send_id"} or
-- {"result": "skipped", "reason"}. The send waits on lease_until until
-- p_send_after (quiet hours); a null p_send_after leaves it claimable now.
-- Auto approvals never count in the streak or the totals.
create or replace function iris.auto_approve_draft(p_draft uuid, p_send_after timestamptz)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  -- Mirrors NEVER_AUTO_SEND (apps/tracker/lib/iris/policy.ts).
  never_list constant text[] := array['pause_or_stop', 'billing_question', 'refund_request', 'no_show', 'other'];
  d iris.drafts;
  m iris.messages;
  st iris.settings;
  rt iris.reply_types;
  v_id uuid := gen_random_uuid();
  skip text;
begin
  select * into d from iris.drafts where id = p_draft;
  if d.id is null then
    return jsonb_build_object('result', 'skipped', 'reason', 'not_found');
  end if;
  select * into m from iris.messages where id = d.message_id for update;
  select * into d from iris.drafts where id = p_draft;
  select * into st from iris.settings where org_id = d.org_id;
  select * into rt from iris.reply_types where org_id = d.org_id and type = d.reply_type;

  if exists (select 1 from iris.sends where draft_id = d.id) or d.state <> 'proposed' then
    skip := 'conflict';
  elsif coalesce(st.paused, true) then
    skip := 'paused';
  elsif not coalesce(st.sending_enabled, false) then
    skip := 'sending_disabled';
  elsif d.reply_type = any (never_list) then
    skip := 'never_auto_send';
  elsif rt.id is null or not rt.auto_send_enabled then
    skip := 'type_disabled';
  elsif d.version <> 1 or d.created_by <> 'iris' or d.edited then
    skip := 'edited';
  elsif d.policy_version is distinct from rt.streak_policy_version then
    skip := 'policy_version';
  elsif m.state is distinct from 'drafted' then
    skip := 'needs_charlie';
  end if;
  if skip is not null then
    return jsonb_build_object('result', 'skipped', 'reason', skip);
  end if;

  update iris.drafts
     set state = 'approved', approval_mode = 'auto', approved_by = null, approved_at = now(),
         send_after = p_send_after
   where id = d.id;
  update iris.messages set state = 'approved', state_changed_at = now() where id = m.id;
  insert into iris.events (org_id, kind, message_id, draft_id, actor, detail)
  values (d.org_id, 'auto_approved', m.id, d.id, 'gate',
          jsonb_build_object('version', d.version, 'reply_type', d.reply_type, 'send_after', p_send_after));

  insert into iris.sends (id, org_id, draft_id, message_id, rfc_message_id, state, mode, attempts, lease_until)
  values (v_id, d.org_id, d.id, m.id, '<iris-' || v_id || '@apacademy.ca>', 'sending', 'auto', 0, p_send_after);
  insert into iris.events (org_id, kind, message_id, draft_id, actor, detail)
  values (d.org_id, 'send_started', m.id, d.id, 'gate',
          jsonb_build_object('send_id', v_id, 'attempt', 0));
  return jsonb_build_object('result', 'ok', 'send_id', v_id);
end;
$$;

-- As in 0028, plus: an auto send that has not been attempted, whose type or
-- the Sending switch is now off, is withdrawn back to the manual queue
-- ("withdrawn"). Paused leaves it waiting.
create or replace function iris.claim_send(p_send uuid, p_lease_seconds integer, p_max_attempts integer)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  s iris.sends;
  d iris.drafts;
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
  if s.mode = 'auto' and s.attempts = 0 then
    select * into d from iris.drafts where id = s.draft_id;
    if not coalesce((select st.sending_enabled from iris.settings st where st.org_id = s.org_id), false)
       or not coalesce((select rt.auto_send_enabled from iris.reply_types rt
                         where rt.org_id = s.org_id and rt.type = d.reply_type), false) then
      delete from iris.sends where id = s.id;
      update iris.drafts
         set state = 'proposed', approval_mode = null, approved_by = null, approved_at = null, send_after = null
       where id = d.id;
      update iris.messages set state = 'drafted', state_changed_at = now() where id = s.message_id;
      insert into iris.events (org_id, kind, message_id, draft_id, actor, detail)
      values (s.org_id, 'auto_send_withdrawn', s.message_id, s.draft_id, 'iris',
              jsonb_build_object('send_id', s.id, 'reply_type', d.reply_type));
      return 'withdrawn';
    end if;
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

-- The owner's per-type switch. Returns {"result": "ok" | "gate_failed" |
-- "not_found", "failing"}. Enabling needs the type off the never list and an
-- unedited streak of 20 at p_policy_version; the eval numbers are checked by
-- the route. The audit_reply_types trigger writes the audit row.
create or replace function iris.set_auto_send(p_org uuid, p_type text, p_enabled boolean, p_policy_version integer)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  -- Mirrors NEVER_AUTO_SEND (apps/tracker/lib/iris/policy.ts).
  never_list constant text[] := array['pause_or_stop', 'billing_question', 'refund_request', 'no_show', 'other'];
  -- Mirrors TUNING.irisAutoSendStreak (apps/tracker/lib/domain/tuning.ts).
  streak_threshold constant integer := 20;
  rt iris.reply_types;
begin
  if not tracker.is_org_owner(p_org) then
    return jsonb_build_object('result', 'not_found');
  end if;
  if p_enabled and p_type = any (never_list) then
    return jsonb_build_object('result', 'gate_failed', 'failing', jsonb_build_array('never_auto_send'));
  end if;
  select * into rt from iris.reply_types where org_id = p_org and type = p_type for update;

  if p_enabled then
    if rt.id is null or rt.unedited_streak < streak_threshold
       or rt.streak_policy_version is distinct from p_policy_version then
      return jsonb_build_object('result', 'gate_failed', 'failing', jsonb_build_array('streak'));
    end if;
    if not rt.auto_send_enabled then
      update iris.reply_types
         set auto_send_enabled = true, enabled_at = now(), enabled_by = (select auth.uid())
       where id = rt.id;
      insert into iris.events (org_id, kind, actor, detail)
      values (p_org, 'auto_send_enabled', (select auth.uid())::text,
              jsonb_build_object('reply_type', p_type, 'policy_version', p_policy_version));
    end if;
  elsif rt.id is not null and rt.auto_send_enabled then
    update iris.reply_types
       set auto_send_enabled = false, disabled_at = now(), disabled_reason = 'owner'
     where id = rt.id;
    insert into iris.events (org_id, kind, actor, detail)
    values (p_org, 'auto_send_disabled', (select auth.uid())::text,
            jsonb_build_object('reply_type', p_type, 'reason', 'owner'));
  end if;
  return jsonb_build_object('result', 'ok');
end;
$$;

-- A new POLICY_VERSION restarts every streak: each type at another version is
-- switched off, made not eligible and reset to 0 under the new version; a type
-- that was on records 'policy_changed' and one event. Idempotent. Returns the
-- number of types changed.
create or replace function iris.reset_for_policy(p_org uuid, p_policy_version integer)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  rt iris.reply_types;
  n integer := 0;
begin
  for rt in
    select * from iris.reply_types
     where org_id = p_org and streak_policy_version is not null and streak_policy_version <> p_policy_version
     for update
  loop
    update iris.reply_types
       set auto_send_enabled = false, auto_send_eligible = false, unedited_streak = 0,
           streak_policy_version = p_policy_version,
           disabled_reason = case when rt.auto_send_enabled then 'policy_changed' else disabled_reason end,
           disabled_at = case when rt.auto_send_enabled then now() else disabled_at end
     where id = rt.id;
    if rt.auto_send_enabled then
      insert into iris.events (org_id, kind, actor, detail)
      values (p_org, 'auto_send_disabled', 'iris',
              jsonb_build_object('reply_type', rt.type, 'reason', 'policy_changed', 'policy_version', p_policy_version));
    end if;
    n := n + 1;
  end loop;
  return n;
end;
$$;

revoke all on function iris.auto_approve_draft(uuid, timestamptz) from public;
revoke all on function iris.set_auto_send(uuid, text, boolean, integer) from public;
revoke all on function iris.reset_for_policy(uuid, integer) from public;
grant execute on function iris.auto_approve_draft(uuid, timestamptz) to service_role;
grant execute on function iris.reset_for_policy(uuid, integer) to service_role;
grant execute on function iris.set_auto_send(uuid, text, boolean, integer) to authenticated;

revoke update (auto_send_enabled) on iris.reply_types from authenticated;
