# ADR 0007: The Founder Console logs call outcomes into Notion people records

- **Status:** Accepted
- **Date:** 2026-10-23
- **Decided by:** Charlie, by approving the REQ-61 design (Risk High)
- **Implemented by:** REQ-61 (Console 7/12)
- **Amends:** ADR 0004, "Nothing is written back to Notion except the existing generated Weekly Schedule summary"
- **Card:** REQ-61

## Context

ADR 0004 makes Notion the editor of record for people and lets the tracker
write back only the generated Weekly Schedule summary. After a call, the
founder records the outcome in Notion by hand: a "Log a Touch" form, then
edits to the lead row, following the OPS SYSTEM rules recorded in
`docs/spec/founder-console/02-data-contracts.md` section 4 (allowed Stage
transitions, contracts A to D, the two-slot cadence). The Founder Console
(ADR 0006) already ranks the next lead (REQ-57). Logging the outcome by hand
is slow and easy to get wrong: a missed Attempts count, a Stage moved along a
disallowed edge, a milestone overwritten.

## Decision

- The console may create Touches rows and update exactly these Students &
  Parents properties: Stage (only along the allowed transitions), Owner,
  Next Action, Next Action Due, Attempts, Last Contact, Lost Reason, and the
  milestone stamps Contacted At, Trial Booked At and Closed At (set only when
  empty, never cleared), plus the `Last Txn` marker. Eleven keys in all.
- It writes only after a verified owner request (`POST /api/console/outcomes`,
  owner gate, cross-site check, strict body), and only the side effects of
  the transition table in tracker ADR 0076.
- Everything ADR 0004 says is never written stays never written. Parent
  fields, rates, invoices, Hours Paid, Last Payment Date, Lesson Cadence,
  Sales Notes, Notes and Weekly Schedule are never written by the console.
  "Paid" and "Enrolled" are never outcomes: Won needs Last Payment Date
  already set in Notion.
- A handoff contract (A for Trial booked, C for Won) whose fields are empty
  is refused with their names and a link to the lead. The console never fills
  a contract field.
- The one writer is `apps/tracker/lib/notion/lead-writer.ts`. It reads
  contract fields as presence only, so their values never leave that file.
- Each write is logged in `tracker.console_transitions` (migration 0029) by
  `request_id`, without the note text, and each finished or uncertain
  transition leaves one `tracker.audit_log` row.
- Nothing is sent: no SMS, email, dial or booking API. Call and text stay
  with the founder's phone; the console links to the Notion page.

## Options rejected

- **Keep logging by hand in Notion:** no change to ADR 0004, but the
  cadence and transition rules stay manual and error-prone.
- **Write through a Notion automation or button:** keeps the write inside
  Notion, but cannot check the stale state the founder saw, cannot be made
  idempotent by request, and leaves no transition log.
- **Copy leads into Supabase and edit them there:** option C of ADR 0004,
  which needs an editing UI and moves the skills off Notion. Not now.

## Consequences

- ADR 0004 now reads "amended in part by ADR 0005 and ADR 0007", and its
  Readers and writers table lists `lead-writer.ts`.
- Notion needs two hand-made text properties before any outcome is logged:
  `Txn ID` on Touches and `Last Txn` on Students & Parents. Until then the
  route answers 503 `notion_not_ready` and writes nothing.
- The integration needs update access on Students & Parents and insert
  access on Touches.
- Revisit if leads move to Supabase (ADR 0004 option C), if another card
  wants to write a field not listed above, or if a setter or teacher card
  logs outcomes for its own leads.
