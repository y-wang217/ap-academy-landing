# 0021: One goal per student
Status: accepted
Date: 2026-10-04

## Context
The spec's goal is a single target program and six-course average. The data model does not say whether a student can have several.

## Decision
`tracker.goals` has a unique `student_id`. Changing a student's target edits that row; the audit log keeps the history.

## Alternatives considered
- Several goals per student: no screen in the spec shows more than one.

## Consequences
Supporting a second-choice program later means dropping the unique constraint and adding a `rank`.
