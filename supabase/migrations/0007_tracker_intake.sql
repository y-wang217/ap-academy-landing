-- Student Tracker, build step 9: AI intake from photos, transcripts and
-- instructions (tracker ADRs 0028, 0029).
--   * students.student_number: the number a teacher writes on trial-lesson
--     notes instead of the student's name. Assigned per org on insert, never
--     by the app.
--   * ai_drafts: a draft now covers the whole student, so course_id is
--     optional; input_chars may be 0 when only files were sent; input_files
--     counts the attachments.
-- Tested by supabase/tests/tracker_intake.sql.

-- Student numbers -----------------------------------------------------------------

alter table tracker.students add column student_number integer;

with numbered as (
  select id, row_number() over (partition by org_id order by created_at, id) as n
  from tracker.students
)
update tracker.students s set student_number = numbered.n
from numbered where numbered.id = s.id;

alter table tracker.students
  alter column student_number set not null,
  add constraint students_student_number_check check (student_number >= 1),
  add constraint students_org_number_key unique (org_id, student_number);

-- Next free number in the org. The advisory lock serialises inserts per org
-- so two teachers adding students at once cannot draw the same number.
create or replace function tracker.assign_student_number()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform pg_advisory_xact_lock(hashtext('tracker.students.student_number'), hashtext(new.org_id::text));
  select coalesce(max(student_number), 0) + 1 into new.student_number
  from tracker.students where org_id = new.org_id;
  return new;
end;
$$;

revoke all on function tracker.assign_student_number() from public;

create trigger students_number before insert on tracker.students
  for each row execute function tracker.assign_student_number();

-- The number is read-only once assigned.
create or replace function tracker.keep_student_number()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.student_number := old.student_number;
  return new;
end;
$$;

revoke all on function tracker.keep_student_number() from public;

create trigger students_number_kept before update on tracker.students
  for each row execute function tracker.keep_student_number();

-- AI drafts cover the whole student ---------------------------------------------------

alter table tracker.ai_drafts
  alter column course_id drop not null,
  drop constraint ai_drafts_input_chars_check,
  add constraint ai_drafts_input_chars_check check (input_chars between 0 and 200000),
  add column input_files smallint not null default 0 check (input_files between 0 and 20),
  add constraint ai_drafts_has_input_check check (input_chars > 0 or input_files > 0);

create index ai_drafts_student_created_idx on tracker.ai_drafts (student_id, created_at desc);

grant insert (org_id, student_id, course_id, input_chars, input_files) on tracker.ai_drafts to authenticated;
