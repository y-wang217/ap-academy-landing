# REQ-40: Feedback 12: Structured monthly billing input, dated classes and exceptions with explicit charge states, reconciled against the text-based run

Card: https://app.notion.com/p/3fbd6ae73dd781d2a387e5badd4cda8f (design approved there by Charlie; this is the build copy).

**Summary:** Charlie gets an owner-only JSON export of every class in a month with a derived charge state, plus a reconciliation page that sets the count the Weekly Schedule text method would produce next to the structured count and explains every difference by date and reason.

**Risk:** High (it fixes the charge rules that will drive invoicing, which is payment handling, and it creates a new export of student class data for a consumer outside this repo; read-only, no migration, no Notion writes).

## Build notes (what the build pinned that the design left open)

- **ADR number:** `0060-structured-billing-input.md`. The design named 0057; main holds up to 0056 and open PR #101 (REQ-42) holds 0057 to 0059 (REQ-51 number reservation).
- **Outcome store not wired:** the outcome store is wired only together with the Lessons port (`realScheduleDeps`). Without it the export and the page answer 503 `lessons_not_ready` instead of guessing: every past class would otherwise read `chargeable` and unconfirmed.
- **`past`:** a class is past once its end time has passed (`endsAt <= now`), the same rule as the parent calendar (`lib/domain/schedule/month.ts`).
- **Hours** in the reconciliation are summed from `durationMinutes / 60` on the structured side and from `parseSlot` hours on the text side, both rounded to 2 decimals for display only.
- **Sync note on the page:** a student row says "Weekly Schedule is out of date. Sync it first." when `syncState` is not `synced` or the last written text differs from a fresh `renderSummary`. Both are reported in the export as `sync: { state, stale }`, the same shape as `/monthly-review`.
- **Download JSON** is a plain `<a href="/tracker/api/scheduler/monthly-billing-input?month=...">`. A plain `<a>` does not get the basePath added, so the `/tracker` prefix is written out.

## Problem

The monthly billing run (`ap-academy-monthly-admin`, outside the repo) counts sessions from Weekly Schedule text. That text cannot express cancellations, moves, one-offs, makeups or `from`/`until` dates (tracker ADR 0035), so Charlie reconciles by hand from `GET /monthly-review`. Outcomes now exist (REQ-39, migration 0023), so delivered, no-show, cancelled-with-makeup and future can be told apart. For Charlie (owner) only: a structured, versioned month input for the skill, and a page that proves it against the text method before the skill switches.

## Acceptance criteria

- [ ] AC1: `chargeState()` in `apps/tracker/lib/domain/billing/charge-state.ts` returns the state in the rules table below for every combination of scheduler state (scheduled, moved, cancelled), kind and purpose (weekly, one-off with null, trial, extra, makeup), outcome (delivered, delivered pending, no_show, none) and time (past, future), and the module exports `BILLING_RULES_VERSION = 1`.
- [ ] AC2: Double-count trap: a cancelled class with a linked makeup that is not yet delivered is `credit_owed`; once the makeup has a delivered outcome the cancelled class is `not_charged` and the makeup is `made_up`; neither is ever `chargeable`.
- [ ] AC3: A weekly series split mid-month (old line ends on `effectiveUntil`, new line from `startDate`) yields occurrences for each line only on dates it was effective; the month total equals the number of weekday dates in the month, with no date counted twice.
- [ ] AC4: `GET /api/scheduler/monthly-billing-input?month=YYYY-MM` as the owner returns 200 with JSON that parses under `BillingInputResponse` (strict Zod), carrying `schemaVersion`, `rulesVersion`, `month`, and one entry per adopted student with every occurrence of that month.
- [ ] AC5: The export answers 403 to a scheduler teacher and to a parent, 401 signed out, 503 `scheduler_not_configured` when unconfigured, 400 for a missing or malformed month, and 503 (never an empty 200) when a store read fails.
- [ ] AC6: The fixture month in `apps/tracker/test/fixtures/billing-input/` (a move, a cancellation with a delivered makeup, a cancellation with no makeup, a no-show, a one-off trial, a mid-month split, a past class with no outcome, a future class) run through the pure builder equals the checked-in expected JSON byte for byte.
- [ ] AC7: A test pins `schemaVersion` and `BILLING_RULES_VERSION` to a SHA-256 of the expected fixture JSON and of the schema's key list; changing either without bumping the version fails the test.
- [ ] AC8: `parseSlot` (the `parse_slot` port, moved out of `monthly-admin-compat.test.ts` into `apps/tracker/lib/domain/schedule/legacy-count.ts`) behaves exactly as before: the existing compat tests pass against the moved function, and `textMonthSessions(text, month)` yields one session per slot per matching weekday in the month, ignoring `from` and `until`.
- [ ] AC9: `reconcileMonth()` returns per student the text count and hours, the structured count and hours, and a list of differences, each with date, subject, side (`text_only` or `structured_only`) and one reason from: `cancelled`, `moved_out`, `moved_in`, `one_off`, `before_from`, `after_until`, `duration_changed`, `no_class`, `not_in_text`. Every fixture case produces the expected reason.
- [ ] AC10: `/tracker/scheduler/billing?month=YYYY-MM` shows the owner, per student, both counts, the charge state tallies and the differences; a student whose text cannot be parsed shows "This text would stop the monthly run."; a teacher and a parent get 404.
- [ ] AC11: A source scan proves the new files name none of Invoices, Missed Sessions, Credits (the database), Hourly Rate, Teacher Payouts, Paid to Teacher, Pay Period, import nothing from `lib/notion/`, and contain no POST, PATCH or DELETE.
- [ ] AC12: Every field of `BillingInputResponse` is documented in `apps/tracker/docs/billing-input.md` (a test walks the schema keys and finds each in the doc).
- [ ] AC13 (e2e): the owner loads the export and the page; a teacher and a parent get 403 from the API and 404 from the page; the mock Notion journal slice for these loads holds no Invoices, Missed Sessions and Credits, Lessons or Payouts request and no non-GET request.

## Approach

### Charge rules (pure)

New `apps/tracker/lib/domain/billing/charge-state.ts`: no React, Next, Supabase, Notion or clock. `chargeState(input)` returns `{ state, unconfirmed }`. Input: `status`, `kind`, `purpose`, `past`, `outcome` (`delivered`, `no_show`, `none`), `outcomePending` (delivered claim with no Lessons page ID yet), and for a cancelled class `makeup` (`none`, `linked`, `delivered`). Rules, first match wins:

| # | Condition | State | unconfirmed |
| --- | --- | --- | --- |
| 1 | cancelled, makeup delivered | `not_charged` | false |
| 2 | cancelled, makeup none or linked but not delivered | `credit_owed` | false |
| 3 | outcome no_show (any purpose) | `forfeit_pending` | false |
| 4 | purpose makeup, outcome delivered | `made_up` | pending claim |
| 5 | purpose makeup, no outcome | `not_charged` | true when past |
| 6 | outcome delivered | `chargeable` | pending claim |
| 7 | past, no outcome | `chargeable` | true |
| 8 | future, no outcome | `not_charged` | false |

Moved classes follow the same rules as scheduled ones (outcomes key on the original date). Trial, extra and undeclared one-offs are charged like weekly classes (Decision 4). `apps/tracker/lib/domain/billing/` sits beside the existing `lib/domain/billing.ts` (parent invoices, ADR 0049); nothing imports across them (Decision 6).

### Month builder (pure)

New `apps/tracker/lib/domain/billing/month-input.ts`: `buildBillingInput({ month, now, series, exceptions, outcomes })` expands each student's series with `expandOccurrences` (`lib/domain/schedule/recurrence.ts`) over `monthRange(month)` (`lib/domain/schedule/month.ts`), so `from`/`until` and moved-in classes are already honoured. For a cancelled class it finds the one-off series whose `makeupFor` is that exception's id (in any month) and that makeup's outcome. Each occurrence carries `occurrenceRef` (`sched:<seriesId>:<originalDate>`, from `lib/domain/schedule/lesson-link.ts`), `seriesId`, `originalDate`, `date`, `startTime`, `durationMinutes`, `subject`, `teacherId` (the Notion Staff page ID, `notion_staff_id`), `schedulerState` (`scheduled`, `moved`, `cancelled`, `one_off`), `purpose`, `movedFrom`, `makeupFor` (original date of the cancelled class), `unlinkedMakeup`, `outcome`, `chargeState`, `unconfirmed`. Students are keyed by Notion Students page ID; no names in the export. Output sorted by student id, then date and start time, so the fixture is stable.

### Text method (pure)

New `apps/tracker/lib/domain/schedule/legacy-count.ts`: `parseSlot(text)` is the `monthlyAdminParseSlot` body moved verbatim from `lib/domain/schedule/monthly-admin-compat.test.ts` (which then imports it), and `textMonthSessions(text, month)` emits, for every slot, one session per date in the month on that weekday, with the slot's hours and course. A text that throws is reported as `unparseable`, as the skill would stop.

New `apps/tracker/lib/domain/billing/reconcile.ts`: `reconcileMonth({ month, text, occurrences, series, exceptions })`. The structured count is every occurrence that is not cancelled and not a makeup (what the text method tries to approximate). Matching is a multiset on (date, subject cleaned the way `renderSummary` cleans it); a matched pair with different hours is `duration_changed`. Text-only reasons: a cancelled occurrence on that original date (`cancelled`), a moved one (`moved_out`), a series for that course and weekday that starts later (`before_from`) or ended earlier (`after_until`), else `no_class`. Structured-only reasons: `moved_in`, `one_off`, else `not_in_text`.

### Data and handler

- `apps/tracker/lib/scheduler/billing-handlers.ts` (new): `loadBillingMonth(deps, month)` gates on `requireScheduler(identity, ["admin"])` (`lib/scheduler/guard.ts`), reads `store.listSummaries()` and `store.listSeriesForStudent()` per adopted student (the same reads as `handleMonthlyReview` in `lib/scheduler/import-handlers.ts`), and `outcomes.listForOccurrences()` (`lib/scheduler/outcome-store.ts`) for the month's occurrences plus linked makeups. The Weekly Schedule text is the local `schedule_summaries.last_written_text`, never a Notion read; when `syncState` is not `synced` or the text differs from a fresh `renderSummary`, the student row says so. Any store throw is a 503, never an empty answer. `handleMonthlyBillingInput(deps, q)` returns the export.
- `apps/tracker/app/api/scheduler/monthly-billing-input/route.ts` (new): GET wrapped in `withServerTiming`, like `monthly-review/route.ts`. Added to the GET list in `apps/tracker/lib/server-timing-routes.test.ts`.
- `apps/tracker/lib/scheduler/schemas.ts`: `BillingInputResponse` (strict Zod) with `schemaVersion: 1`.
- `apps/tracker/app/api/scheduler/scope-matrix.test.ts` and `apps/tracker/docs/permission-matrix.md`: one row, owner only.

### UI

New `apps/tracker/app/scheduler/billing/page.tsx` (server component, `dynamic = "force-dynamic"`): `notFound()` unless identity scope is admin, as `app/schedule/conflicts/page.tsx` does. Calls `loadBillingMonth` and `reconcileMonth` directly (no client fetch), names from `peopleStore().studentNames()` (local copy, ADR 0055). New `apps/tracker/components/scheduler/billing-reconciliation.tsx` renders it. The Monthly review card in `components/scheduler/schedule-import.tsx` gets one link: "Compare billing counts".

Layout (375px first):

```
Billing check            [< Oct]  November 2026  [Dec >]
Text and structured counts agree for 7 of 9 students.
[Download JSON]
--------------------------------------------------
Ava S.                             Differs
Text: 4 classes, 4 h   Structured: 3 classes, 3 h
Chargeable 2 (1 unconfirmed) . Credit owed 1
- Nov 10, MPM2D Math: cancelled, credit owed
- Nov 18, MPM2D Math: moved to Nov 19 (same count)
Weekly Schedule is out of date. Sync it first.
--------------------------------------------------
Ben T.                             Matches
Text: 4 classes, 6 h   Structured: 4 classes, 6 h
```

States: empty ("No classes this month."), error (store down: "Could not load classes. Try again."), unparseable text ("This text would stop the monthly run."), success. Server-rendered, so no client loading state. Copy plain, no em-dashes.

### Docs

- `apps/tracker/docs/billing-input.md` (new): every field, the rules table, the versioning rule, and how to run the fixture.
- `apps/tracker/docs/decisions/0060-structured-billing-input.md` (new ADR) and the README index row.
- `apps/tracker/docs/scheduler-operations.md`: a "Billing check" section. `apps/tracker/docs/PLAN.md` progress. `docs/readiness.md` F01 Production status (builder, on ship).

## Migration

None. Reads only `class_series`, `class_exceptions`, `schedule_summaries` and `occurrence_outcomes`, all owner-readable under existing RLS.

## Test plan

| Test | Type | Covers |
| --- | --- | --- |
| `lib/domain/billing/charge-state.test.ts`: full grid of status x purpose x outcome x past, table-driven against the rules table | unit | AC1 |
| `charge-state.test.ts` and `month-input.test.ts`: makeup linked then delivered, across a month boundary | unit | AC2 |
| `month-input.test.ts`: split on the 15th, both lines, total equals weekday dates | unit | AC3 |
| `app/api/scheduler/billing-input-routes.test.ts` with the fakes in `booking-world.fake.ts` and `lesson-world.fake.ts`: owner 200 parses the schema | integration | AC4 |
| Same file plus a `scope-matrix.test.ts` row: teacher 403, parent (scope none) 403, signed out 401, unconfigured 503, bad month 400, throwing store 503 | integration | AC5 |
| `lib/domain/billing/fixture.test.ts`: `test/fixtures/billing-input/2026-11.input.json` through `buildBillingInput` equals `2026-11.expected.json` | unit | AC6 |
| `fixture.test.ts`: version pin on hashes | unit | AC7 |
| `monthly-admin-compat.test.ts` (now importing `parseSlot`) and `legacy-count.test.ts` | unit | AC8 |
| `lib/domain/billing/reconcile.test.ts`: one case per reason, using the fixture month | unit | AC9 |
| `e2e/tracker/flows.mjs` REQ-40 block: owner page shows counts and a difference; teacher and parent pages 404 | e2e | AC10, AC13 |
| `lib/billing-input-scan.test.ts`, modelled on `lib/parent-billing-scan.test.ts` | unit | AC11 |
| `billing-input-scan.test.ts`: schema keys found in `docs/billing-input.md` | unit | AC12 |
| `e2e/tracker/flows.mjs`: owner GET export 200 with the seeded class; Ryan and the parent get 403; journal slice check | e2e | AC13 |

## Out of scope

Dollar amounts, rates, discounts, invoices, credits, payouts, refunds. Any Notion read or write beyond what existing pages already do. Changing `GET /monthly-review` or the monthly-admin skill. Parent-facing billing (REQ-25). Switching the skill to this export (Decision 1).

## Risks and edge cases

- **Skill counting assumption.** The text count assumes the skill bills every weekday date in the month for each slot. If `build_month.py` differs (skips holidays, caps sessions), the page shows false differences. Mitigation: Decision 2, and the reason `no_class` makes any unexplained gap visible.
- **Makeup in another month.** Handled by reading each student's full series and exceptions (`listSeriesForStudent`), not just the month window.
- **Pending delivered claim** (log in flight or stale): `chargeable` with `unconfirmed: true`, so Charlie sees it.
- **Makeup with no link** (`purpose` makeup, `makeupFor` null): never chargeable, flagged `unlinkedMakeup` so Charlie can link or decide.
- **Text not synced or stale**: the reconciliation uses the last written text (what Notion holds unless hand-edited, which the next sync overwrites) and says so on the row.
- **Mid-month run**: future classes are `not_charged`; the structured count still includes them, so the comparison with the text is meaningful on any day.
- **Performance**: one series read per adopted student, as `/monthly-review` already does; acceptable at current size (under 50 students). Server-Timing shows it.

## Decisions for approval (defaults taken)

| # | Decision | Default taken |
| --- | --- | --- |
| 1 | When the skill switches to this export, and whether it moves into the repo | No switch in this card. Charlie runs both for at least one full month; switch only when a month has no `no_class` or `not_in_text` differences and Charlie records it. The skill stays outside the repo. |
| 2 | How the text method is reproduced | Port `parse_slot` verbatim and assume every matching weekday in the month counts. Charlie confirms against `build_month.py` once. |
| 3 | Every cancellation counts as "with notice" | All cancellations are with notice (`credit_owed`). A no-call no-show is a no-show outcome. No migration. |
| 4 | Trials and extra classes | Charged like any class. |
| 5 | Pending delivered claims and past classes with no outcome | `chargeable` with `unconfirmed: true`. |
| 6 | File placement | `lib/domain/billing/charge-state.ts`; the new modules are imported by full path. |
| 7 | Reconciliation home | New page `/tracker/scheduler/billing`, linked from the Monthly review card. |
| 8 | Source of the text and names | Local only. No Notion request from either the export or the page. |
| 9 | Export content | IDs only (student, teacher, series). No names, emails or money. |
| 10 | Origin check | None for this GET. No change to `proxy.ts`. |
| 11 | New dependencies | None. |
| 12 | Schema placement | None. No table, column, policy or migration. |
| 13 | Scope split | One card. |
| 14 | Download button | A plain `<a>` to the export URL. |
