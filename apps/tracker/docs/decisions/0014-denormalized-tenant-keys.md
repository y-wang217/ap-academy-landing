# 0014: org_id and student_id on every child row, enforced by composite foreign keys
Status: accepted
Date: 2026-10-04

## Context
RLS policies that walk joins (assessment to course to student to org) are slow to write, easy to get wrong, and can recurse.

## Decision
Every child table carries `org_id` and `student_id`. Composite foreign keys (`(student_id, org_id)` to students, `(course_id, student_id)` to courses, `(category_id, course_id)` to categories) make an inconsistent copy impossible. Policies then check one row's own columns.

## Alternatives considered
- Join-based policies: correct but fragile and slower.

## Consequences
Inserts must supply the parent's ids; the data layer does this.
