-- Integrity and RLS checks for tracker step 10 (0008): an assessment is an
-- assignment with a due date or a test with a held date, never both. Run by
-- run-rls.sh on a fresh copy of the migrated database. Each check raises on
-- failure, so psql exits non-zero.

\set ON_ERROR_STOP on

-- Cast ------------------------------------------------------------------------
--   T1  owner of Org One          S1  student login (s1@)
--   S2  student login (s2@), same org as S1

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 't1@example.com'),
  ('00000000-0000-0000-0000-0000000000b1', 's1@example.com'),
  ('00000000-0000-0000-0000-0000000000b2', 's2@example.com');

insert into tracker.orgs (id, name) values ('10000000-0000-0000-0000-000000000001', 'Org One');
insert into tracker.memberships (user_id, org_id, role) values
  ('00000000-0000-0000-0000-0000000000a1', '10000000-0000-0000-0000-000000000001', 'owner');

-- As T1: two published students, one course each --------------------------------------
set role authenticated;
set request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a1", "email": "t1@example.com"}';

insert into tracker.students (id, org_id, teacher_id, email, first_name, last_initial, grade_level) values
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001',
   '00000000-0000-0000-0000-0000000000a1', 's1@example.com', 'Sam', 'L', 11),
  ('20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001',
   '00000000-0000-0000-0000-0000000000a1', 's2@example.com', 'Ria', 'P', 11);
insert into tracker.courses (id, org_id, student_id, code, name) values
  ('30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'MHF4U', 'Advanced Functions'),
  ('30000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000002', 'SCH4U', 'Chemistry');
insert into tracker.syllabus_versions (id, org_id, student_id, course_id, version) values
  ('40000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', 1),
  ('40000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000002', 1);
update tracker.courses set active_syllabus_version_id = '40000000-0000-0000-0000-000000000001' where id = '30000000-0000-0000-0000-000000000001';
update tracker.courses set active_syllabus_version_id = '40000000-0000-0000-0000-000000000002' where id = '30000000-0000-0000-0000-000000000002';
insert into tracker.categories (id, org_id, student_id, course_id, syllabus_version_id, name, weight) values
  ('50000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001', 'All', 100),
  ('50000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000002', '40000000-0000-0000-0000-000000000002', 'All', 100);
update tracker.students set published_at = now(), status = 'active';

do $$ begin
  -- A test carries the day it is held.
  insert into tracker.assessments (id, org_id, student_id, course_id, category_id, title, kind, held_on, score_possible, score_earned) values
    ('60000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001',
     '30000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000001', 'Unit 1 test', 'test', '2026-09-20', 40, 31);
  -- An assignment carries a due date, and a row with no kind is an assignment.
  insert into tracker.assessments (id, org_id, student_id, course_id, category_id, title, due_date, score_possible) values
    ('60000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001',
     '30000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000001', 'Assignment 1', '2026-10-20', 20);
  if (select kind::text from tracker.assessments where id = '60000000-0000-0000-0000-000000000002') is distinct from 'assignment' then
    raise exception 'kind: the default is not assignment';
  end if;
  -- S2's row, for the isolation check below.
  insert into tracker.assessments (id, org_id, student_id, course_id, category_id, title, kind, held_on, score_possible, score_earned) values
    ('60000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000002',
     '30000000-0000-0000-0000-000000000002', '50000000-0000-0000-0000-000000000002', 'Lab test', 'test', '2026-09-22', 20, 18);
  raise notice 'ok: tests take a held date, assignments a due date';
end $$;

do $$ begin
  begin
    insert into tracker.assessments (org_id, student_id, course_id, category_id, title, kind, held_on, due_date, score_possible) values
      ('10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001',
       '30000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000001', 'Both dates', 'test', '2026-09-20', '2026-09-20', 10);
    raise exception 'one date: a test took a due date';
  exception when check_violation then null;
  end;
  begin
    insert into tracker.assessments (org_id, student_id, course_id, category_id, title, kind, held_on, score_possible) values
      ('10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001',
       '30000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000001', 'Held assignment', 'assignment', '2026-09-20', 10);
    raise exception 'one date: an assignment took a held date';
  exception when check_violation then null;
  end;
  begin
    update tracker.assessments set kind = 'assignment' where id = '60000000-0000-0000-0000-000000000001';
    raise exception 'one date: a test became an assignment while keeping its held date';
  exception when check_violation then null;
  end;
  -- Flipping the kind and moving the date in one statement is fine.
  update tracker.assessments set kind = 'assignment', held_on = null, due_date = '2026-09-20'
    where id = '60000000-0000-0000-0000-000000000001';
  update tracker.assessments set kind = 'test', due_date = null, held_on = '2026-09-20'
    where id = '60000000-0000-0000-0000-000000000001';
  -- Both dates null stays legal: old rows and drafts without a date.
  insert into tracker.assessments (id, org_id, student_id, course_id, category_id, title, score_possible) values
    ('60000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001',
     '30000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000001', 'Undated', 10);
  -- The entry stamp follows the score, not the kind or the date.
  if (select graded_at from tracker.assessments where id = '60000000-0000-0000-0000-000000000004') is not null then
    raise exception 'graded_at: set on an unmarked row';
  end if;
  raise notice 'ok: a row never carries both dates';
end $$;

-- As S1: reads the kind and held date of their own rows, none of S2's -------------------
reset role;
set role authenticated;
set request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000b1", "email": "s1@example.com"}';
select tracker.claim_student_invites();

do $$ begin
  if (select count(*) from tracker.assessments where kind = 'test' and held_on = '2026-09-20') <> 1 then
    raise exception 'rls: S1 cannot read their own test''s held date';
  end if;
  if (select count(*) from tracker.assessments where student_id = '20000000-0000-0000-0000-000000000002') <> 0 then
    raise exception 'rls: S1 reads another student''s assessments';
  end if;
  begin
    update tracker.assessments set held_on = '2026-09-21' where id = '60000000-0000-0000-0000-000000000001';
    if (select held_on from tracker.assessments where id = '60000000-0000-0000-0000-000000000001') <> '2026-09-20' then
      raise exception 'rls: a student moved a test date';
    end if;
  exception when insufficient_privilege then null;
  end;
  raise notice 'ok: students read their own kinds and dates only';
end $$;

reset role;
\echo 'tracker_dashboard checks passed'
