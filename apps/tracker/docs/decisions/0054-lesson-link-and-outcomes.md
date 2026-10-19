# 0054: Log this class writes the class reference into Lessons, the owner reconciles form-logged rows, and outcomes live in the tracker
Status: accepted
Date: 2026-10-19

Supersedes [0040](0040-lesson-link-extension-point.md).

## Context
ADR 0040 left `LessonLinkPort` as a type with nothing behind it and named two ways to finish it, leaving the choice to Charlie: (a) a property on Lessons holding the occurrence ref, filled by a "Log this class" action in the teacher's week; or (b) keep the Notion "Log a Lesson" form and add an owner-only list where Charlie links form-logged rows by hand. Planned classes and delivered lessons were never connected, so nothing could say which class was taught, missed or made up (readiness review F07, card REQ-39).

## Decision
- **Option (a) plus the reconciliation list from (b).** Lessons gets one Text property named exactly `Class occurrence`, added by Charlie by hand. It holds `sched:<seriesId>:<originalDate>`. Nothing else on Lessons changes.
- **Log this class** (teacher of the series, or the owner) on a past, not cancelled class: find the Lessons row whose `Class occurrence` equals the ref; create one only when there is none, with exactly six properties (`Lesson` "Logged from schedule", `Date` the actual date, `Teacher`, the student relation, `Duration (hrs)` minutes / 60 to 2 decimals, `Class occurrence`). `Subject` and `Type` are not written; the teacher sets them in Notion.
- **Unlinked lessons** (owner only): for a date range, every past class with no outcome next to the form-logged rows with an empty `Class occurrence` and the same teacher, student and date. Charlie links one row with one click, which patches `Class occurrence` alone. Name matching is never applied, and nothing is linked without the click.
- **Outcomes in the tracker.** `tracker.occurrence_outcomes` (migration 0023) keeps one row per class: `delivered` (with the Lessons page ID, or pending while a log is in flight) or `no_show`. The row is the claim that makes a retry or a double click create at most one Lessons row, and the week view's cache. A no-show is a state, never a forfeit or a credit, and is never written to Notion.
- **Corrections** are owner deletes. A delivered row's lesson loses its ref first, but only when it still holds this ref; the audit trigger keeps the old row.
- **Freeze.** An occurrence with an outcome cannot be cancelled, moved or have its series' teacher, student, start, time or duration changed, and its series cannot end before it. The database refuses with `has_outcome`, so a ref in Notion never points at a class that moved away.
- **Parents** see none of this until Charlie opens delivered states to them.

## Alternatives considered
- **(a) alone.** Rows sent through the form would stay unlinked forever.
- **(b) alone.** Every lesson would need Charlie's click; the teacher already knows which class they taught.
- **Notion only, no local row.** One Lessons query per week load would be slow, count toward Notion's rate limit, and give no claim against double clicks.
- **Matching by name or by date alone.** Readiness review F05: wrong links on the payout-adjacent database. Matching is exact on the Notion page IDs of teacher and student, and the date.

## Consequences
- The tracker writes to Lessons for the first time. `lib/notion/lessons.ts` has exactly two write shapes, and `payout-guardrails.test.ts` drives every lesson path through it to prove it. PRs touching `lib/notion/` stay human-merged.
- The integration needs read, insert and update access on Lessons. Until `Class occurrence` exists, the lesson routes answer 503 `lessons_not_ready` before any write (operator guide, Lesson logging).
- A teacher could still also send the form for a logged class. The copy tells them not to, and "Possible double logs" shows same-day rows next to a logged class before pay.
- Revisit if the Notion form is retired, or when Charlie opens delivered states to parents.
