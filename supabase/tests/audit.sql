-- Audit log checks (0005). Run by run-rls.sh on a fresh migrated database.

\set ON_ERROR_STOP on

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 't1@example.com'),
  ('00000000-0000-0000-0000-0000000000a2', 't2@example.com'),
  ('00000000-0000-0000-0000-0000000000b1', 's1@example.com');
insert into tracker.orgs (id, name) values
  ('10000000-0000-0000-0000-000000000001', 'Org One'),
  ('10000000-0000-0000-0000-000000000002', 'Org Two');
insert into tracker.memberships (user_id, org_id, role) values
  ('00000000-0000-0000-0000-0000000000a1', '10000000-0000-0000-0000-000000000001', 'owner'),
  ('00000000-0000-0000-0000-0000000000a2', '10000000-0000-0000-0000-000000000002', 'teacher');

-- As T1: create a student, a course, a category, an assessment; then score it.
set role authenticated;
set request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a1", "email": "t1@example.com"}';
insert into tracker.students (id, org_id, teacher_id, email, first_name, last_initial, grade_level) values
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1', 's1@example.com', 'Sam', 'L', 11);
insert into tracker.courses (id, org_id, student_id, code, name, target_grade) values
  ('30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'MHF4U', 'Functions', 90);
insert into tracker.syllabus_versions (id, org_id, student_id, course_id, version) values
  ('40000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', 1);
insert into tracker.categories (id, org_id, student_id, course_id, syllabus_version_id, name, weight) values
  ('50000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001', 'All', 100);
insert into tracker.assessments (id, org_id, student_id, course_id, category_id, title, score_possible) values
  ('60000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000001', 'Test', 40);
update tracker.assessments set score_earned = 36 where id = '60000000-0000-0000-0000-000000000001';
update tracker.courses set target_grade = 92 where id = '30000000-0000-0000-0000-000000000001';
-- A no-op update (only updated_at moves) is not recorded.
update tracker.courses set target_grade = 92 where id = '30000000-0000-0000-0000-000000000001';
update tracker.students set published_at = now(), status = 'active';

do $$
declare
  entry record;
begin
  select * into entry from tracker.audit_log
   where table_name = 'assessments' and action = 'UPDATE'
   order by id desc limit 1;
  if entry is null then raise exception 'audit: score change not recorded'; end if;
  if entry.actor_id <> '00000000-0000-0000-0000-0000000000a1' then raise exception 'audit: wrong actor'; end if;
  if (entry.before ->> 'score_earned') is not null or (entry.after ->> 'score_earned')::numeric <> 36 then
    raise exception 'audit: before/after do not show the score change';
  end if;
  if (select count(*) from tracker.audit_log where table_name = 'courses' and action = 'UPDATE') <> 1 then
    raise exception 'audit: expected exactly one recorded course update (target 90 to 92)';
  end if;
  if (select count(*) from tracker.audit_log where table_name in ('students', 'courses', 'syllabus_versions', 'categories', 'assessments') and action = 'INSERT') <> 5 then
    raise exception 'audit: inserts not all recorded';
  end if;
  raise notice 'ok: grades, targets and syllabus changes are recorded with actor and before/after';
end $$;

-- Staff cannot write or erase history.
do $$ begin
  begin
    insert into tracker.audit_log (org_id, table_name, row_id, action) values ('10000000-0000-0000-0000-000000000001', 'x', 'x', 'INSERT');
    raise exception 'audit: staff inserted into the log';
  exception when insufficient_privilege then null;
  end;
  begin
    delete from tracker.audit_log;
    raise exception 'audit: staff deleted from the log';
  exception when insufficient_privilege then null;
  end;
  begin
    update tracker.audit_log set action = 'DELETE';
    raise exception 'audit: staff edited the log';
  exception when insufficient_privilege then null;
  end;
  raise notice 'ok: staff cannot write, edit or erase the log';
end $$;

-- Another org's staff and the student see none of it.
reset role;
set role authenticated;
set request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a2", "email": "t2@example.com"}';
do $$ begin
  if (select count(*) from tracker.audit_log) <> 0 then raise exception 'audit: another org reads the log'; end if;
end $$;
reset role;
set role authenticated;
set request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000b1", "email": "s1@example.com"}';
do $$ begin
  perform tracker.claim_student_invites();
  perform tracker.set_assessment_done('60000000-0000-0000-0000-000000000001', true);
  if (select count(*) from tracker.audit_log) <> 0 then raise exception 'audit: a student reads the log'; end if;
  raise notice 'ok: only staff of the same org read the log';
end $$;

-- Even the table owner cannot edit, delete or truncate.
reset role;
do $$ begin
  if not exists (select 1 from tracker.audit_log where table_name = 'assessments' and actor_id = '00000000-0000-0000-0000-0000000000b1') then
    raise exception 'audit: the student''s Done was not recorded';
  end if;
  begin
    update tracker.audit_log set actor_id = null;
    raise exception 'audit: owner edited the log';
  exception when insufficient_privilege then null;
  end;
  begin
    delete from tracker.audit_log;
    raise exception 'audit: owner deleted from the log';
  exception when insufficient_privilege then null;
  end;
  begin
    truncate tracker.audit_log;
    raise exception 'audit: owner truncated the log';
  exception when insufficient_privilege then null;
  end;
  raise notice 'ok: the log is append-only for every role';
end $$;

\echo 'audit checks passed'
