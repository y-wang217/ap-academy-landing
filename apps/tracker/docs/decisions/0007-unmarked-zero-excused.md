# 0007: Unmarked (null), zero and excused are different
Status: accepted
Date: 2026-10-04

## Context
Treating "not marked yet" as zero makes grades look worse than they are. Treating a real zero as missing makes them look better.

## Decision
`score_earned = null` means unmarked and is excluded. `0` is a real zero and counts. `excused = true` removes the assessment from the calculation whatever its score. `score_possible > 0` and `score_earned >= 0` are database checks. Scores above possible (bonus) are allowed and produce a warning.

## Alternatives considered
- A single status column: loses the difference between a zero and an unmarked item.

## Consequences
The UI must make these three states visibly different.
