-- REQ-31: class purpose and makeup link (0019). Run by run-rls.sh on a fresh
-- copy of the migrated database. Privilege-sensitive steps run under set role
-- because the runner connects as a superuser. Each check raises on failure.

\set ON_ERROR_STOP on
\o /dev/null

-- Cast: OWN owner; TCH teacher (staff E1); PAR parent of Sam (notion F1).
-- Students: Sam (F1, published, linked to PAR), Cal (F2, published, not linked).
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'owner@example.com'),
  ('00000000-0000-0000-0000-0000000000d1', 't@example.com'),
  ('00000000-0000-0000-0000-0000000000e1', 'parent@example.com');
insert into tracker.orgs (id, name) values ('10000000-0000-0000-0000-000000000001', 'Org One');
insert into tracker.memberships (user_id, org_id, role) values
  ('00000000-0000-0000-0000-0000000000a1', '10000000-0000-0000-0000-000000000001', 'owner'),
  ('00000000-0000-0000-0000-0000000000d1', '10000000-0000-0000-0000-000000000001', 'teacher'),
  ('00000000-0000-0000-0000-0000000000e1', '10000000-0000-0000-0000-000000000001', 'parent');
insert into tracker.staff_links (org_id, notion_staff_id, email, approved_by, user_id) values
  ('10000000-0000-0000-0000-000000000001', 'e0000000-0000-4000-8000-000000000001', 't@example.com', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000d1');
insert into tracker.students (id, org_id, teacher_id, email, first_name, last_initial, grade_level, status, published_at, notion_student_id) values
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1', 'sam@example.com', 'Sam', 'L', 11, 'active', now(), 'f0000000-0000-4000-8000-000000000001'),
  ('20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1', 'cal@example.com', 'Cal', 'M', 11, 'active', now(), 'f0000000-0000-4000-8000-000000000002');
insert into tracker.parent_links (org_id, student_id, email, parent_user_id, claimed_at, invited_by) values
  ('10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'parent@example.com', '00000000-0000-0000-0000-0000000000e1', now(), '00000000-0000-0000-0000-0000000000a1');

-- Seeded as the superuser, as rows that existed before 0019 would be:
-- W1 weekly for Sam with a cancelled 2030-01-14; L1 one-off for Sam; C1 one-off for Cal.
insert into tracker.class_series (id, org_id, request_id, notion_staff_id, notion_student_id, subject, kind, start_date, start_time, duration_minutes, created_by) values
  ('50000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', gen_random_uuid(),
   'e0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000001', 'MHF4U', 'weekly', '2030-01-07', '17:00', 60, '00000000-0000-0000-0000-0000000000a1'),
  ('50000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', gen_random_uuid(),
   'e0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000001', 'SPH4U', 'one_off', '2030-01-16', '15:00', 60, '00000000-0000-0000-0000-0000000000a1'),
  ('50000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000001', gen_random_uuid(),
   'e0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000002', 'ENG4U', 'one_off', '2030-01-16', '18:00', 60, '00000000-0000-0000-0000-0000000000a1');
insert into tracker.class_exceptions (id, org_id, request_id, series_id, original_date, kind, created_by) values
  ('70000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', gen_random_uuid(),
   '50000000-0000-0000-0000-000000000001', '2030-01-14', 'cancelled', '00000000-0000-0000-0000-0000000000a1');

create schema cp;
grant usage on schema cp to public;
create function cp.expect_error(stmt text, want_state text)
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
create function cp.stamps() returns jsonb language sql as $$
  select tracker.schedule_write_context('10000000-0000-0000-0000-000000000001', gen_random_uuid(),
    '[{"kind":"staff","id":"e0000000-0000-4000-8000-000000000001"},{"kind":"student","id":"f0000000-0000-4000-8000-000000000001"}]') -> 'stamps'
$$;
grant execute on all functions in schema cp to public;

-- Existing rows read null ---------------------------------------------------------
do $$ begin
  if exists (select 1 from tracker.class_series where purpose is not null or makeup_for is not null) then
    raise exception 'existing rows should have no purpose and no link';
  end if;
end $$;

-- The owner sets purposes ---------------------------------------------------------
set role authenticated;
set request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a1"}';

update tracker.class_series set purpose = 'makeup', makeup_for = '70000000-0000-0000-0000-000000000001'
  where id = '50000000-0000-0000-0000-000000000002';
update tracker.class_series set purpose = 'trial' where id = '50000000-0000-0000-0000-000000000003';
insert into tracker.class_series (id, org_id, request_id, notion_staff_id, notion_student_id, subject, kind, start_date, start_time, duration_minutes, purpose, created_by) values
  ('50000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000001', gen_random_uuid(),
   'e0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000001', 'ICS4U', 'one_off', '2030-01-17', '15:00', 60, 'extra', '00000000-0000-0000-0000-0000000000a1');
do $$ begin
  if (select purpose from tracker.class_series where id = '50000000-0000-0000-0000-000000000002') is distinct from 'makeup'
     or (select makeup_for from tracker.class_series where id = '50000000-0000-0000-0000-000000000002') is distinct from '70000000-0000-0000-0000-000000000001'
     or (select purpose from tracker.class_series where id = '50000000-0000-0000-0000-000000000003') is distinct from 'trial'
     or (select purpose from tracker.class_series where id = '50000000-0000-0000-0000-000000000004') is distinct from 'extra' then
    raise exception 'owner insert or update of purpose did not land';
  end if;
end $$;

-- The database refuses what the form never sends ---------------------------------
-- A weekly series has no purpose.
select cp.expect_error($q$update tracker.class_series set purpose = 'trial' where id = '50000000-0000-0000-0000-000000000001'$q$, '23514');
-- A link needs purpose makeup.
select cp.expect_error($q$update tracker.class_series set purpose = 'trial' where id = '50000000-0000-0000-0000-000000000002'$q$, '23514');
select cp.expect_error($q$update tracker.class_series set makeup_for = '70000000-0000-0000-0000-000000000001' where id = '50000000-0000-0000-0000-000000000003'$q$, '23514');
-- Not one of the three words.
select cp.expect_error($q$update tracker.class_series set purpose = 'bonus' where id = '50000000-0000-0000-0000-000000000003'$q$, '23514');
-- The link must name a real exception.
select cp.expect_error($q$update tracker.class_series set makeup_for = '70000000-0000-0000-0000-0000000000ff' where id = '50000000-0000-0000-0000-000000000002'$q$, '23503');

-- schedule_write carries purpose and link -----------------------------------------
do $$
declare r jsonb;
begin
  r := tracker.schedule_write('10000000-0000-0000-0000-000000000001', gen_random_uuid(), 'create', cp.stamps(),
    '{"staff_id":"e0000000-0000-4000-8000-000000000001","student_id":"f0000000-0000-4000-8000-000000000001","subject":"MCV4U","kind":"one_off","start_date":"2030-01-18","start_time":"15:00","duration_minutes":60,"purpose":"makeup","makeup_for":"70000000-0000-0000-0000-000000000001"}');
  if r #>> '{result,purpose}' <> 'makeup' or r #>> '{result,makeup_for}' <> '70000000-0000-0000-0000-000000000001' then
    raise exception 'create did not store purpose and link: %', r;
  end if;

  -- Absent keys keep the stored values.
  r := tracker.schedule_write('10000000-0000-0000-0000-000000000001', gen_random_uuid(), 'edit_one_off', cp.stamps(), jsonb_build_object(
    'series_id', r #>> '{result,id}', 'original_date', '2030-01-18', 'expected_updated_at', r #>> '{result,updated_at}',
    'fields', jsonb_build_object('subject', 'MCV4U Calculus')));
  if r #>> '{result,purpose}' <> 'makeup' or r #>> '{result,makeup_for}' is null then
    raise exception 'edit without purpose keys changed them: %', r;
  end if;

  -- Purpose null with makeup_for null in the same write clears both.
  r := tracker.schedule_write('10000000-0000-0000-0000-000000000001', gen_random_uuid(), 'edit_one_off', cp.stamps(), jsonb_build_object(
    'series_id', r #>> '{result,id}', 'original_date', '2030-01-18', 'expected_updated_at', r #>> '{result,updated_at}',
    'fields', jsonb_build_object('purpose', null, 'makeup_for', null)));
  if r #>> '{result,purpose}' is not null or r #>> '{result,makeup_for}' is not null then
    raise exception 'edit to purpose null did not clear: %', r;
  end if;

  -- And trial on its own.
  r := tracker.schedule_write('10000000-0000-0000-0000-000000000001', gen_random_uuid(), 'edit_one_off', cp.stamps(), jsonb_build_object(
    'series_id', r #>> '{result,id}', 'original_date', '2030-01-18', 'expected_updated_at', r #>> '{result,updated_at}',
    'fields', jsonb_build_object('purpose', 'trial')));
  if r #>> '{result,purpose}' <> 'trial' then
    raise exception 'edit to trial did not land: %', r;
  end if;
end $$;

-- A teacher cannot change a purpose -------------------------------------------------
set request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000d1"}';
update tracker.class_series set purpose = 'extra' where id = '50000000-0000-0000-0000-000000000003';
reset role;
do $$ begin
  if (select purpose from tracker.class_series where id = '50000000-0000-0000-0000-000000000003') is distinct from 'trial' then
    raise exception 'a teacher changed a purpose';
  end if;
end $$;

-- A parent reads their child's purposes and no other child's ------------------------
set role authenticated;
set request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000e1"}';
do $$ begin
  if (select purpose from tracker.class_series where id = '50000000-0000-0000-0000-000000000002') is distinct from 'makeup'
     or (select makeup_for from tracker.class_series where id = '50000000-0000-0000-0000-000000000002') is distinct from '70000000-0000-0000-0000-000000000001' then
    raise exception 'parent cannot read their child''s purpose';
  end if;
  if exists (select 1 from tracker.class_series where id = '50000000-0000-0000-0000-000000000003') then
    raise exception 'parent read another child''s series';
  end if;
end $$;

-- authenticated still cannot delete an exception --------------------------------------
set request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a1"}';
select cp.expect_error($q$delete from tracker.class_exceptions where id = '70000000-0000-0000-0000-000000000001'$q$, '42501');

-- Deleting a referenced exception as the table owner keeps the makeup -----------------
reset role;
delete from tracker.class_exceptions where id = '70000000-0000-0000-0000-000000000001';
do $$ begin
  if (select purpose from tracker.class_series where id = '50000000-0000-0000-0000-000000000002') is distinct from 'makeup' then
    raise exception 'makeup lost its purpose when the exception was deleted';
  end if;
  if (select makeup_for from tracker.class_series where id = '50000000-0000-0000-0000-000000000002') is not null then
    raise exception 'makeup_for should be null after the exception was deleted';
  end if;
end $$;

\o
\echo ok: class purpose (REQ-31)
