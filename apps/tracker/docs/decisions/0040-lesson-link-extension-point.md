# 0040: A delivered lesson will point at a class occurrence through one reference, and nothing is wired yet
Status: accepted
Date: 2026-10-14

## Context
Scheduler 8/8 asks the module to connect to lesson logging without disturbing it. The tracker has no lesson-logging flow: nothing under `apps/tracker` reads or writes the Lessons data source. Teachers log lessons through the Notion "Log a Lesson" form straight into Lessons. Lessons also has no property that could hold a link to a class occurrence, and adding one is a Notion schema change.

## Decision
- **No wiring now.** The card leaves an extension point and links nothing. Existing lesson logging is untouched.
- **One reference.** `occurrenceRef` in `lib/domain/schedule/lesson-link.ts` is `sched:<seriesId>:<originalDate>`: the occurrence key from ADR 0034 with a self-describing prefix, so the value makes sense if it is later stored in a Notion text property. `parseOccurrenceRef` returns `null` for anything else.
- **A past reference is final.** Edits and splits of past occurrences are refused (`past_occurrence`), moves and cancels keep the key, and a "this and future" split re-keys only dates on or after the split. So the reference of a class that has happened never goes stale. `isLinkable` encodes the rule: not cancelled, dated today or earlier.
- **The contract is a type.** `LessonLinkPort` has no implementation. Whoever builds it must find first (a retry is a no-op), write only the one link property, never touch Paid to Teacher, Pay Period, Duration or Teacher, and link only linkable occurrences.
- **Proof that nothing leaks.** `payout-guardrails.test.ts` drives create, move and cancel and inspects every outbound write. The e2e run checks the mock Notion journal and a before/after snapshot of every other tracker table.

## Alternatives considered
- Add a text property "Class occurrence" to Lessons and a "Log this class" button that creates the Lessons row with the reference. Needs a Notion schema change and writes to Lessons, so it would be its own High-risk card.
- Keep logging in the Notion form and add a matcher that fills the reference by teacher, student and date. No schema change in the tracker, but a heuristic that can guess wrong on payout-adjacent data.

## Consequences
- Nothing imports `lesson-link.ts` yet; a test keeps it that way until a card wires it.
- Choosing between the two ways to finish it is the owner's call, on a later card.
