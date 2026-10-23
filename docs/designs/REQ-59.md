# Design: REQ-59: Console 9/12: Trial funnel and verified finance readouts

Copied from the approved card (Notion, approved at cap on 2026-10-22 18:14Z). Card:
https://app.notion.com/p/400d6ae73dd781c6a0ecfa71c7c33563

**Summary:** four console slots stop saying "Not connected yet". The first is a trial funnel: booked, delivered, closed, verified enrolments and trials whose outcome is unknown, each a separate count with its rows linked to Notion. The second is a read-only cash pulse: collected from Paid invoices only, outstanding Sent split into due and overdue, drafts and voids as counts, and credits applied. Both use a 7, 30 or 90 day Toronto window, show honest stale, error and unverifiable states, write nothing, and add no new Notion reader.
**Risk:** Medium (owner-only UI over Notion rows the REQ-54 facade already reads on the owner's own page; no write, no auth, RLS or permission change, no migration, no new destination for personal data, no file under `apps/tracker/lib/notion/`).

## Acceptance criteria

- AC1: `trialFunnel` computes four counts independently, each from its own named field and never from another count or from Stage:
  - booked = leads whose Toronto date of `Trial Booked At` is in the window;
  - delivered = the union, by `normalId` of the student, of leads whose `Trial Attended At` date is in the window and Lessons `Type = Trial` rows whose `Date` is in the window;
  - closed = leads whose `Closed At` date is in the window;
  - verified enrolments = closed leads that have at least one Invoices row with `Status = Paid` whose `Student` relation holds the lead's page id.

  Fixtures prove: a closed lead with no booked or attended date counts as closed only; a lead with Stage `Active` and no milestone counts nowhere; a lead attended by milestone and by Lessons row counts once.
- AC2: A lead is listed under "Outcome unknown" and never counted in delivered when all of these hold: its `Trial Time` instant is before now; its Trial Time date is in the window; it has no `Trial Attended At`; no Lessons `Type = Trial` row for that student is dated on or after its `Trial Booked At` date (any date when Trial Booked At is empty). A lead whose Trial Time is still in the future is in neither list.
- AC3: `cashPulse` distinguishes Draft, Sent, Paid and Void:
  - Collected is the sum of `Amount (CAD)` over Paid rows only, computed in integer cents.
  - Sent rows are outstanding, split with `invoiceStatus({ status: "Sent", due }, today)` into Due and Overdue (Sent with `Due` before today is overdue).
  - Draft and Void are counts only and never enter any sum.
  - A row whose Status is empty or another value is counted under "Status not recognised" and never summed.
- AC4: A Paid row with no `Paid On` is placed in the window by `Issued`, counted in collected, and listed with the label "paid date not recorded". A Paid row with neither Paid On nor Issued, or with no Amount, is listed ("no date" or "amount missing") and not summed. It is never treated as 0.
- AC5: The funnel and the cash pulse each render ready, empty, loading, stale, error and unverifiable variants. Every variant shows a canonical Notion link: Students & Parents for the funnel, Invoices for the cash pulse. Status mapping (Decision 18):
  - Invoices `error` makes the cash pulse `unverifiable` with "Payment records unavailable" and no figure. The funnel keeps its booked, delivered, closed and outcome-unknown counts shown, with status `stale` and only verified enrolments printed "Unverifiable".
  - Lessons `error` makes the funnel `stale` with booked, closed and verified shown, and delivered and outcome unknown printed "Unverifiable". The cash pulse is unchanged.
  - Leads `error` makes only the funnel `unverifiable` ("Trial records unavailable"). The cash pulse is unchanged.
  - A read stopped at the page cap is treated as failed for that source, by the same rules.
  - `error` ("Read failed") is shown only when the panel's own computation throws.
  - "No trials in this period" and "No verified payments" show only when every read the panel uses is complete.
- AC6: `?window=7`, `30` or `90` on `/tracker/console` selects the window, ending today in America/Toronto and counting today; missing or any other value gives 30. Each panel prints the window ("Last 30 days, Wed 23 Sep to Thu 22 Oct") and links to the other two windows, keeping `mode` and any other query parameter.
- AC7: Rates appear only as count over count with both numbers printed ("Delivered 3 of 5 booked", "Closed 2 of 3 delivered", "Verified 1 of 2 closed"), and only when both counts are available and the denominator is above 0. No `%` character appears in either panel.
- AC8: In the Operations panels each count and each money figure opens a native `<details>` list of its rows (name, date, amount where relevant, label). Each row links to its Notion page (`pageUrl`), and a list shows at most 25 rows plus an "N more in Notion" link. The cash pulse footnote reads "Card payments made through the website's payment links are not recorded in Notion and are not included." In Sales mode the same two panels show the headline figures only, with a link to `?mode=operations` and the same window.
- AC9: Tracker ADR `0073-trial-funnel-and-cash-pulse.md` exists with every section, is in the decisions `README.md` and has no em dash. It records the five count definitions, the outcome-unknown rule, the collected and outstanding rules, the paid-date fallback, the window and the status mapping.
- AC10: No file added or changed by this card writes to Notion or Supabase, reads Notion outside the facade, or names `Last Payment Date`. Nothing under `apps/tracker/lib/notion/` changes. `GET /api/console/health` still reports exactly the six REQ-54 providers.

## Approach (as approved)

1. Pure funnel `apps/tracker/lib/console/trial-funnel.ts`: `trialFunnel`, `windowOf`, types `FunnelWindow` (card: `Window`), `FunnelRef`, `FunnelCount`, `TrialFunnel`.
2. Pure cash pulse `apps/tracker/lib/console/cash-pulse.ts`: `cashPulse`, `toCents`; Sent is every row (not windowed); Draft all current; Void issued in the window or undated; credits over Paid rows counted in collected plus Sent rows issued in the window; integer cents.
3. Panel builders `apps/tracker/lib/console/finance-panels.ts`: `buildTrialFunnelPanel` and `buildCashPulsePanel` over the facade's `ConsolePanels`, using REQ-56's `readComplete`; the status tables from AC5; messages cut to 300 characters; `count`, `sourceEvidence` union, `lastSuccessfulFetchAt` the oldest of the sources.
4. `formatCents` in `format.ts` (two decimals).
5. `parseWindow` and `withParam` in `modes.ts`.
6. Components `components/console/trial-funnel.tsx` and `cash-pulse.tsx`, `variant: "full" | "headline"`, canonical Notion link through the kit's `idle` node and the body (Decision 12); `bridge.tsx` renders them for `conversion`/`trials` and `cashflow`/`finance`.
7. Page wiring in `app/console/page.tsx` from the one facade result.
8. `TUNING.consoleDetailListCap = 25`.
9. Demo results, scan list, mock fixtures, ADR 0073.

## Decisions (defaults taken)

1 no new dependencies; 2 no migration, tracker ADR 0073; 3 verified = closed plus any Paid invoice, any date; 4 delivered one per student; 5 outcome-unknown lesson match on or after Trial Booked At; 6 outstanding is every Sent row; 7 drafts all current, voids in window or undated; 8 two decimals; 9 Sales headline variant; 10 after REQ-56; 11 one shared `?window=`; 12 canonical link via `idle` plus body; 13 list cap 25; 14 no `occurrence_outcomes`; 15 no Last Payment Date; 16 a capped Lessons read is unusable; 17 demo results added; 18 status mapping (a); 19 query-gated e2e fixtures.

## Open gaps

The approver approved at cap with one open gap:

1. **AC3 is too short to test: name the actor, the input and the observable result.** Closed as: *When the owner opens `/tracker/console?mode=operations`, the cash pulse built from the facade's Invoices rows shows collected as the sum of Paid amounts only (in integer cents, two decimals), Sent rows split into "Outstanding due" and "Overdue" by `invoiceStatus()`, Draft and Void as counts that appear in no sum, and any other status under "Status not recognised", never summed.* Proven by `lib/console/cash-pulse.test.ts` (T1a to T1j and the rules block), `components/console/cash-pulse.test.ts` (no $999 or $888 in collected) and the e2e REQ-59 finance checks ($480.00 collected, Drafts 1, Voids 1, $1,512.00 due plus overdue).

## Build notes

- The type the card calls `Window` is `FunnelWindow`, so it does not shadow the DOM global.
- en-GB writes September as "Sept"; the window label maps it to "Sep" to match AC6's example.
- The headline variants also carry the canonical Notion link, so the link is present in every variant and status (AC5).
- REQ-58 (#118) adds a `canonical` header prop; this card keeps Decision 12's `idle` mechanism and has no dependency on #118. Whichever lands second resolves the shared-file merge (`page.tsx`, `bridge.tsx`, `console.css`, `demo-panels.ts`, `flows.mjs`).
- The e2e Lessons trial fixture is served only to the `Type = Trial` query, kept out of the lesson-link rows, so REQ-39's Unlinked lessons checks are unchanged.
