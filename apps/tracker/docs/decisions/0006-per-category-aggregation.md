# 0006: Per-category aggregation method, default mean_of_percentages
Status: accepted
Date: 2026-10-04

## Context
Schools grade differently: some average percentages, some pool raw points, some drop the lowest score. One hard-coded formula will eventually be wrong.

## Decision
Each category stores `aggregation_method`: `mean_of_percentages` (average of earned/possible per assessment, the default) or `pooled_points` (sum earned / sum possible). Rules the engine does not support set `needs_review`; the engine still computes and returns a warning for the teacher.

## Alternatives considered
- One global method: wrong for some syllabi.
- Free-form formulas: untestable and easy to get wrong.

## Consequences
New methods (drop lowest, best N of M) are new enum values plus engine tests.
