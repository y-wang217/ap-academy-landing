# 0025: Students flag a grade with a fixed reason; the teacher resolves it
Status: accepted
Date: 2026-10-05

## Context
Phase 6: "Student flag/feedback on a grade." UX rule: student screens need zero typing except the Done button. Students never write tables directly (ADR 0015).

## Decision
- A student can flag one of their own assessments with one of three fixed reasons, no free text:
  - `score_differs` on a graded item: "My mark is different"
  - `returned` on an item awaiting a result: "I got this back"
  - `other` on either: "Something looks wrong"
- A new table `tracker.grade_flags` holds flags, at most one open flag per assessment. Students write it only through `tracker.flag_assessment(assessment_id, reason)` and `tracker.unflag_assessment(assessment_id)`, security-definer functions that check the caller owns the published, unarchived record (the ADR 0015 pattern). Students read their own flags.
- Staff read their org's flags and resolve them. `resolved_by` is set by a trigger from `auth.uid()`, not by the app. The flag is audited like the rest of the student record.
- The teacher sees open flags on the student list, the student page and next to the assessment in the course view. A flag never changes a score: the teacher fixes the score, then marks the flag resolved.

## Alternatives considered
- A note field: breaks the zero-typing rule and collects free text from minors.
- Flags as columns on assessments: loses the history of repeat flags and mixes student-written fields into a teacher-owned row.

## Consequences
"Something looks wrong" tells the teacher to ask, not what is wrong. If teachers find they always have to ask, more fixed reasons are cheap to add (an enum value plus a label).
