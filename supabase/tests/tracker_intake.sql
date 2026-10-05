-- Checks for tracker step 9 (0007): student numbers and student-wide AI
-- draft records. Run by run-rls.sh on a fresh copy of the migrated database.
-- Each check raises on failure, so psql exits non-zero.

\set ON_ERROR_STOP on

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 't1@example.com'),
  ('00000000-0000-0000-0000-0000000000a2', 't2@example.com');

insert into tracker.orgs (id, name) values
  ('10000000-0000-0000-0000-000000000001', 'Org One'),
  ('10000000-0000-0000-0000-000000000002', 'Org Two');
insert into tracker.memberships (user_id, org_id, role) values
  ('00000000-0000-0000-0000-0000000000a1', '10000000-0000-0000-0000-000000000001', 'owner'),
  ('00000000-0000-0000-0000-0000000000a2', '10000000-0000-0000-0000-000000000002', 'teacher');

-- As T1: two students in Org One ---------------------------------------------------------
set role authenticated;
set request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a1", "email": "t1@example.com"}';

insert into tracker.students (id, org_id, teacher_id, email, first_name, last_initial, grade_level) values
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001',
   '00000000-0000-0000-0000-0000000000a1', 's1@example.com', 'Sam', 'L', 11),
  ('20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001',
   '00000000-0000-0000-0000-0000000000a1', 's2@example.com', 'Ada', 'K', 12);

do $$ begin
  if (select student_number from tracker.students where id = '20000000-0000-0000-0000-000000000001') <> 1
     or (select student_number from tracker.students where id = '20000000-0000-0000-0000-000000000002') <> 2 then
    raise exception 'student_number: not assigned 1, 2 in insert order';
  end if;
  update tracker.students set grade_level = 12 where id = '20000000-0000-0000-0000-000000000001';
  if (select student_number from tracker.students where id = '20000000-0000-0000-0000-000000000001') <> 1 then
    raise exception 'student_number: changed by an update';
  end if;
  raise notice 'ok: student numbers are assigned per org on insert and never change';
end $$;

-- A draft for the whole student: no course, files only -----------------------------------
do $$ begin
  insert into tracker.ai_drafts (org_id, student_id, course_id, input_chars, input_files) values
    ('10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', null, 0, 2);
  begin
    insert into tracker.ai_drafts (org_id, student_id, course_id, input_chars, input_files) values
      ('10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', null, 0, 0);
    raise exception 'ai_drafts: accepted a request with no text and no files';
  exception when check_violation then null;
  end;
  raise notice 'ok: a draft record stands without a course, but not without input';
end $$;

-- As T2: Org Two numbers start at 1 again ----------------------------------------------------
reset role;
set role authenticated;
set request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a2", "email": "t2@example.com"}';

insert into tracker.students (id, org_id, teacher_id, email, first_name, last_initial, grade_level) values
  ('20000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000002',
   '00000000-0000-0000-0000-0000000000a2', 's3@example.com', 'Kim', 'P', 10);

do $$ begin
  if (select student_number from tracker.students where id = '20000000-0000-0000-0000-000000000003') <> 1 then
    raise exception 'student_number: Org Two did not start at 1';
  end if;
  if (select count(*) from tracker.students) <> 1 then
    raise exception 'students: T2 can see another org''s students';
  end if;
  raise notice 'ok: numbers are per org, and the trigger reads nothing across orgs';
end $$;

reset role;
\echo 'tracker intake checks passed'
