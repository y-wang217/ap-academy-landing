-- Tracker: a new syllabus version after publish (tracker ADR 0030, which
-- supersedes 0018). A confirmed version stays as history; changing a course's
-- categories writes version n+1, moves every assessment onto it, points the
-- course at it and confirms it, in one transaction. No tables change: the
-- version and category tables and their guards (0004) were built for this.

-- new_categories is the whole new syllabus, in order:
--   [{"name": "Tests", "weight": 50, "aggregation_method": "pooled_points",
--     "needs_review": false, "from": ["<category id on the current version>"]}]
-- "from" names the current categories whose assessments move into this one:
-- one for a carried-over category, several for a merge, none for a new one.
-- Every current category that holds assessments must be named exactly once.
-- Returns the new category ids in the same order.
--
-- security invoker: RLS decides who may call it, as for any staff write.
create or replace function tracker.revise_syllabus(
  target_course uuid,
  new_categories jsonb,
  revision_notes text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  course record;
  old_version uuid;
  new_version uuid;
  next_number integer;
  entry jsonb;
  pos integer;
  sources uuid[];
  moved uuid[] := '{}';
  new_id uuid;
  ids jsonb := '[]'::jsonb;
  stranded text;
begin
  -- FOR UPDATE needs the update policy, so only staff of the course's org get a row.
  select c.id, c.org_id, c.student_id, c.active_syllabus_version_id
    into course
    from tracker.courses c
   where c.id = target_course
     for update;
  if not found then
    raise exception 'course not found' using errcode = 'no_data_found';
  end if;
  old_version := course.active_syllabus_version_id;
  if old_version is null or not exists (
    select 1 from tracker.syllabus_versions v where v.id = old_version and v.confirmed_at is not null
  ) then
    raise exception 'only a confirmed syllabus gets a new version; edit an unconfirmed one in place'
      using errcode = 'check_violation';
  end if;
  if jsonb_typeof(new_categories) is distinct from 'array' or jsonb_array_length(new_categories) = 0 then
    raise exception 'a new syllabus needs at least one category' using errcode = 'check_violation';
  end if;

  select coalesce(max(v.version), 0) + 1 into next_number
    from tracker.syllabus_versions v where v.course_id = course.id;
  insert into tracker.syllabus_versions (org_id, student_id, course_id, version, notes)
  values (course.org_id, course.student_id, course.id, next_number, left(revision_notes, 500))
  returning id into new_version;

  for entry, pos in
    select e.value, (e.ordinality - 1)::integer from jsonb_array_elements(new_categories) with ordinality e
  loop
    insert into tracker.categories (
      org_id, student_id, course_id, syllabus_version_id, name, weight, aggregation_method, needs_review, position
    ) values (
      course.org_id, course.student_id, course.id, new_version,
      entry ->> 'name',
      (entry ->> 'weight')::numeric,
      coalesce((entry ->> 'aggregation_method')::tracker.aggregation_method, 'mean_of_percentages'),
      coalesce((entry ->> 'needs_review')::boolean, false),
      pos
    )
    returning id into new_id;

    sources := array(select f::uuid from jsonb_array_elements_text(coalesce(entry -> 'from', '[]'::jsonb)) f);
    if exists (
      select 1 from unnest(sources) s
       where not exists (
         select 1 from tracker.categories c where c.id = s and c.syllabus_version_id = old_version
       )
    ) then
      raise exception 'a category to carry over is not on the current syllabus' using errcode = 'check_violation';
    end if;
    if sources && moved then
      raise exception 'a current category is carried over twice' using errcode = 'check_violation';
    end if;
    moved := moved || sources;
    update tracker.assessments a set category_id = new_id
     where a.course_id = course.id and a.category_id = any (sources);
    ids := ids || to_jsonb(new_id);
  end loop;

  -- Every assessment is on the new version, or nothing is saved.
  select string_agg(distinct c.name, ', ') into stranded
    from tracker.assessments a
    join tracker.categories c on c.id = a.category_id
   where a.course_id = course.id and c.syllabus_version_id <> new_version;
  if stranded is not null then
    raise exception 'say where the work in % goes', stranded using errcode = 'check_violation';
  end if;

  update tracker.courses set active_syllabus_version_id = new_version where id = course.id;
  -- The confirm guard (0004) checks the weights sum to 100.
  update tracker.syllabus_versions
     set confirmed_by = (select auth.uid()), confirmed_at = now()
   where id = new_version;
  return ids;
end;
$$;

revoke all on function tracker.revise_syllabus(uuid, jsonb, text) from public;
grant execute on function tracker.revise_syllabus(uuid, jsonb, text) to authenticated;
