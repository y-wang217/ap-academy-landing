# 0073: Trial funnel and cash pulse: separate evidence counts, Paid-only collected, honest failure states
Status: accepted
Date: 2026-10-22

## Context
The founder console's Trials and Finance slots (REQ-59) read the REQ-54 facade's leads, Lessons
(Type = Trial) and Invoices panels. Spec `docs/spec/founder-console/02-data-contracts.md`
sections 3.3, 3.6 and C4 say attendance comes only from evidence, Paid is the only proof of
payment, and Stripe payments are invisible to the repo. The spec leaves open how each count is
defined, what happens to a trial with no evidence, which date places a Paid row with no Paid On,
how the window is chosen, and which status a panel takes when one of its sources fails.

## Decision
- **Five count definitions, each from its own field.** In a Toronto window (`localDateOf` of each
  value): booked = leads with Trial Booked At in the window; delivered = the union, by `normalId`
  of the student, of leads with Trial Attended At in the window and Lessons Type = Trial rows dated
  in the window (a lesson with no student is its own entry, labelled); closed = leads with Closed At
  in the window; verified enrolments = closed leads with any Invoices row Status = Paid whose
  Student relation holds the lead, any date. No count is derived from another or from Stage.
- **Outcome-unknown rule.** A lead whose Trial Time instant is before now and whose Trial Time date
  is in the window, with no Trial Attended At and no Lessons trial row for the student dated on or
  after its Trial Booked At date (any date when that is empty), is listed as outcome unknown and is
  never counted as delivered.
- **Collected and outstanding rules.** Amounts are summed in integer cents. Collected is the sum of
  Amount (CAD) over Paid rows only. Outstanding is every Sent row, whatever its date, split into
  due and overdue with `invoiceStatus()`. Draft (all current) and Void (issued in the window or
  undated) are counts only. Any other status is "Status not recognised" and never summed. A row
  with no amount is listed as "amount missing", never summed and never 0. Credits applied covers
  Paid rows counted in collected plus Sent rows issued in the window.
- **Paid-date fallback.** A Paid row with no Paid On is placed by Issued and labelled
  "paid date not recorded"; with neither date it is listed as "no date" and not summed.
- **Window.** `?window=7`, `30` or `90`, default 30, one window for the funnel and the cash pulse,
  ending today in America/Toronto and counting today. Links to the other windows keep every other
  query parameter.
- **Status mapping.** A source is usable when the facade's `readComplete` says so (ready, empty, or
  stale only for name joins). A failed or page-capped read of a panel's own source makes it
  unverifiable with no figures: the cash pulse on Invoices ("Payment records unavailable"), the
  funnel on leads ("Trial records unavailable"). A failed Lessons or Invoices read marks only the
  funnel counts that need it unverifiable and makes the funnel stale, so booked and closed stay
  shown. Error ("Read failed") is kept for a panel whose own computation throws. Empty is shown only
  from complete reads.
- Rates are shown only as count over count with both numbers printed, never as a percentage. The
  Sales slots show a headline of the same views and link to Operations.

## Alternatives considered
- Deriving delivered or closed from Stage: rejected; Stage moves for many reasons and is not
  evidence of a trial or a close.
- Counting a trial past its Trial Time as delivered: rejected (spec 3.3); it is unknown.
- Matching outcome-unknown lessons at any date: rejected, an old trial lesson would hide a missed
  rebooked one.
- Error on an Invoices failure, or the whole funnel unverifiable on any Lessons or Invoices
  failure: rejected; the first loses the card's unverifiable wording, the second hides the booked
  and closed counts a failed Invoices read does not affect.
- Reading Students & Parents Last Payment Date as reported evidence: rejected for now; no reader
  holds it, and collected stays proof-only.

## Consequences
- While Invoices fail, the cash pulse drops out of the mode's "N of M connected" figure.
- Card payments through the landing site's payment links never appear; the panel's footnote says so.
- Pagination at the facade's page cap withholds totals rather than undercounting them.
- Revisit if trial evidence should also come from `tracker.occurrence_outcomes`, or if Stripe data
  reaches the repo.
