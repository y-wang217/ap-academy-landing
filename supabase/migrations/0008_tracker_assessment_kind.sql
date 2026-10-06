-- Student Tracker, build step 10: the student dashboard redesign (tracker
-- ADR 0030).
--   * assessments.kind: an assignment or a test. An assignment has a due
--     date; a test has the date it is held. Never both. graded_at stays an
--     entry stamp for internal use and is never shown to a student.
--   * assessments.held_on: the day a test is written.
-- Existing rows become assignments and keep their due dates. Both dates may
-- still be null at the database level (old rows, AI drafts that could not
-- read a date); the teacher's form requires one.
-- Tested by supabase/tests/tracker_dashboard.sql.

create type tracker.assessment_kind as enum ('assignment', 'test');

alter table tracker.assessments
  add column kind tracker.assessment_kind not null default 'assignment',
  add column held_on date,
  add constraint assessments_one_date check (
    (kind = 'assignment' and held_on is null) or (kind = 'test' and due_date is null)
  );

create index assessments_student_held_idx on tracker.assessments (student_id, held_on);
