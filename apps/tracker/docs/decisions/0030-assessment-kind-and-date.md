# 0030: An assessment is an assignment with a due date or a test with a held date
Status: accepted
Date: 2026-10-06
## Context
The dashboard redesign (step 10) plots a course's grade over time and turns an item to "awaiting result" once it has happened. Both need the day a test was written. `graded_at` is when the tutor typed the mark in, which can be weeks later and moves again on every correction; the owner keeps it as an internal adherence stamp and never for anything a student sees. The only date the table held was `due_date`, optional and labelled for assignments.
## Decision
- `assessments.kind` is `assignment` or `test`. An assignment carries `due_date`; a test carries `held_on`, the day it is written. A check constraint forbids a row from carrying both.
- The teacher's add form is a two-way toggle that shows the matching date field, and that field is required. The database still allows both dates to be null, for rows that predate this and for AI drafts that could not read a date; such rows show "No date" to the teacher and stay off the chart.
- `lib/domain/assessment-date.ts` is the one place the two columns merge. State, upcoming lists, suggestions and the chart all read it. Nothing player-facing reads `graded_at`.
- AI drafts carry `assessment_kind` and `held_on`. A date the model puts in the wrong field is still used under the kind it gave.
## Alternatives considered
- One `happens_on` column: rejected by the owner. A due date and a test date are different facts to a teacher, and the toggle makes the entry honest.
- A `held_on` column beside a still-required `due_date`: two dates to fill in that are usually the same day.
- Plotting on `graded_at`: every mark entered in one onboarding sitting lands on one day, and a corrected mark jumps.
## Consequences
Migration `0008_tracker_assessment_kind.sql` must be applied live with sign-off before the dashboard ships. Editing an item's kind or date after creation is still an AI-draft-only path (the manual score form changes marks only), as it was for the due date. `kind` here is unrelated to `tasks.kind`.
