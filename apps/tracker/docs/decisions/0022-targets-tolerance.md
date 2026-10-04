# 0022: Course targets may differ from the six-course target by up to 0.5 points before warning
Status: accepted
Date: 2026-10-04

## Context
"Warn if course targets don't average to the six-course target." The spec leaves the tolerance open, and an exact match is unrealistic with whole-number targets.

## Decision
The wizard warns when the average of the six course targets differs from the six-course target by more than 0.5 percentage points. The number lives in `lib/domain/tuning.ts`. It is a warning; the teacher can continue.

## Alternatives considered
- Exact match: warns on every rounding.

## Consequences
Change the tuning value if it warns too often or too rarely.
