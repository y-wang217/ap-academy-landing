-- REQ-44: Iris drafts (0025). Run by run-rls.sh on a fresh copy of the
-- migrated database. Privilege-sensitive steps switch role because the runner
-- connects as a superuser. Each check raises on failure.

\set ON_ERROR_STOP on
\o /dev/null

-- Cast: O1 owner of Org One; O2 owner of Org Two; GT teacher, STU student and
-- PAR parent in Org One. Plus anon and service_role.
insert into auth.users (id, email) values
  ('a0000000-0000-0000-0000-000000000001', 'o1@example.com'),
  ('a0000000-0000-0000-0000-000000000002', 'o2@example.com'),
  ('b0000000-0000-0000-0000-000000000001', 'gt@example.com'),
  ('c0000000-0000-0000-0000-000000000001', 'stu@example.com'),
  ('e0000000-0000-0000-0000-000000000001', 'par@example.com');
insert into tracker.orgs (id, name) values
  ('10000000-0000-0000-0000-000000000001', 'Org One'),
  ('10000000-0000-0000-0000-000000000002', 'Org Two');
insert into tracker.memberships (user_id, org_id, role) values
  ('a0000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'owner'),
  ('a0000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000002', 'owner'),
  ('b0000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'teacher'),
  ('c0000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'student'),
  ('e0000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'parent');

create schema idt;
grant usage on schema idt to public;
create function idt.expect_error(stmt text, want_state text)
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
-- Refused: 42501, or no row touched (RLS hides every row).
create function idt.refused(stmt text) returns boolean language plpgsql as $$
declare n bigint;
begin
  execute stmt;
  get diagnostics n = row_count;
  return n = 0;
exception when insufficient_privilege then
  return true;
end $$;
create function idt.as_user(uid text) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', uid)::text, true);
end $$;
create function idt.as_super() returns void language plpgsql as $$
begin
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', '', true);
end $$;
-- One inbound message of Org One with a proposed Iris draft (version 1).
create function idt.new_draft(p_msg uuid, p_draft uuid, p_type text, p_policy integer, p_state text default 'drafted')
returns void language sql as $$
  insert into iris.messages (id, org_id, thread_id, gmail_message_id, direction, source, from_email, received_at, body_text, state, intent, purge_at)
  values (p_msg, '10000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', p_msg::text,
          'inbound', 'external', 'ann@example.com', now(), 'Hi', p_state, p_type, now() + interval '90 days');
  insert into iris.drafts (id, org_id, message_id, version, reply_type, body_text, policy_version, state, created_by)
  values (p_draft, '10000000-0000-0000-0000-000000000001', p_msg, 1, p_type, 'Thanks for letting me know.', p_policy, 'proposed', 'iris');
$$;
create function idt.rt(p_type text) returns iris.reply_types language sql as $$
  select * from iris.reply_types where org_id = '10000000-0000-0000-0000-000000000001' and type = p_type
$$;
grant execute on all functions in schema idt to public;

-- Shape ---------------------------------------------------------------------------
do $$ begin
  if not (select array_agg(c.relname::text) from pg_class c join pg_namespace n on n.oid = c.relnamespace
           where n.nspname = 'iris' and c.relkind = 'r')
         @> array['drafts', 'reply_types', 'eval_labels', 'eval_runs', 'pushes', 'push_days'] then
    raise exception 'an iris 0025 table is missing';
  end if;
  if exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'iris' and c.relkind = 'r' and not c.relrowsecurity) then
    raise exception 'an iris table has RLS off';
  end if;
  if not exists (select 1 from information_schema.columns
       where table_schema = 'iris' and table_name = 'messages' and column_name = 'notion_student_id') then
    raise exception 'iris.messages.notion_student_id is missing';
  end if;
end $$;

-- Fixtures: a thread per org; O2 has one message with a draft.
insert into iris.threads (id, org_id, gmail_thread_id, parent_email, match_state, purge_at) values
  ('30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'g-t1', 'ann@example.com', 'matched', now() + interval '90 days'),
  ('30000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000002', 'g-t2', 'zed@example.com', 'matched', now() + interval '90 days');
insert into iris.messages (id, org_id, thread_id, gmail_message_id, direction, source, from_email, received_at, body_text, state, intent, purge_at) values
  ('31000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000002',
   'g-m2', 'inbound', 'external', 'zed@example.com', now(), 'Hi', 'drafted', 'cancellation', now() + interval '90 days');
insert into iris.drafts (id, org_id, message_id, version, reply_type, body_text, policy_version, state, created_by) values
  ('40000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000002', '31000000-0000-0000-0000-000000000002',
   1, 'cancellation', 'Thanks', 3, 'proposed', 'iris');
select idt.new_draft('31000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001', 'cancellation', 3);

-- Constraints ---------------------------------------------------------------------
do $$ begin
  -- One proposed draft per message; versions unique per message.
  perform idt.expect_error($q$insert into iris.drafts (org_id, message_id, version, reply_type, body_text, policy_version, state, created_by)
    values ('10000000-0000-0000-0000-000000000001', '31000000-0000-0000-0000-000000000001', 2, 'cancellation', 'x', 3, 'proposed', 'iris')$q$, '23505');
  perform idt.expect_error($q$insert into iris.drafts (org_id, message_id, version, reply_type, body_text, policy_version, state, created_by)
    values ('10000000-0000-0000-0000-000000000001', '31000000-0000-0000-0000-000000000001', 1, 'cancellation', 'x', 3, 'superseded', 'iris')$q$, '23505');
  perform idt.expect_error($q$insert into iris.drafts (org_id, message_id, version, reply_type, body_text, policy_version, state, created_by)
    values ('10000000-0000-0000-0000-000000000001', '31000000-0000-0000-0000-000000000001', 9, 'cancellation', repeat('a', 5001), 3, 'superseded', 'iris')$q$, '23514');
  perform idt.expect_error($q$insert into iris.drafts (org_id, message_id, version, reply_type, body_text, policy_version, state, created_by)
    values ('10000000-0000-0000-0000-000000000001', '31000000-0000-0000-0000-000000000001', 9, 'cancellation', 'x', 3, 'superseded', 'someone')$q$, '23514');
  perform idt.expect_error($q$insert into iris.events (org_id, kind, draft_id, actor)
    values ('10000000-0000-0000-0000-000000000001', 'x', gen_random_uuid(), 'iris')$q$, '23503');
end $$;

-- Reads: the owner reads their org, nobody else reads anything ----------------------
insert into iris.reply_types (org_id, type) values
  ('10000000-0000-0000-0000-000000000001', 'general_question'),
  ('10000000-0000-0000-0000-000000000002', 'general_question');
insert into iris.eval_labels (org_id, message_id, gold_intent) values
  ('10000000-0000-0000-0000-000000000001', '31000000-0000-0000-0000-000000000001', 'cancellation'),
  ('10000000-0000-0000-0000-000000000002', '31000000-0000-0000-0000-000000000002', 'cancellation');
insert into iris.eval_runs (org_id, policy_version) values
  ('10000000-0000-0000-0000-000000000001', 3), ('10000000-0000-0000-0000-000000000002', 3);
insert into iris.pushes (org_id, message_id, draft_id, day, purge_at) values
  ('10000000-0000-0000-0000-000000000001', '31000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001', current_date, now() + interval '90 days'),
  ('10000000-0000-0000-0000-000000000002', '31000000-0000-0000-0000-000000000002', '40000000-0000-0000-0000-000000000002', current_date, now() + interval '90 days');
insert into iris.push_days (org_id, day) values
  ('10000000-0000-0000-0000-000000000001', current_date), ('10000000-0000-0000-0000-000000000002', current_date);

do $$
declare
  tbl text;
  who text;
  n_own bigint;
  n_other bigint;
  tables constant text[] := array['drafts', 'reply_types', 'eval_labels', 'eval_runs', 'pushes', 'push_days'];
begin
  perform idt.as_user('a0000000-0000-0000-0000-000000000001');
  foreach tbl in array tables loop
    execute format('select count(*) filter (where org_id = %L), count(*) filter (where org_id <> %L) from iris.%I',
      '10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', tbl) into n_own, n_other;
    if n_own = 0 or n_other <> 0 then
      raise exception 'O1 on iris.%: read % own and % other rows', tbl, n_own, n_other;
    end if;
  end loop;
  foreach who in array array['a0000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000001',
      'c0000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000001'] loop
    perform idt.as_user(who);
    foreach tbl in array tables loop
      execute format('select count(*) from iris.%I where org_id = %L', tbl, '10000000-0000-0000-0000-000000000001') into n_own;
      if n_own <> 0 then
        raise exception '% read % rows of iris.%', who, n_own, tbl;
      end if;
    end loop;
  end loop;
  perform set_config('role', 'anon', true);
  perform set_config('request.jwt.claims', '', true);
  foreach tbl in array tables loop
    perform idt.expect_error(format('select 1 from iris.%I', tbl), '42501');
  end loop;
  perform idt.as_super();
end $$;

-- Owner writes: drafts only through the functions; reply_types.auto_send_enabled only.
do $$
declare stmt text;
begin
  perform idt.as_user('a0000000-0000-0000-0000-000000000001');
  perform idt.expect_error($q$insert into iris.drafts (org_id, message_id, version, reply_type, body_text, policy_version, state, created_by)
    values ('10000000-0000-0000-0000-000000000001', '31000000-0000-0000-0000-000000000001', 2, 'cancellation', 'x', 3, 'proposed', 'owner')$q$, '42501');
  perform idt.expect_error($q$update iris.drafts set state = 'approved'$q$, '42501');
  perform idt.expect_error($q$update iris.drafts set body_text = 'x'$q$, '42501');
  perform idt.expect_error($q$delete from iris.drafts$q$, '42501');
  foreach stmt in array array[
    'update iris.reply_types set unedited_streak = 20',
    'update iris.reply_types set auto_send_eligible = true',
    'update iris.reply_types set approved_unedited_total = 1',
    'update iris.reply_types set streak_policy_version = 9',
    $q$insert into iris.reply_types (org_id, type) values ('10000000-0000-0000-0000-000000000001', 'x')$q$,
    'delete from iris.reply_types',
    $q$update iris.pushes set state = 'pushed'$q$,
    $q$update iris.push_days set work_page_id = 'x'$q$,
    $q$update iris.eval_runs set model = 'x'$q$
  ] loop
    perform idt.expect_error(stmt, '42501');
  end loop;
  if (select count(*) from iris.reply_types) <> 1 then raise exception 'owner should see one reply type'; end if;
  update iris.reply_types set auto_send_enabled = false where org_id = '10000000-0000-0000-0000-000000000001';
  -- Eval labels: own org and own name only.
  perform idt.expect_error($q$insert into iris.eval_labels (org_id, message_id, labelled_by)
    values ('10000000-0000-0000-0000-000000000002', '31000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001')$q$, '42501');
  update iris.eval_labels set draft_rating = 4, labelled_by = 'a0000000-0000-0000-0000-000000000001'
   where message_id = '31000000-0000-0000-0000-000000000001';
  insert into iris.eval_runs (org_id, policy_version) values ('10000000-0000-0000-0000-000000000001', 3);
  perform idt.as_super();
end $$;

-- Everyone else is refused by each function and changes nothing ---------------------
do $$
declare
  who text;
  res jsonb;
begin
  foreach who in array array['a0000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000001',
      'c0000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000001'] loop
    perform idt.as_user(who);
    res := iris.approve_draft('40000000-0000-0000-0000-000000000001', 1);
    if res ->> 'result' <> 'not_found' then raise exception '% approve gave %', who, res; end if;
    res := iris.save_draft_edit('40000000-0000-0000-0000-000000000001', 1, 'Hijacked');
    if res ->> 'result' <> 'not_found' then raise exception '% edit gave %', who, res; end if;
    res := iris.reject_draft('40000000-0000-0000-0000-000000000001', 'no');
    if res ->> 'result' <> 'not_found' then raise exception '% reject gave %', who, res; end if;
  end loop;
  perform set_config('role', 'anon', true);
  perform set_config('request.jwt.claims', '', true);
  perform idt.expect_error($q$select iris.approve_draft('40000000-0000-0000-0000-000000000001', 1)$q$, '42501');
  perform idt.expect_error($q$select iris.count_review('10000000-0000-0000-0000-000000000001', 'x', 'approve', false, 3)$q$, '42501');
  perform idt.as_user('a0000000-0000-0000-0000-000000000001');
  perform idt.expect_error($q$select iris.count_review('10000000-0000-0000-0000-000000000001', 'x', 'approve', false, 3)$q$, '42501');
  -- An unknown id reads as not_found too.
  if iris.approve_draft(gen_random_uuid(), 1) ->> 'result' <> 'not_found' then
    raise exception 'unknown draft should be not_found';
  end if;
  perform idt.as_super();
  if (select count(*) from iris.drafts where message_id = '31000000-0000-0000-0000-000000000001') <> 1
     or (select state from iris.drafts where id = '40000000-0000-0000-0000-000000000001') <> 'proposed'
     or (select state from iris.messages where id = '31000000-0000-0000-0000-000000000001') <> 'drafted'
     or idt.rt('cancellation') is not null then
    raise exception 'a refused call changed something';
  end if;
end $$;

-- Approve (AC8) --------------------------------------------------------------------
do $$
declare
  res jsonb;
  d iris.drafts;
  r iris.reply_types;
begin
  perform idt.as_user('a0000000-0000-0000-0000-000000000001');
  if iris.approve_draft('40000000-0000-0000-0000-000000000001', 2) ->> 'result' <> 'conflict' then
    raise exception 'approve with a wrong version should conflict';
  end if;
  res := iris.approve_draft('40000000-0000-0000-0000-000000000001', 1);
  if res ->> 'result' <> 'ok' then raise exception 'approve gave %', res; end if;
  if iris.approve_draft('40000000-0000-0000-0000-000000000001', 1) ->> 'result' <> 'conflict' then
    raise exception 'a second approve should conflict';
  end if;
  perform idt.as_super();
  select * into d from iris.drafts where id = '40000000-0000-0000-0000-000000000001';
  if d.state <> 'approved' or d.approval_mode <> 'manual' or d.approved_at is null
     or d.approved_by is distinct from 'a0000000-0000-0000-0000-000000000001'::uuid then
    raise exception 'approved draft fields wrong: %', to_jsonb(d);
  end if;
  if (select state from iris.messages where id = '31000000-0000-0000-0000-000000000001') <> 'approved' then
    raise exception 'message should be approved';
  end if;
  r := idt.rt('cancellation');
  if r.unedited_streak <> 1 or r.approved_unedited_total <> 1 or r.streak_policy_version <> 3 or r.auto_send_eligible then
    raise exception 'streak after one approval wrong: %', to_jsonb(r);
  end if;
  if (select count(*) from iris.events where kind = 'approved' and draft_id = '40000000-0000-0000-0000-000000000001'
        and actor = 'a0000000-0000-0000-0000-000000000001') <> 1 then
    raise exception 'one approved event expected';
  end if;
end $$;

-- Edit, then approve the edited version (AC9) ------------------------------------------
select idt.new_draft('31000000-0000-0000-0000-000000000003', '40000000-0000-0000-0000-000000000003', 'cancellation', 3);
do $$
declare
  res jsonb;
  new_id uuid;
  d iris.drafts;
  r iris.reply_types;
begin
  perform idt.as_user('a0000000-0000-0000-0000-000000000001');
  res := iris.save_draft_edit('40000000-0000-0000-0000-000000000003', 1, 'See you next week.');
  if res ->> 'result' <> 'ok' then raise exception 'edit gave %', res; end if;
  new_id := (res ->> 'draft_id')::uuid;
  if iris.save_draft_edit('40000000-0000-0000-0000-000000000003', 1, 'Again') ->> 'result' <> 'conflict' then
    raise exception 'editing a superseded version should conflict';
  end if;
  if iris.approve_draft('40000000-0000-0000-0000-000000000003', 1) ->> 'result' <> 'conflict' then
    raise exception 'approving a superseded version should conflict';
  end if;
  perform idt.as_super();
  select * into d from iris.drafts where id = new_id;
  if d.version <> 2 or d.created_by <> 'owner' or not d.edited or d.state <> 'proposed'
     or d.body_text <> 'See you next week.' or d.policy_version <> 3 or d.reply_type <> 'cancellation' then
    raise exception 'edited version wrong: %', to_jsonb(d);
  end if;
  if (select state from iris.drafts where id = '40000000-0000-0000-0000-000000000003') <> 'superseded' then
    raise exception 'version 1 should be superseded';
  end if;
  r := idt.rt('cancellation');
  if r.unedited_streak <> 0 or r.auto_send_eligible then raise exception 'edit should reset the streak'; end if;

  perform idt.as_user('a0000000-0000-0000-0000-000000000001');
  if iris.approve_draft(new_id, 2) ->> 'result' <> 'ok' then raise exception 'approving the edit failed'; end if;
  perform idt.as_super();
  r := idt.rt('cancellation');
  if r.edited_total <> 1 or r.unedited_streak <> 0 or r.approved_unedited_total <> 1 then
    raise exception 'approving an edit should count edited_total only: %', to_jsonb(r);
  end if;
end $$;

-- Reject (AC10) ----------------------------------------------------------------------
select idt.new_draft('31000000-0000-0000-0000-000000000004', '40000000-0000-0000-0000-000000000004', 'reschedule_request', 3);
update iris.messages set handled_at = now(), handled_by = 'a0000000-0000-0000-0000-000000000001'
 where id = '31000000-0000-0000-0000-000000000004';
do $$
declare
  m iris.messages;
  r iris.reply_types;
begin
  perform idt.as_user('a0000000-0000-0000-0000-000000000001');
  if iris.approve_draft('40000000-0000-0000-0000-000000000004', 1) ->> 'result' <> 'ok' then raise exception 'setup approve failed'; end if;
  perform idt.as_super();
  -- A fresh draft on a second message, then reject it.
  perform idt.new_draft('31000000-0000-0000-0000-000000000005', '40000000-0000-0000-0000-000000000005', 'reschedule_request', 3);
  update iris.messages set handled_at = now() where id = '31000000-0000-0000-0000-000000000005';
  perform idt.as_user('a0000000-0000-0000-0000-000000000001');
  if iris.reject_draft('40000000-0000-0000-0000-000000000005', 'Too formal') ->> 'result' <> 'ok' then raise exception 'reject failed'; end if;
  if iris.reject_draft('40000000-0000-0000-0000-000000000005', 'Again') ->> 'result' <> 'conflict' then
    raise exception 'a second reject should conflict';
  end if;
  perform idt.as_super();
  if (select state || '/' || rejected_reason from iris.drafts where id = '40000000-0000-0000-0000-000000000005') <> 'rejected/Too formal' then
    raise exception 'draft should be rejected with its reason';
  end if;
  select * into m from iris.messages where id = '31000000-0000-0000-0000-000000000005';
  if m.state <> 'escalated' or m.escalation_reason <> 'draft_rejected' or m.handled_at is not null then
    raise exception 'rejected message should be back in Needs you: %', to_jsonb(m);
  end if;
  r := idt.rt('reschedule_request');
  if r.unedited_streak <> 0 or r.rejected_total <> 1 or r.approved_unedited_total <> 1 then
    raise exception 'reject should reset the streak and count: %', to_jsonb(r);
  end if;
  if exists (select 1 from iris.events where kind = 'draft_rejected' and detail::text like '%Too formal%') then
    raise exception 'the reject reason must not reach events';
  end if;
end $$;

-- 19 and 20 unedited approvals; reset; policy versions (AC11) -------------------------
do $$
declare
  i integer;
  r iris.reply_types;
  msg uuid;
  dr uuid;
begin
  for i in 1..21 loop
    msg := ('5' || lpad(i::text, 7, '0') || '-0000-0000-0000-000000000001')::uuid;
    dr := ('6' || lpad(i::text, 7, '0') || '-0000-0000-0000-000000000001')::uuid;
    perform idt.as_super();
    perform idt.new_draft(msg, dr, 'general_question', 3);
    perform idt.as_user('a0000000-0000-0000-0000-000000000001');
    if i <= 20 then
      if iris.approve_draft(dr, 1) ->> 'result' <> 'ok' then raise exception 'approval % failed', i; end if;
      perform idt.as_super();
      r := idt.rt('general_question');
      if i = 19 and (r.unedited_streak <> 19 or r.auto_send_eligible) then
        raise exception 'after 19: %', to_jsonb(r);
      end if;
      if i = 20 and (r.unedited_streak <> 20 or not r.auto_send_eligible) then
        raise exception 'after 20: %', to_jsonb(r);
      end if;
    else
      -- The 21st is edited: streak 0, eligible false.
      if iris.save_draft_edit(dr, 1, 'Edited') ->> 'result' <> 'ok' then raise exception 'edit failed'; end if;
      perform idt.as_super();
      r := idt.rt('general_question');
      if r.unedited_streak <> 0 or r.auto_send_eligible then raise exception 'edit should clear eligibility'; end if;
    end if;
  end loop;

  -- Newer policy version restarts at 1; an older one does not count.
  perform idt.new_draft('52000000-0000-0000-0000-000000000001', '62000000-0000-0000-0000-000000000001', 'general_question', 3);
  perform idt.new_draft('52000000-0000-0000-0000-000000000002', '62000000-0000-0000-0000-000000000002', 'general_question', 4);
  perform idt.new_draft('52000000-0000-0000-0000-000000000003', '62000000-0000-0000-0000-000000000003', 'general_question', 3);
  perform idt.as_user('a0000000-0000-0000-0000-000000000001');
  perform iris.approve_draft('62000000-0000-0000-0000-000000000001', 1);
  perform idt.as_super();
  if (idt.rt('general_question')).unedited_streak <> 1 then raise exception 'streak should restart after the edit'; end if;
  perform idt.as_user('a0000000-0000-0000-0000-000000000001');
  perform iris.approve_draft('62000000-0000-0000-0000-000000000002', 1);
  perform idt.as_super();
  r := idt.rt('general_question');
  if r.unedited_streak <> 1 or r.streak_policy_version <> 4 then
    raise exception 'a newer policy version should restart at 1: %', to_jsonb(r);
  end if;
  perform idt.as_user('a0000000-0000-0000-0000-000000000001');
  perform iris.approve_draft('62000000-0000-0000-0000-000000000003', 1);
  perform idt.as_super();
  r := idt.rt('general_question');
  if r.unedited_streak <> 1 or r.streak_policy_version <> 4 then
    raise exception 'an older policy version should not count: %', to_jsonb(r);
  end if;
end $$;

-- An escalated message with a draft (needs_charlie, no_show) can be approved.
select idt.new_draft('31000000-0000-0000-0000-000000000006', '40000000-0000-0000-0000-000000000006', 'no_show', 3, 'escalated');
set role authenticated;
set request.jwt.claims = '{"sub": "a0000000-0000-0000-0000-000000000001"}';
do $$ begin
  if iris.approve_draft('40000000-0000-0000-0000-000000000006', 1) ->> 'result' <> 'ok' then
    raise exception 'an escalated message''s draft should be approvable';
  end if;
end $$;
reset role;
reset request.jwt.claims;

-- Audit: reply_types changes are audited, drafts are not (AC23) ------------------------
do $$
declare before_n bigint;
begin
  if not exists (select 1 from tracker.audit_log where table_name = 'reply_types') then
    raise exception 'reply_types changes should be audited';
  end if;
  if exists (select 1 from tracker.audit_log where table_name in ('drafts', 'pushes', 'push_days', 'eval_labels', 'eval_runs')) then
    raise exception 'only reply_types is audited';
  end if;
  before_n := (select count(*) from tracker.audit_log where table_name = 'reply_types');
  perform idt.as_user('a0000000-0000-0000-0000-000000000001');
  update iris.reply_types set auto_send_enabled = true where type = 'general_question';
  perform idt.as_super();
  if (select count(*) from tracker.audit_log where table_name = 'reply_types'
        and actor_id = 'a0000000-0000-0000-0000-000000000001') = 0
     or (select count(*) from tracker.audit_log where table_name = 'reply_types') <> before_n + 1 then
    raise exception 'the owner switch should write one audit row';
  end if;
end $$;

-- Purge: drafts go with the message, events and pushes keep their rows (AC23) --------------
update iris.messages set purge_at = now() - interval '1 day' where id = '31000000-0000-0000-0000-000000000001';
set role service_role;
do $$ begin
  perform iris.purge_expired('10000000-0000-0000-0000-000000000001');
  if exists (select 1 from iris.drafts where message_id = '31000000-0000-0000-0000-000000000001')
     or exists (select 1 from iris.eval_labels where message_id = '31000000-0000-0000-0000-000000000001') then
    raise exception 'drafts and labels should go with their message';
  end if;
  if exists (select 1 from iris.events where draft_id = '40000000-0000-0000-0000-000000000001') then
    raise exception 'events.draft_id should be null after purge';
  end if;
  if not exists (select 1 from iris.events where kind = 'approved' and draft_id is null and message_id is null) then
    raise exception 'the approved event should survive the purge';
  end if;
  if not exists (select 1 from iris.pushes where org_id = '10000000-0000-0000-0000-000000000001'
                   and message_id is null and draft_id is null) then
    raise exception 'the push row should survive with message_id and draft_id null';
  end if;
end $$;
reset role;

\o
\echo 'iris_drafts: ok'
