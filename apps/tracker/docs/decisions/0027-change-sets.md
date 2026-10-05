# 0027: Assessment edits share one change-set shape, AI and manual alike
Status: accepted; scope widened by 0029
Date: 2026-10-05

## Context
ADR 0011 and plan item 12: "Manual edits use the same change-set shape." Two write paths for grades would drift: one could accept a score the other refuses.

## Decision
`lib/data/change-set.ts` defines a change set for one course: a list of `add_assessment` and `set_score` items. `applyChangeSet` validates every item (the same bounds as the forms), checks each id belongs to the course and each category to its active syllabus, then writes. The manual "Add assessment" and "Save score" actions build a one-item change set and call it; the AI confirm calls it with the teacher's selection.

## Alternatives considered
- Separate AI write code: two sets of rules for the same rows.

## Consequences
Items are applied one by one, not in one transaction (PostgREST has no multi-statement transaction from the client). A failure stops at that item and reports how many were saved, which the preview shows. Each saved item is audited.
