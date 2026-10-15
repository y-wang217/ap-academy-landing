-- REQ-15: tracker.unlink_student() and tracker.student_logins(). Run by
-- run-rls.sh on a fresh copy of the migrated database. Privilege-sensitive
-- steps run under set role because the runner connects as a superuser.

\set ON_ERROR_STOP on

-- Cast ------------------------------------------------------------------------
--   O1 owner of Org One   T1 teacher of Org One   O2 owner of Org Two
--   S1 claimed student login (s1@)   S2 login that holds owner+student rows (o3@)
--   N1 new login with the corrected address (s1.real@)
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'o1@example.com'),
  ('00000000-0000-0000-0000-0000000000a2', 't1@example.com'),
  ('00000000-0000-0000-0000-0000000000a3', 'o2@example.com'),
  ('00000000-0000-0000-0000-0000000000b1', 's1@example.com'),
  ('00000000-0000-0000-0000-0000000000b2', 'dual@example.com'),
  ('00000000-0000-0000-0000-0000000000b3', 's1.real@example.com');
insert into tracker.orgs (id, name) values
  ('10000000-0000-0000-0000-000000000001', 'Org One'),
  ('10000000-0000-0000-0000-000000000002', 'Org Two');
insert into tracker.memberships (user_id, org_id, role) values
  ('00000000-0000-0000-0000-0000000000a1', '10000000-0000-0000-0000-000000000001', 'owner'),
  ('00000000-0000-0000-0000-0000000000a2', '10000000-0000-0000-0000-000000000001', 'teacher'),
  ('00000000-0000-0000-0000-0000000000a3', '10000000-0000-0000-0000-000000000002', 'owner');

set role authenticated;
set request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a1", "email": "o1@example.com"}';
insert into tracker.students (id, org_id, teacher_id, email, first_name, last_initial, grade_level) values
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001',
   '00000000-0000-0000-0000-0000000000a1', 's1@example.com', 'Sam', 'L', 11),
  ('20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001',
   '00000000-0000-0000-0000-0000000000a1', 'unclaimed@example.com', 'Una', 'C', 11);
insert into tracker.courses (id, org_id, student_id, code, name) values
  ('30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'MHF4U', 'Advanced Functions');
insert into tracker.syllabus_versions (id, org_id, student_id, course_id, version) values
  ('40000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', 1);
update tracker.courses set active_syllabus_version_id = '40000000-0000-0000-0000-000000000001' where id = '30000000-0000-0000-0000-000000000001';
insert into tracker.categories (id, org_id, student_id, course_id, syllabus_version_id, name, weight) values
  ('50000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001', 'All', 100);
insert into tracker.assessments (id, org_id, student_id, course_id, category_id, title, score_possible, score_earned) values
  ('60000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000001', 'Unit 1 test', 40, 31);
insert into tracker.tasks (org_id, student_id, course_id, title) values
  ('10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', 'Review');
insert into tracker.goals (org_id, student_id, school, program, target_six_avg) values
  ('10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'UofT', 'Engineering', 90);
update tracker.students set published_at = now(), status = 'active';
reset role;

-- S1 claims Sam.
set role authenticated;
set request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000b1", "email": "s1@example.com"}';
select tracker.claim_student_invites();
reset role;

-- AC1: grants -----------------------------------------------------------------
do $$ begin
  if not has_function_privilege('authenticated', 'tracker.unlink_student(uuid)', 'execute') then
    raise exception 'authenticated cannot execute unlink_student';
  end if;
  if has_function_privilege('anon', 'tracker.unlink_student(uuid)', 'execute') then
    raise exception 'anon can execute unlink_student';
  end if;
  if not has_function_privilege('authenticated', 'tracker.student_logins(uuid)', 'execute') then
    raise exception 'authenticated cannot execute student_logins';
  end if;
  if has_function_privilege('anon', 'tracker.student_logins(uuid)', 'execute') then
    raise exception 'anon can execute student_logins';
  end if;
  raise notice 'ok: grants (AC1)';
end $$;

-- Helper: expect SQLSTATE (and optional message) from unlink_student as caller.
create function pg_temp.expect_unlink(sid uuid, want_state text, want_msg text)
returns void language plpgsql as $$
begin
  perform tracker.unlink_student(sid);
  raise exception 'unlink_student succeeded, expected %', want_state;
exception when others then
  if sqlstate = 'P0001' and sqlerrm like 'unlink_student succeeded%' then raise; end if;
  if sqlstate <> want_state then
    raise exception 'expected %, got % (%)', want_state, sqlstate, sqlerrm;
  end if;
  if want_msg is not null and sqlerrm <> want_msg then
    raise exception 'expected message %, got %', want_msg, sqlerrm;
  end if;
end $$;
grant execute on function pg_temp.expect_unlink(uuid, text, text) to public;
grant usage on schema pg_temp to public;

-- AC2: teacher refused ---------------------------------------------------------
set role authenticated;
set request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a2", "email": "t1@example.com"}';
select pg_temp.expect_unlink('20000000-0000-0000-0000-000000000001', '42501', null);
reset role;
do $$ begin
  if (select user_id from tracker.students where id = '20000000-0000-0000-0000-000000000001') is distinct from '00000000-0000-0000-0000-0000000000b1'::uuid then
    raise exception 'teacher attempt changed user_id';
  end if;
  raise notice 'ok: teacher refused (AC2)';
end $$;

-- AC3: other-org owner and unknown id refused ----------------------------------
set role authenticated;
set request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a3", "email": "o2@example.com"}';
select pg_temp.expect_unlink('20000000-0000-0000-0000-000000000001', '42501', null);
select pg_temp.expect_unlink('99999999-9999-9999-9999-999999999999', '42501', null);
reset role;

-- AC10 (negatives): other-org owner and teacher see no logins ------------------
set role authenticated;
set request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a3", "email": "o2@example.com"}';
do $$ begin
  if (select count(*) from tracker.student_logins('10000000-0000-0000-0000-000000000001')) <> 0 then
    raise exception 'other-org owner sees logins';
  end if;
end $$;
set request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a2", "email": "t1@example.com"}';
do $$ begin
  if (select count(*) from tracker.student_logins('10000000-0000-0000-0000-000000000001')) <> 0 then
    raise exception 'teacher sees logins';
  end if;
end $$;
set request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a1", "email": "o1@example.com"}';
do $$ begin
  if (select login_email from tracker.student_logins('10000000-0000-0000-0000-000000000001')
        where student_id = '20000000-0000-0000-0000-000000000001') is distinct from 's1@example.com' then
    raise exception 'owner does not see the login email';
  end if;
  if (select count(*) from tracker.student_logins('10000000-0000-0000-0000-000000000001')) <> 1 then
    raise exception 'student_logins should list claimed students only';
  end if;
  raise notice 'ok: other-org refused, student_logins visibility (AC3, AC10)';
end $$;

-- AC4: unclaimed student -------------------------------------------------------
select pg_temp.expect_unlink('20000000-0000-0000-0000-000000000002', 'P0002', 'student is not linked to a login');

-- AC5: email unchanged -> 23514, nothing changes -------------------------------
select pg_temp.expect_unlink('20000000-0000-0000-0000-000000000001', '23514', 'change the student email before unlinking');
reset role;
do $$ begin
  if (select user_id from tracker.students where id = '20000000-0000-0000-0000-000000000001') is null
     or not exists (select 1 from tracker.memberships where user_id = '00000000-0000-0000-0000-0000000000b1' and role = 'student') then
    raise exception 'guard failure changed data';
  end if;
  raise notice 'ok: P0002 and 23514 guard (AC4, AC5)';
end $$;

-- AC6/AC7: change email, unlink ------------------------------------------------
set role authenticated;
set request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a1", "email": "o1@example.com"}';
update tracker.students set email = 's1.real@example.com' where id = '20000000-0000-0000-0000-000000000001';
select tracker.unlink_student('20000000-0000-0000-0000-000000000001');
reset role;
do $$ begin
  if (select user_id from tracker.students where id = '20000000-0000-0000-0000-000000000001') is not null then
    raise exception 'user_id not cleared';
  end if;
  if exists (select 1 from tracker.memberships where user_id = '00000000-0000-0000-0000-0000000000b1') then
    raise exception 'student membership not removed';
  end if;
  if not exists (select 1 from tracker.audit_log where table_name = 'students' and action = 'UPDATE'
        and row_id = '20000000-0000-0000-0000-000000000001'
        and before->>'user_id' = '00000000-0000-0000-0000-0000000000b1'
        and after->>'user_id' is null
        and actor_id = '00000000-0000-0000-0000-0000000000a1') then
    raise exception 'missing students UPDATE audit row';
  end if;
  if not exists (select 1 from tracker.audit_log where table_name = 'memberships' and action = 'DELETE'
        and row_id = '00000000-0000-0000-0000-0000000000b1'
        and before->>'role' = 'student'
        and actor_id = '00000000-0000-0000-0000-0000000000a1') then
    raise exception 'missing memberships DELETE audit row';
  end if;
  raise notice 'ok: unlink and audit rows (AC6, AC7)';
end $$;

-- AC8: the former user reads nothing, cannot re-claim --------------------------
set role authenticated;
set request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000b1", "email": "s1@example.com"}';
do $$ declare t text; n bigint; begin
  foreach t in array array['students','goals','courses','syllabus_versions','categories','assessments','tasks','grade_flags'] loop
    execute format('select count(*) from tracker.%I', t) into n;
    if n <> 0 then raise exception 'former student still reads % rows of %', n, t; end if;
  end loop;
  if tracker.claim_student_invites() <> 0 then
    raise exception 'former login re-claimed the student';
  end if;
  raise notice 'ok: former student locked out (AC8)';
end $$;
reset role;

-- AC9: corrected email claims and reads ----------------------------------------
set role authenticated;
set request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000b3", "email": "s1.real@example.com"}';
do $$ begin
  if tracker.claim_student_invites() <> 1 then
    raise exception 'corrected login could not claim';
  end if;
  if (select count(*) from tracker.students) <> 1 then
    raise exception 'corrected login cannot read the student';
  end if;
  raise notice 'ok: corrected login claims (AC9)';
end $$;
reset role;

-- AC6 (second fixture): a login that is also a teacher keeps that role ----------
insert into tracker.students (id, org_id, teacher_id, email, first_name, last_initial, grade_level, user_id, published_at, status) values
  ('20000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000001',
   '00000000-0000-0000-0000-0000000000a1', 'dual@example.com', 'Dee', 'U', 11,
   '00000000-0000-0000-0000-0000000000b2', now(), 'active');
insert into tracker.memberships (user_id, org_id, role) values
  ('00000000-0000-0000-0000-0000000000b2', '10000000-0000-0000-0000-000000000001', 'student'),
  ('00000000-0000-0000-0000-0000000000b2', '10000000-0000-0000-0000-000000000002', 'teacher');
set role authenticated;
set request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a1", "email": "o1@example.com"}';
update tracker.students set email = 'dee.real@example.com' where id = '20000000-0000-0000-0000-000000000003';
select tracker.unlink_student('20000000-0000-0000-0000-000000000003');
reset role;
do $$ begin
  if exists (select 1 from tracker.memberships where user_id = '00000000-0000-0000-0000-0000000000b2'
             and org_id = '10000000-0000-0000-0000-000000000001' and role = 'student') then
    raise exception 'student membership kept';
  end if;
  if not exists (select 1 from tracker.memberships where user_id = '00000000-0000-0000-0000-0000000000b2'
             and org_id = '10000000-0000-0000-0000-000000000002' and role = 'teacher') then
    raise exception 'teacher membership removed';
  end if;
  raise notice 'ok: other roles spared (AC6)';
end $$;
