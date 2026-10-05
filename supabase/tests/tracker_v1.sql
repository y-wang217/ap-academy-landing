-- RLS and integrity checks for tracker v1 (0006): grade flags, AI draft
-- records and suggestion keys. Run by run-rls.sh on a fresh copy of the
-- migrated database. Each check raises on failure, so psql exits non-zero.

\set ON_ERROR_STOP on

-- Cast ------------------------------------------------------------------------
--   T1  owner of Org One          T2  teacher of Org Two
--   S1  student login (s1@)       S2  student login (s2@), same org as S1

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 't1@example.com'),
  ('00000000-0000-0000-0000-0000000000a2', 't2@example.com'),
  ('00000000-0000-0000-0000-0000000000b1', 's1@example.com'),
  ('00000000-0000-0000-0000-0000000000b2', 's2@example.com');

insert into tracker.orgs (id, name) values
  ('10000000-0000-0000-0000-000000000001', 'Org One'),
  ('10000000-0000-0000-0000-000000000002', 'Org Two');
insert into tracker.memberships (user_id, org_id, role) values
  ('00000000-0000-0000-0000-0000000000a1', '10000000-0000-0000-0000-000000000001', 'owner'),
  ('00000000-0000-0000-0000-0000000000a2', '10000000-0000-0000-0000-000000000002', 'teacher');

-- As T1: two published students, one course each, one graded test each ------------
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
insert into tracker.assessments (id, org_id, student_id, course_id, category_id, title, score_possible, score_earned) values
  ('60000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000001', 'Unit 1 test', 40, 31),
  ('60000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000002', '50000000-0000-0000-0000-000000000002', 'Lab 1', 20, 18);
update tracker.students set published_at = now(), status = 'active';

-- Suggestion keys are an ordinary staff-written task column.
insert into tracker.tasks (org_id, student_id, course_id, title, reason, suggestion_key) values
  ('10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001',
   'Review All in MHF4U', 'MHF4U is 6.0% below target.', 'review:30000000-0000-0000-0000-000000000001');

-- AI draft records: staff in their own org, requested_by is always the caller.
insert into tracker.ai_drafts (org_id, student_id, course_id, input_chars) values
  ('10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', 120);

do $$ begin
  if (select requested_by from tracker.ai_drafts) is distinct from '00000000-0000-0000-0000-0000000000a1'::uuid then
    raise exception 'ai_drafts: requested_by is not the caller';
  end if;
  begin
    insert into tracker.ai_drafts (org_id, student_id, course_id, input_chars, requested_by) values
      ('10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', 1,
       '00000000-0000-0000-0000-0000000000a2');
    raise exception 'ai_drafts: staff wrote another user as requested_by';
  exception when insufficient_privilege then null;
  end;
  update tracker.ai_drafts set status = 'drafted', draft = '{"items": []}', model = 'test';
  if (select status from tracker.ai_drafts) is distinct from 'drafted' then
    raise exception 'ai_drafts: staff could not record the outcome';
  end if;
  begin
    update tracker.ai_drafts set input_chars = 5;
    raise exception 'ai_drafts: input_chars is writable after the request';
  exception when insufficient_privilege then null;
  end;
  begin
    update tracker.ai_drafts set status = 'deleted';
    raise exception 'ai_drafts: accepted an unknown status';
  exception when check_violation then null;
  end;
  raise notice 'ok: staff record AI drafts in their own org, as themselves';
end $$;

-- As T2: another org sees and writes none of it ---------------------------------------
reset role;
set role authenticated;
set request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a2", "email": "t2@example.com"}';
do $$ begin
  if (select count(*) from tracker.ai_drafts) <> 0 then
    raise exception 'ai_drafts: another org reads them';
  end if;
  begin
    insert into tracker.ai_drafts (org_id, student_id, course_id, input_chars) values
      ('10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', 1);
    raise exception 'ai_drafts: another org created one';
  exception when insufficient_privilege then null;
  end;
  raise notice 'ok: AI drafts are invisible to other orgs';
end $$;

-- As S2: claim -----------------------------------------------------------------------
reset role;
set role authenticated;
set request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000b2", "email": "s2@example.com"}';
select tracker.claim_student_invites();

-- As S1: claim, flag their own grade, nobody else's ----------------------------------------
reset role;
set role authenticated;
set request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000b1", "email": "s1@example.com"}';
select tracker.claim_student_invites();

do $$
declare
  first_id uuid;
  second_id uuid;
begin
  first_id := tracker.flag_assessment('60000000-0000-0000-0000-000000000001', 'score_differs');
  second_id := tracker.flag_assessment('60000000-0000-0000-0000-000000000001', 'other');
  if first_id <> second_id or (select count(*) from tracker.grade_flags) <> 1 then
    raise exception 'flags: flagging twice opened a second flag';
  end if;
  if (select reason::text from tracker.grade_flags) is distinct from 'other' then
    raise exception 'flags: flagging again did not change the reason';
  end if;
  begin
    perform tracker.flag_assessment('60000000-0000-0000-0000-000000000002', 'score_differs');
    raise exception 'flags: S1 flagged another student''s grade';
  exception when no_data_found then null;
  end;
  begin
    insert into tracker.grade_flags (org_id, student_id, assessment_id, reason) values
      ('10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000000001', 'other');
    raise exception 'flags: a student inserted a flag directly';
  exception when insufficient_privilege then null;
  end;
  begin
    update tracker.grade_flags set resolved_at = now();
    if exists (select 1 from tracker.grade_flags where resolved_at is not null) then
      raise exception 'flags: a student resolved their own flag';
    end if;
  exception when insufficient_privilege then null;
  end;
  if (select count(*) from tracker.ai_drafts) <> 0 then
    raise exception 'ai_drafts: a student reads them';
  end if;
  begin
    update tracker.tasks set suggestion_key = 'x';
    if exists (select 1 from tracker.tasks where suggestion_key = 'x') then
      raise exception 'tasks: a student changed a suggestion key';
    end if;
  exception when insufficient_privilege then null;
  end;
  raise notice 'ok: S1 flags only their own grade, only through the function';
end $$;

-- As S2: cannot see or withdraw S1's flag -----------------------------------------------
reset role;
set role authenticated;
set request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000b2", "email": "s2@example.com"}';
do $$ begin
  if (select count(*) from tracker.grade_flags) <> 0 then
    raise exception 'flags: S2 sees S1''s flag';
  end if;
  begin
    perform tracker.unflag_assessment('60000000-0000-0000-0000-000000000001');
    raise exception 'flags: S2 withdrew S1''s flag';
  exception when no_data_found then null;
  end;
  raise notice 'ok: another student neither sees nor withdraws a flag';
end $$;

-- As T2: another org cannot see or resolve it ------------------------------------------
reset role;
set role authenticated;
set request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a2", "email": "t2@example.com"}';
update tracker.grade_flags set resolved_at = now();
do $$ begin
  if (select count(*) from tracker.grade_flags) <> 0 then
    raise exception 'flags: another org sees them';
  end if;
end $$;

-- As T1: sees the flag and resolves it; resolved_by comes from the session -------------
reset role;
set role authenticated;
set request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a1", "email": "t1@example.com"}';
do $$ begin
  if (select count(*) from tracker.grade_flags where resolved_at is null) <> 1 then
    raise exception 'flags: staff do not see the open flag (or T2 resolved it)';
  end if;
  begin
    update tracker.grade_flags set resolved_by = '00000000-0000-0000-0000-0000000000a2';
    raise exception 'flags: staff wrote resolved_by directly';
  exception when insufficient_privilege then null;
  end;
  begin
    update tracker.grade_flags set reason = 'returned';
    raise exception 'flags: staff changed the student''s reason';
  exception when insufficient_privilege then null;
  end;
  update tracker.grade_flags set resolved_at = now();
  if (select resolved_by from tracker.grade_flags) is distinct from '00000000-0000-0000-0000-0000000000a1'::uuid then
    raise exception 'flags: resolved_by is not the resolving teacher';
  end if;
  raise notice 'ok: staff resolve flags; resolved_by is the session user';
end $$;

-- As S1: a resolved flag is history; a new one can be raised and withdrawn --------------
reset role;
set role authenticated;
set request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000b1", "email": "s1@example.com"}';
do $$ begin
  perform tracker.flag_assessment('60000000-0000-0000-0000-000000000001', 'score_differs');
  if (select count(*) from tracker.grade_flags) <> 2 then
    raise exception 'flags: could not flag again after a resolve';
  end if;
  perform tracker.unflag_assessment('60000000-0000-0000-0000-000000000001');
  if (select count(*) from tracker.grade_flags) <> 1
     or exists (select 1 from tracker.grade_flags where resolved_at is null) then
    raise exception 'flags: withdraw removed the wrong flag';
  end if;
  begin
    perform tracker.unflag_assessment('60000000-0000-0000-0000-000000000001');
    raise exception 'flags: withdrew a flag that is not open';
  exception when no_data_found then null;
  end;
  raise notice 'ok: resolved flags stay; open flags can be withdrawn';
end $$;

-- Anonymous: nothing ---------------------------------------------------------------------
reset role;
set role anon;
reset request.jwt.claims;
do $$ begin
  begin
    perform tracker.flag_assessment('60000000-0000-0000-0000-000000000001', 'other');
    raise exception 'flags: anon called flag_assessment';
  exception when insufficient_privilege then null;
  end;
  raise notice 'ok: anon cannot flag';
end $$;

-- Archived students keep their history but can no longer flag ------------------------------
reset role;
update tracker.students set status = 'archived' where id = '20000000-0000-0000-0000-000000000001';
set role authenticated;
set request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000b1", "email": "s1@example.com"}';
do $$ begin
  begin
    perform tracker.flag_assessment('60000000-0000-0000-0000-000000000001', 'other');
    raise exception 'flags: an archived student flagged a grade';
  exception when no_data_found then null;
  end;
  if (select count(*) from tracker.grade_flags) <> 1 then
    raise exception 'flags: an archived student lost read access to their flags';
  end if;
  raise notice 'ok: archived students cannot flag';
end $$;

-- Every flag change is in the audit log ------------------------------------------------------
reset role;
do $$ begin
  -- insert, reason change, resolve, second insert, withdraw
  if (select count(*) from tracker.audit_log where table_name = 'grade_flags') <> 5 then
    raise exception 'audit: expected 5 grade_flags entries, got %',
      (select count(*) from tracker.audit_log where table_name = 'grade_flags');
  end if;
  raise notice 'ok: flag history is audited';
end $$;

\echo 'tracker v1 checks passed'
