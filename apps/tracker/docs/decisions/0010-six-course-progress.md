# 0010: Six-course progress shows the graded count, never a partial average as final
Status: accepted
Date: 2026-10-04

## Context
Admission averages use six courses. Showing the average of three graded courses as "your six-course average" misleads.

## Decision
The six-course view reports `graded_count / 6`, the average of the graded courses, and the target. It is labelled as the average of the graded courses until all six have grades.

## Alternatives considered
- Hide the average until six are graded: the student sees nothing useful for most of the year.

## Consequences
The label rule lives in the domain module and is tested.
