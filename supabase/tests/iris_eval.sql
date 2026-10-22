-- REQ-45: Iris evaluation results (0028). Run by run-rls.sh on a fresh copy of
-- the migrated database. Privilege-sensitive steps switch role because the
-- runner connects as a superuser. Each check raises on failure.

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
grant execute on all functions in schema idt to public;

-- Shape ---------------------------------------------------------------------------
do $$ begin
  if not exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'iris' and c.relname = 'eval_results' and c.relkind = 'r' and c.relrowsecurity) then
    raise exception 'iris.eval_results is missing or has RLS off';
  end if;
  if not exists (select 1 from information_schema.columns
       where table_schema = 'iris' and table_name = 'eval_labels' and column_name = 'rated_result_id') then
    raise exception 'iris.eval_labels.rated_result_id is missing';
  end if;
end $$;

-- Fixtures: one imported message per org, an eval request event per org, a
-- result and a label per message, and an eval run per org.
insert into iris.threads (id, org_id, gmail_thread_id, parent_email, match_state, purge_at) values
  ('30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'g-t1', 'ann@example.com', 'matched', now() + interval '90 days'),
  ('30000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000002', 'g-t2', 'zed@example.com', 'matched', now() + interval '90 days');
insert into iris.messages (id, org_id, thread_id, gmail_message_id, direction, source, from_email, received_at, body_text,
                           state, escalation_reason, handled_at, purge_at) values
  ('31000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001',
   'g-m1', 'inbound', 'external', 'ann@example.com', now() - interval '30 days', 'Sam is sick', 'escalated', 'history_import', now(), now() + interval '90 days'),
  ('31000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000002',
   'g-m2', 'inbound', 'external', 'zed@example.com', now() - interval '30 days', 'Hi', 'escalated', 'history_import', now(), now() + interval '90 days');
insert into iris.events (id, org_id, kind, actor, detail) overriding system value values
  (9001, '10000000-0000-0000-0000-000000000001', 'eval_run_requested', 'a0000000-0000-0000-0000-000000000001', '{"policy_version": 3}'),
  (9002, '10000000-0000-0000-0000-000000000002', 'eval_run_requested', 'a0000000-0000-0000-0000-000000000002', '{"policy_version": 3}');
insert into iris.eval_results (id, org_id, request_event_id, message_id, policy_version, model, predicted_intent,
                               predicted_reply_type, predicted_escalate, draft_body, outcome) values
  ('50000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 9001, '31000000-0000-0000-0000-000000000001',
   3, 'm', 'cancellation', 'cancellation', false, 'Thanks for letting me know.', 'ok'),
  ('50000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000002', 9002, '31000000-0000-0000-0000-000000000002',
   3, 'm', 'cancellation', 'cancellation', false, 'Thanks.', 'ok');
insert into iris.eval_labels (org_id, message_id, gold_intent, labelled_by) values
  ('10000000-0000-0000-0000-000000000001', '31000000-0000-0000-0000-000000000001', 'cancellation', 'a0000000-0000-0000-0000-000000000001'),
  ('10000000-0000-0000-0000-000000000002', '31000000-0000-0000-0000-000000000002', 'cancellation', 'a0000000-0000-0000-0000-000000000002');
insert into iris.eval_runs (org_id, policy_version) values ('10000000-0000-0000-0000-000000000001', 3);

-- Constraints ---------------------------------------------------------------------
do $$ begin
  -- One result per message per request.
  perform idt.expect_error($q$insert into iris.eval_results (org_id, request_event_id, message_id, policy_version, predicted_escalate, outcome)
    values ('10000000-0000-0000-0000-000000000001', 9001, '31000000-0000-0000-0000-000000000001', 3, true, 'ok')$q$, '23505');
  perform idt.expect_error($q$insert into iris.eval_results (org_id, request_event_id, message_id, policy_version, predicted_escalate, outcome)
    values ('10000000-0000-0000-0000-000000000001', 9001, '31000000-0000-0000-0000-000000000002', 3, true, 'maybe')$q$, '23514');
  perform idt.expect_error($q$insert into iris.eval_results (org_id, request_event_id, message_id, policy_version, predicted_escalate, outcome, draft_body)
    values ('10000000-0000-0000-0000-000000000001', 9002, '31000000-0000-0000-0000-000000000001', 3, false, 'ok', '')$q$, '23514');
  perform idt.expect_error($q$insert into iris.eval_results (org_id, request_event_id, message_id, policy_version, predicted_escalate, outcome, error)
    values ('10000000-0000-0000-0000-000000000001', 9002, '31000000-0000-0000-0000-000000000001', 3, true, 'error', repeat('e', 301))$q$, '23514');
end $$;

-- Reads: the owner reads their own org, nobody else reads anything (AC13) ---------
do $$
declare
  who text;
  n_own bigint;
  n_other bigint;
begin
  perform idt.as_user('a0000000-0000-0000-0000-000000000001');
  select count(*) filter (where org_id = '10000000-0000-0000-0000-000000000001'),
         count(*) filter (where org_id <> '10000000-0000-0000-0000-000000000001')
    into n_own, n_other from iris.eval_results;
  if n_own <> 1 or n_other <> 0 then
    raise exception 'O1 read % own and % other eval results', n_own, n_other;
  end if;
  foreach who in array array['a0000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000001',
      'c0000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000001'] loop
    perform idt.as_user(who);
    select count(*) into n_own from iris.eval_results where org_id = '10000000-0000-0000-0000-000000000001';
    if n_own <> 0 then raise exception '% read % of Org One''s eval results', who, n_own; end if;
    select count(*) into n_own from iris.eval_labels where org_id = '10000000-0000-0000-0000-000000000001';
    if n_own <> 0 then raise exception '% read % of Org One''s eval labels', who, n_own; end if;
    select count(*) into n_own from iris.eval_runs where org_id = '10000000-0000-0000-0000-000000000001';
    if n_own <> 0 then raise exception '% read % of Org One''s eval runs', who, n_own; end if;
  end loop;
  perform set_config('role', 'anon', true);
  perform set_config('request.jwt.claims', '', true);
  perform idt.expect_error('select 1 from iris.eval_results', '42501');
  perform idt.as_super();
end $$;

-- Writes: nobody but the run writes eval_results; the owner rates (AC7, AC13) -----
do $$
declare stmt text;
begin
  perform idt.as_user('a0000000-0000-0000-0000-000000000001');
  foreach stmt in array array[
    $q$insert into iris.eval_results (org_id, request_event_id, message_id, policy_version, predicted_escalate, outcome)
       values ('10000000-0000-0000-0000-000000000001', 9001, '31000000-0000-0000-0000-000000000001', 4, true, 'ok')$q$,
    $q$update iris.eval_results set predicted_escalate = true$q$,
    $q$update iris.eval_results set draft_body = 'x'$q$,
    $q$delete from iris.eval_results$q$
  ] loop
    perform idt.expect_error(stmt, '42501');
  end loop;
  update iris.eval_labels
     set draft_rating = 5, rated_result_id = '50000000-0000-0000-0000-000000000001',
         labelled_by = 'a0000000-0000-0000-0000-000000000001'
   where message_id = '31000000-0000-0000-0000-000000000001';
  perform idt.as_super();
  if (select rated_result_id from iris.eval_labels where message_id = '31000000-0000-0000-0000-000000000001')
       is distinct from '50000000-0000-0000-0000-000000000001'::uuid
     or (select draft_rating from iris.eval_labels where message_id = '31000000-0000-0000-0000-000000000001') <> 5 then
    raise exception 'owner rating was not saved';
  end if;
  -- service_role writes results.
  perform set_config('role', 'service_role', true);
  update iris.eval_results set error = null where id = '50000000-0000-0000-0000-000000000001';
  perform idt.as_super();
end $$;

-- Other roles cannot write labels or results ----------------------------------------
do $$
declare who text;
begin
  foreach who in array array['a0000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000001',
      'c0000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000001'] loop
    perform idt.as_user(who);
    perform idt.expect_error($q$insert into iris.eval_results (org_id, request_event_id, message_id, policy_version, predicted_escalate, outcome)
       values ('10000000-0000-0000-0000-000000000001', 9001, '31000000-0000-0000-0000-000000000002', 3, true, 'ok')$q$, '42501');
    update iris.eval_labels set rated_result_id = null, labelled_by = who::uuid
     where message_id = '31000000-0000-0000-0000-000000000001';
  end loop;
  perform idt.as_super();
  if (select rated_result_id from iris.eval_labels where message_id = '31000000-0000-0000-0000-000000000001') is null then
    raise exception 'another role cleared the owner''s rating';
  end if;
end $$;

-- Purge (AC12): the message, its label and its results go; runs and events stay ----
do $$
declare n_events_before bigint;
begin
  select count(*) into n_events_before from iris.events where org_id = '10000000-0000-0000-0000-000000000001';
  update iris.messages set purge_at = now() - interval '1 minute' where id = '31000000-0000-0000-0000-000000000001';
  perform set_config('role', 'service_role', true);
  perform iris.purge_expired('10000000-0000-0000-0000-000000000001');
  perform idt.as_super();
  if exists (select 1 from iris.messages where id = '31000000-0000-0000-0000-000000000001') then
    raise exception 'purged message survived';
  end if;
  if exists (select 1 from iris.eval_labels where message_id = '31000000-0000-0000-0000-000000000001') then
    raise exception 'purged message kept its label';
  end if;
  if exists (select 1 from iris.eval_results where message_id = '31000000-0000-0000-0000-000000000001') then
    raise exception 'purged message kept its eval results';
  end if;
  if (select count(*) from iris.eval_runs where org_id = '10000000-0000-0000-0000-000000000001') <> 1 then
    raise exception 'purge removed an eval run';
  end if;
  if not exists (select 1 from iris.events where id = 9001) then
    raise exception 'purge removed the eval request event';
  end if;
  -- One purge event is added; none removed.
  if (select count(*) from iris.events where org_id = '10000000-0000-0000-0000-000000000001') <> n_events_before + 1 then
    raise exception 'purge changed the event count unexpectedly';
  end if;
  -- Org Two is untouched.
  if not exists (select 1 from iris.eval_results where id = '50000000-0000-0000-0000-000000000002') then
    raise exception 'purge reached another org';
  end if;
end $$;
