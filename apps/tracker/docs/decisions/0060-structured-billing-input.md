# 0060: The monthly billing input is a versioned export with derived charge states, checked against the text count
Status: accepted
Date: 2026-10-21

## Context
The monthly billing run (`ap-academy-monthly-admin`, outside this repo) counts sessions from Weekly Schedule text. ADR 0035 records what that text cannot say: cancellations, moves, one-offs, makeups and `from`/`until` dates. Charlie reconciles those by hand from `/monthly-review`. Since REQ-39 the tracker also knows each class's outcome (delivered or no-show), so the five facts scheduled, delivered, billable, invoiced and paid can start to be told apart in structured form. Readiness finding F01, card REQ-40.

## Decision
- One pure function, `chargeState` in `lib/domain/billing/charge-state.ts`, derives a charge state per class: `chargeable`, `credit_owed`, `made_up`, `forfeit_pending` or `not_charged`, with an `unconfirmed` flag for a past class with no outcome and for a delivered claim whose Lessons row is not written yet. The rules table is in `docs/billing-input.md`; `BILLING_RULES_VERSION` is 1.
- Every cancellation counts as with notice (`credit_owed`) until a delivered makeup replaces it (`not_charged`, and the makeup is `made_up`), so a credited class is never charged twice. A no-show is `forfeit_pending`: Charlie decides. Trials and extra classes are charged like any class.
- `GET /api/scheduler/monthly-billing-input?month=YYYY-MM`, owner only, returns every class of the month per adopted student under a strict schema with `schemaVersion` 1. IDs only: no names, emails or money. The fixture month in `test/fixtures/billing-input/` and the schema are the contract with the skill; a test pins both versions to hashes of the expected JSON and the field list.
- `/tracker/scheduler/billing` sets the count the text method would produce (the `parse_slot` port, every matching weekday in the month) next to the structured count and names each difference by reason.
- It reads only local tables (`class_series`, `class_exceptions`, `schedule_summaries`, `occurrence_outcomes`) and the local people copy, never Notion, and writes nothing. Without the outcome store it answers 503 `lessons_not_ready` rather than charge every past class.
- The skill does not switch to the export in this card. Charlie runs both for at least one full month and switches only after a month with no `no_class` or `not_in_text` differences, recorded by him. The skill stays outside the repo.

## Alternatives considered
- A notice field on cancellations to tell a late cancel from one with notice: needs a migration and a policy decision; deferred. All cancellations count as with notice.
- A separate state for pending claims and unconfirmed past classes: `chargeable` with `unconfirmed` keeps the state list short and still shows them.
- Reading the skill's own counting code: it lives outside the repo; the existing `parse_slot` port is already tested. Charlie confirms the every-weekday assumption against `build_month.py` once.
- Names in the export: the skill matches on Notion page IDs, so names would be personal data with no use.

## Consequences
- Charge rules now live in the repo and are versioned; a rule change is a one-line edit, a test change and a version bump.
- The page may show false differences if the skill skips holidays or caps sessions; `no_class` makes any such gap visible.
- One series read per adopted student per load, as `/monthly-review` does. Revisit past about 50 students.
- Nothing here computes an amount, writes an invoice or touches credits or payouts.
