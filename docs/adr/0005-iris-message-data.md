# ADR 0005: Iris message data is stored for 90 days; Notion parent fields are still never copied

- **Status:** Accepted
- **Date:** 2026-10-20
- **Decided by:** Charlie (REQ-42 design, Decision 3)
- **Implemented by:** REQ-42 (Iris 2/9)
- **Amends:** part of ADR 0004 (parent fields never persist outside Notion and Gmail)

## Context

ADR 0004 says parent name and parent email are read live and uncached from
Notion Students & Parents, never stored in Supabase (Iris spec decision 28).
Iris (REQ-42) reads the mail parents send to charlie@apacademy.ca and has to
keep each message, with its From address, so Charlie can see what needs him
and later cards can classify and draft replies. A sender's From address is the
same string as a Parent Email when the sender is a parent. Left as is, ADR
0004 would forbid storing the address of any email Iris reads.

## Decision

- Notion's Parent Email and Parent Name are never copied. Iris reads them
  live and uncached in `apps/tracker/lib/notion/parents.ts`, once per run,
  only to match a sender in memory. Matching stores Notion page ids only
  (`iris.threads.notion_student_ids`).
- The From address and display name of a stored email are message data, not
  a synced people field. They come from the email header, live in the `iris`
  schema for at most 90 days, are readable by the org owner only, and are
  purged on schedule (tracker ADR 0057).
- Mail from an unknown or automated sender is stored without a body.
- ADR 0004's decision text is unchanged. Its status line now reads
  "Accepted, amended in part by ADR 0005", and its Readers and writers table
  lists `parents.ts` and the Iris run route as existing.

## Options rejected

- **Store no address, only a keyed hash, and read From from Gmail on
  display.** The unknown-sender list would cost a Gmail read per row, and the
  classifier needs the message anyway.
- **Edit ADR 0004 in place.** Accepted ADRs are not edited; they are amended
  or superseded by a new one.

## Consequences

- The privacy page (REQ-41) describes what Iris keeps and for how long.
- A later card that wants to keep any Notion parent field in Supabase still
  needs its own ADR.
