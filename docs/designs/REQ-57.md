Notion card: https://app.notion.com/p/400d6ae73dd78130bf4bcd5713d10129

# Card: REQ-57: Console 6/12: Sales radar and prioritised next-lead Rolodex (read-only queue)

Sales mode: one deduplicated queue from Students & Parents and Touches that always points at exactly one highest-ranked eligible person (or an honest empty or error state), explains why, shows the verified context the founder needs before the call, and opens the canonical record. No writes in this card.

**Seed:** FC-05. **Sources:** leads and touches readers from Console 3/12; the Stage machine, cadence and exceptions on the Notion page "OPS SYSTEM ([agents.md](http://agents.md))" as recorded in `docs/spec/founder-console/02-data-contracts.md`. **Blocked by:** Console 3/12, Console 4/12.

## Requirements

- Pure ranking function in `apps/tracker/lib/console/` (no I/O): input is the leads read model; output is an ordered queue with a `priorityReason` per item. Published order: (1) new, uncontacted: Stage = New; (2) urgent callback: Stage = Working with Next Action in (Call, Text) and Next Action Due at or before now; (3) post-trial decision: Stage = Awaiting Close, or Stage = Trial Claimed with a Lessons Type = Trial row and no Closed At; (4) due follow-ups: any active Stage (New, Working, Trial Booked, Trial Claimed, Awaiting Close, Onboarding) with Next Action Due at or before now not already covered; (5) older: the same stages with a future or missing Next Action Due, oldest Last Contact first. Ties break on Next Action Due, then created time, then page id, so order is stable. Overrides: an explicit `Next Action Due` earlier than the rule's slot moves the item up (human override preserved).
- Eligibility: excluded when Stage in (Active, Paused, Lost, legacy Trial, legacy Churned), when Lost Reason is Do not contact or Duplicate (permanent), or when Next Action = None. Rows with the same Lead ID or the same page id appear once. Missing Next Action Due on a New, Working, Awaiting Close or Onboarding row is shown as an exception, not hidden (OPS SYSTEM rule).
- Filters: New, Due, Post-trial, Later, plus All; keyboard: arrow keys move the selection, Enter opens the canonical Notion page, `/` focuses the filter. Filters never hide the exception count.
- Selected-lead panel (the Rolodex): student name, grade and subjects, Stage, Owner name (from `tracker.staff`), Next Action and due time, Attempts, last verified touch (Touches: type, outcome, note, when, by whom), trial context when present (Trial Time, Trial Teacher name, Level, Major Gaps, Recommended Plan, Trial Summary, and the Lessons Type = Trial row's Trial: Diagnosis and Preferred Lesson Day), source and milestone dates, and links: the Notion page, `tel:` from Parent Phone only when the designer includes it (never cached, never in HTML comments or logs). Missing notes render as "No trial report yet", never a generated sentence.
- Radar (`Radar` from Console 4/12): the five stage buckets as counts with the text table; the sweep is decorative.
- Failure handling: when the leads reader returns stale or error, the last successful queue stays on screen with a busy or error line and a retry; the queue never empties because a fetch failed; "Queue clear" appears only when the read is `ready` and complete.

## Acceptance criteria

- AC1: With any fixture the queue selects exactly one item or shows the empty or error state; it never selects two.
- AC2: Ranking matches the published order with a human-readable reason per item, and identical timestamps produce a stable order across runs.
- AC3: Lost, Do not contact, Duplicate, Active and Paused rows never enter the queue; two rows with one Lead ID show once; a row that becomes Lost between fetches leaves the queue on the next read.
- AC4: Trial diagnosis is shown when the Lessons row exists and shown as missing otherwise; no field is invented.
- AC5: Opening a lead goes to its Notion page url from the read model; no name-based lookup.
- AC6: On a failed or truncated fetch the previous queue remains with a visible stale or error line and a working retry.

## Test coverage

- T1: Table-driven ranking tests including identical timestamps, opt-outs, duplicates, missing due dates and the override case.
- T2: Facade integration with a stale provider and incomplete pagination.
- T3: Playwright in `e2e/tracker/flows.mjs` against the mock Notion: founder filters, moves with the keyboard, opens a record; `pnpm test:tracker` before the PR.

## Out of scope

No calls, texts or sends; no AI scoring; no source edits (Console 7/12); no setter or teacher views.

## Global guardrails (all Console cards)

Founder-only, enforced server-side (owner membership via `getViewer()`, `tracker.is_org_owner` RLS), never by hidden UI; every read through the owner's own client. Notion stays the editor of record for people, leads, touches, lessons, invoices and work (workspace ADR 0004, OPS SYSTEM page); no shadow copies beyond what ADR 0004 allows; joins by Notion page id, never by name. No fabricated values: every panel carries a status (ready, empty, loading, stale, error, unverifiable), its source ids and last successful fetch time; one failed provider never blanks another panel and unknown is never shown as zero. The console never sends a message, places a call, books, pays or publishes; deep links only. No new dependency without a Decisions-for-approval row. Visual fidelity is contractual: `docs/spec/founder-console/handoff/VISUAL_DIRECTION.md`, `PANEL_STATES.md` and `visual-assets/founder-command-bridge-reference.png`, built from HTML, CSS and SVG components, never a raster with baked text; reduced motion, keyboard operation and 390, 1280, 1440 and 1920 px widths. Demo data lives only in tests and an isolated preview, never in production source (automated scan). Migrations ship in their own PR; High risk and `apps/tracker/lib/notion/` changes carry needs-human-merge. Readiness is Charlie's call in `docs/readiness.md`, never implied by a merge.

---

# Design: REQ-57: Console 6/12: Sales radar and prioritised next-lead Rolodex

## Changes from last version

Approver revise 2 of 2. Each required change is answered below.

- Change 1 and C10 (row E contradicts the lift rule): E is base bucket 3, due 15:10Z and overdue. Bucket 2 holds C, due 15:30Z, which is later. So E lifts to effective bucket 2. The E row now reads "3, 2" at position 5, and C moves to position 6. AC2's expected order is now `A, B, G, D, E, C, F, H, K, I, J`. E's due is unchanged, so the fixture still exercises a bucket 3 lift. Every other row was rechecked against the lift rule:
  - G (base 4, due 2026-10-21 04:00Z) and D (base 4, due 14:00Z) lift to 2, because C (15:30Z) is later.
  - H (base 4, due 15:45Z) stays at 4. C (15:30Z) and E (15:10Z) are earlier, and F has no due.
  - F (no due) and the bucket 5 rows K, I and J (future or missing due) cannot lift. A and B are bucket 1, which never lifts and is never jumped.
- Change 2 (exact `priorityReason` per row): a new "Expected reasons" table under Ranking fixtures gives the exact string for every queued row. That includes the three lifted rows G, D and E, each ending in " (moved up: due earlier)". AC2 and the `sales-queue.test.ts` row now point to that table. In the reason template table, the lifted row's text no longer has the stray double space. It now says: the base reason, one space, then `(moved up: due earlier)`.
- Change 3 and C3 (AC2's order conflicts with its override property): with E before C the fixture order satisfies the property for every pair. Approach step 2 now also proves that the lift rule always gives the property, so the exact-order clause and the property clause cannot disagree for any input. The W and X pair and the trial-lessons-null case are rechecked as well. With trial lessons null, F drops to bucket 5 and the order is `A, B, G, D, E, C, H, K, F, I, J`.
- Number reservation re-checked on 2026-10-22 at 18:10Z (Decisions row 2). Tracker ADR 0071 is still used only by this card. Nothing else changed: scope, risk, the other ACs and the defaults are as before.

**Summary:** the Sales mode `next` and `radar` slots on `/tracker/console` stop saying "Not connected yet": the owner sees one deduplicated, ranked lead queue from Students & Parents with exactly one selected lead (or an honest empty or error state), a reason per item, filters and keyboard control, a Rolodex card with the verified context for the selected lead (stage, owner, next action, last touch, trial evidence) and a link to its Notion page, and a five-bucket radar with its text table; a failed or truncated refresh keeps the last good queue on screen with a stale line and a Retry button.
**Risk:** Medium (owner-only UI and one new owner-only GET route on the existing REQ-53 gate; reads more Students & Parents and Lessons fields into the owner's own tracker page, never to a new destination; no write, no auth, RLS or permission change, no migration. The PR touches `apps/tracker/lib/notion/`, so it carries `needs-human-merge` anyway.)

## Problem

Charlie (org owner, the only console viewer) needs to know, the moment he sits down on call, who to contact next and why, with the context he needs before dialling, without reading the Notion board. REQ-54 left typed read models for leads, touches and trial lessons behind `loadConsolePanels` (`apps/tracker/lib/console/facade.ts`); REQ-55 left the Sales grid with a `next` queue slot and a `radar` slot (`apps/tracker/lib/console/panel-slots.ts`) rendered as "Not connected yet" by `apps/tracker/app/console/page.tsx`. Missing: the ranking rules from the OPS SYSTEM page (`docs/spec/founder-console/02-data-contracts.md` sections 3.1 to 3.3 and 4), the few Notion fields the Rolodex needs that REQ-54 deliberately did not read (Lead ID for dedupe, Grade, Subjects, the text of Major Gaps, Trial Summary and Trial: Diagnosis), the interactive queue, and failure handling that never empties the queue because a fetch failed. Teachers, students and parents see nothing new.

## Acceptance criteria

- [ ] AC1: For every fixture in the ranking table and every reducer sequence in `sales-state.test.ts`, the queue has exactly one selected item when the visible list is non-empty and none when it is empty; the rendered Rolodex has exactly one `role="option"` with `aria-selected="true"`, or zero options and one of the texts "Queue clear", "No leads match this filter", "Queue may be incomplete" or the error state.
- [ ] AC2: `rankSalesQueue` returns the fixture table's order `A, B, G, D, E, C, F, H, K, I, J`, with effective buckets 1, 1, 2, 2, 2, 2, 3, 4, 5, 5, 5. Each item's `priorityReason` equals the string in the Expected reasons table under Ranking fixtures. With trial lessons null the order is `A, B, G, D, E, C, H, K, F, I, J`; for 20 shuffled orderings of the same input (including rows W and X with identical due and created times) the output order is identical; and for any two queued items X and Y outside bucket 1, when X's Next Action Due is set and at or before now and Y's is set and later, X comes before Y (the override).
- [ ] AC3: Rows with Stage Active, Paused, Lost, Trial (legacy) or Churned (legacy), with Lost Reason Do not contact or Duplicate at any stage, or with Next Action None never appear in `items`; two rows with the same Lead ID (trimmed, case-insensitive) appear once (the better-ranked row is kept, `mergedDuplicates` counts the other); the same page id given twice appears once; and when a later refresh returns a selected row as Lost, it is gone from the list and the selection moves to the first visible item.
- [ ] AC4: For the selected lead, the Rolodex shows the newest Lessons `Type = Trial` row's Trial: Diagnosis text and Preferred Lesson Day when that row exists; "No trial report yet" when the row exists with an empty diagnosis; "No trial lesson logged" when no row exists and the trial lessons read was usable; "Trial lessons unavailable" when that read failed. Empty Major Gaps or Trial Summary show "No trial report yet". No other text is generated for a missing field.
- [ ] AC5: The Rolodex's "Open in Notion" link and the Enter key open `pageUrl` from the leads read model (`notionPageUrl(id)`) for the selected row; a fixture with two leads of the same name links each to its own page id.
- [ ] AC6: When a refresh fails (network error, non-200, or a 200 whose queue is `error`) or comes back truncated (leads stopped at the page cap) while a previous queue is on screen, the previous items and selection stay, the panel status is `stale` with the line "Refresh failed at HH:MM: \<message>. Showing the queue from HH:MM." (or "Latest read incomplete: \<reason>. Showing the queue from HH:MM."), and a Retry button issues a new request; when Retry succeeds the line is gone and the status is `ready`. "Queue clear" appears only when the leads panel is `ready` or `empty` and no row is eligible.
- [ ] AC7: Filters All, New, Due, Post-trial and Later show their counts and filter by base bucket (New = 1, Due = 2 and 4, Post-trial = 3, Later = 5); the exception count line is rendered under every filter; ArrowDown and ArrowUp move the selection with no wrap, Home and End go to the first and last item, Enter opens the selected lead's page, and `/` (outside form fields, Sales mode, no Ctrl, Meta or Alt) focuses the checked filter.
- [ ] AC8: The Rolodex shows student name, Grade, Subjects, Stage, owner name from `tracker.staff` ("Unassigned" when no Owner, "Unknown staff" when the id has no staff row), Next Action and its due time, Attempts, the newest touch (type, outcome, note, when, staff name) or "No touches in the last 90 days" or "Touch history unavailable", trial context when any trial field or trial lesson exists, Source and the milestone dates (Contacted At, Trial Booked At, Trial Attended At, Closed At). No console source file and no rendered page or `/api/console/sales` body contains `tel:`, a Parent Phone, a Parent Email or a Lead ID value.
- [ ] AC9: The radar shows five sectors and a table with rows New, Callback due, Post-trial, Follow-up due and Later whose counts equal the number of queued items in base buckets 1 to 5; it shows "No active leads" only when the leads panel is `ready` or `empty` and nothing is eligible, and the kit's error state when the leads read failed.
- [ ] AC10: Rows that are eligible or active-staged but break the OPS SYSTEM rule are listed as exceptions and never hidden: a missing Next Action Due on a New, Working, Awaiting Close or Onboarding row ("No Next Action Due"), and a row with no Stage ("No Stage"); the line "N exceptions" (or "No exceptions") is always present in the `next` panel.
- [ ] AC11: `GET /tracker/api/console/sales` answers the owner 200 with `Cache-Control: no-store` and a body that parses with `SalesViewSchema` and has no key outside it; a guest gets the same 307 as the health route, and Ryan, teacher2, the student, the parent and the role-less user get 403 `{"error":"forbidden"}`; `is_org_owner` false gives 403 and a failed viewer or rpc gives 503. `GET /api/console/health` still reports exactly the six providers.
- [ ] AC12: The page is usable at 390, 1280, 1440 and 1920 px with no horizontal scroll (`scrollWidth <= innerWidth`) on `?mode=sales`, and the selection transition is `none` under `prefers-reduced-motion: reduce`.
- [ ] AC13: Tracker ADR `0071-sales-queue-ranking.md` exists with Status, Context, Decision and Consequences, is listed in the decisions `README.md`, has no em dash, and records the published order, the override rule, eligibility, Lead ID dedupe, the browser-only retention and the no-phone rule.

## Approach

**1. Reader additions (human-merge path).**

- `apps/tracker/lib/notion/leads.ts`: add `"Lead ID"`, `"Grade"`, `"Subjects"` to `LEAD_PROPS` (`prop.text`, `prop.select`, `prop.multi`). `LeadSource` (in `lib/console/contracts.ts`) gains `leadId: string | null` (trimmed, lowercased, empty to null), `grade: string | null`, `subjects: string[]`, `majorGaps: string | null` and `trialSummary: string | null` (text cut to 1000 characters). `hasMajorGaps` and `hasTrialSummary` stay as they are. Parent Phone and Parent Email are still never requested.
- `apps/tracker/lib/notion/lessons.ts`: `TrialLessonSource` gains `diagnosis: string | null` (Trial: Diagnosis text, cut to 1000 characters). `TRIAL_PROPS` is unchanged (it already requests the property); `hasDiagnosis` stays.
- `apps/tracker/lib/console/contracts.ts`: `LeadRow` gains `dedupeKey: str` (from `leadId`), `grade: str`, `subjects: z.array(z.string())`, `majorGaps: z.string().max(1000).nullable()`, `trialSummary` likewise; `TrialLessonRow` gains `diagnosis` likewise. `dedupeKey` lives only in server-side panels: the facade passes it through, and the sales view schema (step 3) has no such key.
- `apps/tracker/lib/console/facade.ts`: map the new fields in the leads build (`dedupeKey: l.leadId`) and the trial lessons build; export `PAGE_CAP_PREFIX = "Stopped after "` and build the existing cap reason from it. No behaviour change otherwise.

**2. Pure ranking (new): **`apps/tracker/lib/console/sales-queue.ts`**.** No I/O; imports only `lib/time`, `lib/domain/billing` (`normalId`) and `lib/domain/schedule/wallclock` (`localToUtc`).

```ts
export type Bucket = 1 | 2 | 3 | 4 | 5;
export type QueueEntry = { lead: LeadRow; bucket: Bucket; effectiveBucket: Bucket; priorityReason: string; trialLessonId: string | null };
export type QueueException = { id: string; pageUrl: string; name: string; stage: string | null; reason: "No Next Action Due" | "No Stage" };
export type RankedQueue = { items: QueueEntry[]; exceptions: QueueException[]; mergedDuplicates: number };
export function rankSalesQueue(input: { leads: LeadRow[]; trialLessons: TrialLessonRow[] | null; now: Date }): RankedQueue;
```

Rules in order:

- **Due instant.** A datetime due is its instant; a date-only due `D` is `localToUtc(D, "00:00")` in America/Toronto. "Due at or before now" compares instants.
- **Eligibility.** Excluded: Stage not in the active set (New, Working, Trial Booked, Trial Claimed, Awaiting Close, Onboarding), which covers Active, Paused, Lost, legacy Trial, legacy Churned and null; Lost Reason Do not contact or Duplicate; Next Action None.
- **Exceptions** (computed over all rows before eligibility, deduped by page id): Stage null gives "No Stage"; Stage New, Working, Awaiting Close or Onboarding with no Next Action Due gives "No Next Action Due". Ordered by created time, then page id. An exception row that is also eligible stays in the queue.
- **Base bucket.** 1: Stage New. 2: Stage Working, Next Action Call or Text, due at or before now. 3: Stage Awaiting Close; or Stage Trial Claimed with a trial lesson row for this lead (`normalId(lesson.studentId) === normalId(lead.id)`) and no Closed At. 4: any other active-stage row due at or before now. 5: the rest (future or missing due).
- **Dedupe.** First by `normalId(id)`, then by `dedupeKey` when not null: per key keep the row with the smallest base sort key (below); the others are dropped and counted in `mergedDuplicates`.
- **Override (lift).** For an item X in base bucket 3, 4 or 5 whose due is set and at or before now: `effectiveBucket` is the smallest bucket b in \{2, 3\}, b below X's base bucket, that holds an item whose due is set and later than X's; otherwise `effectiveBucket = bucket`. Bucket 1 is never jumped. Computed once against base buckets, so it is deterministic.
- **Why the override property always holds (AC2).** Take queued X and Y outside bucket 1, where X's due is set and at or before now and Y's due is set and later. X is in base bucket 2, 3 or 4, because bucket 5 never holds an overdue due.
  - If Y's effective bucket b is 2 or 3 and below X's base, then base bucket b holds an item due later than X: Y itself, or the item Y was lifted past. So X lifts to b or lower.
  - Otherwise X's effective bucket is at most Y's.
  - When both are in the same effective bucket (2, 3 or 4), the due-ascending key puts X first.
  - Fixture check: E (15:10Z) and C (15:30Z) give E before C; C and H (15:45Z) give C before H.
- **Sort key.** `(effectiveBucket, then for bucket 5 Last Contact ascending with "never contacted" first, then due ascending with missing last, then created time ascending with missing last, then normalised page id ascending)`.
- **Trial lesson.** `trialLessonId` is the newest matching Type = Trial row (date descending, then id) or null.

`priorityReason` strings (`{when}` is Toronto "Wed 21 Oct 09:00", or "Wed 21 Oct" for a date-only due; `{date}` is "Wed 21 Oct"):

| Bucket | Reason |
| --- | --- |
| 1 | `New lead, not contacted yet` |
| 2 | `Urgent callback: {Next Action} due {when}` |
| 3, Awaiting Close | `Post-trial decision: awaiting close` |
| 3, Trial Claimed | `Post-trial decision: trial on {lesson date}, not closed` |
| 4 | `Follow-up due: {Next Action} due {when}` |
| 5 | `Later: last contact {date}` or `Later: never contacted`, then `, next {Next Action} {when}` or `, no due date` |
| lifted | the base reason, one space, then `(moved up: due earlier)` |

**3. Sales view (new): **`apps/tracker/lib/console/sales-view.ts`**.** `buildSalesView(panels: ConsolePanels, now: Date): SalesView` and the wire schema `SalesViewSchema` (plain `z.object`, strip mode, as REQ-54 Decision 16).

```ts
type SalesLead = {
  id: string; pageUrl: string; name: string; stage: string; bucket: Bucket; effectiveBucket: Bucket; filter: "new" | "due" | "postTrial" | "later";
  priorityReason: string; nextAction: string | null; nextActionDue: string | null; attempts: number | null;
  ownerName: string | null; ownerState: "named" | "unassigned" | "unknown"; grade: string | null; subjects: string[];
  source: string | null; createdAt: string | null; lastContact: string | null;
  contactedAt: string | null; trialBookedAt: string | null; trialAttendedAt: string | null; closedAt: string | null;
  trial: null | { trialTime: string | null; trialTeacherName: string | null; level: string | null; majorGaps: string | null;
    recommendedPlan: string | null; trialSummary: string | null;
    lesson: { state: "found"; pageUrl: string; date: string | null; diagnosis: string | null; preferredDays: string[] } | { state: "none" } | { state: "unavailable" } };
  lastTouch: { state: "found"; type: string | null; outcome: string | null; note: string; when: string | null; staffName: string | null; pageUrl: string }
    | { state: "none" } | { state: "unavailable" };
};
type SalesQueue = { items: SalesLead[]; exceptions: QueueException[]; mergedDuplicates: number; truncated: boolean; windowDays: number };
type SalesView = { queue: PanelView<SalesQueue>; radar: PanelView<RadarStage[]> };
```

- Queue status: leads `error` gives `error` (data null, message verbatim). Leads `stale` gives `stale` with the leads `staleReason`, and `truncated` is true when it starts with `PAGE_CAP_PREFIX`. Leads `ready` or `empty`: when the trial lessons panel is `error`, or `stale` with the cap prefix, and any active row has Stage Trial Claimed, `stale` with "Trial lessons unavailable; post-trial order may be incomplete"; otherwise `empty` when no item is eligible, else `ready`. Freshness times come from the leads panel; `sourceEvidence` joins the leads, touches and trial lessons evidence.
- `trial` is non-null when any of Trial Time, Trial Teacher, Level, Major Gaps, Recommended Plan or Trial Summary is set, or a trial lesson matches. `lesson.state` is `unavailable` when the trial lessons panel has no data (`error`). `lastTouch` comes from the touches group with the same `normalId`, newest first; `unavailable` when the touches panel is `error`, `none` when no group matches.
- Radar: data is five `RadarStage` (`new` "New", `callback` "Callback due", `postTrial` "Post-trial", `followUp` "Follow-up due", `later` "Later") counted by base bucket; status follows the leads panel (`error`, `stale`), else `empty` when nothing is eligible, else `ready`.
- The returned view is `SalesViewSchema.parse(view)`, so `dedupeKey` and any other server-only key are dropped.

**4. Route (new): **`apps/tracker/app/api/console/sales/route.ts` with `export const dynamic = "force-dynamic"` and `GET` only, calling the new `handleConsoleSales` in `apps/tracker/lib/console/handlers.ts`. The owner gate steps of `handleConsoleHealth` (viewer, `requireOwner`, `is_org_owner` rpc, each failure mapped as today) move into one private `gateOwner(input)` used by both handlers, so the health route's behaviour and tests are unchanged. After the gate: `loadConsolePanels(input.deps(viewer, now))`, then `buildSalesView`, then `send(200, view)`; a throw gives 503 `CONSOLE_DENIALS.unavailable`.

**5. Page wiring: **`apps/tracker/app/console/page.tsx`**.** After the owner gate, run `loadConsolePanels` once (if REQ-56 has merged and the page already calls it, reuse that result; there is never a second facade call per load), build `sales = buildSalesView(facade, now)`, set `panels.sales.next = sales.queue` and `panels.sales.radar = sales.radar` on `placeholderPanels(now)` so the rail's "N of 9 connected" counts them, and pass `sales` to `ConsoleBridge`. The facade never throws; a throw from `buildSalesView` is caught and both slots get an `error` view with "Read failed".

**6. Client state (new, pure): **`apps/tracker/lib/console/sales-state.ts`**.** Tested in node without a DOM, like `sync-poller.ts`.

- `SalesState = { shown: SalesView; lastGood: SalesView | null; fetch: "idle" | "busy"; failure: { at: string; message: string } | null; filter: Filter; selectedId: string | null }`.
- `salesReducer(state, action)` with actions `refreshStart`, `refreshOk(view, at)`, `refreshFailed(message, at)`, `setFilter(filter)`, `move(key)`, `select(id)`. `refreshOk` with a queue of `ready` or `empty` (or `stale` but not truncated) replaces both views; with a queue `error` or truncated while `lastGood` has queue data, it keeps `lastGood` and sets the failure (message from `errorMessage`, or "Latest read incomplete: " plus the reason); otherwise it shows the new view as is. `refreshFailed` keeps `lastGood` the same way, or shows the kit error state when there is none.
- `visibleItems(state)` filters by base bucket; selection keeps `selectedId` when it is still visible, else the first visible item, else null; `setFilter` selects the first visible item.
- `retainedView(state): PanelView<SalesQueue>`: when a failure is set and `lastGood` exists, the last good data with status `stale`, `staleReason` from the AC6 templates, `lastCheckedAt` = failure time and `lastSuccessfulFetchAt` from `lastGood`.
- `queueKeyTarget(key, index, count)`: ArrowDown and ArrowUp move by one, clamped (no wrap), Home and End; anything else returns null.
- `shouldRefreshOnSync(seen, sync)`: the first `ok` or `degraded` `checkedAt` seen after mount is only recorded; each later new one triggers one refresh. So the queue refreshes in step with the existing 60 s health poll, paused while the tab is hidden, and no new timer is added.

**7. Components (new): **`apps/tracker/components/console/sales/`**.**

- `sales-provider.tsx` ("use client"): `useReducer(salesReducer)` seeded with the server view; refreshes from `fetch("/tracker/api/console/sales", { cache: "no-store" })` (basePath spelled out, as `sync-provider.tsx` does) when `shouldRefreshOnSync` says so or Retry is pressed, skipped while a fetch is busy. The response is parsed with `SalesViewSchema`; a parse failure counts as a failed refresh. It keeps state only in React memory: no `localStorage` and no server cache (ADR 0004, ADR 0065).
- `next-lead.tsx` ("use client"): `InstrumentPanel` for slot `next`, with `retainedView` as its result. In the value body: a filter `fieldset` of native radios ("All 11", "New 2", "Due 4", "Post-trial 2", "Later 3", each with its live count); the exception line with a native details element listing each exception (name, stage, reason, "Open in Notion" link); a "Refreshing" line (`aria-live="polite"`) while busy; a Retry button when a failure is shown; then two columns at 1280 px and wider (queue left, Rolodex right), stacked below that.
  - The queue is `ol role="listbox" tabIndex=0 aria-activedescendant` with one `li role="option"` per item (name, `priorityReason`, due), click to select, and the NEXT tag on the selected row (gold edge, VISUAL\_DIRECTION C).
  - The Rolodex is a `dl` with the AC8 fields in that order, the AC4 trial block and an "Open in Notion" link (`target="_blank" rel="noopener noreferrer"`).
  - Keys: listbox `onKeyDown` uses `queueKeyTarget`; Enter calls `window.open(pageUrl, "_blank", "noopener,noreferrer")`. A document `keydown` for `/` checks the same guards as `mode-context.tsx` (`inField`, modifiers), the current mode being Sales, and then focuses the checked radio.
  - Empty texts: "Queue clear" (status `empty`), "No leads match this filter" (ready, filtered list empty), "Queue may be incomplete" plus the reason (stale with no items).
- `sales-radar.tsx` ("use client"): the existing kit `Radar` with the provider's radar view (retained the same way as the queue).
- `apps/tracker/components/console/shell/bridge.tsx`: `ConsoleBridge` takes an optional `sales?: SalesView`. When it is set, the Sales `ModePanel` children are wrapped in `SalesProvider` (a context provider adds no DOM, so the grid areas hold), and `Instrument` renders `NextLead` for `slot.id === "next"` and `SalesRadar` for `"radar"` before the kind switch. Without `sales` (the preview, other modes) nothing changes.
- `apps/tracker/components/console/shell/shortcut-help.tsx`: add the rows "Up, Down, Home, End: move in the lead queue", "Enter: open the selected lead in Notion" and "/: focus the queue filter".
- `apps/tracker/app/console/console.css`: `.console-sales-*` rules using only the existing tokens; selection transition `transform 180ms`, set to `none` under `prefers-reduced-motion: reduce`; text at least 12 px; one column at 640 px and below.

Layout of the `next` slot at 1440 px:

```javascript
NEXT CONTACT                                        [Ready]
( All 11 ) ( New 2 ) ( Due 4 ) ( Post-trial 2 ) ( Later 3 )
3 exceptions  [show]                     Refreshing  [Retry]
+------------------------------+  +---------------------------+
| > Nova New            NEXT   |  | Nova New        Grade 11  |
|   New lead, not contacted    |  | MHF4U, SPH4U   Stage New  |
|   Gail Overdue               |  | Owner Ryan Test           |
|   Urgent callback: Call 11:00|  | Next Call, Wed 22 Oct 11:00|
|   Ezra Awaiting Close        |  | Attempts 0                |
+------------------------------+  | Last touch: none in 90 d  |
                                  | Trial: none logged        |
                                  | Source Meta form          |
                                  | [Open in Notion]          |
                                  +---------------------------+
Checked 12:05   Last success 12:05
```

**8. Preview and docs.** `apps/tracker/test/console/demo-panels.ts` gains a demo `SalesView` (test data only; the existing scan keeps it out of production) that `app/console/preview/page.preview.tsx` passes as `sales`. Tracker ADR `apps/tracker/docs/decisions/0071-sales-queue-ranking.md` and its README row; it amends ADR 0065's "Lead ID is never read" to "read for dedupe, never sent to the browser". `docs/readiness.md` has no row for this card, so the builder adds none.

## Migration

None. No table, column, policy or trigger; the route reads through the existing owner client and RLS.

## Ranking fixtures (T1, AC2, AC3, AC10)

Now is 2026-10-22T16:00:00Z (12:00 Toronto). All rows have a Next Action other than None unless stated.

| Row | Stage | Next Action, due | Other | Base, effective | Position |
| --- | --- | --- | --- | --- | --- |
| A | New | Call, 15:00Z | created 10-21 | 1, 1 | 1 |
| B | New | Call, none | created 10-20; exception | 1, 1 | 2 |
| G | Onboarding | Assign teacher, 2026-10-21 (date) | none | 4, 2 | 3 |
| D | Working | Book trial, 14:00Z | none | 4, 2 | 4 |
| E | Awaiting Close | Close call, 15:10Z | none | 3, 2 | 5 |
| C | Working | Call, 15:30Z | Lead ID "M-1" | 2, 2 | 6 |
| F | Trial Claimed | Close call, none | trial lesson row dated 2026-10-20, no Closed At, never contacted | 3, 3 | 7 |
| H | Trial Booked | Deliver trial, 15:45Z | none | 4, 4 | 8 |
| K | Trial Claimed | Close call, 10-25T14:00Z | no trial lesson, never contacted | 5, 5 | 9 |
| I | Working | Text, 10-24T14:00Z | last contact 10-10 | 5, 5 | 10 |
| J | Working | Call, none | last contact 10-15; exception | 5, 5 | 11 |
| U | Working | Call, 15:30Z | Lead ID " m-1 ", created after C | dropped (dedupe) | not queued |
| A again | as A | as A | same page id | dropped | not queued |
| L, M, N | Lost; Working with Lost Reason Do not contact; Working with Lost Reason Duplicate | any | none | excluded | not queued |
| O, P, Q, R | Active, Paused, Trial, Churned | any | none | excluded | not queued |
| S | Working | None | none | excluded | not queued |
| T | no Stage | any | exception "No Stage" | excluded | not queued |
| W, X | Working | Call, 15:20Z each | same created time; page ids 00000000-0000-4000-8000-000000000001 (W) and 00000000-0000-4000-8000-000000000002 (X) | separate case: W before X | W then X |

Expected `mergedDuplicates` is 1 (U); A again is a page-id duplicate and is not counted. Exceptions: B, J, T.

When trial lessons are null (the read failed), F drops to base bucket 5. F and K are both never contacted, and K has a due while F has none, so K comes before F. The order is `A, B, G, D, E, C, H, K, F, I, J` and the view is `stale` with the trial reason. Every other row's bucket and reason is unchanged.

In the separate W and X case, both rows are base and effective bucket 2. They have the same due and the same created time, so W comes before X on page id.

**Expected reasons** (exact `priorityReason` strings). Now is Thu 22 Oct 12:00 Toronto (EDT, UTC-4).

| Row | Base, effective | `priorityReason` |
| --- | --- | --- |
| A | 1, 1 | `New lead, not contacted yet` |
| B | 1, 1 | `New lead, not contacted yet` |
| G | 4, 2 | `Follow-up due: Assign teacher due Wed 21 Oct (moved up: due earlier)` |
| D | 4, 2 | `Follow-up due: Book trial due Thu 22 Oct 10:00 (moved up: due earlier)` |
| E | 3, 2 | `Post-trial decision: awaiting close (moved up: due earlier)` |
| C | 2, 2 | `Urgent callback: Call due Thu 22 Oct 11:30` |
| F | 3, 3 | `Post-trial decision: trial on Tue 20 Oct, not closed` |
| H | 4, 4 | `Follow-up due: Deliver trial due Thu 22 Oct 11:45` |
| K | 5, 5 | `Later: never contacted, next Close call Sun 25 Oct 10:00` |
| I | 5, 5 | `Later: last contact Sat 10 Oct, next Text Sat 24 Oct 10:00` |
| J | 5, 5 | `Later: last contact Thu 15 Oct, no due date` |
| F (trial lessons null) | 5, 5 | `Later: never contacted, no due date` |
| W, X | 2, 2 | `Urgent callback: Call due Thu 22 Oct 11:20` |

Only G, D and E carry the suffix. Each is separated from its base reason by exactly one space.

## Test plan

| Test | Type | Covers |
| --- | --- | --- |
| `apps/tracker/lib/console/sales-queue.test.ts`: the fixture table: order, buckets, effective buckets, every string in the Expected reasons table compared exactly (including the one-space suffix on G, D and E), exceptions and `mergedDuplicates`; the trial-lessons-null order and F's reason; 20 shuffles give one order; W and X tie; override property over all fixture pairs; date-only due on the DST date 2026-11-01; trial lessons null | unit (vitest) T1 | AC2, AC3, AC10 |
| `apps/tracker/lib/console/sales-view.test.ts`: `buildSalesView` over fake `ConsolePanels`: leads error gives queue and radar `error`; leads stale with the cap prefix gives `truncated` and no `empty`; trial lessons error with a Trial Claimed row gives the trial reason; touches error gives `lastTouch.state` "unavailable"; owner states; radar counts equal bucket counts; `SalesViewSchema` output has no `dedupeKey`, `leadId`, phone or email key (deep key walk) | unit | AC3, AC4, AC6, AC8, AC9 |
| `apps/tracker/lib/console/sales-view.test.ts` facade integration: `loadConsolePanels` with fake `NotionPorts` where leads returns `complete: false` and touches times out; the view is `stale`, keeps the rows, `truncated` true, and never "Queue clear" | integration T2 | AC6 |
| `apps/tracker/lib/console/sales-state.test.ts`: refresh ok, failed with and without `lastGood`, 200 with queue error, truncated after a good one (keeps previous, exact AC6 line), Retry success clears the failure; selection invariant after every action over the fixtures; a selected row turned Lost leaves and the selection moves to the first; `setFilter` counts and membership; `queueKeyTarget` clamps; `shouldRefreshOnSync` skips the first and fires once per new `checkedAt` | unit | AC1, AC3, AC6, AC7 |
| `apps/tracker/components/console/sales/next-lead.test.ts` (renderToStaticMarkup with a seeded provider, as `kit/kit.test.ts`): one `aria-selected="true"`; "Queue clear" only for `empty`; "No leads match this filter"; "Queue may be incomplete"; the AC4 strings for found, empty diagnosis, none and unavailable; the AC8 fields and fallbacks; the exception line under each filter; the Open link equals `pageUrl` for two same-name leads; no `tel:` in the markup | unit | AC1, AC4, AC5, AC7, AC8, AC10 |
| `apps/tracker/components/console/kit/kit.test.ts` addition: `SalesRadar` five rows with the labels, "No active leads" for empty | unit | AC9 |
| `apps/tracker/components/console/shell/bridge.test.ts` addition: with `sales` the `next` and `radar` slots render the new components; without it, unchanged; the rail counts 2 of 9 connected | unit | AC9, AC11 |
| `apps/tracker/app/api/console/console-routes.test.ts` additions: sales route owner 200, no-store, body keys equal the schema's; non-owner 403; rpc false 403; rpc error and viewer throw 503; the health cases still pass | unit | AC11 |
| `apps/tracker/lib/notion/leads.test.ts`, `lessons.test.ts` updates: the design prop list now includes Lead ID, Grade, Subjects; Parent Phone and Parent Email still never requested; text cut to 1000; Lead ID normalised | unit | AC3, AC8 |
| `apps/tracker/lib/console-scan.test.ts` additions: the new files are covered by the existing write, service-client and Notion-import rules; no console file contains `tel:` or `Parent Phone`; `dedupeKey` appears only in `contracts.ts`, `facade.ts` and `sales-queue.ts`; the `.console-sales` transition is `none` under reduced motion | unit (scan) | AC8, AC12 |
| `apps/tracker/lib/sales-queue-adr.test.ts` (as `lib/lesson-adr.test.ts`): ADR 0071 sections, the six recorded rules, README row, no em dash | unit (doc) | AC13 |
| `e2e/tracker/flows.mjs` REQ-57, against fixtures added to `e2e/tracker/mock-notion.mjs` (step 9): NEXT is the New lead; ArrowDown moves the selection; the Post-trial filter shows only the Awaiting Close lead with its diagnosis; `/` focuses the filter; "1 exception" under every filter; Enter opens a popup whose URL is the lead's `notionPageUrl` (route `https://www.notion.so/**` stubbed to 200); excluded names, the fixture Lead ID and `tel:` absent from the HTML and the sales JSON; POST `/__console/leads-fail` then Retry keeps the queue with "Refresh failed at"; toggle back, Retry, line gone; POST `/__console/lose` then Retry removes that lead; the sales route denials for Ryan, teacher2, student, parent, role-less, guest; no horizontal scroll at 390 and 1280; reduced-motion transition `none`; screenshots at 390x844, 1280x720, 1440x900, 1920x1080 into `docs/spec/founder-console/screenshots/req-57/` | e2e (builder runs `pnpm test:tracker` before the PR) T3 | AC1, AC3, AC4, AC5, AC6, AC7, AC8, AC11, AC12 |

**9. e2e fixtures.** `e2e/tracker/mock-notion.mjs`: add the lead properties (Owner, Next Action, Next Action Due, Attempts, Last Contact, Source, Lost Reason, the milestones, Trial Time, Trial Teacher, Level, Major Gaps, Recommended Plan, Trial Summary, Lead ID, Grade, Subjects) to the Students & Parents schema answer. A Students query whose `filter_properties` includes the Next Action Due id returns a separate `CONSOLE_LEADS` list (ids of the form `eeeeeeee-0000-4000-8000-0000000000NN`, NN from 01, times relative to now; never returned to the people sync queries, so other flows see the same students). Add a Touches data source (`772939bd-bd88-4272-9f1f-20ce75ef2204`) schema and query with two touches; add `Topic Covered`, `Trial: Diagnosis` and `Trial: Preferred Lesson Day` to the Lessons schema and answer a `Type = Trial` filter from a separate `CONSOLE_TRIALS` list, so the existing lessons Map and its flows are untouched. Add the toggles POST `/__console/leads-fail` (500 on the console leads query) and POST `/__console/lose` (one fixture lead becomes Stage Lost). Invoices and Work stay unserved, so REQ-56's unverifiable check holds.

## Out of scope

- Any write, call, text or send (Console 7/12 logs outcomes); no `tel:` link (Decision 4); no AI scoring; no setter or teacher views.
- The `followUps`, `signals`, `dispatch` and other Sales slots stay "Not connected yet"; the Due filter covers due follow-ups inside the queue (Decision 6).
- Persisting the queue anywhere (no table, no server cache, no browser storage).
- Fresh-lead alerts and pulses (Console 11/12).
- Changes to the health route's shape.

## Risks and edge cases

- **Notion down or slow.** The facade caps each read at 8 s; a failed refresh keeps the last good queue with the AC6 line; on the first load with no good queue, the kit error state shows with Retry (a reload).
- **Pagination cap.** A truncated leads read is `stale`, never "Queue clear", and never replaces a complete queue on screen.
- **Trial lessons or touches unavailable.** Ranking cannot see post-trial evidence, so the queue is `stale` with a reason; the Rolodex says "unavailable" instead of "none".
- **Owner names stale.** People sync older than 120 min makes leads `stale` with `people_sync_stale` printed verbatim (REQ-55 rule); the queue still shows.
- **Date-only versus datetime dues.** Date-only dues are 00:00 Toronto, so a due "today" counts as due all day; tested on the 2026-11-01 DST date.
- **Duplicate rows.** Same page id twice, or two pages with one Lead ID: one shown, count kept. Rows marked Lost with Lost Reason Duplicate are excluded anyway.
- **Unauthorised callers.** The sales route uses the same gate as health (app check and `is_org_owner` RLS); denials read nothing. GET only, so the proxy's origin check is not needed.
- **Free text on screen.** Major Gaps, Trial Summary, Diagnosis and the touch note are rendered as React text (escaped), cut to 1000 or 280 characters, and only for the owner.
- **Two refreshes at once.** A sync tick during a busy fetch is skipped; Retry while busy is disabled.
- **Shared file conflicts.** REQ-56 also edits `page.tsx` and `bridge.tsx`; this card adds one `if` per slot and one prop, and reuses REQ-56's facade call if present.
- **Notion rate limits.** Each sales refresh is one facade load (the same six reads as the health poll), once a minute while visible: about 12 Notion requests a minute, under the 3 per second average.

## Decisions for approval

| # | Decision | Options | Default if you say nothing |
| --- | --- | --- | --- |
| 1 | New dependencies | None | None. React, Zod and the existing kit. |
| 2 | Schema placement and numbers | Migration; tracker ADR number | No migration. Tracker ADR `0071-sales-queue-ranking.md`, the first number nothing uses. Re-checked 2026-10-22 at 18:10 UTC with `gh api` and the board. |

- `main` has tracker decisions 0001 to 0067 and migrations up to 0026.
- No `req/` PR is open.
- REQ-56 names tracker ADR 0068.
- REQ-45 and REQ-48 both name tracker ADR 0069 and migration 0028. That clash is between those two cards.
- REQ-60 names tracker ADR 0070.
- REQ-59 and REQ-46 both name tracker ADR 0072. That clash is between those two cards.
- REQ-58 names no number.

No other card names 0071. |
| 3 | New Notion fields read | Lead ID, Grade, Subjects, Major Gaps text, Trial Summary text, Trial: Diagnosis text; booleans only (REQ-54 Decision 5) | Read them, as the card asks for dedupe and the Rolodex. Text cut to 1000 characters. Lead ID never leaves the server. This amends REQ-54 Decisions 4 and 5 and ADR 0065, recorded in ADR 0071. |
| 4 | `tel:` from Parent Phone | Include; leave out | Leave out. The spec says contact is shown only as deep links (section 3.1), and the Notion page already offers the phone. Parent Phone stays unread. |
| 5 | Meaning of the override | The lift rule in Approach step 2; bucket order only | The lift rule: an overdue explicit due goes ahead of any later-due item in buckets 2 and 3; bucket 1 (fresh leads) is never jumped, as MASTER\_BRIEF puts fresh leads first. |
| 6 | Follow-ups slot | Leave "Not connected yet"; fill it from the Due filter | Leave it. The card asks only for the queue, Rolodex and radar; the Due filter shows the same items. |
| 7 | Radar buckets | The five queue buckets; the eleven Notion stages | The five queue buckets, as the card says "five stage buckets", counted from eligible, deduped items. |
| 8 | Where the last good queue is kept | Browser memory in the sales provider; a server cache | Browser memory only. A server cache would be a shadow copy (ADR 0004, ADR 0065 keeps times only). A reload starts from a fresh read. |
| 9 | Refresh cadence | In step with the existing 60 s health poll plus Retry; a separate timer; Retry only | In step with the health poll (`shouldRefreshOnSync`), paused while hidden, plus Retry. No new timer. |
| 10 | Wire format | New `GET /api/console/sales` returning `SalesView`; extend the health route | New route. The health route stays statuses and times only (REQ-54 AC9). |
| 11 | Duplicate kept | The better-ranked row; the newest row | The better-ranked row, with the dropped count shown as "N duplicate rows merged" under the exception line. |
| 12 | Rows with no Stage | Exception "No Stage"; silently excluded | Exception, so nothing is hidden (OPS SYSTEM rule). |
| 13 | Keyboard | Up and Down without wrap, Home, End, Enter, `/`; with wrap | No wrap, so holding Down stops at the last lead. The 1, 2, 3 and ? keys keep working. |
| 14 | Size | One PR; readers first in a separate PR | One PR. The reader additions are small, and the whole PR is human-merge because of `lib/notion/`. |
| 15 | e2e mock data | Separate `CONSOLE_LEADS` and `CONSOLE_TRIALS` lists answered only for the console's queries; extend the shared lists | Separate lists, so the people sync, billing and lessons flows see unchanged data. |
