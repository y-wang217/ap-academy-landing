-- REQ-61: the console transition log (0029). Run by run-rls.sh on a fresh copy
-- of the migrated database. Privilege-sensitive steps switch role because the
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

create schema ct;
grant usage on schema ct to public;
create function ct.expect_error(stmt text, want_state text)
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
create function ct.as_user(uid text) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', uid)::text, true);
end $$;
create function ct.as_super() returns void language plpgsql as $$
begin
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', '', true);
end $$;
-- A row for org and page, as the owner's insert would make it.
create function ct.row_sql(org text, page text, req text, state text default 'running', by_user text default null) returns text
language sql as $$
  select format($f$insert into tracker.console_transitions (org_id, request_id, notion_page_id, outcome, patch, touch, expected, state, lease_until%s)
    values (%L, %L, %L, 'no_answer', '{"attempts": 1}', '{"type": "Call", "note_chars": 4, "note_sha256": "ab"}',
            '{"stage": "New", "attempts": 0, "last_edited_at": "2026-10-23T10:00:00.000Z"}', %L, now() + interval '30 seconds'%s)$f$,
    case when by_user is null then '' else ', created_by' end, org, req, page, state,
    case when by_user is null then '' else format(', %L', by_user) end)
$$;
grant execute on all functions in schema ct to public;

-- Shape -----------------------------------------------------------------------------
do $$ begin
  if not exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'tracker' and c.relname = 'console_transitions' and c.relkind = 'r' and c.relrowsecurity) then
    raise exception 'tracker.console_transitions is missing or has RLS off';
  end if;
end $$;

-- The owner inserts, reads and updates their own org's rows (AC14) ----------------------
do $$
declare n bigint;
begin
  perform ct.as_user('a0000000-0000-0000-0000-000000000001');
  execute ct.row_sql('10000000-0000-0000-0000-000000000001', '6a000000-0000-4000-8000-000000000001', '9a000000-0000-4000-8000-000000000001');
  if (select created_by from tracker.console_transitions where request_id = '9a000000-0000-4000-8000-000000000001')
       <> 'a0000000-0000-0000-0000-000000000001' then
    raise exception 'created_by is not the inserting owner';
  end if;
  -- Not as another user, not finished, not in another org.
  perform ct.expect_error(ct.row_sql('10000000-0000-0000-0000-000000000001', '6a000000-0000-4000-8000-000000000002',
    '9a000000-0000-4000-8000-000000000002', 'running', 'b0000000-0000-0000-0000-000000000001'), '42501');
  perform ct.expect_error(ct.row_sql('10000000-0000-0000-0000-000000000001', '6a000000-0000-4000-8000-000000000002',
    '9a000000-0000-4000-8000-000000000002', 'done'), '42501');
  perform ct.expect_error(ct.row_sql('10000000-0000-0000-0000-000000000002', '6a000000-0000-4000-8000-000000000002',
    '9a000000-0000-4000-8000-000000000002'), '42501');
  -- One request id, one row; one open transition per lead.
  perform ct.expect_error(ct.row_sql('10000000-0000-0000-0000-000000000001', '6a000000-0000-4000-8000-000000000003',
    '9a000000-0000-4000-8000-000000000001'), '23505');
  perform ct.expect_error(ct.row_sql('10000000-0000-0000-0000-000000000001', '6a000000-0000-4000-8000-000000000001',
    '9a000000-0000-4000-8000-000000000003'), '23505');
  -- The note never goes in.
  perform ct.expect_error($q$insert into tracker.console_transitions (org_id, request_id, notion_page_id, outcome, patch, touch, expected)
    values ('10000000-0000-0000-0000-000000000001', '9a000000-0000-4000-8000-000000000004', '6a000000-0000-4000-8000-000000000004',
            'no_answer', '{}', '{"note": "Sam is sick"}', '{}')$q$, '23514');
  perform ct.expect_error($q$insert into tracker.console_transitions (org_id, request_id, notion_page_id, outcome, patch, touch, expected)
    values ('10000000-0000-0000-0000-000000000001', '9a000000-0000-4000-8000-000000000004', '6a000000-0000-4000-8000-000000000004',
            'paid', '{}', '{}', '{}')$q$, '23514');
  update tracker.console_transitions set patch_sent_at = now() where request_id = '9a000000-0000-4000-8000-000000000001';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'owner could not mark their own transition'; end if;
  select count(*) into n from tracker.console_transitions;
  if n <> 1 then raise exception 'owner reads % rows, expected 1', n; end if;
  perform ct.as_super();
end $$;

-- Org Two's own row, for the cross-org checks.
do $$ begin
  perform ct.as_user('a0000000-0000-0000-0000-000000000002');
  execute ct.row_sql('10000000-0000-0000-0000-000000000002', '6a000000-0000-4000-8000-000000000009', '9a000000-0000-4000-8000-000000000009');
  perform ct.as_super();
end $$;

-- Nobody else reads or writes; nobody deletes (AC14) ------------------------------------
do $$
declare
  who text;
  n bigint;
begin
  foreach who in array array['a0000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000001',
      'c0000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000001'] loop
    perform ct.as_user(who);
    select count(*) into n from tracker.console_transitions where org_id = '10000000-0000-0000-0000-000000000001';
    if n <> 0 then raise exception '% reads % of Org One''s transitions', who, n; end if;
    perform ct.expect_error(ct.row_sql('10000000-0000-0000-0000-000000000001', '6a000000-0000-4000-8000-000000000005',
      '9a000000-0000-4000-8000-000000000005', 'running', who), '42501');
    update tracker.console_transitions set state = 'failed' where org_id = '10000000-0000-0000-0000-000000000001';
    get diagnostics n = row_count;
    if n <> 0 then raise exception '% updated Org One''s transitions', who; end if;
    if (select count(*) from tracker.claim_console_transition('9a000000-0000-4000-8000-000000000001', 30)) <> 0 then
      raise exception '% claimed Org One''s transition', who;
    end if;
  end loop;
  perform ct.as_user('a0000000-0000-0000-0000-000000000001');
  perform ct.expect_error('delete from tracker.console_transitions', '42501');
  perform set_config('role', 'anon', true);
  perform set_config('request.jwt.claims', '', true);
  perform ct.expect_error('select 1 from tracker.console_transitions', '42501');
  perform ct.as_super();
  if (select state from tracker.console_transitions where request_id = '9a000000-0000-4000-8000-000000000001') <> 'running' then
    raise exception 'another role moved Org One''s transition';
  end if;
end $$;

-- The request is fixed; a finished row never moves (AC14) --------------------------------
do $$
declare col text;
begin
  perform ct.as_user('a0000000-0000-0000-0000-000000000001');
  -- No grant on the fixed columns.
  foreach col in array array['request_id', 'notion_page_id', 'outcome', 'patch', 'touch', 'expected', 'created_by', 'org_id'] loop
    perform ct.expect_error(format('update tracker.console_transitions set %I = %I', col, col), '42501');
  end loop;
  perform ct.as_super();
  -- The guard refuses them even where a grant would allow it.
  perform set_config('role', 'service_role', true);
  perform ct.expect_error($q$update tracker.console_transitions set outcome = 'won' where request_id = '9a000000-0000-4000-8000-000000000001'$q$, '23514');
  perform ct.expect_error($q$update tracker.console_transitions set patch = '{"stage": "Lost"}' where request_id = '9a000000-0000-4000-8000-000000000001'$q$, '23514');
  perform ct.expect_error($q$update tracker.console_transitions set request_id = gen_random_uuid() where request_id = '9a000000-0000-4000-8000-000000000001'$q$, '23514');
  perform ct.as_super();
end $$;

-- State machine, claim and audit (AC10, AC14) -----------------------------------------------
do $$
declare
  n bigint;
  audits_before bigint := (select count(*) from tracker.audit_log where table_name = 'console_transitions');
  a tracker.audit_log;
begin
  perform ct.as_user('a0000000-0000-0000-0000-000000000001');
  -- A live lease is not claimed.
  if (select count(*) from tracker.claim_console_transition('9a000000-0000-4000-8000-000000000001', 30)) <> 0 then
    raise exception 'claimed a running row with a live lease';
  end if;
  -- running to uncertain: audited once.
  update tracker.console_transitions set state = 'uncertain', last_error = 'timeout', lease_until = null
   where request_id = '9a000000-0000-4000-8000-000000000001';
  -- uncertain is claimed: running again, one more attempt, no audit.
  if (select attempts from tracker.claim_console_transition('9a000000-0000-4000-8000-000000000001', 30)) <> 2 then
    raise exception 'claim did not count the attempt';
  end if;
  if (select state from tracker.console_transitions where request_id = '9a000000-0000-4000-8000-000000000001') <> 'running' then
    raise exception 'claim did not set running';
  end if;
  -- running to done.
  update tracker.console_transitions set state = 'done', result = '{"stage": "Working"}', finished_at = now()
   where request_id = '9a000000-0000-4000-8000-000000000001';
  -- done never moves, and its fields never change.
  perform ct.expect_error($q$update tracker.console_transitions set state = 'running' where request_id = '9a000000-0000-4000-8000-000000000001'$q$, '23514');
  perform ct.expect_error($q$update tracker.console_transitions set result = '{}' where request_id = '9a000000-0000-4000-8000-000000000001'$q$, '23514');
  if (select count(*) from tracker.claim_console_transition('9a000000-0000-4000-8000-000000000001', 30)) <> 0 then
    raise exception 'claimed a done row';
  end if;
  -- A done row is not open: the lead takes a new transition.
  execute ct.row_sql('10000000-0000-0000-0000-000000000001', '6a000000-0000-4000-8000-000000000001', '9a000000-0000-4000-8000-000000000006');
  update tracker.console_transitions set state = 'failed', last_error = 'Notion said 400', finished_at = now()
   where request_id = '9a000000-0000-4000-8000-000000000006';
  perform ct.expect_error($q$update tracker.console_transitions set state = 'running' where request_id = '9a000000-0000-4000-8000-000000000006'$q$, '23514');
  perform ct.as_super();

  -- uncertain, done and failed: three audit rows, keyed by the page, with the actual state.
  select count(*) into n from tracker.audit_log where table_name = 'console_transitions';
  if n - audits_before <> 3 then raise exception 'expected 3 audit rows, got %', n - audits_before; end if;
  select * into a from tracker.audit_log where table_name = 'console_transitions' and after ->> 'state' = 'done';
  if a.row_id <> '6a000000-0000-4000-8000-000000000001' or a.org_id <> '10000000-0000-0000-0000-000000000001'
     or a.actor_id <> 'a0000000-0000-0000-0000-000000000001' or a.after -> 'result' ->> 'stage' <> 'Working' then
    raise exception 'done audit row is wrong: %', to_jsonb(a);
  end if;
  if exists (select 1 from tracker.audit_log where table_name = 'console_transitions' and after::text like '%note"%') then
    raise exception 'an audit row carries a note';
  end if;

  -- The owner reads the audit rows; another org's owner does not.
  perform ct.as_user('a0000000-0000-0000-0000-000000000002');
  if exists (select 1 from tracker.audit_log where table_name = 'console_transitions' and org_id = '10000000-0000-0000-0000-000000000001') then
    raise exception 'another org reads Org One''s console audit';
  end if;
  perform ct.as_super();
end $$;

\o
\echo console_transitions checks passed
