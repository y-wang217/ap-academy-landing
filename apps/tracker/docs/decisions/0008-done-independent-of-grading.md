# 0008: Done and grading are independent; assessment state is derived
Status: accepted
Date: 2026-10-04

## Context
Students want to mark work as done. Done must never look like a mark.

## Decision
`student_done_at` and `score_earned` are independent fields. The display state is derived, never stored: upcoming, then done (student tapped), then awaiting result (due date passed), then graded (score present). Excused is shown as its own state. The derivation lives in `lib/domain/assessment-state.ts` and takes "today" as an input.

## Alternatives considered
- A stored status column: drifts from the data it summarizes.

## Consequences
Students can only set `student_done_at`, through a narrow SQL function (0015).
