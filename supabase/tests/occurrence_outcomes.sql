-- REQ-39: occurrence outcomes and the freeze (0023). Run by run-rls.sh on a
-- fresh copy of the migrated database. Privilege-sensitive steps run under
-- set role because the runner connects as a superuser. Each check raises on
-- failure. Dates are relative to today in Toronto, as the linkable rule is.

\set ON_ERROR_STOP on
\o /dev/null

-- Cast: OWN owner; RYN teacher (staff E1); KBY teacher (staff E2); PAR parent
-- of Sam (notion F1); STU Sam's student login; OTH owner of another org.
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'owner@example.com'),
  ('00000000-0000-0000-0000-0000000000d1', 'ryan@example.com'),
  ('00000000-0000-0000-0000-0000000000d2', 'kuby@example.com'),
  ('00000000-0000-0000-0000-0000000000e1', 'parent@example.com'),
  ('00000000-0000-0000-0000-0000000000c1', 'sam@example.com'),
  ('00000000-0000-0000-0000-0000000000b1', 'other@example.com');
insert into tracker.orgs (id, name) values
  ('10000000-0000-0000-0000-000000000001', 'Org One'),
  ('10000000-0000-0000-0000-000000000002', 'Org Two');
insert into tracker.memberships (user_id, org_id, role) values
  ('00000000-0000-0000-0000-0000000000a1', '10000000-0000-0000-0000-000000000001', 'owner'),
  ('00000000-0000-0000-0000-0000000000d1', '10000000-0000-0000-0000-000000000001', 'teacher'),
  ('00000000-0000-0000-0000-0000000000d2', '10000000-0000-0000-0000-000000000001', 'teacher'),
  ('00000000-0000-0000-0000-0000000000e1', '10000000-0000-0000-0000-000000000001', 'parent'),
  ('00000000-0000-0000-0000-0000000000c1', '10000000-0000-0000-0000-000000000001', 'student'),
  ('00000000-0000-0000-0000-0000000000b1', '10000000-0000-0000-0000-000000000002', 'owner');
insert into tracker.staff_links (org_id, notion_staff_id, email, approved_by, user_id) values
  ('10000000-0000-0000-0000-000000000001', 'e0000000-0000-4000-8000-000000000001', 'ryan@example.com', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000d1'),
  ('10000000-0000-0000-0000-000000000001', 'e0000000-0000-4000-8000-000000000002', 'kuby@example.com', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000d2');
insert into tracker.students (id, org_id, teacher_id, user_id, email, first_name, last_initial, grade_level, status, published_at, notion_student_id) values
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000c1',
   'sam@example.com', 'Sam', 'L', 11, 'active', now(), 'f0000000-0000-4000-8000-000000000001');
insert into tracker.parent_links (org_id, student_id, email, parent_user_id, claimed_at, invited_by) values
  ('10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'parent@example.com', '00000000-0000-0000-0000-0000000000e1', now(), '00000000-0000-0000-0000-0000000000a1');

create schema oo;
grant usage on schema oo to public;
create function oo.today() returns date language sql stable as $$
  select (now() at time zone 'America/Toronto')::date
$$;
-- d(n): the n-th weekly occurrence of W1 and K1, which start four weeks ago.
-- d(0..3) are past, d(4) is today, d(5) is next week.
create function oo.d(n int) returns date language sql stable as $$
  select oo.today() - 28 + 7 * n
$$;
create function oo.expect_error(stmt text, want_state text)
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
create function oo.expect_message(stmt text, want text)
returns void language plpgsql as $$
begin
  execute stmt;
  raise exception 'statement succeeded, expected %: %', want, stmt;
exception when others then
  if sqlerrm like 'statement succeeded%' then raise; end if;
  if sqlerrm <> want then
    raise exception 'expected %, got % (%) for %', want, sqlstate, sqlerrm, stmt;
  end if;
end $$;
-- Rows a statement touched.
create function oo.touched(stmt text) returns bigint language plpgsql as $$
declare n bigint;
begin
  execute stmt;
  get diagnostics n = row_count;
  return n;
end $$;
create function oo.stamps() returns jsonb language sql as $$
  select tracker.schedule_write_context('10000000-0000-0000-0000-000000000001', gen_random_uuid(),
    '[{"kind":"staff","id":"e0000000-0000-4000-8000-000000000001"},{"kind":"student","id":"f0000000-0000-4000-8000-000000000001"}]') -> 'stamps'
$$;
grant execute on all functions in schema oo to public;

-- W1: Ryan's weekly for Sam. K1: Kuby's weekly for Sam.
-- W1 exceptions: d(1) cancelled, d(2) moved to the future, d(3) moved to a past day.
do $$ begin
  insert into tracker.class_series (id, org_id, request_id, notion_staff_id, notion_student_id, subject, kind, start_date, start_time, duration_minutes, created_by) values
    ('50000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', gen_random_uuid(),
     'e0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000001', 'MHF4U', 'weekly', oo.d(0), '16:00', 60, '00000000-0000-0000-0000-0000000000a1'),
    ('50000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', gen_random_uuid(),
     'e0000000-0000-4000-8000-000000000002', 'f0000000-0000-4000-8000-000000000001', 'SPH4U', 'weekly', oo.d(0), '18:00', 60, '00000000-0000-0000-0000-0000000000a1');
  insert into tracker.class_exceptions (org_id, request_id, series_id, original_date, kind, new_date, new_start_time, created_by) values
    ('10000000-0000-0000-0000-000000000001', gen_random_uuid(), '50000000-0000-0000-0000-000000000001', oo.d(1), 'cancelled', null, null, '00000000-0000-0000-0000-0000000000a1'),
    ('10000000-0000-0000-0000-000000000001', gen_random_uuid(), '50000000-0000-0000-0000-000000000001', oo.d(2), 'moved', oo.today() + 3, '16:00', '00000000-0000-0000-0000-0000000000a1'),
    ('10000000-0000-0000-0000-000000000001', gen_random_uuid(), '50000000-0000-0000-0000-000000000001', oo.d(3), 'moved', oo.d(3) - 1, '16:00', '00000000-0000-0000-0000-0000000000a1');
end $$;

-- Teacher inserts -------------------------------------------------------------------
set role authenticated;
set request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000d1"}';

-- A pending logged row for his past class, then completed with the lesson ID.
do $$ begin
  insert into tracker.occurrence_outcomes (org_id, series_id, original_date, outcome, link_source, claimed_at, created_by) values
    ('10000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000001', oo.d(0), 'delivered', 'logged', now(), '00000000-0000-0000-0000-0000000000d1');
  if oo.touched(format($q$update tracker.occurrence_outcomes set notion_lesson_id = 'cccccccc-0000-4000-8000-000000000001', lesson_date = %L
      where series_id = '50000000-0000-0000-0000-000000000001' and original_date = %L$q$, oo.d(0), oo.d(0))) <> 1 then
    raise exception 'teacher could not complete his own pending row';
  end if;
  -- Completed: a second update matches nothing.
  if oo.touched(format($q$update tracker.occurrence_outcomes set notion_lesson_id = 'cccccccc-0000-4000-8000-000000000009'
      where series_id = '50000000-0000-0000-0000-000000000001' and original_date = %L$q$, oo.d(0))) <> 0 then
    raise exception 'teacher changed a completed row';
  end if;
end $$;

-- Refused: Kuby's series, a future date, a cancelled date, a non-pattern date,
-- link_source reconciled, and a lesson ID.
do $$
declare ins text := $q$insert into tracker.occurrence_outcomes (org_id, series_id, original_date, outcome, link_source, notion_lesson_id, created_by)
  values ('10000000-0000-0000-0000-000000000001', %L, %L, %L, %L, %L, '00000000-0000-0000-0000-0000000000d1')$q$;
begin
  perform oo.expect_error(format(ins, '50000000-0000-0000-0000-000000000002', oo.d(0), 'delivered', 'logged', null), '42501');
  perform oo.expect_error(format(ins, '50000000-0000-0000-0000-000000000001', oo.d(5), 'delivered', 'logged', null), '42501');
  perform oo.expect_error(format(ins, '50000000-0000-0000-0000-000000000001', oo.d(1), 'no_show', null, null), '42501');
  perform oo.expect_error(format(ins, '50000000-0000-0000-0000-000000000001', oo.d(0) + 1, 'no_show', null, null), '42501');
  perform oo.expect_error(format(ins, '50000000-0000-0000-0000-000000000001', oo.d(4), 'delivered', 'reconciled', null), '42501');
  perform oo.expect_error(format(ins, '50000000-0000-0000-0000-000000000001', oo.d(4), 'delivered', 'logged', 'cccccccc-0000-4000-8000-000000000002'), '42501');
  -- Moved: under the original date, allowed when the new date has passed, refused when it is ahead.
  perform oo.expect_error(format(ins, '50000000-0000-0000-0000-000000000001', oo.d(2), 'no_show', null, null), '42501');
  execute format(ins, '50000000-0000-0000-0000-000000000001', oo.d(3), 'delivered', 'logged', null);
  -- And a no-show for today.
  execute format(ins, '50000000-0000-0000-0000-000000000001', oo.d(4), 'no_show', null, null);
end $$;

-- Constraints (as the superuser, so RLS is not what refuses) ---------------------------
reset role;
do $$
declare ins text := $q$insert into tracker.occurrence_outcomes (org_id, series_id, original_date, outcome, link_source, notion_lesson_id, lesson_date, claimed_at, created_by)
  values ('10000000-0000-0000-0000-000000000001', %L, %L, %L, %L, %L, %L, %L, '00000000-0000-0000-0000-0000000000a1')$q$;
begin
  perform oo.expect_error(format(ins, '50000000-0000-0000-0000-000000000001', oo.d(0), 'no_show', null, null, null, null), '23505');
  perform oo.expect_error(format(ins, '50000000-0000-0000-0000-000000000002', oo.d(0), 'delivered', 'reconciled', 'cccccccc-0000-4000-8000-000000000001', oo.d(0), null), '23505');
  perform oo.expect_error(format(ins, '50000000-0000-0000-0000-000000000002', oo.d(0), 'no_show', 'logged', null, null, null), '23514');
  perform oo.expect_error(format(ins, '50000000-0000-0000-0000-000000000002', oo.d(0), 'no_show', null, 'cccccccc-0000-4000-8000-000000000003', null, null), '23514');
  perform oo.expect_error(format(ins, '50000000-0000-0000-0000-000000000002', oo.d(0), 'no_show', null, null, oo.d(0), null), '23514');
  perform oo.expect_error(format(ins, '50000000-0000-0000-0000-000000000002', oo.d(0), 'no_show', null, null, null, now()), '23514');
  perform oo.expect_error(format(ins, '50000000-0000-0000-0000-000000000002', oo.d(0), 'delivered', null, null, null, null), '23514');
  perform oo.expect_error(format(ins, '50000000-0000-0000-0000-000000000002', oo.d(0), 'missed', null, null, null, null), '23514');
end $$;

-- The owner records a pending row on Kuby's series, for the teacher limits below.
set role authenticated;
set request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a1"}';
do $$ begin
  insert into tracker.occurrence_outcomes (org_id, series_id, original_date, outcome, link_source, claimed_at, created_by) values
    ('10000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000002', oo.d(0), 'delivered', 'logged', now(), '00000000-0000-0000-0000-0000000000a1');
end $$;

-- Teacher limits ----------------------------------------------------------------------
set request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000d1"}';
do $$ begin
  if oo.touched(format($q$update tracker.occurrence_outcomes set claimed_at = now()
      where series_id = '50000000-0000-0000-0000-000000000001' and original_date = %L$q$, oo.d(4))) <> 0 then
    raise exception 'teacher updated a no_show row';
  end if;
  if oo.touched($q$update tracker.occurrence_outcomes set claimed_at = now() where series_id = '50000000-0000-0000-0000-000000000002'$q$) <> 0 then
    raise exception 'teacher updated another teacher''s row';
  end if;
  if exists (select 1 from tracker.occurrence_outcomes where series_id = '50000000-0000-0000-0000-000000000002') then
    raise exception 'teacher read another teacher''s row';
  end if;
  if (select count(*) from tracker.occurrence_outcomes) <> 3 then
    raise exception 'teacher should read his own three rows';
  end if;
  if oo.touched('delete from tracker.occurrence_outcomes') <> 0 then
    raise exception 'teacher deleted an outcome';
  end if;
end $$;
-- Kuby, the series' teacher, cannot take over a pending row he did not create.
set request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000d2"}';
do $$ begin
  if (select count(*) from tracker.occurrence_outcomes) <> 1 then
    raise exception 'Kuby should read the one row on his series';
  end if;
  if oo.touched($q$update tracker.occurrence_outcomes set claimed_at = now() where series_id = '50000000-0000-0000-0000-000000000002'$q$) <> 0 then
    raise exception 'a teacher took over a claim he did not create';
  end if;
end $$;

-- Owner -------------------------------------------------------------------------------
set request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a1"}';
do $$ begin
  if (select count(*) from tracker.occurrence_outcomes) <> 4 then
    raise exception 'owner should read all four rows';
  end if;
  perform oo.expect_error($q$update tracker.occurrence_outcomes set outcome = 'no_show' where series_id = '50000000-0000-0000-0000-000000000002'$q$, '42501');
  if oo.touched($q$update tracker.occurrence_outcomes set notion_lesson_id = 'cccccccc-0000-4000-8000-000000000004', lesson_date = original_date, claimed_at = null
      where series_id = '50000000-0000-0000-0000-000000000002'$q$) <> 1 then
    raise exception 'owner could not complete a pending row';
  end if;
  if oo.touched(format($q$delete from tracker.occurrence_outcomes
      where series_id = '50000000-0000-0000-0000-000000000001' and original_date = %L$q$, oo.d(4))) <> 1 then
    raise exception 'owner could not clear a no-show';
  end if;
end $$;
reset role;
do $$ begin
  if not exists (
    select 1 from tracker.audit_log
    where table_name = 'occurrence_outcomes' and action = 'DELETE'
      and actor_id = '00000000-0000-0000-0000-0000000000a1'
      and before ->> 'outcome' = 'no_show' and before ->> 'original_date' = oo.d(4)::text) then
    raise exception 'owner clear wrote no audit row with the old value';
  end if;
end $$;

-- No access ---------------------------------------------------------------------------
set role authenticated;
do $$
declare
  who text;
begin
  foreach who in array array['00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000b1'] loop
    perform set_config('request.jwt.claims', json_build_object('sub', who)::text, true);
    if exists (select 1 from tracker.occurrence_outcomes) then
      raise exception '% read an outcome', who;
    end if;
    perform oo.expect_error(format($q$insert into tracker.occurrence_outcomes (org_id, series_id, original_date, outcome, created_by)
      values ('10000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000001', %L, 'no_show', %L)$q$, oo.d(4), who), '42501');
    perform oo.expect_error(format($q$insert into tracker.occurrence_outcomes (org_id, series_id, original_date, outcome, created_by)
      values ('10000000-0000-0000-0000-000000000002', '50000000-0000-0000-0000-000000000001', %L, 'no_show', %L)$q$, oo.d(4), who), '42501');
  end loop;
end $$;
set role anon;
select oo.expect_error('select 1 from tracker.occurrence_outcomes', '42501');
select oo.expect_error(format($q$insert into tracker.occurrence_outcomes (org_id, series_id, original_date, outcome, created_by)
  values ('10000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000001', %L, 'no_show', '00000000-0000-0000-0000-0000000000a1')$q$, oo.d(4)), '42501');
reset role;

-- Freeze ------------------------------------------------------------------------------
-- W1 has outcomes on d(0) (delivered) and d(3) (pending, moved). Put a no-show back on today.
set role authenticated;
set request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a1"}';
do $$
declare
  s tracker.class_series;
  r jsonb;
begin
  insert into tracker.occurrence_outcomes (org_id, series_id, original_date, outcome, created_by) values
    ('10000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000001', oo.d(4), 'no_show', '00000000-0000-0000-0000-0000000000a1');

  -- A cancel of an occurrence with an outcome.
  perform oo.expect_message(format($q$insert into tracker.class_exceptions (org_id, request_id, series_id, original_date, kind, created_by)
    values ('10000000-0000-0000-0000-000000000001', gen_random_uuid(), '50000000-0000-0000-0000-000000000001', %L, 'cancelled', '00000000-0000-0000-0000-0000000000a1')$q$, oo.d(0)), 'has_outcome');
  -- A move of that occurrence (d(3) is already moved; move it again).
  perform oo.expect_message(format($q$update tracker.class_exceptions set new_date = %L
    where series_id = '50000000-0000-0000-0000-000000000001' and original_date = %L$q$, oo.d(3) - 2, oo.d(3)), 'has_outcome');
  -- A duration change, and an end before an outcome.
  perform oo.expect_message($q$update tracker.class_series set duration_minutes = 90 where id = '50000000-0000-0000-0000-000000000001'$q$, 'has_outcome');
  perform oo.expect_message(format($q$update tracker.class_series set effective_until = %L where id = '50000000-0000-0000-0000-000000000001'$q$, oo.today() - 1), 'has_outcome');
  perform oo.expect_message($q$update tracker.class_series set start_time = '17:00' where id = '50000000-0000-0000-0000-000000000001'$q$, 'has_outcome');
  perform oo.expect_message($q$update tracker.class_series set notion_staff_id = 'e0000000-0000-4000-8000-000000000002' where id = '50000000-0000-0000-0000-000000000001'$q$, 'has_outcome');

  -- split_class_series from today, which has an outcome.
  select * into s from tracker.class_series where id = '50000000-0000-0000-0000-000000000001';
  perform oo.expect_message(format($q$select tracker.split_class_series('50000000-0000-0000-0000-000000000001', %L, %L, gen_random_uuid(), '{"start_time":"17:00"}')$q$,
    oo.today(), s.updated_at), 'has_outcome');

  -- schedule_write cancel of the logged occurrence.
  perform oo.expect_message(format($q$select tracker.schedule_write('10000000-0000-0000-0000-000000000001', gen_random_uuid(), 'cancel', oo.stamps(),
    jsonb_build_object('series_id', '50000000-0000-0000-0000-000000000001', 'original_date', %L, 'expected_updated_at', %L))$q$,
    oo.d(0), s.updated_at), 'has_outcome');

  -- Not over-reaching: a subject change, and a split from next week.
  update tracker.class_series set subject = 'MHF4U Functions' where id = '50000000-0000-0000-0000-000000000001';
  select * into s from tracker.class_series where id = '50000000-0000-0000-0000-000000000001';
  perform tracker.split_class_series('50000000-0000-0000-0000-000000000001', oo.d(5), s.updated_at, gen_random_uuid(), '{"start_time":"17:00"}');
  if (select effective_until from tracker.class_series where id = '50000000-0000-0000-0000-000000000001') <> oo.d(5) - 1 then
    raise exception 'split from next week did not end the old series';
  end if;
  if (select count(*) from tracker.occurrence_outcomes where series_id = '50000000-0000-0000-0000-000000000001') <> 3 then
    raise exception 'split moved or dropped an outcome';
  end if;
  if not tracker.occurrence_is_linkable('50000000-0000-0000-0000-000000000001', oo.d(0)) then
    raise exception 'split changed whether the logged occurrence is linkable';
  end if;
end $$;
reset role;

-- The linkable helper agrees with the insert rule.
do $$ begin
  if not tracker.occurrence_is_linkable('50000000-0000-0000-0000-000000000001', oo.d(4))
     or tracker.occurrence_is_linkable('50000000-0000-0000-0000-000000000001', oo.d(1))
     or tracker.occurrence_is_linkable('50000000-0000-0000-0000-000000000001', oo.d(2))
     or not tracker.occurrence_is_linkable('50000000-0000-0000-0000-000000000001', oo.d(3))
     or tracker.occurrence_is_linkable('50000000-0000-0000-0000-000000000001', oo.d(0) + 1)
     or tracker.occurrence_is_linkable('50000000-0000-0000-0000-000000000002', oo.d(5)) then
    raise exception 'occurrence_is_linkable disagrees with the rule';
  end if;
end $$;

\o
\echo 'occurrence_outcomes: ok'
