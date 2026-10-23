-- REQ-49: Iris auto-send (0031). Run by run-rls.sh on a fresh copy of the
-- migrated database. Privilege-sensitive steps switch role because the runner
-- connects as a superuser. Each check raises on failure.

\set ON_ERROR_STOP on
\o /dev/null

-- Cast: O1 owner of Org One; O2 owner of Org Two; GT teacher in Org One.
insert into auth.users (id, email) values
  ('a0000000-0000-0000-0000-000000000001', 'o1@example.com'),
  ('a0000000-0000-0000-0000-000000000002', 'o2@example.com'),
  ('b0000000-0000-0000-0000-000000000001', 'gt@example.com');
insert into tracker.orgs (id, name) values
  ('10000000-0000-0000-0000-000000000001', 'Org One'),
  ('10000000-0000-0000-0000-000000000002', 'Org Two');
insert into tracker.memberships (user_id, org_id, role) values
  ('a0000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'owner'),
  ('a0000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000002', 'owner'),
  ('b0000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'teacher');
-- Org One runs with Sending on.
insert into iris.settings (org_id, paused, sending_enabled) values
  ('10000000-0000-0000-0000-000000000001', false, true),
  ('10000000-0000-0000-0000-000000000002', true, false);
-- Org One: late_cancel at a full streak (policy 5), cancellation below it,
-- general_question at a full streak of an older policy.
insert into iris.reply_types (org_id, type, unedited_streak, streak_policy_version, auto_send_eligible) values
  ('10000000-0000-0000-0000-000000000001', 'late_cancel', 20, 5, true),
  ('10000000-0000-0000-0000-000000000001', 'cancellation', 7, 5, false),
  ('10000000-0000-0000-0000-000000000001', 'general_question', 25, 4, true),
  ('10000000-0000-0000-0000-000000000001', 'pause_or_stop', 30, 5, true);

create schema ist;
grant usage on schema ist to public;
create function ist.expect_error(stmt text, want_state text)
returns void language plpgsql as $$
begin
  execute stmt;
  raise exception 'statement succeeded, expected %: %', want_state, stmt;
exception when others then
  if sqlerrm like 'statement succeeded%' then raise; end if;
  if sqlstate <> want_state then
    raise exception 'expected %, got % (%) for %', want_state, sqlstate, sqlerrm, stmt;
  end if;
end $$;
create function ist.as_user(uid text) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', uid)::text, true);
end $$;
create function ist.as_service() returns void language plpgsql as $$
begin
  perform set_config('role', 'service_role', true);
  perform set_config('request.jwt.claims', '{"role": "service_role"}', true);
end $$;
create function ist.as_super() returns void language plpgsql as $$
begin
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', '', true);
end $$;
-- One drafted inbound message with a proposed Iris draft (version 1, policy 5).
create function ist.new_draft(p_msg uuid, p_draft uuid, p_type text)
returns void language sql as $$
  insert into iris.messages (id, org_id, thread_id, gmail_message_id, direction, source, from_email, received_at,
                             rfc_message_id, body_text, state, intent, confidence, purge_at)
  values (p_msg, '10000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', p_msg::text,
          'inbound', 'external', 'ann@example.com', now() - interval '1 hour',
          '<in-' || p_msg || '@example.com>', 'Hi', 'drafted', 'cancellation', 0.95, now() + interval '90 days');
  insert into iris.drafts (id, org_id, message_id, version, reply_type, body_text, policy_version, state, created_by)
  values (p_draft, '10000000-0000-0000-0000-000000000001', p_msg, 1, p_type, 'Thanks for letting me know.', 5, 'proposed', 'iris');
$$;
create function ist.rt(p_type text) returns iris.reply_types language sql as $$
  select * from iris.reply_types where org_id = '10000000-0000-0000-0000-000000000001' and type = p_type
$$;
create function ist.events(p_kind text) returns bigint language sql as $$
  select count(*) from iris.events where kind = p_kind
$$;
grant execute on all functions in schema ist to public;

insert into iris.threads (id, org_id, gmail_thread_id, parent_email, match_state, subject, purge_at) values
  ('30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'g-t1', 'ann@example.com',
   'matched', 'Monday', now() + interval '90 days');

-- The owner cannot switch a type directly -----------------------------------------------
do $$ begin
  perform ist.as_user('a0000000-0000-0000-0000-000000000001');
  perform ist.expect_error($q$update iris.reply_types set auto_send_enabled = true where type = 'late_cancel'$q$, '42501');
  perform ist.as_super();
  if (ist.rt('late_cancel')).auto_send_enabled then raise exception 'a direct update switched a type on'; end if;
end $$;

-- set_auto_send: refused callers and refused types ------------------------------------
do $$
declare
  res jsonb;
  who text;
begin
  foreach who in array array['a0000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000001'] loop
    perform ist.as_user(who);
    res := iris.set_auto_send('10000000-0000-0000-0000-000000000001', 'late_cancel', true, 5);
    if res ->> 'result' <> 'not_found' then raise exception '% set_auto_send gave %', who, res; end if;
  end loop;
  perform set_config('role', 'anon', true);
  perform set_config('request.jwt.claims', '', true);
  perform ist.expect_error($q$select iris.set_auto_send('10000000-0000-0000-0000-000000000001', 'late_cancel', true, 5)$q$, '42501');

  perform ist.as_user('a0000000-0000-0000-0000-000000000001');
  res := iris.set_auto_send('10000000-0000-0000-0000-000000000001', 'pause_or_stop', true, 5);
  if res ->> 'result' <> 'gate_failed' or res -> 'failing' <> '["never_auto_send"]'::jsonb then
    raise exception 'never-list type gave %', res;
  end if;
  res := iris.set_auto_send('10000000-0000-0000-0000-000000000001', 'cancellation', true, 5);
  if res ->> 'result' <> 'gate_failed' or res -> 'failing' <> '["streak"]'::jsonb then
    raise exception 'low-streak type gave %', res;
  end if;
  res := iris.set_auto_send('10000000-0000-0000-0000-000000000001', 'general_question', true, 5);
  if res ->> 'result' <> 'gate_failed' then raise exception 'old-version type gave %', res; end if;
  res := iris.set_auto_send('10000000-0000-0000-0000-000000000001', 'reschedule_offer', true, 5);
  if res ->> 'result' <> 'gate_failed' then raise exception 'missing row gave %', res; end if;
  perform ist.as_super();
  if exists (select 1 from iris.reply_types where auto_send_enabled) then
    raise exception 'a refused set_auto_send switched a type on';
  end if;
end $$;

-- set_auto_send: the owner enables a qualifying type, with an audit row ------------------
do $$
declare
  res jsonb;
  rt iris.reply_types;
  n_audit bigint;
begin
  select count(*) into n_audit from tracker.audit_log where table_name = 'reply_types';
  perform ist.as_user('a0000000-0000-0000-0000-000000000001');
  res := iris.set_auto_send('10000000-0000-0000-0000-000000000001', 'late_cancel', true, 5);
  if res ->> 'result' <> 'ok' then raise exception 'enable gave %', res; end if;
  perform ist.as_super();
  rt := ist.rt('late_cancel');
  if not rt.auto_send_enabled or rt.enabled_at is null
     or rt.enabled_by <> 'a0000000-0000-0000-0000-000000000001' then
    raise exception 'enable fields wrong: %', to_jsonb(rt);
  end if;
  if (select count(*) from tracker.audit_log where table_name = 'reply_types') <= n_audit then
    raise exception 'enable wrote no audit row';
  end if;
  if ist.events('auto_send_enabled') <> 1 then raise exception 'one auto_send_enabled event expected'; end if;
end $$;

-- auto_approve_draft: refused to authenticated; skips; one auto send ---------------------
select ist.new_draft('31000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001', 'late_cancel');
select ist.new_draft('31000000-0000-0000-0000-000000000002', '40000000-0000-0000-0000-000000000002', 'cancellation');
select ist.new_draft('31000000-0000-0000-0000-000000000003', '40000000-0000-0000-0000-000000000003', 'late_cancel');
select ist.new_draft('31000000-0000-0000-0000-000000000004', '40000000-0000-0000-0000-000000000004', 'late_cancel');
do $$
declare
  res jsonb;
  s iris.sends;
  d iris.drafts;
begin
  perform ist.as_user('a0000000-0000-0000-0000-000000000001');
  perform ist.expect_error($q$select iris.auto_approve_draft('40000000-0000-0000-0000-000000000001', null)$q$, '42501');
  perform ist.expect_error($q$select iris.reset_for_policy('10000000-0000-0000-0000-000000000001', 6)$q$, '42501');

  perform ist.as_service();
  res := iris.auto_approve_draft('40000000-0000-0000-0000-000000000002', null);
  if res ->> 'result' <> 'skipped' or res ->> 'reason' <> 'type_disabled' then raise exception 'off type gave %', res; end if;

  -- An edited draft is skipped.
  perform ist.as_super();
  update iris.drafts set edited = true where id = '40000000-0000-0000-0000-000000000004';
  perform ist.as_service();
  res := iris.auto_approve_draft('40000000-0000-0000-0000-000000000004', null);
  if res ->> 'result' <> 'skipped' or res ->> 'reason' <> 'edited' then raise exception 'edited draft gave %', res; end if;

  -- A draft at another policy version is skipped.
  perform ist.as_super();
  update iris.drafts set edited = false, policy_version = 4 where id = '40000000-0000-0000-0000-000000000004';
  perform ist.as_service();
  res := iris.auto_approve_draft('40000000-0000-0000-0000-000000000004', null);
  if res ->> 'result' <> 'skipped' or res ->> 'reason' <> 'policy_version' then raise exception 'old policy gave %', res; end if;

  -- A message that is not drafted is skipped.
  perform ist.as_super();
  update iris.drafts set policy_version = 5 where id = '40000000-0000-0000-0000-000000000004';
  update iris.messages set state = 'escalated' where id = '31000000-0000-0000-0000-000000000004';
  perform ist.as_service();
  res := iris.auto_approve_draft('40000000-0000-0000-0000-000000000004', null);
  if res ->> 'result' <> 'skipped' or res ->> 'reason' <> 'needs_charlie' then raise exception 'escalated gave %', res; end if;

  -- Sending off, then paused.
  perform ist.as_super();
  update iris.settings set sending_enabled = false where org_id = '10000000-0000-0000-0000-000000000001';
  perform ist.as_service();
  res := iris.auto_approve_draft('40000000-0000-0000-0000-000000000001', null);
  if res ->> 'result' <> 'skipped' or res ->> 'reason' <> 'sending_disabled' then raise exception 'sending off gave %', res; end if;
  perform ist.as_super();
  update iris.settings set sending_enabled = true, paused = true where org_id = '10000000-0000-0000-0000-000000000001';
  perform ist.as_service();
  res := iris.auto_approve_draft('40000000-0000-0000-0000-000000000001', null);
  if res ->> 'result' <> 'skipped' or res ->> 'reason' <> 'paused' then raise exception 'paused gave %', res; end if;
  perform ist.as_super();
  update iris.settings set paused = false where org_id = '10000000-0000-0000-0000-000000000001';
  if exists (select 1 from iris.sends) or ist.events('auto_approved') <> 0 then
    raise exception 'a skipped auto-approve wrote something';
  end if;

  -- The pass: one send, mode auto, no attempt yet, the streak untouched.
  perform ist.as_service();
  res := iris.auto_approve_draft('40000000-0000-0000-0000-000000000001', null);
  if res ->> 'result' <> 'ok' then raise exception 'auto approve gave %', res; end if;
  res := iris.auto_approve_draft('40000000-0000-0000-0000-000000000001', null);
  if res ->> 'result' <> 'skipped' then raise exception 'second auto approve gave %', res; end if;
  perform ist.as_super();
  select * into s from iris.sends where draft_id = '40000000-0000-0000-0000-000000000001';
  select * into d from iris.drafts where id = '40000000-0000-0000-0000-000000000001';
  if s.mode <> 'auto' or s.attempts <> 0 or s.state <> 'sending' or s.lease_until is not null then
    raise exception 'auto send fields wrong: %', to_jsonb(s);
  end if;
  if d.state <> 'approved' or d.approval_mode <> 'auto' or d.approved_by is not null or d.approved_at is null then
    raise exception 'auto-approved draft fields wrong: %', to_jsonb(d);
  end if;
  if (select state from iris.messages where id = '31000000-0000-0000-0000-000000000001') <> 'approved' then
    raise exception 'the message should be approved';
  end if;
  if (ist.rt('late_cancel')).unedited_streak <> 20 or (ist.rt('late_cancel')).approved_unedited_total <> 0 then
    raise exception 'an auto approval must not count in the streak or totals';
  end if;
  if ist.events('auto_approved') <> 1 or (select actor from iris.events where kind = 'auto_approved') <> 'gate' then
    raise exception 'one auto_approved event by gate expected';
  end if;

  -- A daytime auto send is claimable at once.
  perform ist.as_service();
  if iris.claim_send(s.id, 60, 3) <> 'claimed' then raise exception 'daytime auto send should claim'; end if;
end $$;

-- Quiet hours: a held send is busy until send_after; withdrawn when the type is off ------
do $$
declare
  res jsonb;
  s iris.sends;
  d iris.drafts;
begin
  perform ist.as_service();
  res := iris.auto_approve_draft('40000000-0000-0000-0000-000000000003', now() + interval '8 hours');
  if res ->> 'result' <> 'ok' then raise exception 'held auto approve gave %', res; end if;
  perform ist.as_super();
  select * into s from iris.sends where draft_id = '40000000-0000-0000-0000-000000000003';
  select * into d from iris.drafts where id = '40000000-0000-0000-0000-000000000003';
  if s.lease_until is null or s.lease_until < now() + interval '7 hours' or d.send_after is distinct from s.lease_until then
    raise exception 'held send should wait on lease_until = send_after: % %', to_jsonb(s), to_jsonb(d);
  end if;
  perform ist.as_service();
  if iris.claim_send(s.id, 60, 3) <> 'busy' then raise exception 'held send should be busy'; end if;

  -- Paused leaves it waiting.
  perform ist.as_super();
  update iris.settings set paused = true where org_id = '10000000-0000-0000-0000-000000000001';
  update iris.reply_types set auto_send_enabled = false where org_id = '10000000-0000-0000-0000-000000000001' and type = 'late_cancel';
  perform ist.as_service();
  if iris.claim_send(s.id, 60, 3) <> 'paused' then raise exception 'paused should leave the held send'; end if;
  perform ist.as_super();
  update iris.settings set paused = false where org_id = '10000000-0000-0000-0000-000000000001';

  -- The type is off: withdrawn back to the queue.
  perform ist.as_service();
  if iris.claim_send(s.id, 60, 3) <> 'withdrawn' then raise exception 'held send of an off type should withdraw'; end if;
  perform ist.as_super();
  select * into d from iris.drafts where id = '40000000-0000-0000-0000-000000000003';
  if exists (select 1 from iris.sends where id = s.id)
     or d.state <> 'proposed' or d.approval_mode is not null or d.approved_at is not null or d.send_after is not null
     or (select state from iris.messages where id = '31000000-0000-0000-0000-000000000003') <> 'drafted'
     or ist.events('auto_send_withdrawn') <> 1 then
    raise exception 'withdraw did not return the draft to the queue: %', to_jsonb(d);
  end if;
  update iris.reply_types set auto_send_enabled = true where org_id = '10000000-0000-0000-0000-000000000001' and type = 'late_cancel';
end $$;

-- Failed sends: an auto send switches its type off, a manual one does not ----------------
do $$
declare
  s iris.sends;
  rt iris.reply_types;
begin
  select * into s from iris.sends where draft_id = '40000000-0000-0000-0000-000000000001';
  perform ist.as_service();
  if iris.fail_send_attempt(s.id, 'Gmail said no', 1) <> 'failed' then raise exception 'auto send should fail'; end if;
  perform ist.as_super();
  rt := ist.rt('late_cancel');
  if rt.auto_send_enabled or rt.disabled_reason <> 'send_failed' or rt.disabled_at is null or rt.unedited_streak <> 20 then
    raise exception 'a failed auto send should switch the type off and keep the streak: %', to_jsonb(rt);
  end if;
  if ist.events('auto_send_disabled') <> 1 then raise exception 'one auto_send_disabled event expected'; end if;

  -- A manual send of an enabled type fails: the type stays on.
  update iris.reply_types set auto_send_enabled = true, disabled_reason = null where org_id = '10000000-0000-0000-0000-000000000001' and type = 'late_cancel';
  perform ist.as_user('a0000000-0000-0000-0000-000000000001');
  if iris.approve_draft_for_send('40000000-0000-0000-0000-000000000003', 1, 0) ->> 'result' <> 'ok' then
    raise exception 'manual approve failed';
  end if;
  perform ist.as_super();
  select * into s from iris.sends where draft_id = '40000000-0000-0000-0000-000000000003';
  perform ist.as_service();
  if iris.fail_send_attempt(s.id, 'Gmail said no', 1) <> 'failed' then raise exception 'manual send should fail'; end if;
  perform ist.as_super();
  if not (ist.rt('late_cancel')).auto_send_enabled then raise exception 'a failed manual send switched the type off'; end if;
end $$;

-- Edit and reject of an enabled type switch it off ---------------------------------------
select ist.new_draft('31000000-0000-0000-0000-000000000005', '40000000-0000-0000-0000-000000000005', 'late_cancel');
select ist.new_draft('31000000-0000-0000-0000-000000000006', '40000000-0000-0000-0000-000000000006', 'late_cancel');
do $$
declare
  res jsonb;
  rt iris.reply_types;
begin
  update iris.reply_types set unedited_streak = 20, auto_send_eligible = true
   where org_id = '10000000-0000-0000-0000-000000000001' and type = 'late_cancel';
  perform ist.as_user('a0000000-0000-0000-0000-000000000001');
  res := iris.save_draft_edit('40000000-0000-0000-0000-000000000005', 1, 'Thanks, noted.');
  if res ->> 'result' <> 'ok' then raise exception 'edit gave %', res; end if;
  perform ist.as_super();
  rt := ist.rt('late_cancel');
  if rt.auto_send_enabled or rt.auto_send_eligible or rt.unedited_streak <> 0
     or rt.disabled_reason <> 'edited_after_enable' or rt.disabled_at is null then
    raise exception 'an edit should switch the type off: %', to_jsonb(rt);
  end if;
  if ist.events('auto_send_disabled') <> 2 then raise exception 'edit should write one auto_send_disabled event'; end if;

  update iris.reply_types set unedited_streak = 20, auto_send_eligible = true, auto_send_enabled = true, disabled_reason = null
   where org_id = '10000000-0000-0000-0000-000000000001' and type = 'late_cancel';
  perform ist.as_user('a0000000-0000-0000-0000-000000000001');
  res := iris.reject_draft('40000000-0000-0000-0000-000000000006', 'Wrong tone');
  if res ->> 'result' <> 'ok' then raise exception 'reject gave %', res; end if;
  perform ist.as_super();
  rt := ist.rt('late_cancel');
  if rt.auto_send_enabled or rt.unedited_streak <> 0 or rt.disabled_reason <> 'edited_after_enable' then
    raise exception 'a reject should switch the type off: %', to_jsonb(rt);
  end if;
  if ist.events('auto_send_disabled') <> 3 then raise exception 'reject should write one auto_send_disabled event'; end if;

  -- An edit of a type that is off writes no disable event.
  perform ist.as_user('a0000000-0000-0000-0000-000000000001');
  res := iris.save_draft_edit((select id from iris.drafts where message_id = '31000000-0000-0000-0000-000000000005' and state = 'proposed'), 2, 'Thanks again.');
  perform ist.as_super();
  if ist.events('auto_send_disabled') <> 3 then raise exception 'an edit of an off type wrote a disable event'; end if;
end $$;

-- The owner switches a type off ----------------------------------------------------------
do $$
declare res jsonb;
begin
  update iris.reply_types set unedited_streak = 20, auto_send_eligible = true, auto_send_enabled = true, disabled_reason = null
   where org_id = '10000000-0000-0000-0000-000000000001' and type = 'late_cancel';
  perform ist.as_user('a0000000-0000-0000-0000-000000000001');
  res := iris.set_auto_send('10000000-0000-0000-0000-000000000001', 'late_cancel', false, 5);
  if res ->> 'result' <> 'ok' then raise exception 'disable gave %', res; end if;
  perform ist.as_super();
  if (ist.rt('late_cancel')).auto_send_enabled or (ist.rt('late_cancel')).disabled_reason <> 'owner' then
    raise exception 'owner disable fields wrong';
  end if;
  update iris.reply_types set auto_send_enabled = true
   where org_id = '10000000-0000-0000-0000-000000000001' and type = 'late_cancel';
end $$;

-- reset_for_policy is idempotent -----------------------------------------------------------
do $$
declare
  n integer;
  rt iris.reply_types;
  before_events bigint;
begin
  before_events := ist.events('auto_send_disabled');
  perform ist.as_service();
  n := iris.reset_for_policy('10000000-0000-0000-0000-000000000001', 6);
  if n <> 4 then raise exception 'reset changed % rows, expected 4', n; end if;
  perform ist.as_super();
  rt := ist.rt('late_cancel');
  if rt.auto_send_enabled or rt.auto_send_eligible or rt.unedited_streak <> 0 or rt.streak_policy_version <> 6
     or rt.disabled_reason <> 'policy_changed' then
    raise exception 'reset fields wrong: %', to_jsonb(rt);
  end if;
  if (ist.rt('cancellation')).disabled_reason is not null then
    raise exception 'a type that was off should keep its disabled reason';
  end if;
  if ist.events('auto_send_disabled') <> before_events + 1 then raise exception 'reset should write one event per type that was on'; end if;
  perform ist.as_service();
  n := iris.reset_for_policy('10000000-0000-0000-0000-000000000001', 6);
  if n <> 0 then raise exception 'a second reset changed % rows', n; end if;
  perform ist.as_super();
end $$;

\o
\echo 'iris_auto_send: ok'
