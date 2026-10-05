# 0024: Priority suggestions are rule-based and reach students only through the teacher
Status: accepted
Date: 2026-10-05

## Context
Plan item 14 and Phase 6: "Rule-based priority suggestions with explanations." Teacher-pinned items come first, and every suggestion carries a stored plain-language reason. Automated priorities a student can't explain lose trust, and one wrong suggestion shown straight to a student is the black box the plan warns about.

## Decision
- `lib/domain/suggestions.ts` computes suggestions on read, purely, from the same data the grade engine uses. Two rules, numbers in `tuning.ts`:
  - **Prepare:** an active course is at least `suggestGapPoints` below its target and has upcoming work, not yet marked done, due within `suggestSoonDays`. One suggestion per item: "Prepare for Unit 3 Test" with "SCH4U is 6.0% below target and Unit 3 Test is due in 4 days."
  - **Review:** the same course gap with nothing due soon. "Review Tests in SCH4U" with "SCH4U is 6.0% below target. Tests is the lowest category at 71.0%."
- Suggestions are shown to the teacher only, under the student's priorities, each with its reason. One tap adds it as an ordinary school task: unpinned, last in rank, with the reason stored in `tasks.reason` and the rule's key in `tasks.suggestion_key`.
- A suggestion whose key matches an open task is hidden. Once that task is done or removed, the rule may suggest it again if it still applies.
- Students see only tasks, so the dashboard order stays: pinned, then the teacher's rank.

## Alternatives considered
- Show suggestions straight to students under the teacher's tasks: no teacher in the loop, and no way to hide a bad one without another table.
- Store suggestions as rows on a schedule: needs a job (no queues, CLAUDE.md), and a stored suggestion goes stale the moment a score changes.

## Consequences
Teachers do one tap per suggestion. If that becomes a chore across many students, a per-student "show suggestions to the student" setting is the next step, with its own ADR.
