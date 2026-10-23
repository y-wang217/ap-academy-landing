# 0071: The Sales queue ranks leads by the published order, keeps opt-outs out and never sends a phone to the browser
Status: accepted
Date: 2026-10-22

## Context
REQ-57 (Console 6/12) fills the Sales `next` and `radar` slots of the founder console. Charlie, the org owner, needs one lead to contact next, why, and the context he needs before the call, without reading the Notion board. The ranking rules come from the OPS SYSTEM page as recorded in `docs/spec/founder-console/02-data-contracts.md` (sections 3.1 to 3.3 and 4). REQ-54 (ADR 0065) read Students & Parents without the Lead ID and with Major Gaps, Trial Summary and Trial: Diagnosis as presence only; the Rolodex needs the dedupe key and those texts.

## Decision
- **Published order.** `rankSalesQueue` (`lib/console/sales-queue.ts`, pure) puts each eligible lead in a base bucket: 1 Stage New; 2 Stage Working with Next Action Call or Text due at or before now; 3 Stage Awaiting Close, or Stage Trial Claimed with a Lessons `Type = Trial` row for that lead and no Closed At; 4 any other active stage due at or before now; 5 the rest. Inside a bucket: due ascending (missing last), then created time, then the normalised page id, so equal timestamps give one order. Bucket 5 sorts by Last Contact first, never contacted before any. A date-only due is 00:00 Toronto that day.
- **Override.** An item in base bucket 3, 4 or 5 whose explicit due is set and at or before now lifts to the smallest bucket among 2 and 3, below its own, that holds an item due later than it. Its reason ends with " (moved up: due earlier)". Bucket 1, fresh leads, is never jumped. So an overdue due always comes before any later due outside bucket 1.
- **Eligibility.** Only the active stages (New, Working, Trial Booked, Trial Claimed, Awaiting Close, Onboarding) enter. Lost Reason Do not contact or Duplicate excludes a row at any stage, as does Next Action None. A row with no Stage, or a New, Working, Awaiting Close or Onboarding row with no Next Action Due, is listed as an exception and never hidden.
- **Lead ID dedupe.** Lead ID is now read (trimmed, lowercased) as the server-side dedupe key: rows sharing one keep the better-ranked row and the count of merged rows is shown. The same page id twice is shown once and not counted. The key never leaves the server: `SalesViewSchema` has no such key and the wire view is parsed with it.
- **More fields read.** Grade, Subjects, and the Major Gaps, Trial Summary and Trial: Diagnosis text (cut to 1000 characters) are read for the Rolodex. A missing Major Gaps, Trial Summary or diagnosis prints "No trial report yet"; no other text is made up for a missing field. This amends [0065](0065-console-read-facade.md): Lead ID is read for dedupe, never sent to the browser, and those three texts are no longer presence only.
- **No phone.** Parent Phone and Parent Email stay unread, and there is no `tel:` link anywhere in the console. The Notion page already offers the phone; the console opens it through "Open in Notion" and Enter.
- **Browser memory only.** The last good queue is kept in browser memory in the Sales provider. A failed or truncated refresh keeps it on screen with "Refresh failed at HH:MM" or "Latest read incomplete" and a Retry button; a reload starts from a fresh read. No server cache and no browser storage, so there is no shadow copy (workspace ADR 0004).
- **Wire and cadence.** `GET /api/console/sales` returns the queue and radar views behind the health route's owner gate. The page refreshes it in step with the existing 60 s health poll, paused while the tab is hidden, and on Retry; no new timer.
- **Radar.** The radar counts queued items by the five base buckets: New, Callback due, Post-trial, Follow-up due, Later.

## Alternatives considered
- Ranking by bucket order only, with no override: an overdue follow-up would wait behind a callback due later in the day.
- Keeping the newest duplicate: it can hide the row the founder last worked; the better-ranked row is the one to call.
- A `tel:` link from Parent Phone: the spec shows contact only as deep links, and reading the phone puts it in the page for no gain.
- A server cache of the last good queue: a copy of lead rows outside Notion, against ADR 0004 and ADR 0065.
- Extending the health route with the queue: it stays statuses and times only.

## Consequences
- Each Sales refresh is one facade load, about 12 Notion requests a minute while the tab is visible.
- When the trial lessons read fails, Trial Claimed rows fall to bucket 5 and the queue says "Trial lessons unavailable; post-trial order may be incomplete".
- Console 7/12 will log outcomes; this card writes nothing. Revisit the override if founders report lifted items as surprising, and the dedupe if Lead ID stops being unique per family.
