-- Who reads tracker.audit_log (0020, REQ-32). Run by run-rls.sh on a fresh
-- copy of the migrated database. Each check raises on failure.

\set ON_ERROR_STOP on

-- Cast ------------------------------------------------------------------------
--   OWN  owner of Org One                GT   grade teacher of Org One (membership 'teacher')
--   ST   scheduling-only teacher (staff_link, no membership)
--   STU  published student of Org One    PAR  parent of that student
--   OWN2 owner of Org Two
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'owner@example.com'),
  ('00000000-0000-0000-0000-0000000000a2', 'owner2@example.com'),
  ('00000000-0000-0000-0000-0000000000b1', 'gt@example.com'),
  ('00000000-0000-0000-0000-0000000000c1', 'stu@example.com'),
  ('00000000-0000-0000-0000-0000000000d1', 'st@example.com'),
  ('00000000-0000-0000-0000-0000000000e1', 'par@example.com');

insert into tracker.orgs (id, name) values
  ('10000000-0000-0000-0000-000000000001', 'Org One'),
  ('10000000-0000-0000-0000-000000000002', 'Org Two');
insert into tracker.memberships (user_id, org_id, role) values
  ('00000000-0000-0000-0000-0000000000a1', '10000000-0000-0000-0000-000000000001', 'owner'),
  ('00000000-0000-0000-0000-0000000000a2', '10000000-0000-0000-0000-000000000002', 'owner'),
  ('00000000-0000-0000-0000-0000000000b1', '10000000-0000-0000-0000-000000000001', 'teacher'),
  ('00000000-0000-0000-0000-0000000000c1', '10000000-0000-0000-0000-000000000001', 'student'),
  ('00000000-0000-0000-0000-0000000000e1', '10000000-0000-0000-0000-000000000001', 'parent');

-- One audited row in every audited table of Org One, written as superuser so
-- the trigger records them. Org Two gets a student, so its log is not empty.
insert into tracker.students (id, org_id, teacher_id, user_id, email, first_name, last_initial, grade_level, published_at, notion_student_id) values
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001',
   '00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000c1',
   'stu@example.com', 'Ada', 'L', 11, now(), 'f0000000-0000-4000-8000-000000000001'),
  ('20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000002',
   '00000000-0000-0000-0000-0000000000a2', null, 'other@example.com', 'Bo', 'K', 10, null, null);
insert into tracker.goals (org_id, student_id, school, program, target_six_avg) values
  ('10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'U of T', 'Engineering', 92);
insert into tracker.courses (id, org_id, student_id, code, name) values
  ('30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001',
   '20000000-0000-0000-0000-000000000001', 'MHF4U', 'Advanced Functions');
insert into tracker.syllabus_versions (id, org_id, student_id, course_id, version) values
  ('31000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001',
   '20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', 1);
insert into tracker.categories (id, org_id, student_id, course_id, syllabus_version_id, name, weight) values
  ('32000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001',
   '20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001',
   '31000000-0000-0000-0000-000000000001', 'Tests', 100);
insert into tracker.assessments (id, org_id, student_id, course_id, category_id, title, score_possible) values
  ('33000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001',
   '20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001',
   '32000000-0000-0000-0000-000000000001', 'Unit 1 test', 50);
insert into tracker.tasks (org_id, student_id, title) values
  ('10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'Review unit 1');
insert into tracker.grade_flags (org_id, student_id, assessment_id, reason) values
  ('10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001',
   '33000000-0000-0000-0000-000000000001', 'returned');
insert into tracker.staff_links (org_id, notion_staff_id, email, user_id, approved_by) values
  ('10000000-0000-0000-0000-000000000001', 'e0000000-0000-4000-8000-000000000001', 'st@example.com',
   '00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000a1');
insert into tracker.availability_windows (org_id, request_id, notion_staff_id, weekday, start_time, end_time, effective_from, created_by) values
  ('10000000-0000-0000-0000-000000000001', gen_random_uuid(), 'e0000000-0000-4000-8000-000000000001',
   2, '16:00', '20:00', '2026-09-01', '00000000-0000-0000-0000-0000000000a1');
insert into tracker.availability_exceptions (org_id, request_id, notion_staff_id, on_date, kind, created_by) values
  ('10000000-0000-0000-0000-000000000001', gen_random_uuid(), 'e0000000-0000-4000-8000-000000000001',
   '2026-11-03', 'time_off', '00000000-0000-0000-0000-0000000000a1');
insert into tracker.class_series (id, org_id, request_id, notion_staff_id, notion_student_id, subject, kind, start_date, start_time, duration_minutes, created_by) values
  ('40000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', gen_random_uuid(),
   'e0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000001',
   'Math', 'weekly', '2026-09-01', '17:00', 60, '00000000-0000-0000-0000-0000000000a1');
insert into tracker.class_exceptions (org_id, request_id, series_id, original_date, kind, created_by) values
  ('10000000-0000-0000-0000-000000000001', gen_random_uuid(), '40000000-0000-0000-0000-000000000001',
   '2026-11-03', 'cancelled', '00000000-0000-0000-0000-0000000000a1');
insert into tracker.schedule_summaries (org_id, notion_student_id, adopted_from_text, created_by) values
  ('10000000-0000-0000-0000-000000000001', 'f0000000-0000-4000-8000-000000000001',
   'Tue 5pm Math', '00000000-0000-0000-0000-0000000000a1');
insert into tracker.parent_links (org_id, student_id, email, parent_user_id, claimed_at, invited_by) values
  ('10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'par@example.com',
   '00000000-0000-0000-0000-0000000000e1', now(), '00000000-0000-0000-0000-0000000000a1');
-- What remove_parent_link() and unlink_student() write for a membership removal.
insert into tracker.audit_log (org_id, actor_id, table_name, row_id, action, before, after) values
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1', 'memberships',
   '00000000-0000-0000-0000-0000000000e1', 'DELETE', '{"role": "parent"}', null);

do $$ begin
  assert (select count(distinct table_name) from tracker.audit_log
          where org_id = '10000000-0000-0000-0000-000000000001') = 16,
    'fixture: every audited table of Org One has a row';
end $$;

-- Owner: every row of their org, none of Org Two ------------------------------------
set role authenticated;
set request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a1", "email": "owner@example.com"}';
do $$ begin
  assert (select count(*) from tracker.audit_log) = 16, 'owner reads every audit row of the org';
  assert (select count(*) from tracker.audit_log where org_id <> '10000000-0000-0000-0000-000000000001') = 0,
    'owner reads another org''s audit rows';
end $$;
reset role;

-- Grade teacher: the grade tables only ------------------------------------------------
set role authenticated;
set request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000b1", "email": "gt@example.com"}';
do $$
declare
  seen text[];
begin
  select array_agg(distinct table_name order by table_name) into seen from tracker.audit_log;
  assert seen = array['assessments', 'categories', 'courses', 'goals', 'grade_flags', 'students', 'syllabus_versions', 'tasks'],
    format('grade teacher reads audit rows of %s', seen);
  assert (select count(*) from tracker.audit_log
          where table_name in ('staff_links', 'parent_links', 'schedule_summaries', 'class_series', 'class_exceptions',
                               'availability_windows', 'availability_exceptions', 'memberships')) = 0,
    'grade teacher reads audit rows of tables they cannot read';
  assert (select count(*) from tracker.audit_log where org_id <> '10000000-0000-0000-0000-000000000001') = 0,
    'grade teacher reads another org''s audit rows';
end $$;
reset role;

-- Everyone else reads nothing ---------------------------------------------------------
do $$
declare
  who text;
begin
  foreach who in array array[
    '00000000-0000-0000-0000-0000000000a2',  -- owner of Org Two
    '00000000-0000-0000-0000-0000000000c1',  -- student
    '00000000-0000-0000-0000-0000000000d1',  -- scheduling-only teacher
    '00000000-0000-0000-0000-0000000000e1'   -- parent
  ] loop
    perform set_config('request.jwt.claims', json_build_object('sub', who)::text, true);
    set local role authenticated;
    if who = '00000000-0000-0000-0000-0000000000a2' then
      assert (select count(*) from tracker.audit_log where org_id = '10000000-0000-0000-0000-000000000001') = 0,
        'owner of Org Two reads Org One''s audit log';
    else
      assert (select count(*) from tracker.audit_log) = 0, format('%s reads the audit log', who);
    end if;
    reset role;
  end loop;
end $$;

-- Still append-only for the owner -----------------------------------------------------
set role authenticated;
set request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a1", "email": "owner@example.com"}';
do $$ begin
  begin
    insert into tracker.audit_log (org_id, table_name, row_id, action)
      values ('10000000-0000-0000-0000-000000000001', 'x', 'x', 'INSERT');
    raise exception 'audit: owner inserted a row';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;
