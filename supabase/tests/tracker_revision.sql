-- Checks for a new syllabus version after publish (0008, tracker ADR 0030).
-- Run by run-rls.sh on a fresh copy of the migrated database. Each check
-- raises on failure, so psql exits non-zero.

\set ON_ERROR_STOP on

-- Cast ------------------------------------------------------------------------
--   T1  owner of Org One     T2  teacher of Org Two     S1  student of T1

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

-- As T1: one published student, a confirmed course (C1) and an unconfirmed one (C2) --
set role authenticated;
set request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a1", "email": "t1@example.com"}';

insert into tracker.students (id, org_id, teacher_id, email, first_name, last_initial, grade_level) values
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001',
   '00000000-0000-0000-0000-0000000000a1', 's1@example.com', 'Sam', 'L', 12);
insert into tracker.courses (id, org_id, student_id, code, name) values
  ('30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'SBI4U', 'Biology'),
  ('30000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'ENG4U', 'English');
insert into tracker.syllabus_versions (id, org_id, student_id, course_id, version) values
  ('40000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', 1),
  ('40000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000002', 1);
update tracker.courses set active_syllabus_version_id = '40000000-0000-0000-0000-000000000001' where id = '30000000-0000-0000-0000-000000000001';
update tracker.courses set active_syllabus_version_id = '40000000-0000-0000-0000-000000000002' where id = '30000000-0000-0000-0000-000000000002';
-- C1: Tests 60, Quizzes 20, Labs 20. C2: All 100.
insert into tracker.categories (id, org_id, student_id, course_id, syllabus_version_id, name, weight, position) values
  ('50000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001', 'Tests', 60, 0),
  ('50000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001', 'Quizzes', 20, 1),
  ('50000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001', 'Labs', 20, 2),
  ('50000000-0000-0000-0000-000000000009', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000002', '40000000-0000-0000-0000-000000000002', 'All', 100, 0);
insert into tracker.assessments (id, org_id, student_id, course_id, category_id, title, score_possible, score_earned) values
  ('60000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000001', 'Unit 1 test', 40, 31),
  ('60000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000002', 'Quiz 1', 10, 9),
  ('60000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000003', 'Lab 1', 20, 18);
update tracker.syllabus_versions set confirmed_by = '00000000-0000-0000-0000-0000000000a1', confirmed_at = now()
 where id = '40000000-0000-0000-0000-000000000001';
update tracker.students set published_at = now(), status = 'active';

-- Refusals: each leaves the course exactly as it was ----------------------------------
do $$
declare
  graded_before timestamptz;
begin
  select graded_at into graded_before from tracker.assessments where id = '60000000-0000-0000-0000-000000000001';

  begin
    perform tracker.revise_syllabus('30000000-0000-0000-0000-000000000001', '[
      {"name": "Tests", "weight": 60, "from": ["50000000-0000-0000-0000-000000000001"]},
      {"name": "Quizzes", "weight": 20, "from": ["50000000-0000-0000-0000-000000000002"]},
      {"name": "Labs", "weight": 10, "from": ["50000000-0000-0000-0000-000000000003"]}
    ]');
    raise exception 'revise: accepted weights that add up to 90';
  exception when check_violation then
    if sqlerrm not like '%weights must sum to 100%' then raise; end if;
  end;

  begin
    perform tracker.revise_syllabus('30000000-0000-0000-0000-000000000001', '[
      {"name": "Tests", "weight": 80, "from": ["50000000-0000-0000-0000-000000000001"]},
      {"name": "Quizzes", "weight": 20, "from": ["50000000-0000-0000-0000-000000000002"]}
    ]');
    raise exception 'revise: dropped Labs with a mark in it';
  exception when check_violation then
    if sqlerrm not like 'say where the work in Labs goes' then raise; end if;
  end;

  begin
    perform tracker.revise_syllabus('30000000-0000-0000-0000-000000000001', '[
      {"name": "Tests", "weight": 60, "from": ["50000000-0000-0000-0000-000000000001", "50000000-0000-0000-0000-000000000003"]},
      {"name": "Quizzes", "weight": 40, "from": ["50000000-0000-0000-0000-000000000002", "50000000-0000-0000-0000-000000000003"]}
    ]');
    raise exception 'revise: carried one category into two';
  exception when check_violation then null;
  end;

  begin
    perform tracker.revise_syllabus('30000000-0000-0000-0000-000000000001', '[
      {"name": "Tests", "weight": 100, "from": ["50000000-0000-0000-0000-000000000001", "50000000-0000-0000-0000-000000000002", "50000000-0000-0000-0000-000000000003", "50000000-0000-0000-0000-000000000009"]}
    ]');
    raise exception 'revise: carried over another course''s category';
  exception when check_violation then null;
  end;

  begin
    perform tracker.revise_syllabus('30000000-0000-0000-0000-000000000002', '[{"name": "All", "weight": 100, "from": ["50000000-0000-0000-0000-000000000009"]}]');
    raise exception 'revise: made a new version of an unconfirmed syllabus';
  exception when check_violation then null;
  end;

  begin
    perform tracker.revise_syllabus('30000000-0000-0000-0000-000000000001', '[]');
    raise exception 'revise: accepted an empty syllabus';
  exception when check_violation then null;
  end;

  if (select count(*) from tracker.syllabus_versions where course_id = '30000000-0000-0000-0000-000000000001') <> 1
     or (select active_syllabus_version_id from tracker.courses where id = '30000000-0000-0000-0000-000000000001') <> '40000000-0000-0000-0000-000000000001'
     or (select category_id from tracker.assessments where id = '60000000-0000-0000-0000-000000000003') <> '50000000-0000-0000-0000-000000000003'
     or (select graded_at from tracker.assessments where id = '60000000-0000-0000-0000-000000000001') is distinct from graded_before then
    raise exception 'revise: a refused revision left something behind';
  end if;
  raise notice 'ok: a revision that is wrong saves nothing';
end $$;

-- As T2: another org cannot revise it --------------------------------------------------
reset role;
set role authenticated;
set request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a2", "email": "t2@example.com"}';
do $$ begin
  begin
    perform tracker.revise_syllabus('30000000-0000-0000-0000-000000000001', '[{"name": "All", "weight": 100, "from": ["50000000-0000-0000-0000-000000000001", "50000000-0000-0000-0000-000000000002", "50000000-0000-0000-0000-000000000003"]}]');
    raise exception 'revise: another org revised the syllabus';
  exception when no_data_found then null;
  end;
  raise notice 'ok: another org cannot revise a syllabus';
end $$;

-- As S1: the student cannot either ---------------------------------------------------------
reset role;
set role authenticated;
set request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000b1", "email": "s1@example.com"}';
select tracker.claim_student_invites();
do $$ begin
  begin
    perform tracker.revise_syllabus('30000000-0000-0000-0000-000000000001', '[{"name": "All", "weight": 100, "from": ["50000000-0000-0000-0000-000000000001", "50000000-0000-0000-0000-000000000002", "50000000-0000-0000-0000-000000000003"]}]');
    raise exception 'revise: the student revised their own syllabus';
  exception when no_data_found or insufficient_privilege then null;
  end;
  raise notice 'ok: a student cannot revise a syllabus';
end $$;

-- As T1: the school moved Labs into Tests and added Gizmos ------------------------------
reset role;
set role authenticated;
set request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a1", "email": "t1@example.com"}';
do $$
declare
  ids jsonb;
  v2 uuid;
  graded_before timestamptz;
begin
  select graded_at into graded_before from tracker.assessments where id = '60000000-0000-0000-0000-000000000003';
  ids := tracker.revise_syllabus('30000000-0000-0000-0000-000000000001', '[
    {"name": "Tests", "weight": 70, "aggregation_method": "pooled_points", "from": ["50000000-0000-0000-0000-000000000001", "50000000-0000-0000-0000-000000000003"]},
    {"name": "Quizzes", "weight": 20, "from": ["50000000-0000-0000-0000-000000000002"]},
    {"name": "Gizmos", "weight": 10}
  ]', 'Labs now count as tests');
  if jsonb_array_length(ids) <> 3 then
    raise exception 'revise: did not return the three new category ids';
  end if;

  select active_syllabus_version_id into v2 from tracker.courses where id = '30000000-0000-0000-0000-000000000001';
  if v2 = '40000000-0000-0000-0000-000000000001' then
    raise exception 'revise: the course still points at version 1';
  end if;
  if not exists (
    select 1 from tracker.syllabus_versions
     where id = v2 and version = 2 and confirmed_at is not null
       and confirmed_by = '00000000-0000-0000-0000-0000000000a1' and notes = 'Labs now count as tests'
  ) then
    raise exception 'revise: version 2 is not confirmed by the caller with the notes';
  end if;
  if (select string_agg(name || ':' || weight::int || ':' || position, ',' order by position) from tracker.categories where syllabus_version_id = v2)
     <> 'Tests:70:0,Quizzes:20:1,Gizmos:10:2' then
    raise exception 'revise: version 2 categories are wrong';
  end if;
  if (select aggregation_method::text from tracker.categories where id = (ids ->> 0)::uuid) <> 'pooled_points' then
    raise exception 'revise: the aggregation method was not carried';
  end if;
  if (select count(*) from tracker.assessments where category_id = (ids ->> 0)::uuid) <> 2
     or (select category_id from tracker.assessments where id = '60000000-0000-0000-0000-000000000002') <> (ids ->> 1)::uuid then
    raise exception 'revise: assessments did not move to their new categories';
  end if;
  if (select graded_at from tracker.assessments where id = '60000000-0000-0000-0000-000000000003') is distinct from graded_before
     or (select score_earned from tracker.assessments where id = '60000000-0000-0000-0000-000000000003') <> 18 then
    raise exception 'revise: moving a mark changed it';
  end if;
  if (select string_agg(name || ':' || weight::int, ',' order by position) from tracker.categories where syllabus_version_id = '40000000-0000-0000-0000-000000000001')
     <> 'Tests:60,Quizzes:20,Labs:20' then
    raise exception 'revise: version 1 was changed';
  end if;
  begin
    update tracker.categories set weight = 50 where id = (ids ->> 0)::uuid;
    raise exception 'revise: version 2 categories are writable after confirm';
  exception when check_violation then null;
  end;
  raise notice 'ok: version 2 is confirmed, version 1 kept, marks moved unchanged';

  -- A second revision builds on version 2.
  ids := tracker.revise_syllabus('30000000-0000-0000-0000-000000000001', jsonb_build_array(
    jsonb_build_object('name', 'Tests', 'weight', 60, 'from', jsonb_build_array(ids ->> 0)),
    jsonb_build_object('name', 'Quizzes', 'weight', 30, 'from', jsonb_build_array(ids ->> 1)),
    jsonb_build_object('name', 'Gizmos', 'weight', 10, 'from', jsonb_build_array(ids ->> 2))
  ));
  if (select v.version from tracker.courses c join tracker.syllabus_versions v on v.id = c.active_syllabus_version_id
       where c.id = '30000000-0000-0000-0000-000000000001') <> 3 then
    raise exception 'revise: a second revision is not version 3';
  end if;
  raise notice 'ok: revisions stack';
end $$;

-- The audit log saw it ----------------------------------------------------------------
reset role;
do $$ begin
  if (select count(*) from tracker.audit_log where table_name = 'syllabus_versions' and action = 'INSERT') < 2
     or (select count(*) from tracker.audit_log where table_name = 'assessments' and action = 'UPDATE') < 3 then
    raise exception 'audit: a revision was not audited';
  end if;
  raise notice 'ok: revisions are audited';
end $$;
