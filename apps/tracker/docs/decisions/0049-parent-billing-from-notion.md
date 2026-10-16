# 0049: Parent Billing reads from Notion, gated on the child's Notion link
Status: accepted
Date: 2026-10-16

## Context
REQ-25 fills the parent Billing tab. Invoices and missed-session credits live in Notion (Invoices, Missed Sessions & Credits, both under Students & Parents), not in Postgres, and Charlie decided the tracker reads them and never writes them. Notion has no row security for the tracker's integration token, so a parent's billing data (amounts, credits, invoice PDFs, a sibling's first name) reaching the parent's browser is a new destination guarded by app code. The card left open which credits sit on an invoice's "Credit applied" line, how Overdue is derived, how a PDF is delivered and which file hosts are trusted.

## Decision
- **Gate.** The child's `students.notion_student_id`, read on the parent's own client under the 0016 policy "parent reads linked students", is the only key. Both list queries filter on `Student` `relation.contains` that ID, and the parser drops any row whose `Student` relation does not contain it. Only an owner can change that link (ADR 0048, migration 0017), so a teacher cannot repoint a family's billing.
- **Allowed properties.** Every request names its properties with `filter_properties`. Invoices: Invoice, Month, Amount (CAD), Credit Applied (CAD), Credits, Issued, Due, Status, PDF, Student. Credits: Date, Course, Hours, Rate (CAD), Credit Status, Applied To, Student. The child's page: Hourly Rate (CAD), Lesson Cadence, Billing Family. A sibling's page: Student Name, Billing Family. The sharer lookup: Invoice, Student, Status. Zod drops anything else, and a source scan (`BILLING_FORBIDDEN` in `test/parent-guardrails.ts`) keeps contact, sales, discount, internal comment and lesson property names out of the billing files.
- **Visible invoices.** Draft and Void are excluded in the query and again at the parse. Overdue is derived: Status Sent and Due before today's America/Toronto date. Paid stays Paid.
- **Netting display.** An Open credit nets off the next invoice (OPS rule, 2026-10-15), so it is never on any invoice's "Credit applied" line. That line lists Applied credits whose `Applied To` names the invoice number (text before the first comma) or which sit in the invoice's `Credits` relation. The amount shown is always the invoice's own Credit Applied (CAD); the tracker never computes an invoice total. Open total sums Hours × Rate over Open rows.
- **Shared invoices.** One row per student. When another visible row has the same Invoice number and its student's Billing Family matches the child's non-empty one (trimmed, case-insensitive), the child's row says "Shared invoice with <first name>". Only the sibling's first name leaves Notion, siblings are never summed, and a failed sibling lookup only drops the line.
- **PDF proxy.** `GET /tracker/parent/[studentId]/billing/invoices/[invoiceId]` re-checks the parent, the published child, the link, the page's data source, the Student relation and the Status, then fetches the Notion-hosted file (`type: "file"` only; `external` refused) from `*.amazonaws.com`, `*.notion.so` or `*.notion-static.com` over https, or the `NOTION_API_BASE` origin when that e2e override is set. `redirect: "error"`, a 15 s timeout and a 10 MB cap; the body is read under the cap before the response starts, so a failure is a bare 502, never a truncated 200. Responses are `private, no-store`, `nosniff` and `no-referrer`. The signed file URL is fetched per click and never sent to the browser, stored or logged. Every refusal is a bare 404.
- **No caching** of billing rows or file URLs. Only property-ID maps (schema, no row data) are cached for 300 s in `lib/notion/cached.ts`.

## Alternatives considered
- **Copy invoices into Postgres with RLS.** Real row security, but a second copy of financial data to keep in sync and a migration; the card keeps Notion as the source.
- **302 to the signed file URL.** Simpler, but the link reaches the browser and history, and lives about an hour.
- **Sum a family's rows on one tab.** Shows a sibling's share to the other child's view; one row per student is how the run bills.
- **Use the `Credit (CAD)` formula.** Hours and Rate are already listed fields; the formula adds a property for the same number.

## Consequences
- The Notion integration must be shared with Invoices and Missed Sessions & Credits before deploy. Without that, Notion answers 404 and the tab shows "Could not load billing. Try again later."; nothing leaks.
- A page load makes three core Notion requests in parallel, one sharer query and up to four sibling GETs. A 429 on a core read shows the error state.
- An invoice with more than 25 linked credits relies on `Applied To` for the rest, which is the rule's authority anyway.
- A mistyped Invoice number shared across two families shows nothing, because the Billing Family keys differ.
