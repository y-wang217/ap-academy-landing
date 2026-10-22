Notion card: https://app.notion.com/p/400d6ae73dd781c39542fb946d32d73f

# Design: REQ-56: Console 5/12: Verified net-new recurring teaching hours per week

## Changes from last version

- Approver 1 (unadopted students' series): a weekly or one-off series whose student has no `tracker.schedule_summaries` row now goes to `excluded` with the new reason `not_in_scheduler` and never counts (card text: "not in scheduler and not counted"). Rule added in Approach step 1, AC3, fixture F21; a series created after an empty-text auto-adoption (`prepareStudent` in `lib/scheduler/schedule-handlers.ts`) still counts, fixture F22. Decisions row 17.
- Approver 2: Decisions row 18 records that `unpaid`, `not_synced` and `stage_not_active` series sit in `counted` with `class: "unverified"` (they feed the unverified net), while `excluded` holds only rows that never count under any class.
- Approver 3 and 8: AC1 now says F1 to F22, matching the Fixture table and the test plan.
- Approver 4: AC6 is an exact three-case rule (percent and hours; hours only when the prior week is 0; no comparison line otherwise), and the north-star.test.ts row asserts each case.
- Approver 5 and 7: AC11's test has one path: the once-only people wrapper is `sharePeopleRead` in `apps/tracker/lib/console/providers.ts`, tested in `apps/tracker/lib/console/providers.test.ts`.
- Approver 6 and 8: status precedence is fixed as error, then unverifiable, then stale (incomplete), then ready or empty. A failed series read wins over an unavailable Invoices or people read (AC8, Approach step 4), with its own test case.

**Summary:** the Sales mode north-star slot on `/tracker/console` stops saying "Not connected yet" and shows, for a chosen Toronto week, verified net-new weekly teaching hours (additions minus reductions of weekly series whose student is synced, has a Paid invoice and is Onboarding or Active, or whose series has ended), with the unverified net beside it, every counted and excluded series listed with a link and a reason, and an honest `unverifiable` state when Invoices or student stages cannot be read.
**Risk:** Medium (owner-only UI and reads over data that existing owner RLS already covers: `tracker.class_series`, `tracker.schedule_summaries`, `tracker.student_people`, plus the Invoices panel REQ-54 already reads; no schema, auth, permission or Notion write change, and no file under `apps/tracker/lib/notion/`).

## Problem

Charlie (org owner) needs one honest number for growth: net new recurring, paid, teacher-delivered hours per week. The rule is fixed in `docs/spec/founder-console/02-data-contracts.md` section 5 (and section 3.7, risk register rows for REQ-56). The slot exists (`sales.northStar` in `apps/tracker/lib/console/panel-slots.ts`), the facade reads Invoices and the people copy (`apps/tracker/lib/console/facade.ts`, REQ-54), and the shell renders any `PanelView` (`apps/tracker/components/console/shell/bridge.tsx`, REQ-55). What is missing: the pure computation, an org-wide series read that fails loudly, and the panel that shows the value, its evidence and its failure states. Only the owner sees it; teachers, students and parents see nothing new.

## Acceptance criteria

- [ ] AC1: `netNewHours` returns the values in the Fixture table below for fixtures F1 to F22 (spec section 5 fixtures 1 to 11 verbatim, plus an adopted student, a make-up and an extra one-off, an Active student with no series, an empty week, a duplicated series row, the prior-week comparator, stale and failed people reads, a series whose student is not adopted, and a series created after an empty-text auto-adoption).
- [ ] AC2: For the weeks that contain the Toronto DST changes (2026-03-02 to 2026-03-08 and 2026-10-26 to 2026-11-01): a series starting Sunday 2026-03-08 is an addition in the week of 2026-03-02; a series with `effective_until = 2026-11-01` is a reduction in the week of 2026-11-02, not the week of 2026-10-26; a series starting Monday 2026-11-02 is an addition in the week of 2026-11-02. Event dates are wall-clock dates compared as strings, never instants.
- [ ] AC3: Verified net excludes every `kind = 'one_off'` row (reason `trial`, `makeup`, `extra` or `one_off` from `purpose`), every addition of a series created by adoption (reason `adopted`), every series whose student has no `schedule_summaries` row (reason `not_in_scheduler`, both its addition and its reduction, and it is left out of the opening baseline), and every series that fails rule a, b or c (moved to unverified with reason `not_synced`, `unpaid` or `stage_not_active`); a series row given twice counts once; reductions subtract. Each is proven by its own fixture.
- [ ] AC4: When the Invoices panel is `error`, or `stale` because the read stopped at the page cap, or the people read is `error`, the north-star panel has `data-status="unverifiable"`, shows "Cannot verify weekly hours", the reason, the week boundaries, a retry link, and the gross additions and reductions labelled "unclassified" with their series ids. It never renders a verified or unverified figure, and never `0 h` as a verified value.
- [ ] AC5: The panel's detail view (a native `<details>` element, keyboard operable) lists every counted event (series id, student name or "Unknown student", addition or reduction, date, minutes, verified or unverified, reason) and every excluded series (id, reason). Each series links to `/tracker/schedule?date=<event date>&staffId=<staff id>` and each student to `notionPageUrl(studentId)`. The count of rows equals `counted.length + excluded.length`.
- [ ] AC6: The "vs last week" line follows exactly one of three cases. (a) This week and the prior week are both `verified` and the prior week's verified net is not 0: it shows the hours change and the percentage, e.g. "vs last week +0.5 h (+50%)". (b) Both weeks are `verified` and the prior week's verified net is 0: it shows the hours change only, e.g. "vs last week +1.5 h", with no `%` character in the panel. (c) Either week is not `verified` (incomplete or unverifiable, or the series read failed): no "vs last week" line is rendered and no `%` character is in the panel.
- [ ] AC7: People sync older than `TUNING.peopleStaleMinutes` (120) or never synced gives `incomplete`: the panel is `stale`, shows the verified value, and prints the reason with the sync time. A people read that fails gives `unverifiable` (AC4).
- [ ] AC8: A failed series read (any Supabase error on the class_series or schedule_summaries query) gives panel `error` with "Cannot verify weekly hours" and a retry, and this wins over every other state: when the series read fails and Invoices or people are also unavailable at the same time, the panel is `error`, not `unverifiable`. Precedence is error, then unverifiable, then stale (incomplete), then ready or empty. No other console panel changes status.
- [ ] AC9: `?week=YYYY-MM-DD` on `/tracker/console` selects `weekOf(date)`; a missing, malformed or future date selects the current Toronto week. The panel shows the week as "Mon 19 Oct to Sun 25 Oct" with previous and next links (next is absent on the current week). `?mode=` keeps working alongside it.
- [ ] AC10: Secondary readouts show only where their source is usable: leads awaiting first contact (Stage = New count), overdue follow-ups (Next Action Due before now, Next Action not None, Stage not Lost or legacy Churned) from the leads panel, and booked recurring capacity (sum of `duration_minutes` of weekly series running on any day of the week, in hours, labelled unclassified). When the leads panel is not usable its two readouts say "Leads unavailable", never 0.
- [ ] AC11: The health route still reports exactly the six providers REQ-54 pinned (the north star adds no facade provider), and the people snapshot is read once per page load.
- [ ] AC12: Tracker ADR `0068-north-star-net-new-hours.md` exists with every section, is in the decisions `README.md`, has no em dash, and records the adoption rule, the not-in-scheduler rule, the status mapping and precedence, the opening baseline and the percentage rule.

## Approach

**1. Pure function (new): `apps/tracker/lib/domain/schedule/net-new.ts`.** No I/O, no imports outside `lib/domain` (the same rule `lib/domain/boundaries.test.ts` enforces). Uses `weekOf` and `addDays` from `week.ts` and `wallclock.ts`, and `normalId` from `lib/domain/billing.ts` for every id comparison.

```ts
export type SeriesFact = {
  id: string; studentId: string; staffId: string; kind: "weekly" | "one_off";
  purpose: "trial" | "makeup" | "extra" | null; startDate: string; effectiveUntil: string | null;
  durationMinutes: number; splitFrom: string | null; createdAt: string;
};
export type NetNewInput = {
  week: { from: string; to: string };
  today: string;                                   // todayIso(now), America/Toronto
  series: SeriesFact[];
  adoptions: { studentId: string; adoptedAt: string }[];   // tracker.schedule_summaries
  people: { ok: true; stale: boolean; syncedAt: string | null; students: { id: string; stage: string }[] }
        | { ok: false; reason: string };
  payments: { ok: true; paidByStudent: Map<string, { invoiceId: string; paidOn: string | null; month: string | null }[]> }
          | { ok: false; reason: string };
};
export type NetNewResult = {
  week: { from: string; to: string };
  status: "verified" | "incomplete" | "unverifiable";
  reason: string | null;
  openingVerifiedMinutes: number | null;
  additionsVerifiedMinutes: number | null; reductionsVerifiedMinutes: number | null; netNewVerifiedMinutes: number | null;
  additionsUnverifiedMinutes: number | null; reductionsUnverifiedMinutes: number | null; netNewUnverifiedMinutes: number | null;
  grossAdditionsMinutes: number; grossReductionsMinutes: number;   // always set, unclassified
  counted: { seriesId: string; studentId: string; staffId: string; event: "addition" | "reduction"; date: string; minutes: number;
             class: "verified" | "unverified" | "unclassified"; reason: "not_synced" | "unpaid" | "stage_not_active" | null; paidOn: string | null }[];
  excluded: { seriesId: string; studentId: string; staffId: string; date: string; reason: "trial" | "makeup" | "extra" | "one_off" | "adopted" | "not_in_scheduler" }[];
  notInScheduler: string[];        // students with no adoption row: Onboarding or Active ones, plus any whose series were excluded
  lastSuccessfulSyncAt: string | null;
};
export function netNewHours(input: NetNewInput): NetNewResult;
export function priorWeek(week: { from: string; to: string }): { from: string; to: string };
```

Rules, in order (spec section 5, extended only where marked ADR):

- Dedupe `series` by normalised id (first wins).
- **Not in scheduler (card rule, ADR 0068):** a series (weekly or one-off) whose student has no adoption row goes to `excluded` with reason `not_in_scheduler` on the date of its in-W event, never counts as verified, unverified or opening, and its student is also listed in `notInScheduler`. Such rows exist when a series was written without the Notion students dependency wired (`prepareStudent` returns early when `deps.students` is absent) or predates migration 0011; the student's legacy Weekly Schedule text may still describe classes that billing reads, so the scheduler rows are not the whole picture. This check runs before the one-off and adoption rules.
- One-offs whose `startDate` is in W go to `excluded` with `purpose ?? "one_off"`; they never count.
- Weekly series: addition when `startDate` is in W; reduction when `addDays(effectiveUntil, 1)` is in W. A split needs no special case: the old row's reduction and the new row's addition are both in W and net to the duration change.
- **Adoption (ADR 0068):** a weekly series is adopted when an adoption row has the same student and `Date.parse(createdAt) === Date.parse(adoptedAt)`. `adopt_student_schedule` (migration 0011) inserts the series and the summary in one transaction, so both defaults read the same `now()`. Its addition is moved to `excluded` with reason `adopted` (it is an existing class brought into the scheduler, not new hours, and `import-plan.ts` gives it a start date on or after the adoption day). Its later reduction counts like any other. When a student with an empty legacy text gets their first class, `prepareStudent` adopts them with no series and the series is written in a later transaction, so its `created_at` is later than `adopted_at` and it counts as an addition (fixture F22).
- Class of a weekly series: verified when (a) the student has a people row, (b) `paidByStudent` has at least one row for the student, and (c) the stage is Onboarding or Active (`ACTIVE_STUDENT_STAGES` copied as a domain constant, since domain cannot import `lib/notion`) or `effectiveUntil` is set and before `today`. Else unverified with the first failing reason in the order a, b, c.
- Opening baseline (ADR 0068): verified minutes of weekly series running on `W.from` that began before it (`startDate < W.from` and `effectiveUntil` null or `>= W.from`), plus adopted series whose start date is in W (their excluded addition is part of the base, not lost).
- Status: payments not ok, or people not ok, gives `unverifiable` with the reason; every classified figure is null; `counted` rows carry `class: "unclassified"`; gross figures and ids are still returned. People ok and stale gives `incomplete` with figures. Otherwise `verified`.
- `notInScheduler`: Onboarding or Active students (people ok) with no adoption row, plus every student whose series was excluded as `not_in_scheduler` (the latter even when people is not ok), deduplicated by `normalId`.

**2. Series read (new): `apps/tracker/lib/console/series-read.ts`.** `createConsoleSeriesReader(tracker, orgId)` returns `(window: { from: string; to: string }) => Promise<{ series: SeriesFact[]; adoptions: ... }>`, on the owner's own client (RLS decides), Zod-parsed (ADR 0017), and throws on any query error so a failure never looks like "no classes" (the same rule as `listSeriesForStudent` in `lib/data/schedule.ts`; the existing `listSeries` swallows errors and is not reused). Three queries in parallel:

- weekly: `select("id, notion_student_id, notion_staff_id, kind, purpose, start_date, effective_until, duration_minutes, split_from, created_at").eq("org_id", orgId).eq("kind", "weekly").lte("start_date", window.to).or("effective_until.is.null,effective_until.gte.<window.from minus 1 day>")`;
- one-offs: same columns, `eq("kind", "one_off")`, `start_date` between `window.from` and `window.to`;
- adoptions: `schedule_summaries` `select("notion_student_id, adopted_at").eq("org_id", orgId)`.
`window` spans the prior week's Monday to this week's Sunday, so one read feeds both weeks.

**3. Facade helper: `apps/tracker/lib/console/facade.ts`.** Export `readComplete(r: PanelResult<unknown>): boolean`: true for `ready` and `empty`, and for `stale` when every `; `-separated reason is one of the facade's own name-join reasons (`people_sync_stale`, `names_unavailable`, both now exported as `NAME_JOIN_REASONS`). A page-cap stop is not complete. Without this, a stale people copy would make the Invoices panel stale and wrongly turn the north star unverifiable. No change to `loadConsolePanels` behaviour.

**4. Panel builder (new): `apps/tracker/lib/console/north-star.ts`.** `buildNorthStar({ week, now, panels, people, series })` where `panels` is the facade's `ConsolePanels`, `people` the settled `PeopleSnapshot` (or a failure), and `series` the settled series read. It:

- builds `paidByStudent` from `panels.invoices.data` rows with `status === "Paid"`, keyed by `normalId` of each `studentIds` entry, when `readComplete(panels.invoices)`; otherwise payments `{ ok: false, reason }` from `errorMessage` or `staleReason`;
- maps people: failed read gives `{ ok: false, reason: "Student stages unavailable" }`; `panels.people.status === "stale"` gives `stale: true`;
- runs `netNewHours` for W and for `priorWeek(W)`;
- computes diagnostics (AC10) from `panels.leads` when `readComplete`, and capacity from the series facts;
- applies one precedence: series read failed gives `error` (checked first, before payments or people are looked at, so it wins when Invoices or people are also unavailable); otherwise the function's status maps as below;
- returns `PanelView<NorthStarData>`: `verified` maps to `ready` (or `empty` when `counted` and `excluded` are both empty), `incomplete` to `stale` with `staleReason` "Student stages last synced HH:MM; figures may be incomplete" (or "never synced"), `unverifiable` to `unverifiable` with `staleReason` "Cannot verify weekly hours: <reason>"; series read failure to `error` with `errorMessage` "Cannot verify weekly hours". `sourceEvidence` lists `tracker.class_series`, `tracker.schedule_summaries`, `tracker.student_people` and the Invoices data source; `lastSuccessfulFetchAt` is the older of the Invoices and series fetch times; `data` carries student names (from the people snapshot by `normalId`, else null) for the detail list.

**5. Page wiring: `apps/tracker/app/console/page.tsx`.** After the owner gate: parse `week` (new `parseWeek(raw, today)` in `apps/tracker/lib/console/modes.ts` beside `parseMode`, AC9); build `deps = sharePeopleRead(createConsoleDeps(gate.viewer))`, where the new exported `sharePeopleRead(deps: FacadeDeps): FacadeDeps` in `apps/tracker/lib/console/providers.ts` replaces `deps.people` with a memoised call (one promise, reused, rejection included) so the facade and the north star share one people read (AC11); run `loadConsolePanels(deps)` and the series read together; then `panels = placeholderPanels(now)` with `panels.sales.northStar = buildNorthStar(...)`. Every other slot stays "Not connected yet" (later cards fill them). The facade never throws; the series read is caught into a failure so the page always renders.

**6. Component (new): `apps/tracker/components/console/north-star.tsx`.** Wraps `InstrumentPanel` (no new kit primitive). `bridge.tsx`'s `Instrument` renders it when `slot.id === "northStar"`, before the kind switch. Layout at 390 px, one column; at 1280 px and up it keeps the slot's grid area from `console.css`:

```
NORTH STAR                                   [Verified]
+2.5 h                 net new verified hours, Mon 19 Oct to Sun 25 Oct
Opening 41 h   +4 h added   -1.5 h reduced
Unverified net +1 h (not counted)
vs last week +1 h (+67%)            <- % only per AC6
Leads awaiting first contact 3 | Overdue follow-ups 2 | Booked 52 h (unclassified)
< Previous week        Next week >
> Show 7 counted, 2 excluded        (<details>)
   + 60 min  Sam R.   Tue 21 Oct   verified   series link | Notion link
   - 60 min  Lee K.   Thu 23 Oct   unverified: unpaid
   excluded  trial    Wed 22 Oct
Last synced 14:05  (FreshnessLine)
```

States: loading is the kit skeleton (never a zero); empty prints "No verified change this week" (PANEL_STATES.md); error prints the kit `FailureState`; unverifiable passes an `idle` body with the reason, week, retry link (`?mode=sales&week=<from>`), "Gross +60 min, -60 min (unclassified)" and the same `<details>` list. Hours are `formatReadout(minutes / 60, { unit: "h" })` (one decimal). Copy is plain, no em dashes. Reduced motion: no animation is added.

**7. Preview data: `apps/tracker/test/console/demo-panels.ts`.** Gains a north-star `PanelView<NorthStarData>` so `/tracker/console/preview` shows it. Demo data stays in `test/` (the existing scan).

**8. Docs.** Tracker ADR `apps/tracker/docs/decisions/0068-north-star-net-new-hours.md` and its README row. The spec in `docs/spec/` is verbatim and is not edited; the ADR records the extensions (adoption rule, opening baseline, status mapping, percentage rule, people-read failure as unverifiable). If `docs/readiness.md` has a row for this card, the builder sets its Production status on ship.

## Migration

None. All columns read already exist (`class_series.created_at` from 0010, `purpose` from 0019, `schedule_summaries.adopted_at` from 0011) and the owner already reads them under the existing RLS.

## Fixture table (AC1, AC3)

W = 2026-10-19 to 2026-10-25, today = 2026-10-22, 60-minute series unless stated, people fresh and Invoices readable unless stated.

| # | Case | Verified net | Unverified net | Notes |
| --- | --- | --- | --- | --- |
| F1 to F11 | spec section 5 fixtures 1 to 11 | as the spec table | as the spec table | F6: status unverifiable, gross +60 and -60, all figures null |
| F12 | adopted student: series `createdAt` equals `adoptedAt`, starts in W | 0 | 0 | excluded `adopted`; opening includes +60 |
| F13 | adopted series ends in a later week | -60 in that week | 0 | reduction counts |
| F14 | make-up and extra one-offs in W | 0 | 0 | excluded `makeup`, `extra` |
| F15 | Active student with no series and no adoption row | 0 | 0 | listed in `notInScheduler` |
| F16 | empty week (no series) | 0 | 0 | status verified, counted and excluded empty (panel `empty`) |
| F17 | the F1 row given twice | +60 | 0 | counted once |
| F18 | prior week verified net +60, this week +90 | +90 | 0 | comparator +30 min (+0.5 h), +50% |
| F19 | people stale (synced 3 h ago), else F1 | +60 | 0 | status incomplete |
| F20 | people read failed, else F1 | n/a | n/a | status unverifiable, reason "Student stages unavailable" |
| F21 | Active, Paid student with no adoption row; one weekly series starting in W and one weekly series running since before W | 0 | 0 | both excluded `not_in_scheduler`; opening excludes them; student in `notInScheduler` |
| F22 | adopted with empty text on 2026-10-01 (`adoptedAt` 10:00:00Z), weekly series `createdAt` 10:00:01Z starting in W, Paid, Active | +60 | 0 | counted as addition, not `adopted` |

## Test plan

| Test | Type | Covers |
| --- | --- | --- |
| `apps/tracker/lib/domain/schedule/net-new.test.ts`: table-driven F1 to F22 asserting every output field; DST cases of AC2; adoption timestamp compared by instant (`+00:00` and `Z` forms equal); split of an adopted series; `priorWeek` | unit (vitest) | AC1, AC2, AC3, AC7 |
| `apps/tracker/lib/console/north-star.test.ts`: `buildNorthStar` with a fake `ConsolePanels`: Invoices `error` and Invoices `stale` by page cap give `unverifiable` with gross figures and no classified figure; Invoices `stale` only by `people_sync_stale` stays usable; people `stale` gives panel `stale` with the sync time; people failure gives `unverifiable`; series failure gives `error` and the leads and invoices panels in the input are untouched; series failure together with Invoices `error` and with people failure each give `error`, not `unverifiable`; AC6 case (a) both verified, prior +60 and this week +90 renders "+0.5 h (+50%)"; case (b) both verified, prior 0 and this week +90 renders "+1.5 h" with no `%`; case (c) prior week incomplete, and separately this week unverifiable, render no "vs last week" line; leads not usable gives "Leads unavailable" readouts; source evidence and `lastSuccessfulFetchAt` | unit, facade integration (T2) | AC4, AC6, AC7, AC8, AC10 |
| `apps/tracker/lib/console/providers.test.ts` additions: `sharePeopleRead` wraps a counting fake people reader; calling the returned `deps.people` twice (as the facade and `buildNorthStar` do) invokes the underlying reader once and returns the same value; a rejection is shared, not retried; the other deps are passed through unchanged | unit | AC11 |
| `apps/tracker/lib/console/facade.test.ts` additions: `readComplete` true for ready, empty, and stale with only name-join reasons; false for error, loading, unverifiable and a page-cap reason | unit | AC4 |
| `apps/tracker/lib/console/series-read.test.ts`: recording fake client asserts the three queries' filters and selected columns; a query error on any one throws; rows parse to `SeriesFact` | unit | AC8 |
| `apps/tracker/lib/console/modes.test.ts` additions: `parseWeek` for missing, malformed, a Wednesday (gives its Monday), a future date (gives the current week) | unit | AC9 |
| `apps/tracker/components/console/north-star.test.ts` (renderToStaticMarkup, as `kit/kit.test.ts`): verified, incomplete (stale), unverifiable, loading, empty and error variants; unverifiable has no verified figure and the word "unclassified"; detail list rows equal counted plus excluded with both links; no `%` unless AC6 holds; no "0 h" in loading or error | unit (T3) | AC4, AC5, AC6 |
| `apps/tracker/components/console/shell/bridge.test.ts` addition: the `northStar` slot renders `NorthStar`, others unchanged | unit | AC5 |
| `apps/tracker/lib/north-star-adr.test.ts` (built like `lib/lesson-adr.test.ts`): ADR 0068 has `Status: accepted`, every section, the four rules, no em dash; README row | unit (doc) | AC12 |
| `e2e/tracker/flows.mjs` REQ-56: the owner opens `/tracker/console`; the mock Notion does not serve the console's Invoices data source, so the north-star section has `data-status="unverifiable"`, contains "Cannot verify weekly hours" and "unclassified", and no `%`; `?week=2026-03-04` shows "Mon 2 Mar"; the `<details>` opens with Enter; the health route still lists six providers | e2e (builder runs `pnpm test:tracker` before the PR; `apps/tracker/app/` and `components/` are `e2e_paths`) | AC4, AC5, AC9, AC11 |

## Out of scope

- Billing computation, invoice totals, Stripe, or any change to how payments are recorded (REQ-40).
- Stage history: "was ever verified" stays approximated by rules b and c, as the spec says.
- Wiring any other console slot (REQ-57 to REQ-62), and the Signals or Follow-ups panels; the two lead readouts here are secondary numbers inside the north star only.
- A new facade provider or any change to the health route.
- Reading `schedule_writes`: `effective_until` is the source of truth for ends (set by both `end_series` and `split`), so the op log adds nothing.
- `Last Payment Date` on Students & Parents: not read by this card (the spec allows it only as "reported", and no reader exists; adding one would touch `lib/notion/`).

## Risks and edge cases

- **Adoption week spike.** Without the adoption rule every imported student would show as new hours in the week they were adopted. The rule uses the shared transaction timestamp; series added later for the same student have a later `created_at` and count as additions.
- **In-place duration edits.** The table grants `update (duration_minutes)`, but weekly duration changes go through `split` in the app. A direct edit would change history silently; figures are always computed from current rows, which the ADR states.
- **Invoices pagination.** A page-cap stop could hide a Paid row, so it makes the metric unverifiable rather than undercounting.
- **Moved or cancelled single occurrences** (`class_exceptions`) never change recurring hours (spec), so they are not read.
- **Ids.** Notion ids arrive with or without dashes; every join uses `normalId`.
- **Past weeks and today.** Rule c uses today, not the week end, per the spec, so an old week's figures can change when a series later ends; the panel shows the computed time.
- **Shared slot file conflicts.** REQ-57 to REQ-60 will also edit `app/console/page.tsx` and `bridge.tsx`; this card adds only one assignment and one `if`, to keep later merges small.

## Decisions for approval

| # | Decision | Options | Default if you say nothing |
| --- | --- | --- | --- |
| 1 | New dependencies | None | None. |
| 2 | Schema placement and numbers | Migration; tracker ADR number | No migration. Tracker ADR `0068-north-star-net-new-hours.md`: main holds up to 0066 (0063 and 0064 absent), open PR #112 holds 0063 and 0064, open PR #114 holds 0067; no other live card design names a tracker ADR. |
| 3 | Adopted series | Exclude the addition (reason `adopted`), identified by `created_at = adopted_at`; count it as the spec text alone would | Exclude, recorded in ADR 0068. |
| 4 | Units and field names | Minutes in the function (`...Minutes`), hours only in the UI; hours as the card's `...Hours` names | Minutes (integer math, no float drift); the panel shows hours to one decimal. |
| 5 | Status names | Function returns `verified`, `incomplete`, `unverifiable` and the panel maps them to `ready`/`empty`, `stale`, `unverifiable` | As written, so the panel vocabulary from REQ-54 stays the only one on screen. |
| 6 | People read failure | `unverifiable`; every series unverified as `not_synced` | `unverifiable` (treating a failed read as "no students" would fabricate). |
| 7 | Invoices "usable" | ready, empty, or stale only for name-join reasons, via an exported `readComplete` in `facade.ts`; a separate Invoices read for the north star | `readComplete`; no second Notion read. |
| 8 | Opening baseline | Verified series running on Monday plus adopted series starting in W; Monday only | Monday plus adopted-in-W, so an adoption week does not lose hours. |
| 9 | Percentage | Prior week's verified net as comparator, percent only when both weeks verified and prior non-zero; none at all | As written (AC6). |
| 10 | Where the series read lives | New `lib/console/series-read.ts` (throws on error); reuse `listSeries` in `lib/data/schedule.ts` (swallows errors) | New file. |
| 11 | North star as a facade provider | Separate read in the page; a seventh facade provider | Separate read, so the health route keeps the six providers e2e pins. |
| 12 | `schedule_writes` input named in the card | Not read; read `end_series` rows | Not read (`effective_until` already carries both `end_series` and `split`). |
| 13 | Secondary readouts | Inside the north-star panel, from the leads panel and the series read; separate slots | Inside the panel. Overdue follow-ups here exclude Lost and legacy Churned and Next Action None; REQ-57 owns the Follow-ups slot and may define its own queue. |
| 14 | Week picker | `?week=` query param with previous and next links, future clamped to current; a date input | Query param and links. |
| 15 | `Last Payment Date` "reported" readout | Leave out (no reader; adding one touches `lib/notion/`, a human-merge path); add a reader | Leave out; listed in Out of scope. |
| 16 | Preview | Add a north-star demo to `test/console/demo-panels.ts`; leave preview as placeholders | Add it (test data only). |
| 17 | Series of a student with no `schedule_summaries` row | Exclude with reason `not_in_scheduler` (never counted, not in opening); classify them like adopted students | Exclude, as the card says, recorded in ADR 0068. The legacy Notion text may still hold classes billing reads, so scheduler rows alone would misstate that student's hours. |
| 18 | Where unverified series sit | In `counted` with `class: "unverified"` and reason `not_synced`, `unpaid` or `stage_not_active`; in `excluded` as the card's `excludedSeriesIds` list suggests | In `counted` as unverified, because spec section 5 reports an unverified net beside the verified one and these rows feed it. `excluded` holds only rows that count under no class: `trial`, `makeup`, `extra`, `one_off`, `adopted`, `not_in_scheduler`. The panel's detail list shows both with their reasons (AC5), so nothing the card asked to surface is hidden. |
| 19 | Status precedence when several sources fail | error, then unverifiable, then stale, then ready or empty; unverifiable first | error first: with no series rows there are no ids or gross figures to show, so the unverifiable body would be empty. |
| 20 | Where the once-only people wrapper lives | Exported `sharePeopleRead` in `lib/console/providers.ts`; inline in `page.tsx` | `providers.ts`, so it is unit-tested without rendering the page. |

## Build notes

- The gross moves in the unverifiable body are shown as signed hours ("Gross +1 h, -1 h (unclassified)"), matching the panel's other figures, rather than minutes.
- People staleness for rule incompleteness is computed from the snapshot's `syncedAt` with `TUNING.peopleStaleMinutes`, the same test the facade's people panel uses.
- e2e: the design assumed the mock Notion does not serve the console's Invoices data source. It does (REQ-25), so on the e2e stack the north star is a real verified read. The e2e flow checks that read (status ready, empty or stale, the current week, no Next week link, the detail list opening with Enter), then toggles the mock's `POST /__billing/fail` to make Invoices fail and checks the AC4 unverifiable state, then toggles it back.
- e2e: the REQ-55 check that every production panel says "Not connected yet" now expects 8 (the north star is wired) and no readout outside the north star, and the REQ-55 focus walk stops at the "Keyboard shortcuts" summary rather than at the first summary, since the north star's detail list is a `<details>` too.
