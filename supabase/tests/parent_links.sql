-- REQ-22: parent role, tracker.parent_links, parent read policies and the
-- claim / my_children / remove_parent_link functions. Run by run-rls.sh on a
-- fresh copy of the migrated database. Privilege-sensitive steps run under
-- set role because the runner connects as a superuser.

\set ON_ERROR_STOP on

-- Cast ------------------------------------------------------------------------
--   O1 owner of Org One  T1 teacher of Org One  O2 owner of Org Two
--   P1 parent of Sam (published) and Bea (unpublished)   P2 parent of nobody
--   S1 student login of Sam
-- Students: Sam (published, notion id N1), Bea (unpublished), Cal (published, unlinked)
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'o1@example.com'),
  ('00000000-0000-0000-0000-0000000000a2', 't1@example.com'),
  ('00000000-0000-0000-0000-0000000000a3', 'o2@example.com'),
  ('00000000-0000-0000-0000-0000000000c1', 'p1@example.com'),
  ('00000000-0000-0000-0000-0000000000c2', 'p2@example.com'),
  ('00000000-0000-0000-0000-0000000000b1', 's1@example.com');
insert into tracker.orgs (id, name) values
  ('10000000-0000-0000-0000-000000000001', 'Org One'),
  ('10000000-0000-0000-0000-000000000002', 'Org Two');
insert into tracker.memberships (user_id, org_id, role) values
  ('00000000-0000-0000-0000-0000000000a1', '10000000-0000-0000-0000-000000000001', 'owner'),
  ('00000000-0000-0000-0000-0000000000a2', '10000000-0000-0000-0000-000000000001', 'teacher'),
  ('00000000-0000-0000-0000-0000000000a3', '10000000-0000-0000-0000-000000000002', 'owner');

-- Seed as the superuser; the policies under test are the read paths below.
insert into tracker.students (id, org_id, teacher_id, email, first_name, last_initial, grade_level, status, published_at, notion_student_id) values
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1', 's1@example.com', 'Sam', 'L', 11, 'active', now(), '70000000-0000-0000-0000-000000000001'),
  ('20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1', 'bea@example.com', 'Bea', 'K', 11, 'setup', null, '70000000-0000-0000-0000-000000000002'),
  ('20000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1', 'cal@example.com', 'Cal', 'M', 11, 'active', now(), '70000000-0000-0000-0000-000000000003');

do $$
declare s uuid; org uuid := '10000000-0000-0000-0000-000000000001'; n int := 0;
begin
  foreach s in array array['20000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000003']::uuid[] loop
    n := n + 1;
    insert into tracker.goals (org_id, student_id, school, program, target_six_avg) values (org, s, 'UofT', 'Eng', 90);
    insert into tracker.courses (id, org_id, student_id, code, name)
      values (('30000000-0000-0000-0000-00000000000' || n)::uuid, org, s, 'MHF4U', 'Advanced Functions');
    insert into tracker.syllabus_versions (id, org_id, student_id, course_id, version)
      values (('40000000-0000-0000-0000-00000000000' || n)::uuid, org, s, ('30000000-0000-0000-0000-00000000000' || n)::uuid, 1);
    insert into tracker.categories (id, org_id, student_id, course_id, syllabus_version_id, name, weight)
      values (('50000000-0000-0000-0000-00000000000' || n)::uuid, org, s, ('30000000-0000-0000-0000-00000000000' || n)::uuid, ('40000000-0000-0000-0000-00000000000' || n)::uuid, 'All', 100);
    insert into tracker.assessments (id, org_id, student_id, course_id, category_id, title, score_possible, score_earned)
      values (('60000000-0000-0000-0000-00000000000' || n)::uuid, org, s, ('30000000-0000-0000-0000-00000000000' || n)::uuid, ('50000000-0000-0000-0000-00000000000' || n)::uuid, 'Unit 1 test', 40, 31);
    insert into tracker.tasks (org_id, student_id, course_id, title)
      values (org, s, ('30000000-0000-0000-0000-00000000000' || n)::uuid, 'Review');
    insert into tracker.grade_flags (org_id, student_id, assessment_id, reason)
      values (org, s, ('60000000-0000-0000-0000-00000000000' || n)::uuid, 'other');
    insert into tracker.ai_drafts (org_id, student_id, course_id, requested_by, input_chars)
      values (org, s, ('30000000-0000-0000-0000-00000000000' || n)::uuid, '00000000-0000-0000-0000-0000000000a1', 10);
    insert into tracker.class_series (id, org_id, request_id, notion_staff_id, notion_student_id, subject, kind, start_date, start_time, duration_minutes, created_by)
      values (('80000000-0000-0000-0000-00000000000' || n)::uuid, org, gen_random_uuid(), '90000000-0000-0000-0000-000000000001',
              ('70000000-0000-0000-0000-00000000000' || n)::uuid, 'Math', 'weekly', '2026-10-05', '16:00', 60, '00000000-0000-0000-0000-0000000000a1');
    insert into tracker.class_exceptions (org_id, request_id, series_id, original_date, kind, created_by)
      values (org, gen_random_uuid(), ('80000000-0000-0000-0000-00000000000' || n)::uuid, '2026-10-12', 'cancelled', '00000000-0000-0000-0000-0000000000a1');
  end loop;
  insert into tracker.staff_links (org_id, notion_staff_id, email, approved_by)
    values (org, '90000000-0000-0000-0000-000000000001', 'staff@example.com', '00000000-0000-0000-0000-0000000000a1');
  insert into tracker.availability_windows (org_id, request_id, notion_staff_id, weekday, start_time, end_time, effective_from, created_by)
    values (org, gen_random_uuid(), '90000000-0000-0000-0000-000000000001', 1, '09:00', '17:00', '2026-10-01', '00000000-0000-0000-0000-0000000000a1');
  insert into tracker.availability_exceptions (org_id, request_id, notion_staff_id, on_date, kind, created_by)
    values (org, gen_random_uuid(), '90000000-0000-0000-0000-000000000001', '2026-10-20', 'time_off', '00000000-0000-0000-0000-0000000000a1');
  insert into tracker.schedule_summaries (org_id, notion_student_id, adopted_from_text, created_by)
    values (org, '70000000-0000-0000-0000-000000000001', 'Mon 4pm', '00000000-0000-0000-0000-0000000000a1');
  insert into tracker.daily_tasks (id, org_id, kind, local_date)
    values ('a0000000-0000-0000-0000-000000000001', org, 'teacher_texts', '2026-10-16');
  insert into tracker.daily_task_teachers (task_id, org_id, notion_staff_id, block_id, written_fingerprint, written_at)
    values ('a0000000-0000-0000-0000-000000000001', org, '90000000-0000-0000-0000-000000000001', gen_random_uuid(), 'x', now());
end $$;

-- Helper: expect SQLSTATE from a statement run as the caller.
create schema parent_helpers;
grant usage on schema parent_helpers to public;
create function parent_helpers.expect_error(stmt text, want_state text)
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
grant execute on function parent_helpers.expect_error(text, text) to public;

-- AC1: schema -------------------------------------------------------------------
do $$ begin
  if not exists (select 1 from pg_enum e join pg_type t on t.oid = e.enumtypid
                 where t.typname = 'membership_role' and e.enumlabel = 'parent') then
    raise exception 'parent role missing';
  end if;
  if not (select relrowsecurity from pg_class where oid = 'tracker.parent_links'::regclass) then
    raise exception 'RLS off on parent_links';
  end if;
  if has_function_privilege('anon', 'tracker.claim_parent_invites()', 'execute')
     or has_function_privilege('anon', 'tracker.my_children()', 'execute')
     or has_function_privilege('anon', 'tracker.remove_parent_link(uuid)', 'execute') then
    raise exception 'anon can execute a parent function';
  end if;
  raise notice 'ok: schema and grants (AC1)';
end $$;

-- AC7: owner adds links; the student-email guard fires -----------------------------
set role authenticated;
set request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a1", "email": "o1@example.com"}';
insert into tracker.parent_links (id, org_id, student_id, email, invited_by) values
  ('b0000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'p1@example.com', '00000000-0000-0000-0000-0000000000a1'),
  ('b0000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000002', 'p1@example.com', '00000000-0000-0000-0000-0000000000a1');
select parent_helpers.expect_error($q$insert into tracker.parent_links (org_id, student_id, email, invited_by)
  values ('10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000003', 'cal@example.com', '00000000-0000-0000-0000-0000000000a1')$q$, '23514');
select parent_helpers.expect_error($q$insert into tracker.parent_links (org_id, student_id, email, invited_by)
  values ('10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'p1@example.com', '00000000-0000-0000-0000-0000000000a1')$q$, '23505');
-- A teacher and a foreign owner cannot add links.
set request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a2", "email": "t1@example.com"}';
select parent_helpers.expect_error($q$insert into tracker.parent_links (org_id, student_id, email, invited_by)
  values ('10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000003', 'x@example.com', '00000000-0000-0000-0000-0000000000a2')$q$, '42501');
set request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a3", "email": "o2@example.com"}';
select parent_helpers.expect_error($q$insert into tracker.parent_links (org_id, student_id, email, invited_by)
  values ('10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000003', 'x@example.com', '00000000-0000-0000-0000-0000000000a3')$q$, '42501');
reset role;
do $$ begin raise notice 'ok: owner adds, guard and non-owner refusals (AC7)'; end $$;

-- AC6: who reads parent_links ------------------------------------------------------
set role authenticated;
set request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a1", "email": "o1@example.com"}';
do $$ begin
  if (select count(*) from tracker.parent_links) <> 2 then raise exception 'owner should see 2 links'; end if;
end $$;
set request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a2", "email": "t1@example.com"}';
do $$ begin
  if (select count(*) from tracker.parent_links) <> 0 then raise exception 'teacher reads links'; end if;
end $$;
set request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a3", "email": "o2@example.com"}';
do $$ begin
  if (select count(*) from tracker.parent_links) <> 0 then raise exception 'foreign owner reads links'; end if;
end $$;
reset role;

-- AC2: claim (before the student claim, to prove independence) -----------------------
set role authenticated;
set request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000b1", "email": "s1@example.com"}';
select tracker.claim_student_invites();
do $$ begin
  if (select count(*) from tracker.parent_links) <> 0 then raise exception 'student reads links (AC6)'; end if;
  if tracker.claim_parent_invites() <> 0 then raise exception 'student claimed a parent link'; end if;
end $$;
set request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000c2", "email": "p2@example.com"}';
do $$ begin
  if tracker.claim_parent_invites() <> 0 then raise exception 'stranger claimed a link'; end if;
end $$;
set request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000c1", "email": "P1@Example.com"}';
do $$ begin
  if tracker.claim_parent_invites() <> 2 then raise exception 'P1 should claim 2 links'; end if;
  if tracker.claim_parent_invites() <> 0 then raise exception 'second claim should be 0'; end if;
end $$;
reset role;
do $$ begin
  if not exists (select 1 from tracker.memberships where user_id = '00000000-0000-0000-0000-0000000000c1'
                 and org_id = '10000000-0000-0000-0000-000000000001' and role::text = 'parent') then
    raise exception 'parent membership missing';
  end if;
  if (select count(*) from tracker.memberships where user_id = '00000000-0000-0000-0000-0000000000c1') <> 1 then
    raise exception 'expected one parent membership';
  end if;
  raise notice 'ok: claim, unpublished child too (AC2)';
end $$;

-- AC8: my_children -----------------------------------------------------------------
set role authenticated;
set request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000c1", "email": "p1@example.com"}';
do $$
declare r record; n int := 0;
begin
  for r in select * from tracker.my_children() loop
    n := n + 1;
    if r.first_name = 'Sam' and not r.published then raise exception 'Sam should be published'; end if;
    if r.first_name = 'Bea' and r.published then raise exception 'Bea should be unpublished'; end if;
    if r.first_name = 'Cal' then raise exception 'Cal leaked'; end if;
  end loop;
  if n <> 2 then raise exception 'expected 2 children, got %', n; end if;
end $$;
set request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000c2", "email": "p2@example.com"}';
do $$ begin
  if (select count(*) from tracker.my_children()) <> 0 then raise exception 'P2 sees children'; end if;
end $$;
reset role;
do $$ begin raise notice 'ok: my_children (AC8)'; end $$;

-- AC3: parent reads linked published child only ---------------------------------------
set role authenticated;
set request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000c1", "email": "p1@example.com"}';
do $$
declare t text; n bigint; sam text := '20000000-0000-0000-0000-000000000001';
begin
  foreach t in array array['goals', 'courses', 'syllabus_versions', 'categories', 'assessments', 'tasks'] loop
    execute format('select count(*) from tracker.%I where student_id = %L', t, sam) into n;
    if n <> 1 then raise exception '% should show Sam (got %)', t, n; end if;
    execute format('select count(*) from tracker.%I where student_id <> %L', t, sam) into n;
    if n <> 0 then raise exception '% shows other students (%)', t, n; end if;
  end loop;
  select count(*) into n from tracker.students;
  if n <> 1 or not exists (select 1 from tracker.students where id = sam::uuid) then
    raise exception 'students: expected only Sam, got %', n;
  end if;
  select count(*) into n from tracker.class_series;
  if n <> 1 or not exists (select 1 from tracker.class_series where notion_student_id = '70000000-0000-0000-0000-000000000001') then
    raise exception 'class_series: expected only Sam''s, got %', n;
  end if;
  select count(*) into n from tracker.class_exceptions;
  if n <> 1 then raise exception 'class_exceptions: expected 1, got %', n; end if;
  raise notice 'ok: parent reads Sam only (AC3)';
end $$;

-- AC4: teacher-only tables, and the unpublished child ----------------------------------
do $$
declare t text; n bigint;
begin
  foreach t in array array['grade_flags', 'ai_drafts', 'audit_log', 'staff_links', 'availability_windows',
                           'availability_exceptions', 'schedule_summaries', 'daily_tasks', 'daily_task_teachers'] loop
    execute format('select count(*) from tracker.%I', t) into n;
    if n <> 0 then raise exception 'parent reads % rows of %', n, t; end if;
  end loop;
  if exists (select 1 from tracker.students where id = '20000000-0000-0000-0000-000000000002') then
    raise exception 'parent reads unpublished Bea';
  end if;
  if exists (select 1 from tracker.goals where student_id = '20000000-0000-0000-0000-000000000002') then
    raise exception 'parent reads Bea''s goals';
  end if;
  if exists (select 1 from tracker.class_series where notion_student_id = '70000000-0000-0000-0000-000000000002') then
    raise exception 'parent reads Bea''s classes';
  end if;
  raise notice 'ok: teacher-only tables and unpublished child hidden (AC4)';
end $$;

-- A parent with no links reads nothing.
set request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000c2", "email": "p2@example.com"}';
do $$ begin
  if (select count(*) from tracker.students) <> 0 or (select count(*) from tracker.assessments) <> 0
     or (select count(*) from tracker.class_series) <> 0 then
    raise exception 'unlinked parent reads data';
  end if;
end $$;

-- AC5: every write refused ---------------------------------------------------------------
-- Each statement is checked on its own: refused with 42501, or it touches 0 rows.
reset role;
create function parent_helpers.expect_denied(stmt text)
returns void language plpgsql as $$
declare n bigint;
begin
  begin
    execute stmt;
    get diagnostics n = row_count;
  exception when insufficient_privilege then
    return;
  end;
  if n <> 0 then raise exception 'write touched % rows: %', n, stmt; end if;
end $$;
grant execute on function parent_helpers.expect_denied(text) to public;

set role authenticated;
set request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000c1", "email": "p1@example.com"}';
do $$
declare t text; sam text := '20000000-0000-0000-0000-000000000001';
begin
  foreach t in array array['goals', 'courses', 'syllabus_versions', 'categories', 'assessments', 'tasks'] loop
    perform parent_helpers.expect_denied(format('update tracker.%I set org_id = org_id where student_id = %L', t, sam));
    perform parent_helpers.expect_denied(format('delete from tracker.%I where student_id = %L', t, sam));
  end loop;
  perform parent_helpers.expect_denied(format('update tracker.students set first_name = %L where id = %L', 'Hax', sam));
  perform parent_helpers.expect_denied($q$update tracker.parent_links set email = 'hax@example.com'$q$);
  perform parent_helpers.expect_denied($q$delete from tracker.parent_links$q$);
  perform parent_helpers.expect_denied($q$update tracker.class_series set subject = 'Hax'$q$);
  perform parent_helpers.expect_denied($q$delete from tracker.class_exceptions$q$);
end $$;
select parent_helpers.expect_error($q$insert into tracker.tasks (org_id, student_id, course_id, title)
  values ('10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', 'x')$q$, '42501');
select parent_helpers.expect_error($q$insert into tracker.parent_links (org_id, student_id, email, invited_by)
  values ('10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000003', 'x@example.com', '00000000-0000-0000-0000-0000000000c1')$q$, '42501');
select parent_helpers.expect_error($q$select tracker.set_assessment_done('60000000-0000-0000-0000-000000000001', true)$q$, 'P0002');
select parent_helpers.expect_error($q$select tracker.set_task_done(gen_random_uuid(), true)$q$, 'P0002');
select parent_helpers.expect_error($q$select tracker.remove_parent_link('b0000000-0000-0000-0000-000000000001')$q$, '42501');
reset role;
do $$ begin
  if (select first_name from tracker.students where id = '20000000-0000-0000-0000-000000000001') <> 'Sam' then
    raise exception 'a parent write got through';
  end if;
  if (select count(*) from tracker.parent_links) <> 2 then raise exception 'a parent changed parent_links'; end if;
  if (select count(*) from tracker.parent_links where email = 'p1@example.com') <> 2 then raise exception 'a parent changed a link email'; end if;
  if exists (select 1 from tracker.class_series where subject = 'Hax') then raise exception 'a parent changed class_series'; end if;
  raise notice 'ok: parent writes refused (AC5)';
end $$;

-- AC7: removal ---------------------------------------------------------------------------
-- Non-owner and foreign owner get 42501, and so does an unknown id.
set role authenticated;
set request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a2", "email": "t1@example.com"}';
select parent_helpers.expect_error($q$select tracker.remove_parent_link('b0000000-0000-0000-0000-000000000001')$q$, '42501');
set request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a3", "email": "o2@example.com"}';
select parent_helpers.expect_error($q$select tracker.remove_parent_link('b0000000-0000-0000-0000-000000000001')$q$, '42501');
set request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a1", "email": "o1@example.com"}';
select parent_helpers.expect_error($q$select tracker.remove_parent_link('99999999-9999-9999-9999-999999999999')$q$, '42501');
-- Removing one of two links keeps the membership; removing the last drops it.
select tracker.remove_parent_link('b0000000-0000-0000-0000-000000000001');
reset role;
do $$ begin
  if not exists (select 1 from tracker.memberships where user_id = '00000000-0000-0000-0000-0000000000c1' and role::text = 'parent') then
    raise exception 'membership removed while a link remains';
  end if;
end $$;
set role authenticated;
set request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a1", "email": "o1@example.com"}';
select tracker.remove_parent_link('b0000000-0000-0000-0000-000000000002');
reset role;
do $$ begin
  if exists (select 1 from tracker.parent_links) then raise exception 'links remain'; end if;
  if exists (select 1 from tracker.memberships where user_id = '00000000-0000-0000-0000-0000000000c1') then
    raise exception 'parent membership remains';
  end if;
  if not exists (select 1 from tracker.audit_log where table_name = 'memberships' and action = 'DELETE'
                 and row_id = '00000000-0000-0000-0000-0000000000c1') then
    raise exception 'membership delete not audited';
  end if;
  if (select count(*) from tracker.audit_log where table_name = 'parent_links' and action = 'DELETE') <> 2 then
    raise exception 'link deletes not audited';
  end if;
  raise notice 'ok: removal, membership and audit (AC7)';
end $$;

-- After removal the parent reads nothing.
set role authenticated;
set request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000c1", "email": "p1@example.com"}';
do $$ begin
  if (select count(*) from tracker.students) <> 0 or (select count(*) from tracker.my_children()) <> 0 then
    raise exception 'removed parent still reads data';
  end if;
end $$;
reset role;
