# 0034: Occurrences are computed from a series plus one exception row each
Status: accepted
Date: 2026-10-14
## Context
Scheduler cards 3/8 to 8/8 read and write teacher availability and planned classes through one server API. Classes repeat weekly, are moved or cancelled one at a time, and are sometimes changed "from here on". Later cards link delivered lessons to a specific occurrence, so its identity must survive every edit.
## Decision
- **Wall-clock storage.** Dates and times are local `date` and `time` columns in America/Toronto, never `timestamptz`. They become UTC instants only when a response is built (`localToUtc`, `Intl` only, no date library), so a 17:00 class stays 17:00 across DST. A time in the spring gap shifts forward by the gap; an ambiguous fall-back time takes the earlier offset.
- **Computed occurrences.** Nothing generated is stored. `expandOccurrences` recomputes dates from `class_series` and applies `class_exceptions`, so a cancellation holds through any regeneration and there is nothing to keep in sync.
- **Identity.** An occurrence key is `<seriesId>:<originalDate>`, where `originalDate` is the date the series pattern produced. Moving or cancelling never changes it.
- **One exception per occurrence.** `unique (series_id, original_date)` makes cancel and move idempotent at the database. Duration and teacher cannot be overridden for one occurrence; use "this class and future".
- **Splits.** "This class and future" calls `tracker.split_class_series()`, one transaction: the old series ends the day before, a new one (`split_from` set) starts on its weekday in that week (the following week if that day is before the split date), and the old series' exceptions on or after the split are re-keyed to the same ISO week of the new weekday. A moved occurrence keeps its absolute new date and time. An exception that would land before the new start is left behind, inert, on the old series. The pure `planSplit` mirrors the function and is unit-tested.
- **Idempotent creates.** Every insertable table has `request_id` with `unique (org_id, request_id)`; a retried create reads back the first row (`200`, first is `201`). A retried split returns the same new series.
- **Version token.** No optimistic-concurrency pattern existed. `updated_at` (kept by `tracker.set_updated_at()`) is the token: edits send `expectedUpdatedAt` and a mismatch is `409 stale` with nothing written. A "this class only" edit checks the series' token; it does not bump it.
- **Students are Notion page IDs.** Classes reference the Notion Students & Parents page ID, not `tracker.students.id`, because most scheduled students are not grade-tracker students. Only the ID shape is checked here; 3/8 adds the narrow Students read and existence validation.
- **Permissions.** Teachers read and write only their own availability and read only their own classes; class writes are owner-only (RLS, no delete policy). Endpoints also go through the 0033 guard.
## Alternatives considered
- Materialised occurrence rows: drift from the rule, need regeneration and cancellation bookkeeping.
- `timestamptz` plus a zone: a recurrence rule in UTC shifts an hour at DST.
- Rejecting splits while future exceptions exist: blocks routine edits; re-keying by ISO week is predictable and tested.
## Consequences
Migration 0010 needs Charlie's sign-off before it reaches the live database. There is no UI in this card. Deleting a series is not possible; end it by splitting or cancelling.
