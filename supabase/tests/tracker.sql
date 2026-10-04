-- RLS and integrity checks for the tracker schema (0003, 0004). Run by
-- run-rls.sh on a fresh copy of the migrated database. Each check raises on
-- failure, so psql exits non-zero.

\set ON_ERROR_STOP on

-- Cast ------------------------------------------------------------------------
--   T1  owner of Org One          T2  teacher of Org Two
--   S1  student login (s1@)       S2  student login (s2@), same org as S1
--   O   outsider, no invite

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 't1@example.com'),
  ('00000000-0000-0000-0000-0000000000a2', 't2@example.com'),
  ('00000000-0000-0000-0000-0000000000b1', 's1@example.com'),
  ('00000000-0000-0000-0000-0000000000b2', 's2@example.com'),
  ('00000000-0000-0000-0000-0000000000c1', 'o@example.com');

insert into tracker.orgs (id, name) values
  ('10000000-0000-0000-0000-000000000001', 'Org One'),
  ('10000000-0000-0000-0000-000000000002', 'Org Two');
insert into tracker.memberships (user_id, org_id, role) values
  ('00000000-0000-0000-0000-0000000000a1', '10000000-0000-0000-0000-000000000001', 'owner'),
  ('00000000-0000-0000-0000-0000000000a2', '10000000-0000-0000-0000-000000000002', 'teacher');

-- As T1: set up two students ----------------------------------------------------
set role authenticated;
set request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a1", "email": "t1@example.com"}';

insert into tracker.students (id, org_id, teacher_id, email, first_name, last_initial, grade_level) values
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001',
   '00000000-0000-0000-0000-0000000000a1', 's1@example.com', 'Sam', 'L', 11),
  ('20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001',
   '00000000-0000-0000-0000-0000000000a1', 's2@example.com', 'Ria', 'P', 11);

insert into tracker.goals (org_id, student_id, school, program, application_year, target_six_avg) values
  ('10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'Waterloo', 'Software Engineering', 2027, 95);

insert into tracker.courses (id, org_id, student_id, code, name, term, target_grade) values
  ('30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'MHF4U', 'Advanced Functions', 'Fall 2026', 95),
  ('30000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000002', 'SCH4U', 'Chemistry', 'Fall 2026', 92);

insert into tracker.syllabus_versions (id, org_id, student_id, course_id, version) values
  ('40000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', 1),
  ('40000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000002', 1);
update tracker.courses set active_syllabus_version_id = '40000000-0000-0000-0000-000000000001' where id = '30000000-0000-0000-0000-000000000001';
update tracker.courses set active_syllabus_version_id = '40000000-0000-0000-0000-000000000002' where id = '30000000-0000-0000-0000-000000000002';

insert into tracker.categories (id, org_id, student_id, course_id, syllabus_version_id, name, weight) values
  ('50000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001', 'Tests', 60),
  ('50000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001', 'Assignments', 30),
  ('50000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000002', '40000000-0000-0000-0000-000000000002', 'All', 100);

insert into tracker.assessments (id, org_id, student_id, course_id, category_id, title, due_date, score_possible) values
  ('60000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000001', 'Unit 1 test', '2026-10-10', 40),
  ('60000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000002', '50000000-0000-0000-0000-000000000003', 'Lab 1', '2026-10-11', 20);

insert into tracker.tasks (id, org_id, student_id, course_id, title, kind, pinned) values
  ('70000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', 'Review factor theorem', 'school', true),
  ('70000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000002', null, 'Read chapter 2', 'supplemental', false);

do $$ begin
  -- Weights are 90, so confirming must fail.
  begin
    update tracker.syllabus_versions set confirmed_at = now(), confirmed_by = auth.uid()
      where id = '40000000-0000-0000-0000-000000000001';
    raise exception 'syllabus: confirmed a version whose weights sum to 90';
  exception when check_violation then null;
  end;
  -- Composite keys: a course row cannot point at another student's record.
  begin
    insert into tracker.courses (org_id, student_id, code, name)
      values ('10000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000001', 'X', 'Mismatched org');
    raise exception 'courses: accepted an org_id that does not match the student';
  exception when foreign_key_violation or insufficient_privilege then null;
  end;
  -- T1 cannot create a student in an org they are not staff of.
  begin
    insert into tracker.students (org_id, teacher_id, email, first_name, last_initial, grade_level)
      values ('10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000a1', 'x@example.com', 'X', 'Y', 11);
    raise exception 'students: T1 created a student in Org Two';
  exception when insufficient_privilege then null;
  end;
  -- Nobody links a login by hand: user_id is not writable through the API.
  begin
    update tracker.students set user_id = '00000000-0000-0000-0000-0000000000c1'
      where id = '20000000-0000-0000-0000-000000000001';
    raise exception 'students: T1 set user_id directly';
  exception when insufficient_privilege then null;
  end;
  -- Students are never deleted.
  begin
    delete from tracker.students where id = '20000000-0000-0000-0000-000000000002';
    raise exception 'students: T1 deleted a student';
  exception when insufficient_privilege then null;
  end;
  raise notice 'ok: staff set up students in their own org only';
end $$;

insert into tracker.categories (org_id, student_id, course_id, syllabus_version_id, name, weight) values
  ('10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001', 'Participation', 10);
update tracker.syllabus_versions set confirmed_at = now(), confirmed_by = auth.uid()
  where id = '40000000-0000-0000-0000-000000000001';

do $$ begin
  begin
    update tracker.categories set weight = 70 where id = '50000000-0000-0000-0000-000000000001';
    raise exception 'syllabus: changed a weight on a confirmed version';
  exception when check_violation then null;
  end;
  begin
    update tracker.syllabus_versions set notes = 'edit' where id = '40000000-0000-0000-0000-000000000001';
    raise exception 'syllabus: edited a confirmed version';
  exception when check_violation then null;
  end;
  raise notice 'ok: a confirmed syllabus sums to 100 and is read-only';
end $$;

-- graded_at follows the score.
update tracker.assessments set score_earned = 0 where id = '60000000-0000-0000-0000-000000000001';
do $$ begin
  if (select graded_at from tracker.assessments where id = '60000000-0000-0000-0000-000000000001') is null then
    raise exception 'assessments: graded_at not set when a zero was entered';
  end if;
end $$;
update tracker.assessments set score_earned = null where id = '60000000-0000-0000-0000-000000000001';
do $$ begin
  if (select graded_at from tracker.assessments where id = '60000000-0000-0000-0000-000000000001') is not null then
    raise exception 'assessments: graded_at kept after the score was removed';
  end if;
  raise notice 'ok: graded_at follows the score';
end $$;

-- As T2: another org sees nothing and changes nothing ----------------------------
reset role;
set role authenticated;
set request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a2", "email": "t2@example.com"}';

update tracker.assessments set score_earned = 1 where id = '60000000-0000-0000-0000-000000000001';
do $$ begin
  if (select count(*) from tracker.students) <> 0
     or (select count(*) from tracker.assessments) <> 0
     or (select count(*) from tracker.tasks) <> 0
     or (select count(*) from tracker.goals) <> 0 then
    raise exception 'tracker: a teacher in Org Two can read Org One rows';
  end if;
  raise notice 'ok: staff of another org read nothing';
end $$;

-- As S1 before publish: nothing to see or claim -----------------------------------
reset role;
set role authenticated;
set request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000b1", "email": "s1@example.com"}';

do $$ begin
  if tracker.claim_student_invites() <> 0 then
    raise exception 'claim: claimed an unpublished student record';
  end if;
  if (select count(*) from tracker.students) <> 0 or (select count(*) from tracker.courses) <> 0 then
    raise exception 'tracker: a student sees data before publish';
  end if;
  raise notice 'ok: students see nothing until published';
end $$;

-- As T1: publish both students ----------------------------------------------------
reset role;
set role authenticated;
set request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a1", "email": "t1@example.com"}';
update tracker.students set published_at = now(), status = 'active';

-- As S1: claim, then read only their own rows ----------------------------------------
reset role;
set role authenticated;
set request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000b1", "email": "S1@Example.com"}';

do $$ begin
  if tracker.claim_student_invites() <> 1 then
    raise exception 'claim: S1 could not claim their published record';
  end if;
  if tracker.claim_student_invites() <> 0 then
    raise exception 'claim: S1 claimed twice';
  end if;
  if (select count(*) from tracker.students) <> 1
     or (select first_name from tracker.students) <> 'Sam' then
    raise exception 'students: S1 sees records other than their own';
  end if;
  if (select count(*) from tracker.courses) <> 1
     or (select count(*) from tracker.assessments) <> 1
     or (select count(*) from tracker.tasks) <> 1
     or (select count(*) from tracker.categories) <> 3
     or (select count(*) from tracker.syllabus_versions) <> 1
     or (select count(*) from tracker.goals) <> 1 then
    raise exception 'tracker: S1 row counts do not match their own data';
  end if;
  if (select role::text from tracker.memberships) <> 'student' then
    raise exception 'claim: no student membership was added';
  end if;
  if tracker.is_org_staff('10000000-0000-0000-0000-000000000001') then
    raise exception 'memberships: a student counts as staff';
  end if;
  raise notice 'ok: S1 claims their invite and reads only their own rows';
end $$;

-- S1 cannot write marks or rows, only Done through the functions.
update tracker.assessments set score_earned = 40 where id = '60000000-0000-0000-0000-000000000001';
delete from tracker.tasks;
do $$
declare
  stamp timestamptz;
begin
  begin
    insert into tracker.tasks (org_id, student_id, title)
      values ('10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'Self-assigned');
    raise exception 'tasks: S1 inserted a task';
  exception when insufficient_privilege then null;
  end;
  stamp := tracker.set_assessment_done('60000000-0000-0000-0000-000000000001', true);
  if stamp is null then raise exception 'done: set_assessment_done returned no timestamp'; end if;
  if tracker.set_assessment_done('60000000-0000-0000-0000-000000000001', true) <> stamp then
    raise exception 'done: tapping Done twice moved the timestamp';
  end if;
  if tracker.set_task_done('70000000-0000-0000-0000-000000000001', true) is null then
    raise exception 'done: set_task_done failed on own task';
  end if;
  begin
    perform tracker.set_assessment_done('60000000-0000-0000-0000-000000000002', true);
    raise exception 'done: S1 marked S2''s assessment done';
  exception when no_data_found then null;
  end;
  begin
    perform tracker.set_task_done('70000000-0000-0000-0000-000000000002', true);
    raise exception 'done: S1 marked S2''s task done';
  exception when no_data_found then null;
  end;
  raise notice 'ok: S1 can only mark their own work done';
end $$;

reset role;
do $$ begin
  if (select score_earned from tracker.assessments where id = '60000000-0000-0000-0000-000000000001') is not null then
    raise exception 'assessments: S1 changed their own score';
  end if;
  if (select count(*) from tracker.tasks) <> 2 then
    raise exception 'tasks: S1 deleted a task';
  end if;
  if (select score_earned from tracker.assessments where id = '60000000-0000-0000-0000-000000000001') is not null
     or (select student_done_at from tracker.assessments where id = '60000000-0000-0000-0000-000000000001') is null then
    raise exception 'done: Done awarded marks or did not stick';
  end if;
  if (select student_done_at from tracker.assessments where id = '60000000-0000-0000-0000-000000000002') is not null then
    raise exception 'done: the cross-student Done landed';
  end if;
  raise notice 'ok: Done never awards marks, and S1 changed nothing else';
end $$;

-- As S2 (same org): sees none of S1's rows -------------------------------------------
set role authenticated;
set request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000b2", "email": "s2@example.com"}';
do $$ begin
  perform tracker.claim_student_invites();
  if exists (select 1 from tracker.students where first_name = 'Sam')
     or exists (select 1 from tracker.assessments where title = 'Unit 1 test')
     or exists (select 1 from tracker.goals) then
    raise exception 'tracker: S2 can read S1''s rows';
  end if;
  if (select count(*) from tracker.assessments) <> 1 then
    raise exception 'tracker: S2 cannot read their own assessment';
  end if;
  raise notice 'ok: a student in the same org cannot read another student''s rows';
end $$;

-- Outsider and anonymous ----------------------------------------------------------
reset role;
set role authenticated;
set request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000c1", "email": "o@example.com"}';
do $$ begin
  if tracker.claim_student_invites() <> 0 then raise exception 'claim: outsider claimed something'; end if;
  if (select count(*) from tracker.students) + (select count(*) from tracker.assessments)
     + (select count(*) from tracker.orgs) <> 0 then
    raise exception 'tracker: an outsider can read rows';
  end if;
  raise notice 'ok: an outsider reads nothing';
end $$;

reset role;
set role anon;
reset request.jwt.claims;
do $$ begin
  begin
    perform 1 from tracker.students;
    raise exception 'tracker: anon can reach students';
  exception when insufficient_privilege then null;
  end;
  begin
    perform tracker.claim_student_invites();
    raise exception 'tracker: anon can call claim_student_invites';
  exception when insufficient_privilege then null;
  end;
  raise notice 'ok: anon reaches nothing in tracker';
end $$;

-- Archived students can read but no longer mark work done.
reset role;
update tracker.students set status = 'archived' where id = '20000000-0000-0000-0000-000000000001';
set role authenticated;
set request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000b1", "email": "s1@example.com"}';
do $$ begin
  begin
    perform tracker.set_task_done('70000000-0000-0000-0000-000000000001', false);
    raise exception 'done: an archived student changed Done';
  exception when no_data_found then null;
  end;
  if (select count(*) from tracker.courses) <> 1 then
    raise exception 'tracker: an archived student lost read access to their history';
  end if;
  raise notice 'ok: archived students keep read access, lose Done';
end $$;

reset role;
\echo 'tracker checks passed'
