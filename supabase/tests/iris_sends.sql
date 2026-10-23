-- REQ-48: Iris sends (0028). Run by run-rls.sh on a fresh copy of the
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
-- Org One runs; Org Two is paused (the default).
insert into iris.settings (org_id, paused) values
  ('10000000-0000-0000-0000-000000000001', false),
  ('10000000-0000-0000-0000-000000000002', true);

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
-- One inbound message with a proposed draft (version 1) in the given org.
create function ist.new_draft(p_org uuid, p_thread uuid, p_msg uuid, p_draft uuid)
returns void language sql as $$
  insert into iris.messages (id, org_id, thread_id, gmail_message_id, direction, source, from_email, received_at,
                             rfc_message_id, body_text, state, intent, purge_at)
  values (p_msg, p_org, p_thread, p_msg::text, 'inbound', 'external', 'ann@example.com', now() - interval '1 hour',
          '<in-' || p_msg || '@example.com>', 'Hi', 'drafted', 'cancellation', now() + interval '90 days');
  insert into iris.drafts (id, org_id, message_id, version, reply_type, body_text, policy_version, state, created_by)
  values (p_draft, p_org, p_msg, 1, 'cancellation', 'Thanks for letting me know.', 3, 'proposed', 'iris');
$$;
create function ist.send_of(p_draft uuid) returns iris.sends language sql as $$
  select * from iris.sends where draft_id = p_draft
$$;
grant execute on all functions in schema ist to public;

-- Shape ---------------------------------------------------------------------------
do $$ begin
  if not exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'iris' and c.relname = 'sends' and c.relkind = 'r' and c.relrowsecurity) then
    raise exception 'iris.sends is missing or has RLS off';
  end if;
  if exists (select 1 from information_schema.columns where table_schema = 'iris' and table_name = 'sends'
       and column_name ~ '(prompt|answer|summary|completion|response|body|email)') then
    raise exception 'iris.sends must hold no text column beyond ids, states and the error line';
  end if;
end $$;

insert into iris.threads (id, org_id, gmail_thread_id, parent_email, match_state, subject, purge_at) values
  ('30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'g-t1', 'ann@example.com', 'matched', 'Monday', now() + interval '90 days'),
  ('30000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000002', 'g-t2', 'zed@example.com', 'matched', 'Tuesday', now() + interval '90 days');
select ist.new_draft('10000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001',
                     '31000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001');
select ist.new_draft('10000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000002',
                     '31000000-0000-0000-0000-000000000002', '40000000-0000-0000-0000-000000000002');

-- Refused callers change nothing --------------------------------------------------
do $$
declare
  who text;
  res jsonb;
begin
  foreach who in array array['a0000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000001',
      'c0000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000001'] loop
    perform ist.as_user(who);
    res := iris.approve_draft_for_send('40000000-0000-0000-0000-000000000001', 1, 60);
    if res ->> 'result' <> 'not_found' then raise exception '% approve gave %', who, res; end if;
  end loop;
  perform set_config('role', 'anon', true);
  perform set_config('request.jwt.claims', '', true);
  perform ist.expect_error($q$select iris.approve_draft_for_send('40000000-0000-0000-0000-000000000001', 1, 60)$q$, '42501');
  perform ist.expect_error($q$select iris.claim_send(gen_random_uuid(), 60, 3)$q$, '42501');
  perform ist.expect_error($q$select 1 from iris.sends$q$, '42501');
  -- service_role may not approve or retry; only the owner does.
  perform ist.as_service();
  perform ist.expect_error($q$select iris.approve_draft_for_send('40000000-0000-0000-0000-000000000001', 1, 60)$q$, '42501');
  perform ist.expect_error($q$select iris.retry_send(gen_random_uuid(), 60)$q$, '42501');
  perform ist.as_super();
  if exists (select 1 from iris.sends)
     or (select state from iris.drafts where id = '40000000-0000-0000-0000-000000000001') <> 'proposed' then
    raise exception 'a refused approve changed something';
  end if;
end $$;

-- Paused approve leaves nothing (Org Two is paused) -----------------------------------
do $$
declare res jsonb;
begin
  perform ist.as_user('a0000000-0000-0000-0000-000000000002');
  res := iris.approve_draft_for_send('40000000-0000-0000-0000-000000000002', 1, 60);
  if res ->> 'result' <> 'paused' then raise exception 'paused approve gave %', res; end if;
  perform ist.as_super();
  if exists (select 1 from iris.sends where org_id = '10000000-0000-0000-0000-000000000002')
     or (select state from iris.drafts where id = '40000000-0000-0000-0000-000000000002') <> 'proposed'
     or (select state from iris.messages where id = '31000000-0000-0000-0000-000000000002') <> 'drafted'
     or exists (select 1 from iris.reply_types where org_id = '10000000-0000-0000-0000-000000000002')
     or exists (select 1 from iris.events where org_id = '10000000-0000-0000-0000-000000000002') then
    raise exception 'a paused approve wrote something';
  end if;
  -- Unpause Org Two for the read checks below.
  update iris.settings set paused = false where org_id = '10000000-0000-0000-0000-000000000002';
  perform ist.as_user('a0000000-0000-0000-0000-000000000002');
  if iris.approve_draft_for_send('40000000-0000-0000-0000-000000000002', 1, 60) ->> 'result' <> 'ok' then
    raise exception 'O2 approve failed';
  end if;
  perform ist.as_super();
end $$;

-- Double approve leaves one row ------------------------------------------------------
do $$
declare
  res jsonb;
  res2 jsonb;
  s iris.sends;
begin
  perform ist.as_user('a0000000-0000-0000-0000-000000000001');
  if iris.approve_draft_for_send('40000000-0000-0000-0000-000000000001', 2, 60) ->> 'result' <> 'conflict' then
    raise exception 'approve with a wrong version should conflict';
  end if;
  res := iris.approve_draft_for_send('40000000-0000-0000-0000-000000000001', 1, 60);
  if res ->> 'result' <> 'ok' or res ->> 'state' <> 'sending' then raise exception 'approve gave %', res; end if;
  res2 := iris.approve_draft_for_send('40000000-0000-0000-0000-000000000001', 1, 60);
  if res2 ->> 'result' <> 'existing' or res2 ->> 'send_id' <> res ->> 'send_id' or res2 ->> 'state' <> 'sending' then
    raise exception 'second approve gave %', res2;
  end if;
  perform ist.as_super();
  if (select count(*) from iris.sends where draft_id = '40000000-0000-0000-0000-000000000001') <> 1 then
    raise exception 'double approve should leave one send';
  end if;
  s := ist.send_of('40000000-0000-0000-0000-000000000001');
  if s.id::text <> res ->> 'send_id' or s.state <> 'sending' or s.mode <> 'manual' or s.attempts <> 1
     or s.lease_until not between now() + interval '50 seconds' and now() + interval '70 seconds'
     or s.rfc_message_id <> '<iris-' || s.id || '@apacademy.ca>' or s.gmail_message_id is not null then
    raise exception 'new send fields wrong: %', to_jsonb(s);
  end if;
  if (select state from iris.drafts where id = '40000000-0000-0000-0000-000000000001') <> 'approved'
     or (select state from iris.messages where id = '31000000-0000-0000-0000-000000000001') <> 'approved'
     or (select unedited_streak from iris.reply_types
          where org_id = '10000000-0000-0000-0000-000000000001' and type = 'cancellation') <> 1 then
    raise exception 'approve should approve the draft and message and count the streak once';
  end if;
  if (select count(*) from iris.events where kind = 'approved' and draft_id = '40000000-0000-0000-0000-000000000001') <> 1
     or (select count(*) from iris.events where kind = 'send_started' and draft_id = '40000000-0000-0000-0000-000000000001') <> 1 then
    raise exception 'one approved and one send_started event expected';
  end if;
end $$;

-- Reads: the owner reads their own org only; nobody else reads anything; no direct writes
do $$
declare
  who text;
  n_own bigint;
  n_other bigint;
  stmt text;
begin
  perform ist.as_user('a0000000-0000-0000-0000-000000000001');
  select count(*) filter (where org_id = '10000000-0000-0000-0000-000000000001'),
         count(*) filter (where org_id <> '10000000-0000-0000-0000-000000000001')
    into n_own, n_other from iris.sends;
  if n_own <> 1 or n_other <> 0 then raise exception 'O1 read % own and % other sends', n_own, n_other; end if;
  foreach who in array array['a0000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000001',
      'c0000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000001'] loop
    perform ist.as_user(who);
    if (select count(*) from iris.sends where org_id = '10000000-0000-0000-0000-000000000001') <> 0 then
      raise exception '% read sends of Org One', who;
    end if;
  end loop;
  perform ist.as_user('a0000000-0000-0000-0000-000000000001');
  foreach stmt in array array[
    $q$insert into iris.sends (org_id, draft_id, message_id, rfc_message_id, state, mode)
       values ('10000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001',
               '31000000-0000-0000-0000-000000000001', '<x@y>', 'sending', 'manual')$q$,
    $q$update iris.sends set state = 'sent'$q$,
    $q$update iris.sends set attempts = 0$q$,
    $q$delete from iris.sends$q$
  ] loop
    perform ist.expect_error(stmt, '42501');
  end loop;
  perform ist.as_super();
end $$;

-- claim_send: busy, claimed, exhausted, paused -------------------------------------
do $$
declare
  sid uuid := (ist.send_of('40000000-0000-0000-0000-000000000001')).id;
  r text;
begin
  -- Other org's owner and the teacher see not_found; the owner sees busy (Approve's lease).
  perform ist.as_user('a0000000-0000-0000-0000-000000000002');
  if iris.claim_send(sid, 60, 3) <> 'not_found' then raise exception 'O2 claim should be not_found'; end if;
  if iris.finish_send(sid, 'gx', 'charlie@apacademy.ca', 'x', now()) <> 'not_found' then raise exception 'O2 finish should be not_found'; end if;
  if iris.fail_send_attempt(sid, 'x', 3) <> 'not_found' then raise exception 'O2 fail should be not_found'; end if;
  perform ist.as_user('b0000000-0000-0000-0000-000000000001');
  if iris.claim_send(sid, 60, 3) <> 'not_found' then raise exception 'teacher claim should be not_found'; end if;
  perform ist.as_user('a0000000-0000-0000-0000-000000000001');
  if iris.claim_send(sid, 60, 3) <> 'busy' then raise exception 'a live lease should be busy'; end if;

  -- A failed attempt clears the lease; the run can claim the next attempt.
  if iris.fail_send_attempt(sid, 'Gmail returned 500', 3) <> 'retrying' then raise exception 'first failure should be retrying'; end if;
  perform ist.as_super();
  if (ist.send_of('40000000-0000-0000-0000-000000000001')).lease_until is not null
     or (ist.send_of('40000000-0000-0000-0000-000000000001')).last_error <> 'Gmail returned 500' then
    raise exception 'a failed attempt should clear the lease and keep the status line';
  end if;

  -- Paused: no claim.
  update iris.settings set paused = true where org_id = '10000000-0000-0000-0000-000000000001';
  perform ist.as_service();
  if iris.claim_send(sid, 60, 3) <> 'paused' then raise exception 'paused claim should be paused'; end if;
  perform ist.as_super();
  update iris.settings set paused = false where org_id = '10000000-0000-0000-0000-000000000001';

  perform ist.as_service();
  r := iris.claim_send(sid, 60, 3);
  if r <> 'claimed' then raise exception 'service claim gave %', r; end if;
  if iris.claim_send(sid, 60, 3) <> 'busy' then raise exception 'a second claim should be busy'; end if;
  if iris.fail_send_attempt(sid, 'Gmail returned 500', 3) <> 'retrying' then raise exception 'second failure should be retrying'; end if;
  if iris.claim_send(sid, 60, 3) <> 'claimed' then raise exception 'third claim should be claimed'; end if;
  perform ist.as_super();
  if (ist.send_of('40000000-0000-0000-0000-000000000001')).attempts <> 3 then raise exception 'attempts should be 3'; end if;
  -- The third attempt's lease lapses (a crash); the next claim finds the limit reached.
  update iris.sends set lease_until = now() - interval '1 second' where id = sid;
  perform ist.as_service();
  if iris.claim_send(sid, 60, 3) <> 'exhausted' then raise exception 'claim at the limit should be exhausted'; end if;
  if iris.claim_send(sid, 60, 3) <> 'done' then raise exception 'claim on a failed send should be done'; end if;
  perform ist.as_super();
  if (ist.send_of('40000000-0000-0000-0000-000000000001')).state <> 'failed'
     or (select state from iris.drafts where id = '40000000-0000-0000-0000-000000000001') <> 'failed'
     or (select state from iris.messages where id = '31000000-0000-0000-0000-000000000001') <> 'failed'
     or (select last_error from iris.messages where id = '31000000-0000-0000-0000-000000000001') <> 'Gmail returned 500' then
    raise exception 'exhausted send should fail the send, draft and message';
  end if;
end $$;

-- retry_send: only failed sends, only the owner, and not while paused ----------------------
do $$
declare
  sid uuid := (ist.send_of('40000000-0000-0000-0000-000000000001')).id;
  res jsonb;
  who text;
  s iris.sends;
begin
  foreach who in array array['a0000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000001',
      'c0000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000001'] loop
    perform ist.as_user(who);
    if iris.retry_send(sid, 60) ->> 'result' <> 'not_found' then raise exception '% retry should be not_found', who; end if;
  end loop;
  perform ist.as_super();
  update iris.settings set paused = true where org_id = '10000000-0000-0000-0000-000000000001';
  perform ist.as_user('a0000000-0000-0000-0000-000000000001');
  if iris.retry_send(sid, 60) ->> 'result' <> 'paused' then raise exception 'paused retry should be paused'; end if;
  perform ist.as_super();
  update iris.settings set paused = false where org_id = '10000000-0000-0000-0000-000000000001';
  perform ist.as_user('a0000000-0000-0000-0000-000000000001');
  res := iris.retry_send(sid, 60);
  if res ->> 'result' <> 'ok' or res ->> 'state' <> 'sending' then raise exception 'retry gave %', res; end if;
  if iris.retry_send(sid, 60) ->> 'result' <> 'not_failed' then raise exception 'retry on a sending send should be not_failed'; end if;
  perform ist.as_super();
  s := ist.send_of('40000000-0000-0000-0000-000000000001');
  if s.state <> 'sending' or s.attempts <> 1 or s.last_error is not null or s.lease_until is null
     or (select state from iris.drafts where id = s.draft_id) <> 'approved'
     or (select state || '/' || coalesce(last_error, '-') from iris.messages where id = s.message_id) <> 'approved/-' then
    raise exception 'retry should reset the send and approve the draft and message: %', to_jsonb(s);
  end if;
  if (select count(*) from iris.events where kind = 'send_retried' and draft_id = s.draft_id
        and actor = 'a0000000-0000-0000-0000-000000000001') <> 1 then
    raise exception 'one send_retried event expected';
  end if;
end $$;

-- finish_send: idempotent, records everything, converts a charlie_manual row ---------------
-- The poll already stored the Gmail copy as charlie_manual (a rewritten Message-ID).
insert into iris.messages (org_id, thread_id, gmail_message_id, direction, source, from_email, received_at, body_text, purge_at)
values ('10000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', 'gm-sent-1', 'outbound',
        'charlie_manual', 'charlie@apacademy.ca', now(), 'Thanks', now() + interval '90 days');
do $$
declare
  sid uuid := (ist.send_of('40000000-0000-0000-0000-000000000001')).id;
  s iris.sends;
  at timestamptz := now();
begin
  perform ist.as_service();
  if iris.finish_send(sid, 'gm-sent-1', 'Charlie@APAcademy.ca', 'Thanks for letting me know.', at) <> 'ok' then
    raise exception 'finish failed';
  end if;
  if iris.finish_send(sid, 'gm-sent-1', 'charlie@apacademy.ca', 'Thanks for letting me know.', at) <> 'done' then
    raise exception 'a second finish should be done';
  end if;
  if iris.fail_send_attempt(sid, 'late', 3) <> 'done' then raise exception 'fail after sent should be done'; end if;
  if iris.claim_send(sid, 60, 3) <> 'done' then raise exception 'claim after sent should be done'; end if;
  perform ist.as_super();
  s := ist.send_of('40000000-0000-0000-0000-000000000001');
  if s.state <> 'sent' or s.gmail_message_id <> 'gm-sent-1' or s.sent_at is null or s.lease_until is not null then
    raise exception 'finished send fields wrong: %', to_jsonb(s);
  end if;
  if (select state from iris.drafts where id = s.draft_id) <> 'sent'
     or (select state from iris.messages where id = s.message_id) <> 'sent' then
    raise exception 'draft and message should be sent';
  end if;
  if (select count(*) from iris.messages where gmail_message_id = 'gm-sent-1') <> 1
     or (select source from iris.messages where gmail_message_id = 'gm-sent-1') <> 'iris' then
    raise exception 'the charlie_manual copy should become the one iris row';
  end if;
  if (select last_outbound_at from iris.threads where id = '30000000-0000-0000-0000-000000000001') is null then
    raise exception 'thread last_outbound_at should be set';
  end if;
  if (select count(*) from iris.events where kind = 'sent' and draft_id = s.draft_id) <> 1 then
    raise exception 'one sent event expected';
  end if;
  if exists (select 1 from iris.events where detail::text ~* '(thanks|ann@|charlie@)') then
    raise exception 'events must hold ids and codes only';
  end if;
end $$;

-- A fresh outbound row from finish_send, with no earlier copy.
select ist.new_draft('10000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001',
                     '31000000-0000-0000-0000-000000000003', '40000000-0000-0000-0000-000000000003');
do $$
declare
  sid uuid;
  m iris.messages;
begin
  perform ist.as_user('a0000000-0000-0000-0000-000000000001');
  sid := (iris.approve_draft_for_send('40000000-0000-0000-0000-000000000003', 1, 60) ->> 'send_id')::uuid;
  if iris.finish_send(sid, 'gm-sent-3', 'charlie@apacademy.ca', 'Thanks for letting me know.', now()) <> 'ok' then
    raise exception 'owner finish failed';
  end if;
  perform ist.as_super();
  select * into m from iris.messages where gmail_message_id = 'gm-sent-3';
  if m.direction <> 'outbound' or m.source <> 'iris' or m.state is not null or m.from_email <> 'charlie@apacademy.ca'
     or m.body_text <> 'Thanks for letting me know.' or m.rfc_message_id <> '<iris-' || sid || '@apacademy.ca>'
     or m.thread_id <> '30000000-0000-0000-0000-000000000001' then
    raise exception 'outbound row wrong: %', to_jsonb(m);
  end if;
end $$;

-- Purge: sends go with their message ------------------------------------------------
update iris.messages set purge_at = now() - interval '1 day'
 where id in ('31000000-0000-0000-0000-000000000001', '31000000-0000-0000-0000-000000000003');
set role service_role;
do $$ begin
  perform iris.purge_expired('10000000-0000-0000-0000-000000000001');
  if exists (select 1 from iris.sends where org_id = '10000000-0000-0000-0000-000000000001') then
    raise exception 'sends should go with their message';
  end if;
  if not exists (select 1 from iris.events where kind = 'sent' and message_id is null and draft_id is null) then
    raise exception 'the sent event should survive the purge with its ids cleared';
  end if;
end $$;
reset role;

\o
\echo 'iris_sends: ok'
