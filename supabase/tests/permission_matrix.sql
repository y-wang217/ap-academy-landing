-- The permission matrix (REQ-32, tracker ADR 0052), cell by cell. Run by
-- run-rls.sh on a fresh copy of the migrated database. Each check raises on
-- failure and every passing cell prints "ok: <actor> <table> <op>".
--
-- The `expected` values below mirror apps/tracker/docs/permission-matrix.md.
-- apps/tracker/lib/permission-matrix.test.ts fails when the two disagree, and
-- the AC3 block fails when a tracker table is missing here, so a new table
-- cannot ship unclassified.

\set ON_ERROR_STOP on

-- Cast ------------------------------------------------------------------------
-- Org One (O1) and Org Two (O2). Single roles:
--   OWN   owner of O1                       GT    grade teacher of O1 (membership 'teacher')
--   ST1   scheduling-only teacher, staff ST1  ST2  scheduling-only teacher, staff ST2
--   STU   student A's login                 PA    parent of A    PB  parent of B
--   OWN2  owner of O2
-- Combinations (AC9):
--   OS    owner of O1 + staff link ST3      GTS   grade teacher + staff link ST4
--   STP   staff link ST5 + parent of B      GTP   grade teacher + parent of A
-- Students: A (published, claimed by STU), B (published), C (unpublished) in
-- O1; Z (published) in O2. Classes: s1 ST1/A, s2 ST2/B, s3 ST1/C, s4 ST3/B,
-- s5 ST4/C, s6 ST5/A in O1; s7 ST9/Z in O2.
insert into auth.users (id, email) values
  ('a0000000-0000-0000-0000-000000000001', 'own@example.com'),
  ('a0000000-0000-0000-0000-000000000002', 'own2@example.com'),
  ('b0000000-0000-0000-0000-000000000001', 'gt@example.com'),
  ('d0000000-0000-0000-0000-000000000001', 'st1@example.com'),
  ('d0000000-0000-0000-0000-000000000002', 'st2@example.com'),
  ('c0000000-0000-0000-0000-000000000001', 'stu-login@example.com'),
  ('e0000000-0000-0000-0000-000000000001', 'pa@example.com'),
  ('e0000000-0000-0000-0000-000000000002', 'pb@example.com'),
  ('f0000000-0000-0000-0000-000000000001', 'os@example.com'),
  ('f0000000-0000-0000-0000-000000000002', 'gts@example.com'),
  ('f0000000-0000-0000-0000-000000000003', 'stp@example.com'),
  ('f0000000-0000-0000-0000-000000000004', 'gtp@example.com');

insert into tracker.orgs (id, name) values
  ('10000000-0000-0000-0000-000000000001', 'Org One'),
  ('10000000-0000-0000-0000-000000000002', 'Org Two');
insert into tracker.memberships (user_id, org_id, role) values
  ('a0000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'owner'),
  ('a0000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000002', 'owner'),
  ('b0000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'teacher'),
  ('c0000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'student'),
  ('e0000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'parent'),
  ('e0000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', 'parent'),
  ('f0000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'owner'),
  ('f0000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', 'teacher'),
  ('f0000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000001', 'parent'),
  ('f0000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000001', 'teacher');

insert into tracker.students (id, org_id, teacher_id, user_id, email, first_name, last_initial, grade_level, published_at, notion_student_id) values
  ('20000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001',
   'c0000000-0000-0000-0000-000000000001', 'a@example.com', 'Ada', 'L', 11, now(), '6a000000-0000-4000-8000-00000000000a'),
  ('20000000-0000-0000-0000-00000000000b', '10000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001',
   null, 'b@example.com', 'Bea', 'K', 10, now(), '6a000000-0000-4000-8000-00000000000b'),
  ('20000000-0000-0000-0000-00000000000c', '10000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001',
   null, 'c@example.com', 'Cy', 'M', 12, null, '6a000000-0000-4000-8000-00000000000c'),
  ('20000000-0000-0000-0000-00000000000f', '10000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000002',
   null, 'z@example.com', 'Zed', 'Q', 11, now(), '6a000000-0000-4000-8000-00000000000f');

-- One row per student in every grade table.
do $$
declare
  s record;
  owner_of uuid;
  course uuid;
  version uuid;
  category uuid;
  assessment uuid;
begin
  for s in select * from tracker.students loop
    owner_of := case when s.org_id = '10000000-0000-0000-0000-000000000001'
                     then 'a0000000-0000-0000-0000-000000000001'::uuid else 'a0000000-0000-0000-0000-000000000002'::uuid end;
    insert into tracker.goals (org_id, student_id, school, program, target_six_avg)
      values (s.org_id, s.id, 'U of T', 'Engineering', 90);
    insert into tracker.courses (org_id, student_id, code, name) values (s.org_id, s.id, 'MHF4U', 'Advanced Functions')
      returning id into course;
    insert into tracker.syllabus_versions (org_id, student_id, course_id, version) values (s.org_id, s.id, course, 1)
      returning id into version;
    insert into tracker.categories (org_id, student_id, course_id, syllabus_version_id, name, weight)
      values (s.org_id, s.id, course, version, 'Tests', 100) returning id into category;
    insert into tracker.assessments (org_id, student_id, course_id, category_id, title, score_possible)
      values (s.org_id, s.id, course, category, 'Unit 1 test', 50) returning id into assessment;
    insert into tracker.tasks (org_id, student_id, title) values (s.org_id, s.id, 'Review unit 1');
    insert into tracker.grade_flags (org_id, student_id, assessment_id, reason) values (s.org_id, s.id, assessment, 'returned');
    insert into tracker.ai_drafts (org_id, student_id, course_id, requested_by, input_chars)
      values (s.org_id, s.id, course, owner_of, 10);
  end loop;
end $$;

insert into tracker.staff_links (org_id, notion_staff_id, email, user_id, approved_by) values
  ('10000000-0000-0000-0000-000000000001', '5a000000-0000-4000-8000-000000000001', 'st1@example.com', 'd0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001'),
  ('10000000-0000-0000-0000-000000000001', '5a000000-0000-4000-8000-000000000002', 'st2@example.com', 'd0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001'),
  ('10000000-0000-0000-0000-000000000001', '5a000000-0000-4000-8000-000000000003', 'os@example.com', 'f0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001'),
  ('10000000-0000-0000-0000-000000000001', '5a000000-0000-4000-8000-000000000004', 'gts@example.com', 'f0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001'),
  ('10000000-0000-0000-0000-000000000001', '5a000000-0000-4000-8000-000000000005', 'stp@example.com', 'f0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000001'),
  ('10000000-0000-0000-0000-000000000002', '5a000000-0000-4000-8000-000000000009', 'st9@example.com', null, 'a0000000-0000-0000-0000-000000000002');

-- Availability and classes, one of each per teacher.
do $$
declare
  t record;
  sid uuid;
  n int := 0;
begin
  for t in select * from (values
      ('10000000-0000-0000-0000-000000000001'::uuid, '5a000000-0000-4000-8000-000000000001'::uuid, '6a000000-0000-4000-8000-00000000000a'::uuid, 'a0000000-0000-0000-0000-000000000001'::uuid),
      ('10000000-0000-0000-0000-000000000001', '5a000000-0000-4000-8000-000000000002', '6a000000-0000-4000-8000-00000000000b', 'a0000000-0000-0000-0000-000000000001'),
      ('10000000-0000-0000-0000-000000000001', '5a000000-0000-4000-8000-000000000001', '6a000000-0000-4000-8000-00000000000c', 'a0000000-0000-0000-0000-000000000001'),
      ('10000000-0000-0000-0000-000000000001', '5a000000-0000-4000-8000-000000000003', '6a000000-0000-4000-8000-00000000000b', 'a0000000-0000-0000-0000-000000000001'),
      ('10000000-0000-0000-0000-000000000001', '5a000000-0000-4000-8000-000000000004', '6a000000-0000-4000-8000-00000000000c', 'a0000000-0000-0000-0000-000000000001'),
      ('10000000-0000-0000-0000-000000000001', '5a000000-0000-4000-8000-000000000005', '6a000000-0000-4000-8000-00000000000a', 'a0000000-0000-0000-0000-000000000001'),
      ('10000000-0000-0000-0000-000000000002', '5a000000-0000-4000-8000-000000000009', '6a000000-0000-4000-8000-00000000000f', 'a0000000-0000-0000-0000-000000000002')
    ) v(org, staff, student, owner_id) loop
    n := n + 1;
    insert into tracker.class_series (id, org_id, request_id, notion_staff_id, notion_student_id, subject, kind, start_date, start_time, duration_minutes, created_by)
      values (format('40000000-0000-0000-0000-00000000000%s', n)::uuid, t.org, gen_random_uuid(), t.staff, t.student,
              'Math', 'weekly', '2026-09-07', '17:00', 60, t.owner_id)
      returning id into sid;
    insert into tracker.class_exceptions (org_id, request_id, series_id, original_date, kind, created_by)
      values (t.org, gen_random_uuid(), sid, '2026-09-14', 'cancelled', t.owner_id);
    -- Availability once per teacher, not per class (ST1 teaches two).
    if not exists (select 1 from tracker.availability_windows w where w.notion_staff_id = t.staff) then
      insert into tracker.availability_windows (org_id, request_id, notion_staff_id, weekday, start_time, end_time, effective_from, created_by)
        values (t.org, gen_random_uuid(), t.staff, 1, '15:00', '21:00', '2026-09-01', t.owner_id);
      insert into tracker.availability_exceptions (org_id, request_id, notion_staff_id, on_date, kind, created_by)
        values (t.org, gen_random_uuid(), t.staff, '2026-12-25', 'time_off', t.owner_id);
    end if;
  end loop;
end $$;

insert into tracker.schedule_summaries (org_id, notion_student_id, adopted_from_text, created_by) values
  ('10000000-0000-0000-0000-000000000001', '6a000000-0000-4000-8000-00000000000a', 'Mon 5pm Math', 'a0000000-0000-0000-0000-000000000001'),
  ('10000000-0000-0000-0000-000000000001', '6a000000-0000-4000-8000-00000000000b', 'Mon 5pm Math', 'a0000000-0000-0000-0000-000000000001'),
  ('10000000-0000-0000-0000-000000000001', '6a000000-0000-4000-8000-00000000000c', 'Mon 5pm Math', 'a0000000-0000-0000-0000-000000000001'),
  ('10000000-0000-0000-0000-000000000002', '6a000000-0000-4000-8000-00000000000f', 'Mon 5pm Math', 'a0000000-0000-0000-0000-000000000002');

insert into tracker.daily_tasks (id, org_id, kind, local_date) values
  ('70000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'teacher_texts', '2026-10-01'),
  ('70000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000002', 'teacher_texts', '2026-10-01');
insert into tracker.daily_task_teachers (task_id, org_id, notion_staff_id, block_id, written_fingerprint, written_at) values
  ('70000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '5a000000-0000-4000-8000-000000000001', gen_random_uuid(), 'f1', now()),
  ('70000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000002', '5a000000-0000-4000-8000-000000000009', gen_random_uuid(), 'f9', now());
insert into tracker.schedule_writes (org_id, request_id, op, series_id, created_by) values
  ('10000000-0000-0000-0000-000000000001', gen_random_uuid(), 'cancel', '40000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001'),
  ('10000000-0000-0000-0000-000000000002', gen_random_uuid(), 'cancel', '40000000-0000-0000-0000-000000000007', 'a0000000-0000-0000-0000-000000000002');
-- Outcomes (0023) on 2026-09-28, a past date no exception touches: ST1's
-- pending log on s1, the owner's reconciled link on s2, a no-show in Org Two.
insert into tracker.occurrence_outcomes (org_id, series_id, original_date, outcome, link_source, notion_lesson_id, lesson_date, claimed_at, created_by) values
  ('10000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001', '2026-09-28', 'delivered', 'logged', null, null, now(), 'd0000000-0000-0000-0000-000000000001'),
  ('10000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000002', '2026-09-28', 'delivered', 'reconciled', 'cccccccc-0000-4000-8000-000000000002', '2026-09-28', null, 'a0000000-0000-0000-0000-000000000001'),
  ('10000000-0000-0000-0000-000000000002', '40000000-0000-0000-0000-000000000007', '2026-09-28', 'no_show', null, null, null, null, 'a0000000-0000-0000-0000-000000000002');

insert into tracker.parent_links (id, org_id, student_id, email, parent_user_id, claimed_at, invited_by) values
  ('80000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-00000000000a',
   'pa@example.com', 'e0000000-0000-0000-0000-000000000001', now(), 'a0000000-0000-0000-0000-000000000001'),
  ('80000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-00000000000b',
   'pb@example.com', 'e0000000-0000-0000-0000-000000000002', now(), 'a0000000-0000-0000-0000-000000000001'),
  ('80000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-00000000000b',
   'stp@example.com', 'f0000000-0000-0000-0000-000000000003', now(), 'a0000000-0000-0000-0000-000000000001'),
  ('80000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-00000000000a',
   'gtp@example.com', 'f0000000-0000-0000-0000-000000000004', now(), 'a0000000-0000-0000-0000-000000000001'),
  ('80000000-0000-0000-0000-000000000009', '10000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-00000000000f',
   'zp@example.com', null, null, 'a0000000-0000-0000-0000-000000000002');

-- The matrix -------------------------------------------------------------------
-- One row per single role and table: rows visible from the fixture above,
-- whether a direct insert, update and delete get past the grants and RLS, and
-- the functions through which the role writes that table (null for none).
-- audit_log row counts are null here and filled in below from the fixture.
create schema matrix;
grant usage on schema matrix to authenticated;

create table matrix.expected (actor text, tbl text, rows int, ins boolean, upd boolean, del boolean, rpc text);
insert into matrix.expected (actor, tbl, rows, ins, upd, del, rpc) values
  -- owner
  ('owner', 'orgs',                    1, false, false, false, null),
  ('owner', 'memberships',             1, false, false, false, null),
  ('owner', 'students',                3, true,  true,  false, 'unlink_student'),
  ('owner', 'goals',                   3, true,  true,  true,  null),
  ('owner', 'courses',                 3, true,  true,  true,  null),
  ('owner', 'syllabus_versions',       3, true,  true,  true,  null),
  ('owner', 'categories',              3, true,  true,  true,  null),
  ('owner', 'assessments',             3, true,  true,  true,  null),
  ('owner', 'tasks',                   3, true,  true,  true,  null),
  ('owner', 'grade_flags',             3, false, true,  false, null),
  ('owner', 'ai_drafts',               3, true,  true,  false, null),
  ('owner', 'audit_log',            null, false, false, false, null),
  ('owner', 'staff_links',             5, true,  true,  false, null),
  ('owner', 'availability_windows',    5, true,  true,  true,  null),
  ('owner', 'availability_exceptions', 5, true,  true,  true,  null),
  ('owner', 'class_series',            6, true,  true,  false, 'schedule_write, split_class_series'),
  ('owner', 'class_exceptions',        6, true,  true,  false, 'schedule_write'),
  ('owner', 'schedule_summaries',      3, true,  true,  false, 'adopt_student_schedule'),
  ('owner', 'daily_tasks',             1, true,  true,  false, 'claim_daily_task'),
  ('owner', 'daily_task_teachers',     1, true,  true,  false, null),
  ('owner', 'parent_links',            4, true,  false, false, 'remove_parent_link'),
  ('owner', 'booking_stamps',          8, false, false, false, null),
  ('owner', 'schedule_writes',         1, true,  true,  false, 'schedule_write'),
  ('owner', 'occurrence_outcomes',      2, true,  true,  true,  null),
  ('owner', 'notion_outbox',        null, false, true,  false, 'enqueue_summary_sync, claim_notion_outbox, retry_notion_outbox'),
  -- grade_teacher
  ('grade_teacher', 'orgs',                    1, false, false, false, null),
  ('grade_teacher', 'memberships',             1, false, false, false, null),
  ('grade_teacher', 'students',                3, true,  true,  false, null),
  ('grade_teacher', 'goals',                   3, true,  true,  true,  null),
  ('grade_teacher', 'courses',                 3, true,  true,  true,  null),
  ('grade_teacher', 'syllabus_versions',       3, true,  true,  true,  null),
  ('grade_teacher', 'categories',              3, true,  true,  true,  null),
  ('grade_teacher', 'assessments',             3, true,  true,  true,  null),
  ('grade_teacher', 'tasks',                   3, true,  true,  true,  null),
  ('grade_teacher', 'grade_flags',             3, false, true,  false, null),
  ('grade_teacher', 'ai_drafts',               3, true,  true,  false, null),
  ('grade_teacher', 'audit_log',            null, false, false, false, null),
  ('grade_teacher', 'staff_links',             0, false, false, false, null),
  ('grade_teacher', 'availability_windows',    0, false, false, false, null),
  ('grade_teacher', 'availability_exceptions', 0, false, false, false, null),
  ('grade_teacher', 'class_series',            0, false, false, false, null),
  ('grade_teacher', 'class_exceptions',        0, false, false, false, null),
  ('grade_teacher', 'schedule_summaries',      0, false, false, false, null),
  ('grade_teacher', 'daily_tasks',             0, false, false, false, null),
  ('grade_teacher', 'daily_task_teachers',     0, false, false, false, null),
  ('grade_teacher', 'parent_links',            0, false, false, false, null),
  ('grade_teacher', 'booking_stamps',          0, false, false, false, null),
  ('grade_teacher', 'schedule_writes',         0, false, false, false, null),
  ('grade_teacher', 'occurrence_outcomes',      0, false, false, false, null),
  ('grade_teacher', 'notion_outbox',           0, false, false, false, null),
  -- scheduling_teacher
  ('scheduling_teacher', 'orgs',                    0, false, false, false, null),
  ('scheduling_teacher', 'memberships',             0, false, false, false, null),
  ('scheduling_teacher', 'students',                0, false, false, false, null),
  ('scheduling_teacher', 'goals',                   0, false, false, false, null),
  ('scheduling_teacher', 'courses',                 0, false, false, false, null),
  ('scheduling_teacher', 'syllabus_versions',       0, false, false, false, null),
  ('scheduling_teacher', 'categories',              0, false, false, false, null),
  ('scheduling_teacher', 'assessments',             0, false, false, false, null),
  ('scheduling_teacher', 'tasks',                   0, false, false, false, null),
  ('scheduling_teacher', 'grade_flags',             0, false, false, false, null),
  ('scheduling_teacher', 'ai_drafts',               0, false, false, false, null),
  ('scheduling_teacher', 'audit_log',               0, false, false, false, null),
  ('scheduling_teacher', 'staff_links',             1, false, false, false, null),
  ('scheduling_teacher', 'availability_windows',    1, true,  true,  true,  null),
  ('scheduling_teacher', 'availability_exceptions', 1, true,  true,  true,  null),
  ('scheduling_teacher', 'class_series',            2, false, false, false, null),
  ('scheduling_teacher', 'class_exceptions',        2, false, false, false, null),
  ('scheduling_teacher', 'schedule_summaries',      0, false, false, false, null),
  ('scheduling_teacher', 'daily_tasks',             0, false, false, false, null),
  ('scheduling_teacher', 'daily_task_teachers',     0, false, false, false, null),
  ('scheduling_teacher', 'parent_links',            0, false, false, false, null),
  ('scheduling_teacher', 'booking_stamps',          0, false, false, false, null),
  ('scheduling_teacher', 'schedule_writes',         0, false, false, false, null),
  ('scheduling_teacher', 'occurrence_outcomes',      1, true,  true,  false, null),
  ('scheduling_teacher', 'notion_outbox',           0, false, false, false, null),
  -- student
  ('student', 'orgs',                    1, false, false, false, null),
  ('student', 'memberships',             1, false, false, false, null),
  ('student', 'students',                1, false, false, false, null),
  ('student', 'goals',                   1, false, false, false, null),
  ('student', 'courses',                 1, false, false, false, null),
  ('student', 'syllabus_versions',       1, false, false, false, null),
  ('student', 'categories',              1, false, false, false, null),
  ('student', 'assessments',             1, false, false, false, 'set_assessment_done'),
  ('student', 'tasks',                   1, false, false, false, 'set_task_done'),
  ('student', 'grade_flags',             1, false, false, false, 'flag_assessment, unflag_assessment'),
  ('student', 'ai_drafts',               0, false, false, false, null),
  ('student', 'audit_log',               0, false, false, false, null),
  ('student', 'staff_links',             0, false, false, false, null),
  ('student', 'availability_windows',    0, false, false, false, null),
  ('student', 'availability_exceptions', 0, false, false, false, null),
  ('student', 'class_series',            0, false, false, false, null),
  ('student', 'class_exceptions',        0, false, false, false, null),
  ('student', 'schedule_summaries',      0, false, false, false, null),
  ('student', 'daily_tasks',             0, false, false, false, null),
  ('student', 'daily_task_teachers',     0, false, false, false, null),
  ('student', 'parent_links',            0, false, false, false, null),
  ('student', 'booking_stamps',          0, false, false, false, null),
  ('student', 'schedule_writes',         0, false, false, false, null),
  ('student', 'occurrence_outcomes',      0, false, false, false, null),
  ('student', 'notion_outbox',           0, false, false, false, null),
  -- parent
  ('parent', 'orgs',                    1, false, false, false, null),
  ('parent', 'memberships',             1, false, false, false, null),
  ('parent', 'students',                1, false, false, false, null),
  ('parent', 'goals',                   1, false, false, false, null),
  ('parent', 'courses',                 1, false, false, false, null),
  ('parent', 'syllabus_versions',       1, false, false, false, null),
  ('parent', 'categories',              1, false, false, false, null),
  ('parent', 'assessments',             1, false, false, false, null),
  ('parent', 'tasks',                   1, false, false, false, null),
  ('parent', 'grade_flags',             0, false, false, false, null),
  ('parent', 'ai_drafts',               0, false, false, false, null),
  ('parent', 'audit_log',               0, false, false, false, null),
  ('parent', 'staff_links',             0, false, false, false, null),
  ('parent', 'availability_windows',    0, false, false, false, null),
  ('parent', 'availability_exceptions', 0, false, false, false, null),
  ('parent', 'class_series',            2, false, false, false, null),
  ('parent', 'class_exceptions',        2, false, false, false, null),
  ('parent', 'schedule_summaries',      0, false, false, false, null),
  ('parent', 'daily_tasks',             0, false, false, false, null),
  ('parent', 'daily_task_teachers',     0, false, false, false, null),
  ('parent', 'parent_links',            1, false, false, false, null),
  ('parent', 'booking_stamps',          0, false, false, false, null),
  ('parent', 'schedule_writes',         0, false, false, false, null),
  ('parent', 'occurrence_outcomes',      0, false, false, false, null),
  ('parent', 'notion_outbox',           0, false, false, false, null);

-- The login that plays each single role, and each combination's parts.
create table matrix.cast_of (actor text primary key, uid uuid not null);
insert into matrix.cast_of values
  ('owner',              'a0000000-0000-0000-0000-000000000001'),
  ('grade_teacher',      'b0000000-0000-0000-0000-000000000001'),
  ('scheduling_teacher', 'd0000000-0000-0000-0000-000000000001'),
  ('student',            'c0000000-0000-0000-0000-000000000001'),
  ('parent',             'e0000000-0000-0000-0000-000000000001');

-- The owner reads every audit row of the org; a grade teacher only the grade
-- tables' rows (0020). Nothing below writes the log until the AC9 block.
update matrix.expected set rows = (select count(*) from tracker.audit_log where org_id = '10000000-0000-0000-0000-000000000001')
  where actor = 'owner' and tbl = 'audit_log';
update matrix.expected set rows = (select count(*) from tracker.audit_log where org_id = '10000000-0000-0000-0000-000000000001'
    and table_name in ('students', 'goals', 'courses', 'syllabus_versions', 'categories', 'assessments', 'tasks', 'grade_flags'))
  where actor = 'grade_teacher' and tbl = 'audit_log';
-- The outbox rows the fixture's class and summary writes enqueued (0021).
update matrix.expected set rows = (select count(*) from tracker.notion_outbox where org_id = '10000000-0000-0000-0000-000000000001')
  where actor = 'owner' and tbl = 'notion_outbox';

-- Probes ------------------------------------------------------------------------
-- Each write attempt runs in a subtransaction and is rolled back, so the
-- fixture never changes. A write counts as refused when it raises 42501 or
-- touches no row; a constraint error means it got past the grants and RLS.

create type matrix.cell as (rows int, ins boolean, upd boolean, del boolean, keys text[]);

-- A stable key for a row, so visible sets can be compared across states.
create function matrix.key_of(tbl text, j jsonb) returns text
language sql immutable as $$
  select case tbl
    when 'memberships' then (j ->> 'user_id') || ':' || (j ->> 'org_id')
    when 'daily_task_teachers' then (j ->> 'task_id') || ':' || (j ->> 'notion_staff_id')
    when 'booking_stamps' then (j ->> 'org_id') || ':' || (j ->> 'key_kind') || ':' || (j ->> 'key_id')
    else j ->> 'id'
  end;
$$;

create function matrix.allowed_after(state text) returns boolean
language plpgsql as $$
begin
  return case
    when state = '42501' then false
    when state in ('P0001', '23505', '23503', '23514') then true
    else null
  end;
end;
$$;

create function matrix.try_insert(tbl text, cols text[], sample jsonb, actor uuid) returns boolean
language plpgsql as $$
declare
  s jsonb := sample;
  k text;
  list text := (select string_agg(format('%I', c), ', ') from unnest(cols) c);
begin
  foreach k in array array['id', 'request_id'] loop
    if s ? k then s := jsonb_set(s, array[k], to_jsonb(gen_random_uuid())); end if;
  end loop;
  foreach k in array array['created_by', 'invited_by', 'approved_by', 'requested_by'] loop
    if s ? k then s := jsonb_set(s, array[k], to_jsonb(actor)); end if;
  end loop;
  begin
    execute format('insert into tracker.%I (%s) select %s from jsonb_populate_record(null::tracker.%I, $1)', tbl, list, list, tbl) using s;
    raise exception 'matrix: written' using errcode = 'P0001';
  exception when others then
    if matrix.allowed_after(sqlstate) is null then raise; end if;
    return matrix.allowed_after(sqlstate);
  end;
end;
$$;

create function matrix.try_change(op text, tbl text, col text, target tid) returns boolean
language plpgsql as $$
declare
  n bigint;
begin
  begin
    if op = 'update' then
      execute format('update tracker.%I set %I = %I where ctid = $1', tbl, col, col) using target;
    else
      execute format('delete from tracker.%I where ctid = $1', tbl) using target;
    end if;
    get diagnostics n = row_count;
    if n = 0 then return false; end if;
    raise exception 'matrix: written' using errcode = 'P0001';
  exception when others then
    if matrix.allowed_after(sqlstate) is null then raise; end if;
    return matrix.allowed_after(sqlstate);
  end;
end;
$$;

-- What `actor` sees of `tbl` and which direct writes get through. The write
-- target is a row the actor can see, else an Org One row. audit_log rows
-- after `audit_upto` are ignored (the AC9 state changes are audited).
create function matrix.probe(actor uuid, tbl text, audit_upto bigint default null) returns matrix.cell
language plpgsql as $$
declare
  ins_cols text[];
  upd_col text;
  fallback_ctid tid;
  fallback_row jsonb;
  seen_ctid tid;
  seen_row jsonb;
  out matrix.cell;
  filter text := case when tbl = 'audit_log' and audit_upto is not null then format('where id <= %s', audit_upto) else '' end;
begin
  -- As the superuser: the granted columns, and a row to aim at.
  select coalesce(array_agg(column_name::text order by ordinal_position), '{}') into ins_cols
    from information_schema.column_privileges p join information_schema.columns c using (table_schema, table_name, column_name)
   where p.table_schema = 'tracker' and p.table_name = tbl and p.grantee = 'authenticated' and p.privilege_type = 'INSERT';
  if cardinality(ins_cols) = 0 then
    select array_agg(column_name::text order by ordinal_position) into ins_cols from information_schema.columns
     where table_schema = 'tracker' and table_name = tbl and is_identity = 'NO';
  end if;
  select coalesce(
    (select column_name::text from information_schema.column_privileges p join information_schema.columns c using (table_schema, table_name, column_name)
      where p.table_schema = 'tracker' and p.table_name = tbl and p.grantee = 'authenticated' and p.privilege_type = 'UPDATE'
      order by c.ordinal_position limit 1),
    (select column_name::text from information_schema.columns where table_schema = 'tracker' and table_name = tbl and is_identity = 'NO'
      order by ordinal_position limit 1))
    into upd_col;
  execute format('select ctid, to_jsonb(t) from tracker.%I t order by (to_jsonb(t) ->> ''org_id'') = %L desc nulls last limit 1',
                 tbl, '10000000-0000-0000-0000-000000000001') into fallback_ctid, fallback_row;

  perform set_config('request.jwt.claims', json_build_object('sub', actor)::text, true);
  set local role authenticated;
  execute format('select count(*), coalesce(array_agg(k order by k), ''{}'') from (select matrix.key_of(%L, to_jsonb(t)) as k from tracker.%I t %s) x', tbl, tbl, filter)
    into out.rows, out.keys;
  execute format('select ctid, to_jsonb(t) from tracker.%I t limit 1', tbl) into seen_ctid, seen_row;
  out.ins := matrix.try_insert(tbl, ins_cols, coalesce(seen_row, fallback_row), actor);
  out.upd := matrix.try_change('update', tbl, upd_col, coalesce(seen_ctid, fallback_ctid));
  out.del := matrix.try_change('delete', tbl, null, coalesce(seen_ctid, fallback_ctid));
  reset role;
  return out;
end;
$$;

-- Every tracker row, hashed, to prove a block changed nothing.
create function matrix.snapshot() returns text
language plpgsql as $$
declare
  t text;
  h text;
  acc text := '';
begin
  for t in select table_name from information_schema.tables where table_schema = 'tracker' and table_type = 'BASE TABLE' order by 1 loop
    execute format('select coalesce(md5(string_agg(to_jsonb(x)::text, '','' order by to_jsonb(x)::text)), '''') from tracker.%I x', t) into h;
    acc := acc || t || '=' || h || ';';
  end loop;
  return md5(acc);
end;
$$;

-- AC3: every tracker table is classified, and there are no views --------------------
do $$
declare
  missing text[];
  extra text[];
begin
  select array_agg(table_name::text order by 1) into missing from information_schema.tables
   where table_schema = 'tracker' and table_type = 'BASE TABLE'
     and table_name not in (select distinct tbl from matrix.expected);
  select array_agg(distinct tbl order by tbl) into extra from matrix.expected
   where tbl not in (select table_name from information_schema.tables where table_schema = 'tracker' and table_type = 'BASE TABLE');
  if missing is not null then raise exception 'matrix: tables with no row in the permission matrix: %', missing; end if;
  if extra is not null then raise exception 'matrix: matrix rows for tables that do not exist: %', extra; end if;
  if exists (select 1 from information_schema.views where table_schema = 'tracker')
     or exists (select 1 from pg_matviews where schemaname = 'tracker') then
    raise exception 'matrix: tracker has a view; classify it in the permission matrix';
  end if;
  if (select count(*) from matrix.expected) <> 5 * (select count(distinct tbl) from matrix.expected) then
    raise exception 'matrix: every single role needs one row per table';
  end if;
  raise notice 'ok: % tracker tables classified, no views (AC3)', (select count(distinct tbl) from matrix.expected);
end $$;

-- AC4, AC5, AC6 (direct writes): every single role, every table -----------------------
do $$
declare
  e record;
  got matrix.cell;
  before text := matrix.snapshot();
begin
  for e in select x.*, c.uid from matrix.expected x join matrix.cast_of c using (actor) order by x.actor, x.tbl loop
    got := matrix.probe(e.uid, e.tbl);
    if got.rows <> e.rows then
      raise exception 'matrix: % reads % rows of %, expected %', e.actor, got.rows, e.tbl, e.rows;
    end if;
    if got.ins <> e.ins then raise exception 'matrix: % insert on % is %, expected %', e.actor, e.tbl, got.ins, e.ins; end if;
    if got.upd <> e.upd then raise exception 'matrix: % update on % is %, expected %', e.actor, e.tbl, got.upd, e.upd; end if;
    if got.del <> e.del then raise exception 'matrix: % delete on % is %, expected %', e.actor, e.tbl, got.del, e.del; end if;
    raise notice 'ok: % % select=% insert=% update=% delete=%', e.actor, e.tbl, got.rows, got.ins, got.upd, got.del;
  end loop;
  if matrix.snapshot() <> before then raise exception 'matrix: a probe left a change behind'; end if;
end $$;

-- Ids the later blocks call functions with, readable by the signed-in roles.
create table matrix.ids as
  select s.id as student_id, s.notion_student_id, s.org_id,
         (select a.id from tracker.assessments a where a.student_id = s.id) as assessment_id,
         (select t.id from tracker.tasks t where t.student_id = s.id) as task_id,
         (select f.id from tracker.grade_flags f where f.student_id = s.id) as flag_id,
         (select c.id from tracker.class_series c where c.notion_student_id = s.notion_student_id order by c.id limit 1) as series_id,
         (select l.id from tracker.parent_links l where l.student_id = s.id order by l.id limit 1) as link_id,
         s.first_name
    from tracker.students s;
grant select on matrix.ids to authenticated;

-- AC6: every write function, positively, by the role it is for ---------------------------
-- Each runs in a subtransaction that is then rolled back.
set role authenticated;
set request.jwt.claims = '{"sub": "c0000000-0000-0000-0000-000000000001", "email": "stu-login@example.com"}';
do $$
declare
  a matrix.ids := (select i from matrix.ids i where i.first_name = 'Ada');
begin
  begin
    assert tracker.set_assessment_done(a.assessment_id, true) is not null, 'set_assessment_done returned null';
    assert (select student_done_at from tracker.assessments where id = a.assessment_id) is not null, 'set_assessment_done wrote nothing';
    assert tracker.set_task_done(a.task_id, true) is not null, 'set_task_done returned null';
    assert (select done_at from tracker.tasks where id = a.task_id) is not null, 'set_task_done wrote nothing';
    assert tracker.flag_assessment(a.assessment_id, 'other') = a.flag_id, 'flag_assessment did not change the open flag';
    assert (select reason from tracker.grade_flags where id = a.flag_id) = 'other', 'flag_assessment wrote nothing';
    perform tracker.unflag_assessment(a.assessment_id);
    assert not exists (select 1 from tracker.grade_flags where id = a.flag_id), 'unflag_assessment left the flag';
    raise exception 'matrix: rolled back' using errcode = 'P0001';
  exception when sqlstate 'P0001' then null;
  end;
  raise notice 'ok: student set_assessment_done set_task_done flag_assessment unflag_assessment (AC6)';
end $$;
reset role;

set role authenticated;
set request.jwt.claims = '{"sub": "a0000000-0000-0000-0000-000000000001", "email": "own@example.com"}';
do $$
declare
  a matrix.ids := (select i from matrix.ids i where i.first_name = 'Ada');
  s1 tracker.class_series := (select c from tracker.class_series c where c.id = '40000000-0000-0000-0000-000000000001');
  new_id uuid;
begin
  begin
    -- unlink_student needs the stored email to differ from the login's; it does here.
    perform tracker.unlink_student(a.student_id);
    assert (select user_id from tracker.students where id = a.student_id) is null, 'unlink_student kept the login';
    raise exception 'matrix: rolled back' using errcode = 'P0001';
  exception when sqlstate 'P0001' then null;
  end;
  begin
    perform tracker.remove_parent_link(a.link_id);
    assert not exists (select 1 from tracker.parent_links where id = a.link_id), 'remove_parent_link kept the link';
    raise exception 'matrix: rolled back' using errcode = 'P0001';
  exception when sqlstate 'P0001' then null;
  end;
  begin
    new_id := tracker.adopt_student_schedule('6a000000-0000-4000-8000-0000000000aa', 'Tue 4pm',
      '[{"request_id": "9a000000-0000-4000-8000-000000000001", "staff_id": "5a000000-0000-4000-8000-000000000001", "subject": "Math", "start_date": "2026-09-08", "start_time": "16:00", "duration_minutes": 60}]');
    assert exists (select 1 from tracker.schedule_summaries where id = new_id), 'adopt_student_schedule wrote no summary';
    assert exists (select 1 from tracker.class_series where notion_student_id = '6a000000-0000-4000-8000-0000000000aa'), 'adopt_student_schedule wrote no series';
    raise exception 'matrix: rolled back' using errcode = 'P0001';
  exception when sqlstate 'P0001' then null;
  end;
  begin
    new_id := tracker.split_class_series(s1.id, ((now() at time zone 'America/Toronto')::date + 14), s1.updated_at,
      '9a000000-0000-4000-8000-000000000002', '{"start_time": "18:00"}');
    assert (select split_from from tracker.class_series where id = new_id) = s1.id, 'split_class_series wrote no new series';
    raise exception 'matrix: rolled back' using errcode = 'P0001';
  exception when sqlstate 'P0001' then null;
  end;
  begin
    assert (select count(*) from tracker.claim_daily_task('10000000-0000-0000-0000-000000000001', 'teacher_texts', '2026-10-02', 60)) = 1,
      'claim_daily_task did not take the lease';
    raise exception 'matrix: rolled back' using errcode = 'P0001';
  exception when sqlstate 'P0001' then null;
  end;
  begin
    assert (select count(*) from tracker.enqueue_summary_sync('10000000-0000-0000-0000-000000000001',
      array['6a000000-0000-4000-8000-00000000000a']::uuid[])) = 1, 'enqueue_summary_sync returned no row';
    new_id := (select c.id from tracker.claim_notion_outbox('10000000-0000-0000-0000-000000000001', null, 1, 60) c);
    assert new_id is not null, 'claim_notion_outbox took no row';
    update tracker.notion_outbox set status = 'failed', lease_until = null where id = new_id;
    assert (select r.id from tracker.retry_notion_outbox(new_id) r) = new_id, 'retry_notion_outbox did not retry the row';
    raise exception 'matrix: rolled back' using errcode = 'P0001';
  exception when sqlstate 'P0001' then null;
  end;
  raise notice 'ok: owner unlink_student remove_parent_link adopt_student_schedule split_class_series claim_daily_task enqueue_summary_sync claim_notion_outbox retry_notion_outbox (AC6)';
end $$;
reset role;

-- AC7: the scheduling-only teacher, row by row ----------------------------------------------
set role authenticated;
set request.jwt.claims = '{"sub": "d0000000-0000-0000-0000-000000000001", "email": "st1@example.com"}';
do $$
declare
  t text;
  n bigint;
begin
  assert (select array_agg(distinct notion_staff_id) from tracker.class_series) = array['5a000000-0000-4000-8000-000000000001'::uuid],
    'scheduling teacher reads another teacher''s series';
  assert (select array_agg(id order by id) from tracker.class_series)
         = array['40000000-0000-0000-0000-000000000001'::uuid, '40000000-0000-0000-0000-000000000003'::uuid],
    'scheduling teacher does not read exactly their own two series';
  assert not exists (select 1 from tracker.class_exceptions where series_id not in
    ('40000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000003')),
    'scheduling teacher reads an exception of another teacher''s series';
  assert (select count(*) from tracker.class_exceptions) = 2, 'scheduling teacher misses an exception of their own series';
  assert not exists (select 1 from tracker.availability_windows where notion_staff_id <> '5a000000-0000-4000-8000-000000000001'),
    'scheduling teacher reads another teacher''s availability';
  assert not exists (select 1 from tracker.availability_exceptions where notion_staff_id <> '5a000000-0000-4000-8000-000000000001'),
    'scheduling teacher reads another teacher''s time off';
  foreach t in array array['students', 'goals', 'courses', 'syllabus_versions', 'categories', 'assessments', 'tasks', 'grade_flags',
                           'ai_drafts', 'schedule_summaries', 'daily_tasks', 'daily_task_teachers', 'parent_links', 'audit_log'] loop
    execute format('select count(*) from tracker.%I', t) into n;
    if n <> 0 then raise exception 'scheduling teacher reads % rows of %', n, t; end if;
  end loop;
  begin
    insert into tracker.class_series (org_id, request_id, notion_staff_id, notion_student_id, subject, kind, start_date, start_time, duration_minutes, created_by)
      values ('10000000-0000-0000-0000-000000000001', gen_random_uuid(), '5a000000-0000-4000-8000-000000000001',
              '6a000000-0000-4000-8000-00000000000a', 'Math', 'one_off', '2026-12-01', '17:00', 60, 'd0000000-0000-0000-0000-000000000001');
    raise exception 'scheduling teacher booked their own class';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into tracker.class_exceptions (org_id, request_id, series_id, original_date, kind, created_by)
      values ('10000000-0000-0000-0000-000000000001', gen_random_uuid(), '40000000-0000-0000-0000-000000000001',
              '2026-09-21', 'cancelled', 'd0000000-0000-0000-0000-000000000001');
    raise exception 'scheduling teacher cancelled their own class';
  exception when insufficient_privilege then null;
  end;
  update tracker.class_series set subject = 'Changed' where id = '40000000-0000-0000-0000-000000000001';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'scheduling teacher edited their own series'; end if;
  update tracker.class_exceptions set original_date = original_date;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'scheduling teacher edited an exception'; end if;
  raise notice 'ok: scheduling-only teacher reads own series, exceptions and availability only, writes no class (AC7)';
end $$;
reset role;

-- AC11: a parent never reads another family ----------------------------------------------------
-- Bea (same org) and Zed (Org Two) are not PA's children. Every tracker
-- function granted to authenticated is called with their IDs: it raises or
-- returns nothing, and no row changes.
create table matrix.rpc_seen (fn text);
grant insert on matrix.rpc_seen to authenticated;

create function matrix.foreign_rows() returns bigint
language plpgsql as $$
declare
  n bigint := 0;
  m bigint;
  t text;
begin
  foreach t in array array['goals', 'courses', 'syllabus_versions', 'categories', 'assessments', 'tasks', 'grade_flags', 'ai_drafts', 'parent_links'] loop
    execute format('select count(*) from tracker.%I where student_id in (select student_id from matrix.ids where first_name in (''Bea'', ''Zed''))', t) into m;
    n := n + m;
  end loop;
  n := n + (select count(*) from tracker.students where id in (select student_id from matrix.ids where first_name in ('Bea', 'Zed')));
  n := n + (select count(*) from tracker.class_series where notion_student_id in (select notion_student_id from matrix.ids where first_name in ('Bea', 'Zed')));
  n := n + (select count(*) from tracker.class_exceptions e join matrix.ids i on i.series_id = e.series_id where i.first_name in ('Bea', 'Zed'));
  n := n + (select count(*) from tracker.class_exceptions where series_id in ('40000000-0000-0000-0000-000000000002', '40000000-0000-0000-0000-000000000004', '40000000-0000-0000-0000-000000000007'));
  n := n + (select count(*) from tracker.schedule_summaries where notion_student_id in (select notion_student_id from matrix.ids where first_name in ('Bea', 'Zed')));
  n := n + (select count(*) from tracker.audit_log);
  return n;
end;
$$;

-- Calls one function with another family's IDs. Returns 'raised' or 'empty',
-- else raises: a returned value means the call reached data it should not.
create function matrix.call_foreign(fn text, t matrix.ids) returns text
language plpgsql as $$
declare
  r jsonb;
  n bigint;
begin
  insert into matrix.rpc_seen values (fn);
  begin
    case fn
      when 'is_org_staff' then r := to_jsonb(nullif(tracker.is_org_staff(t.org_id), false));
      when 'is_org_owner' then r := to_jsonb(nullif(tracker.is_org_owner(t.org_id), false));
      when 'is_my_published_student' then r := to_jsonb(nullif(tracker.is_my_published_student(t.student_id), false));
      when 'is_my_linked_student' then r := to_jsonb(nullif(tracker.is_my_linked_student(t.student_id), false));
      when 'is_my_childs_schedule' then r := to_jsonb(nullif(tracker.is_my_childs_schedule(t.org_id, t.notion_student_id), false));
      when 'is_my_childs_series' then r := to_jsonb(nullif(tracker.is_my_childs_series(t.series_id), false));
      when 'my_staff_id' then r := to_jsonb(tracker.my_staff_id(t.org_id));
      when 'set_assessment_done' then r := to_jsonb(tracker.set_assessment_done(t.assessment_id, true));
      when 'set_task_done' then r := to_jsonb(tracker.set_task_done(t.task_id, true));
      when 'flag_assessment' then r := to_jsonb(tracker.flag_assessment(t.assessment_id, 'other'));
      when 'unflag_assessment' then perform tracker.unflag_assessment(t.assessment_id);
      when 'claim_student_invites' then r := to_jsonb(nullif(tracker.claim_student_invites(), 0));
      when 'claim_staff_link' then r := to_jsonb(nullif(tracker.claim_staff_link(), 0));
      when 'claim_parent_invites' then r := to_jsonb(nullif(tracker.claim_parent_invites(), 0));
      when 'unlink_student' then perform tracker.unlink_student(t.student_id);
      when 'student_logins' then select count(*) into n from tracker.student_logins(t.org_id); r := to_jsonb(nullif(n, 0));
      when 'my_children' then
        select count(*) into n from tracker.my_children() c where c.id = t.student_id; r := to_jsonb(nullif(n, 0));
      when 'remove_parent_link' then perform tracker.remove_parent_link(t.link_id);
      when 'split_class_series' then
        r := to_jsonb(tracker.split_class_series(t.series_id, '2027-01-04', now(), gen_random_uuid(), '{}'));
      when 'adopt_student_schedule' then r := to_jsonb(tracker.adopt_student_schedule(t.notion_student_id, 'x', '[]'));
      when 'claim_daily_task' then
        select count(*) into n from tracker.claim_daily_task(t.org_id, 'teacher_texts', '2026-10-03', 60); r := to_jsonb(nullif(n, 0));
      when 'setup_checks' then
        select count(*) into n from tracker.setup_checks(t.org_id); r := to_jsonb(nullif(n, 0));
      when 'occurrence_is_linkable' then r := to_jsonb(nullif(tracker.occurrence_is_linkable(t.series_id, '2026-09-28'), false));
      when 'lock_booking_key' then perform tracker.lock_booking_key(t.org_id, 'student', t.notion_student_id);
      when 'schedule_write_context' then r := tracker.schedule_write_context(t.org_id, gen_random_uuid(), '[]');
      when 'schedule_write' then
        r := tracker.schedule_write(t.org_id, gen_random_uuid(), 'cancel', '[]',
               jsonb_build_object('series_id', t.series_id, 'original_date', '2026-09-21', 'expected_updated_at', now()));
      when 'enqueue_summary_sync' then
        select count(*) into n from tracker.enqueue_summary_sync(t.org_id, array[t.notion_student_id]); r := to_jsonb(nullif(n, 0));
      when 'claim_notion_outbox' then
        select count(*) into n from tracker.claim_notion_outbox(t.org_id, null, 10, 60); r := to_jsonb(nullif(n, 0));
      when 'retry_notion_outbox' then
        select count(*) into n from tracker.retry_notion_outbox((select o.id from tracker.notion_outbox o where o.org_id = t.org_id limit 1));
        r := to_jsonb(nullif(n, 0));
      else raise exception 'matrix: % is granted to authenticated but not classified here', fn;
    end case;
  exception when others then
    if sqlerrm like 'matrix: %' then raise; end if;
    return 'raised';
  end;
  if r is not null and r <> 'null'::jsonb then
    raise exception 'matrix: % returned % for another family', fn, r;
  end if;
  return 'empty';
end;
$$;

do $$
declare
  before text := matrix.snapshot();
  t matrix.ids;
  fn text;
  outcome text;
  n bigint;
begin
  perform set_config('request.jwt.claims', '{"sub": "e0000000-0000-0000-0000-000000000001", "email": "pa@example.com"}', true);
  set local role authenticated;
  n := matrix.foreign_rows();
  if n <> 0 then raise exception 'parent of Ada reads % rows of another family', n; end if;
  if (select array_agg(id) from tracker.my_children()) <> array['20000000-0000-0000-0000-00000000000a'::uuid] then
    raise exception 'my_children lists more than Ada';
  end if;
  for t in select * from matrix.ids where first_name in ('Bea', 'Zed') loop
    for fn in
      select distinct p.routine_name::text from information_schema.routine_privileges p
       where p.routine_schema = 'tracker' and p.grantee = 'authenticated' and p.privilege_type = 'EXECUTE'
       order by 1
    loop
      outcome := matrix.call_foreign(fn, t);
      raise notice 'ok: parent % with %''s IDs: %', fn, t.first_name, outcome;
    end loop;
  end loop;
  reset role;
  if matrix.snapshot() <> before then raise exception 'a cross-family call changed a row'; end if;
  raise notice 'ok: parent reads and changes nothing of Bea or Zed through any table or function (AC11)';
end $$;

-- AC9: a combination sees the union of its roles, and nothing more -------------------------------
-- Each combination login is read three times: with only its first role, with
-- only its second, and with both. The state changes are made as superuser
-- and put back, so the "both" read is the fixture's own state.
create function matrix.read_all(actor uuid, audit_upto bigint) returns table (tbl text, cell matrix.cell)
language plpgsql as $$
declare
  t text;
begin
  for t in select distinct e.tbl from matrix.expected e order by 1 loop
    tbl := t;
    cell := matrix.probe(actor, t, audit_upto);
    return next;
  end loop;
end;
$$;

create function matrix.set_role_state(who uuid, part text, present boolean) returns void
language plpgsql as $$
begin
  if part = 'owner' then
    if present then insert into tracker.memberships (user_id, org_id, role) values (who, '10000000-0000-0000-0000-000000000001', 'owner') on conflict do nothing;
    else delete from tracker.memberships where user_id = who and role = 'owner'; end if;
  elsif part = 'grade_teacher' then
    if present then
      delete from tracker.memberships where user_id = who and role = 'parent';
      insert into tracker.memberships (user_id, org_id, role) values (who, '10000000-0000-0000-0000-000000000001', 'teacher') on conflict do nothing;
    else delete from tracker.memberships where user_id = who and role = 'teacher'; end if;
  elsif part = 'scheduling_teacher' then
    update tracker.staff_links set revoked_at = case when present then null else now() end where user_id = who;
  elsif part = 'parent' then
    update tracker.parent_links set parent_user_id = case when present then who end, claimed_at = case when present then now() end
     where email = (select email from auth.users where id = who);
    -- A parent-only login holds a parent membership; with a teacher membership the claim adds none.
    if present and not exists (select 1 from tracker.memberships where user_id = who) then
      insert into tracker.memberships (user_id, org_id, role) values (who, '10000000-0000-0000-0000-000000000001', 'parent');
    elsif not present then
      delete from tracker.memberships where user_id = who and role = 'parent';
    end if;
  end if;
end;
$$;

do $$
declare
  combo record;
  upto bigint := (select max(id) from tracker.audit_log);
  only_a record;
  only_b record;
  whole record;
  want text[];
begin
  for combo in select * from (values
      ('owner+scheduling_teacher', 'f0000000-0000-0000-0000-000000000001'::uuid, 'owner', 'scheduling_teacher'),
      ('grade_teacher+scheduling_teacher', 'f0000000-0000-0000-0000-000000000002', 'grade_teacher', 'scheduling_teacher'),
      ('scheduling_teacher+parent', 'f0000000-0000-0000-0000-000000000003', 'scheduling_teacher', 'parent'),
      ('grade_teacher+parent', 'f0000000-0000-0000-0000-000000000004', 'grade_teacher', 'parent')
    ) v(name, uid, a, b) loop
    create temp table phase_a on commit drop as select * from matrix.read_all(combo.uid, upto);
    -- only b
    perform matrix.set_role_state(combo.uid, combo.a, false);
    perform matrix.set_role_state(combo.uid, combo.b, true);
    create temp table phase_b on commit drop as select * from matrix.read_all(combo.uid, upto);
    -- only a
    perform matrix.set_role_state(combo.uid, combo.b, false);
    perform matrix.set_role_state(combo.uid, combo.a, true);
    create temp table phase_only_a on commit drop as select * from matrix.read_all(combo.uid, upto);
    -- both again
    perform matrix.set_role_state(combo.uid, combo.b, true);
    create temp table phase_both on commit drop as select * from matrix.read_all(combo.uid, upto);

    for whole in select * from phase_both loop
      select * into only_a from phase_only_a where tbl = whole.tbl;
      select * into only_b from phase_b where tbl = whole.tbl;
      select coalesce(array_agg(distinct k order by k), '{}') into want
        from unnest((only_a.cell).keys || (only_b.cell).keys) k;
      if (whole.cell).keys <> want then
        raise exception 'matrix: % reads % of %, the union of its roles is %', combo.name, (whole.cell).keys, whole.tbl, want;
      end if;
      if (whole.cell).ins <> ((only_a.cell).ins or (only_b.cell).ins)
         or (whole.cell).upd <> ((only_a.cell).upd or (only_b.cell).upd)
         or (whole.cell).del <> ((only_a.cell).del or (only_b.cell).del) then
        raise exception 'matrix: % writes % as %, not the union of % and %', combo.name, whole.tbl, whole.cell, only_a.cell, only_b.cell;
      end if;
    end loop;
    -- The first read ran in the fixture's state too: it must equal the last.
    if exists (select 1 from phase_a x join phase_both y using (tbl) where (x.cell).keys <> (y.cell).keys) then
      raise exception 'matrix: % state was not put back', combo.name;
    end if;
    drop table phase_a, phase_b, phase_only_a, phase_both;
    raise notice 'ok: % reads and writes the union of % and % (AC9)', combo.name, combo.a, combo.b;
  end loop;
end $$;

-- The two cases the card names.
set role authenticated;
set request.jwt.claims = '{"sub": "f0000000-0000-0000-0000-000000000002", "email": "gts@example.com"}';
do $$ begin
  assert (select array_agg(id) from tracker.class_series) = array['40000000-0000-0000-0000-000000000005'::uuid],
    'grade teacher + staff link reads another teacher''s series';
  assert (select count(*) from tracker.students) = 3, 'grade teacher + staff link lost the grade rows';
  raise notice 'ok: grade teacher + staff link reads only their own series (AC9)';
end $$;
reset role;
set role authenticated;
set request.jwt.claims = '{"sub": "f0000000-0000-0000-0000-000000000003", "email": "stp@example.com"}';
do $$ begin
  -- Own series s6 (ST5, Ada) and the child's series s2 (ST2, Bea) and s4 (ST3, Bea).
  assert (select array_agg(id order by id) from tracker.class_series) = array[
    '40000000-0000-0000-0000-000000000002'::uuid, '40000000-0000-0000-0000-000000000004'::uuid, '40000000-0000-0000-0000-000000000006'::uuid],
    'staff link + parent link does not read exactly their own and their child''s series';
  assert (select array_agg(id) from tracker.students) = array['20000000-0000-0000-0000-00000000000b'::uuid],
    'staff link + parent link reads a student who is not their child';
  raise notice 'ok: staff link + parent link reads own series plus the child''s (AC9)';
end $$;
reset role;

-- AC10: revocation cuts access on the next statement ---------------------------------------------
-- The owner revokes ST1's link.
set role authenticated;
set request.jwt.claims = '{"sub": "a0000000-0000-0000-0000-000000000001", "email": "own@example.com"}';
update tracker.staff_links set revoked_at = now() where notion_staff_id = '5a000000-0000-4000-8000-000000000001';
reset role;
set role authenticated;
set request.jwt.claims = '{"sub": "d0000000-0000-0000-0000-000000000001", "email": "st1@example.com"}';
do $$
declare t text; n bigint;
begin
  foreach t in array array['class_series', 'class_exceptions', 'availability_windows', 'availability_exceptions'] loop
    execute format('select count(*) from tracker.%I', t) into n;
    if n <> 0 then raise exception 'revoked teacher still reads % rows of %', n, t; end if;
  end loop;
  -- Their own link row stays readable as history, revoked.
  assert (select bool_and(revoked_at is not null) from tracker.staff_links), 'revoked teacher reads a live link';
  begin
    insert into tracker.availability_windows (org_id, request_id, notion_staff_id, weekday, start_time, end_time, effective_from, created_by)
      values ('10000000-0000-0000-0000-000000000001', gen_random_uuid(), '5a000000-0000-4000-8000-000000000001', 2, '15:00', '18:00', '2026-09-01',
              'd0000000-0000-0000-0000-000000000001');
    raise exception 'revoked teacher added availability';
  exception when insufficient_privilege then null;
  end;
  raise notice 'ok: revoked staff link reads no scheduling rows and adds no availability (AC10)';
end $$;
reset role;

-- The owner removes PA's link to Ada.
set role authenticated;
set request.jwt.claims = '{"sub": "a0000000-0000-0000-0000-000000000001", "email": "own@example.com"}';
select tracker.remove_parent_link('80000000-0000-0000-0000-000000000001');
reset role;
set role authenticated;
set request.jwt.claims = '{"sub": "e0000000-0000-0000-0000-000000000001", "email": "pa@example.com"}';
do $$
declare t text; n bigint;
begin
  foreach t in array array['orgs', 'memberships', 'students', 'goals', 'courses', 'syllabus_versions', 'categories', 'assessments',
                           'tasks', 'class_series', 'class_exceptions', 'parent_links'] loop
    execute format('select count(*) from tracker.%I', t) into n;
    if n <> 0 then raise exception 'removed parent still reads % rows of %', n, t; end if;
  end loop;
  raise notice 'ok: removed parent reads nothing of the child (AC10)';
end $$;
reset role;

-- The operator deletes GT's membership (operator SQL, tracker ADR 0052).
delete from tracker.memberships where user_id = 'b0000000-0000-0000-0000-000000000001';
set role authenticated;
set request.jwt.claims = '{"sub": "b0000000-0000-0000-0000-000000000001", "email": "gt@example.com"}';
do $$
declare t text; n bigint;
begin
  foreach t in array array['orgs', 'students', 'goals', 'courses', 'syllabus_versions', 'categories', 'assessments', 'tasks',
                           'grade_flags', 'ai_drafts', 'audit_log'] loop
    execute format('select count(*) from tracker.%I', t) into n;
    if n <> 0 then raise exception 'former grade teacher still reads % rows of %', n, t; end if;
  end loop;
  raise notice 'ok: former grade teacher reads no grade rows (AC10)';
end $$;
reset role;

-- Combinations: revoking one role leaves exactly the other.
set role authenticated;
set request.jwt.claims = '{"sub": "a0000000-0000-0000-0000-000000000001", "email": "own@example.com"}';
update tracker.staff_links set revoked_at = now() where notion_staff_id = '5a000000-0000-4000-8000-000000000005';
select tracker.remove_parent_link('80000000-0000-0000-0000-000000000004');
reset role;
set role authenticated;
set request.jwt.claims = '{"sub": "f0000000-0000-0000-0000-000000000003", "email": "stp@example.com"}';
do $$ begin
  assert (select array_agg(id order by id) from tracker.class_series) = array[
    '40000000-0000-0000-0000-000000000002'::uuid, '40000000-0000-0000-0000-000000000004'::uuid],
    'staff link + parent link with the link revoked is not a parent only';
  assert (select count(*) from tracker.availability_windows) = 0, 'revoked combo still reads their availability';
  assert (select count(*) from tracker.students) = 1, 'revoked combo lost their child';
  raise notice 'ok: staff link + parent link, link revoked: parent only (AC10)';
end $$;
reset role;
set role authenticated;
set request.jwt.claims = '{"sub": "f0000000-0000-0000-0000-000000000004", "email": "gtp@example.com"}';
do $$ begin
  assert (select role from tracker.memberships) = 'teacher', 'grade teacher + parent lost the teacher membership';
  assert (select count(*) from tracker.students) = 3, 'grade teacher + parent, link removed, lost the grade rows';
  assert (select count(*) from tracker.parent_links) = 0, 'grade teacher + parent still reads the removed link';
  assert (select count(*) from tracker.class_series) = 0, 'grade teacher + parent, link removed, still reads the child''s classes';
  raise notice 'ok: grade teacher + parent link, link removed: grade teacher only (AC10)';
end $$;
reset role;

\echo permission matrix checks passed
