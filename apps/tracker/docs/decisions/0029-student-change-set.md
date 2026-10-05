# 0029: One change set covers the whole student; every teacher edit is an item in it
Status: accepted
Date: 2026-10-05

## Context
ADR 0027 gave AI and manual edits one shape, but only for two operations on
one course. The step 9 prompt asks for intake that fills in a student from a
trial lesson's notes or transcript, and for "describe what you want to
change" as the main way to interact. Both need the change set to reach
everything the wizard and the course page can write.

## Decision
- **Scope.** `lib/data/change-set.ts` defines a change set for one student.
  Items: `set_goal`; `add_course`, `update_course`, `remove_course`;
  `add_category`, `update_category`, `remove_category`; `add_assessment`,
  `update_assessment`, `remove_assessment`; `add_task`, `update_task`,
  `remove_task`. Update items carry only the fields that change. The bounds
  are the ones the forms and the database use.
- **References inside a set.** An item that needs a row another item in the
  same set creates names it as `$k`, the index of that earlier item. So one
  set can add a course, its categories and its first marks. Validation
  checks every `$k` points at an earlier item of the right kind; apply
  resolves them as rows are written.
- **Context and checks.** `loadStudentContext` loads the student's courses,
  syllabus versions, categories, assessments and tasks. `itemProblem` refuses
  an item whose row is not this student's, a category not on a course's
  active syllabus, and any category change on a confirmed syllabus (ADR
  0018) before the database does, with a message the preview can show.
- **Manual edits.** Goal, course, target, category, assessment and task
  actions in `app/actions/teacher.ts` build a one-item set and call
  `applyChangeSet`. Student details (name, email, grade), publish, archive,
  task reordering and flag resolution stay as direct actions: they are not
  data the model drafts.
- **What the model sees and says.** The prompt lists the student as refs
  (`G` for the goal, `C1..` courses, `K1..` categories, `A1..` assessments,
  `T1..` tasks), never ids, and never name, email, school or program beyond
  what the goal already holds. The model answers with the same op names,
  refs for existing rows and a `new_ref` of its own choosing for rows it
  adds; `toDraftItems` turns those into `$k` references and drops anything
  that does not map. Each item carries `certain`: the preview ticks certain
  items and leaves uncertain ones unticked and marked, so review is a glance
  rather than re-entry.
- **Where.** One composer component on the student page, each setup step and
  the course page. On the course page it tells the model which course the
  teacher is looking at, nothing more.

## Alternatives considered
- Nest categories and marks inside `add_course`: fewer refs, but a second
  shape for the same rows, and no way to add marks to a new course from a
  later paste.
- Positional refs for the model too: harder for it to keep straight than a
  name it chose.
- A separate "instruction" route: same output, same preview, same apply; the
  only difference is a sentence in the prompt.

## Consequences
- `tracker.ai_drafts.course_id` becomes nullable (migration 0007).
- Items are still applied one by one (ADR 0027). A failure after a
  `remove_course` has already run cannot be undone by the app; the audit log
  has the rows.
- The wizard and the course forms remain the backup path and are untouched
  in appearance.
