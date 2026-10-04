# 0015: Students write only through narrow SQL functions
Status: accepted
Date: 2026-10-04

## Context
Students may set exactly two things: done on an assessment and done on a task. RLS restricts rows, not columns, so an UPDATE policy for students would also let them change their own scores.

## Decision
Students have no INSERT, UPDATE or DELETE policies on any tracker table. `tracker.set_assessment_done(id, done)` and `tracker.set_task_done(id, done)` are security-definer functions that check the caller owns the published student record and change only the done timestamp.

## Alternatives considered
- Column-level grants: apply to the whole `authenticated` role, which teachers also use.
- A trigger that rejects other columns for students: works, but is harder to read and test than a function.

## Consequences
Any new student action is a new function with its own RLS test.
