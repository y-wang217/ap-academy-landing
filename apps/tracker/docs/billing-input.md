# Billing input (REQ-40)

The structured month input for the monthly billing run. Owner only:
`GET /tracker/api/scheduler/monthly-billing-input?month=YYYY-MM`, or Download
JSON on `/tracker/scheduler/billing`. Decision: [ADR 0060](decisions/0060-structured-billing-input.md).

It records whether each class is chargeable. It never computes an amount,
writes an invoice, or reads or writes credits or payouts. It reads only the
tracker's own tables and makes no Notion request.

## Contract and versioning

The contract with the `ap-academy-monthly-admin` skill is this file, the
response schema (`BillingInputResponse` in `lib/scheduler/schemas.ts`) and the
fixture month in `test/fixtures/billing-input/`:

- `2026-11.input.json`: the classes, exceptions and outcomes of four students (a move, a cancellation with a delivered makeup, a cancellation with no makeup, a no-show, a one-off trial, a mid-month split, a past class with no outcome, future classes, a stale text and one the run cannot read).
- `2026-11.expected.json`: what `buildBillingInput` returns for it, byte for byte.

Any change to a field, or to a rule that changes the expected JSON, bumps a
version: `schemaVersion` (`BILLING_SCHEMA_VERSION` in `lib/domain/billing/month-input.ts`)
for the shape, `rulesVersion` (`BILLING_RULES_VERSION` in `lib/domain/billing/charge-state.ts`)
for the rules. `lib/domain/billing/fixture.test.ts` pins each version pair to a
SHA-256 of the expected JSON and of the schema's field list, so a change without
a bump fails. After a bump, add a row to its `PINS` with the new hashes.

Run the fixture: `pnpm --filter tracker exec vitest run lib/domain/billing`.

## Fields

| field | meaning |
|---|---|
| `schemaVersion` | Shape version, 1. |
| `rulesVersion` | Charge rules version, 1. |
| `month` | The month, `YYYY-MM`. |
| `asOf` | When the export was made (ISO instant). "Past" and "future" are relative to it. |
| `students` | One entry per adopted student (one with a `schedule_summaries` row), sorted by `studentId`. A student with no classes this month has an empty list. |
| `students[].studentId` | The Notion Students page ID. No names. |
| `students[].sync` | The state of the student's Weekly Schedule text. |
| `students[].sync.state` | `pending`, `synced` or `failed`: the last write of the text to Notion. |
| `students[].sync.stale` | True when the last written text differs from what the classes would render today. Sync before the run. |
| `students[].occurrences` | Every class of the month, sorted by date, then start time. Cancelled classes are included. |
| `students[].occurrences[].occurrenceRef` | `sched:<seriesId>:<originalDate>`, the same reference a Lessons row carries in `Class occurrence`. |
| `students[].occurrences[].seriesId` | The class rule it comes from. |
| `students[].occurrences[].originalDate` | The date the rule gives it. Outcomes key on this date, also for a moved class. |
| `students[].occurrences[].date` | The date it takes place (the new date when moved). |
| `students[].occurrences[].startTime` | Local start time, `HH:MM`, Toronto. |
| `students[].occurrences[].durationMinutes` | Length in minutes. |
| `students[].occurrences[].subject` | The course as the scheduler holds it. |
| `students[].occurrences[].teacherId` | The Notion Staff page ID. |
| `students[].occurrences[].schedulerState` | `scheduled`, `moved`, `cancelled`, or `one_off` for a scheduled one-off class. |
| `students[].occurrences[].purpose` | For a one-off: `makeup`, `trial`, `extra`, or null when not declared. Null for a weekly class. |
| `students[].occurrences[].movedFrom` | For a moved class, its original date; otherwise null. |
| `students[].occurrences[].makeupFor` | For a makeup, the original date of the cancelled class it replaces; null when it has no link. |
| `students[].occurrences[].unlinkedMakeup` | True for a makeup with no link, or a link to a cancellation that no longer exists. Never chargeable; link it or decide. |
| `students[].occurrences[].outcome` | `delivered` (logged against a Lessons row, or a claim in flight), `no_show`, or `none`. |
| `students[].occurrences[].chargeState` | See the rules below. |
| `students[].occurrences[].unconfirmed` | True when the state rests on a guess: a past class with no outcome, or a delivered claim with no Lessons row yet. |

## Charge rules (version 1)

First match wins. A moved class follows the same rules as a scheduled one.
Trials, extras and undeclared one-offs are charged like weekly classes.

| # | condition | `chargeState` | `unconfirmed` |
|---|---|---|---|
| 1 | cancelled, and its makeup is delivered | `not_charged` | false |
| 2 | cancelled, no makeup or the makeup is not delivered yet | `credit_owed` | false |
| 3 | outcome no-show | `forfeit_pending` (Charlie decides) | false |
| 4 | a makeup, delivered | `made_up` | true while the claim is pending |
| 5 | a makeup, no outcome | `not_charged` | true once past |
| 6 | delivered | `chargeable` | true while the claim is pending |
| 7 | past, no outcome | `chargeable` | true |
| 8 | future, no outcome | `not_charged` | false |

Every cancellation counts as with notice. A no-call no-show is recorded as a
no-show outcome, not a cancellation. A credited class is never charged twice:
until its makeup is delivered the original is `credit_owed`; after, the
original is `not_charged` and the makeup is `made_up`.

## The billing check page

`/tracker/scheduler/billing?month=YYYY-MM` sets, per student, the count the text
method would produce (every slot of the last written text on every matching
weekday of the month, `from` and `until` ignored, as the run does) next to the
structured count (every class that is not cancelled and not a makeup). Each
difference has a reason: `cancelled`, `moved_out`, `moved_in`, `one_off`,
`before_from`, `after_until`, `duration_changed`, `no_class` or `not_in_text`.
The skill keeps reading the text until a full month shows no `no_class` and no
`not_in_text` difference and Charlie records the switch.
