Notion card: https://app.notion.com/p/400d6ae73dd781c69c9de742487b1b7b

# Card: REQ-62: Console 11/12: Polled actionable signals, protected-time snooze and integration health

Fresh leads and real operational exceptions surfaced in any mode with honest provenance (bounded polling, last-checked time), deduplicated per source record, snoozable during protected teaching time, and never claiming "all clear" when a provider check failed. No new notification platform; nothing is sent.

**Seed:** FC-09. **Sources:** there is no realtime, push, SMS or app email in the repo; what exists is the hourly bearer cron to `/tracker/api/scheduler/daily-task/run` (tracker ADR 0039), `tracker.notion_outbox` with a 30 s polled strip (`apps/tracker/components/scheduler/exports-strip.tsx`), `tracker.sync_runs` and the setup page (`apps/tracker/lib/data/setup.ts`, REQ-33), and the Iris plan of a 15-minute poll. Inputs: leads reader (created time, Stage = New, Next Action Due), lesson gaps (Console 8/12), trial funnel (Console 9/12), facade health (Console 3/12). **Blocked by:** Console 6/12, Console 8/12, Console 9/12.

## Requirements

- Polling, not watching: the console page refetches the facade on a visible-tab interval from `TUNING` (default 60 s, backoff on error to 10 minutes), shows "checked HH:MM" per panel, and shows "polling, not live" in the header; a hidden tab stops polling and catches up on focus. No server-side poller, cron or webhook is added by this card.
- Fresh-lead signal: a Students & Parents row with Stage = New whose created time is after the console's last seen watermark (stored per owner in a small `tracker` table or `localStorage`, designer's choice) raises one signal per page id, with the student name, source, created time and a "Call now" deep link (Sales mode selection) and a "Snooze" that hides it until a chosen time; a snoozed signal reappears and is listed in a persistent "deferred" strip. A row seen twice (import, edit) raises nothing new.
- Exception signals, each computed from a read model with its own check time: follow-up overdue (Next Action Due before now on an active Stage), trial without close decision (Trial Attended At set, Stage still Trial Claimed or Awaiting Close past 24 h), missing lesson log (Console 8/12 gaps older than 48 h), provider failure (facade panel error or stale), stale people sync (`sync_runs` last ok older than `peopleStaleMinutes`), outbox failures (`notion_outbox` status failed). Each shows source, check time and the next action with a canonical link.
- Protected time: a quiet toggle (owner, session-scoped) and the current teaching occurrence from the scheduler (the owner's own `class_series` occurrences now) suppress the amber pulse and sound nothing; signals accumulate in the deferred strip and are recoverable. The console never auto-calls, auto-sends or auto-books in any mode.
- Dismissal hides the display for the owner's session only; the underlying Notion or Supabase state is unchanged and the signal returns if the condition persists after the dismissal window.
- Health rail (bottom): per provider (Notion leads, Notion lessons, Notion invoices, Notion work, scheduler tables, people sync, outbox) with status and last success; a failed check is red with its reason, never hidden.

## Acceptance criteria (card)

- AC1: A fresh lead raises exactly one signal per Notion page id across repeated polls, and remains reachable from the deferred strip after a snooze.
- AC2: With quiet mode on or a teaching occurrence in progress, no signal triggers motion or sound and nothing is auto-called, sent or booked; deferred signals are listed and recoverable.
- AC3: Every signal shows its source record, check time and next action; when a provider check fails the health rail shows red and the panel never reads "all clear".
- AC4: Dismissing a signal changes only the console display; the Notion row and Supabase rows are untouched and the signal returns while the condition holds.
- AC5: No signal payload includes parent phone or email, and a non-owner request for the signals endpoint gets 403 with an empty body.

## Test coverage (card)

- T1: Fixtures for duplicate, out-of-order and offline polls, and watermark persistence.
- T2: Playwright: foreground and background tabs, quiet mode, snooze and recovery, teaching-time suppression with a seeded occurrence (`pnpm test:tracker` before the PR).
- T3: Provider failure fixture keeps the warning and health red across polls.

## Out of scope (card)

No webhook, Zapier, push, SMS, email or Notion comment notifications; no background phone or messaging activity; no persistent server poller.

## Global guardrails (all Console cards)

Founder-only, enforced server-side (owner membership via `getViewer()`, `tracker.is_org_owner` RLS), never by hidden UI; every read through the owner's own client. Notion stays the editor of record for people, leads, touches, lessons, invoices and work (workspace ADR 0004, OPS SYSTEM page); no shadow copies beyond what ADR 0004 allows; joins by Notion page id, never by name. No fabricated values: every panel carries a status (ready, empty, loading, stale, error, unverifiable), its source ids and last successful fetch time; one failed provider never blanks another panel and unknown is never shown as zero. The console never sends a message, places a call, books, pays or publishes; deep links only. No new dependency without a Decisions-for-approval row. Visual fidelity is contractual: `docs/spec/founder-console/handoff/VISUAL_DIRECTION.md`, `PANEL_STATES.md` and `visual-assets/founder-command-bridge-reference.png`, built from HTML, CSS and SVG components, never a raster with baked text; reduced motion, keyboard operation and 390, 1280, 1440 and 1920 px widths. Demo data lives only in tests and an isolated preview, never in production source (automated scan). Migrations ship in their own PR; High risk and `apps/tracker/lib/notion/` changes carry needs-human-merge. Readiness is Charlie's call in `docs/readiness.md`, never implied by a merge.

---

# Design: REQ-62 Console 11/12, polled signals, protected-time snooze and integration health

**Summary:** The console gets a polled, owner-only signals feed: fresh Stage = New leads and six kinds of operational exception, each deduplicated by source record and shown with its source, check time and next action. Signals can be snoozed or dismissed, and are held back without motion while quiet mode is on or the owner is teaching. A health rail shows each provider's real status, so the console never reads "all clear" over a failed check.
**Risk:** Medium. This is a new read-only route behind the existing owner gate (`requireOwner` plus `is_org_owner`), over data RLS already lets the owner read. It adds no migration, no write and no new destination for personal data. It does not touch `apps/tracker/lib/notion/`, auth or RLS.

Observed at `main` `ce85a6e` (2026-10-23).

## Changes from last version

- Approver revise 1 of 2, placeholder table cell: the UI sketch used pipe separators with three-dot ellipsis entries in the grid and rail lines, which read as an unfilled table cell. The sketch now lists every band, grid and rail entry in full, one per line, with no pipes and no ellipsis. The loading text is now "Checking sources" with no ellipsis character.
- Re-checked number reservation on 2026-10-23: `main` is still `ce85a6e` with tracker ADRs up to 0075; open PRs #122, #123 and #125 hold 0059, 0069, 0070 and 0074; REQ-61's design holds 0076. ADR 0077 is still the first free number. No other content changed.

## Problem

The founder needs to see two things in any mode without watching Notion: a new lead that needs a call, and real operational exceptions (overdue follow-ups, trials with no close decision, missing lesson logs, failed providers, a stale people sync, failed outbox exports). The view must be honest about how it works: it is polled, not live, so each signal carries the time it was checked, and a failed check shows red, never green. It must also respect teaching time: no pulse during a class and no automatic action ever, with deferred signals kept in a strip where they can be recovered.

What exists today:

- **Polling.** The console already polls `GET /api/console/health` every 60 s while the tab is visible, through `startSyncPoller` in `apps/tracker/lib/console/sync-poller.ts`. The poll pauses while the tab is hidden and runs at once on focus. `SalesProvider` (`apps/tracker/components/console/sales/sales-provider.tsx`) refreshes `/api/console/sales` in step with that poll.
- **Signal slots.** `sales.signals` and `creation.signals` are "Not connected yet" slots in `apps/tracker/lib/console/panel-slots.ts`. `operations.integrations` is a placeholder too.
- **Sources this card needs:**
  - Leads, with `createdAt`, `stage`, `nextActionDue` and `trialAttendedAt`, come from the facade (`apps/tracker/lib/console/facade.ts`, `LeadRow` in `contracts.ts`).
  - Lesson gaps come from `loadOperationsPanels` (`apps/tracker/lib/console/operations.ts`).
  - People-sync freshness is the facade's `people` panel (`people_synced_at`, `TUNING.peopleStaleMinutes`).
  - `tracker.notion_outbox` and `tracker.staff_links` are both owner-readable under RLS (`0021_notion_outbox.sql` line 47; `0009`).
  - Today's classes come from `createOperationsReader().schedule` (`operations-read.ts`) and `expandOccurrences` (`lib/domain/schedule/recurrence.ts`).

## Acceptance criteria

- [ ] **AC1:** A Stage = New lead whose created time is after the watermark appears as exactly one fresh-lead signal per normalised Notion page id across repeated polls. This holds for duplicate rows in one read, a lead arriving across out-of-order polls, and an edit that changes `last_edited` but not `created_time`. After "Snooze", the lead is listed in the deferred strip and comes back to the band when the snooze ends. A lead the owner has acknowledged ("Call now" or "Seen") never comes back as fresh.
- [ ] **AC2:** With quiet mode on, or while the owner's own class occurrence is in progress, a new signal adds no pulse class and makes no `aria-live` "assertive" announcement, only "polite". Signals go to the deferred strip and can be opened from it. No console source contains `new Audio`, `<audio`, `tel:`, `sms:`, `mailto:` or a `fetch` with a non-GET method under `lib/console/signals*` or `components/console/signals/`.
- [ ] **AC3:** Every signal row shows its source label with a canonical link, "checked HH:MM" and one next action. When any provider check fails or is stale, the health rail shows that provider red (error) or amber (stale) with its reason, and the signals panel shows "Some checks failed" in place of "No exceptions found".
- [ ] **AC4:** Dismissing a signal changes only this browser session's display. The signals route makes no write: a source scan finds no `.insert(`, `.update(`, `.upsert(`, `.delete(` or `.rpc(` other than `is_org_owner` in the signals files. While the condition still holds, the signal comes back after `TUNING.consoleSignalDismissMinutes`.
- [ ] **AC5:** The `GET /api/console/signals` body never includes a parent phone, an email or `last_error` text. `SignalsViewSchema` is plain `z.object`, so unknown keys are stripped, and a fixture lead carrying `Parent Phone` and an email produces no such value in the JSON. A teacher, student, parent, role-less, signed-out or not-configured request gets the fixed `CONSOLE_DENIALS` body and status (403 `{"error":"forbidden"}` for non-owners) and no signal data.
- [ ] **AC6:** The header reads "Polling, not live". Each signal and health entry shows its own check time. The signals poll runs every `TUNING.consoleSignalsPollMs` (60 s) while the tab is visible. On a network error or non-200 the interval doubles, up to `TUNING.consolePollMaxBackoffMs` (10 min), and it goes back to 60 s on the next 200. It sends nothing while the tab is hidden and polls once when the tab shows again.
- [ ] **AC7:** The health rail lists seven providers in a fixed order: Notion leads, Notion lessons, Notion invoices, Notion work, scheduler tables, people sync and outbox. Each shows its status and last success. A provider that was never checked reads "Not checked", never "ok".

## Approach

### Server: a pure signal builder and one route

- **New `apps/tracker/lib/console/signals.ts`** (pure, no I/O): `buildSignals(input, now)` returns a `SignalsView`.
  - **Input:** the facade's `ConsolePanels`, the `lessonGaps` and schedule `PanelView`s from `OperationsPanels`, an `OutboxRead`, a `TeachingRead` and the freshness times.
  - **`Signal`:** `{ signalKey, kind, title, detail, sourceLabel, sourceUrl, checkedAt, createdAt?, action: { label, href } }`.
  - **`signalKey`** is `<kind>:<normalId(source id)>`, with `normalId` from `lib/domain/billing`. A new name is used on purpose: `dedupeKey` is pinned to three files by `lib/console-scan.test.ts`.
  - Signals are deduplicated by `signalKey`, and the earliest `createdAt` wins.
- **Kinds and their rules.** Thresholds live in `TUNING`, see Decision 4.
  - `fresh_lead`: a lead with `stage === "New"` and `createdAt` within `consoleFreshLeadLookbackHours` (72 h).
    - Title: the student name. Detail: the source and created time.
    - Action: "Call now", `?mode=sales&lead=<id>`.
    - Only candidates are sent. The watermark is applied in the browser (see Client).
  - `followup_overdue`: `nextActionDue` before now, on a stage in the `ACTIVE` set exported from `sales-queue.ts`, and not opted out. The action opens the lead in Sales.
  - `trial_undecided`: `trialAttendedAt` set, stage `Trial Claimed` or `Awaiting Close`, and attended more than `consoleTrialDecisionHours` (24 h) ago. The action is the Notion page link.
  - `lesson_gap`: a gap row from `lessonGaps` whose occurrence ended more than `consoleLessonGapSignalHours` (48 h) ago. The action is the gap's existing schedule href.
  - `provider_failure`: one per facade panel or operations read whose status is `error`, or `stale` for a reason other than the name join (`NAME_JOIN_REASONS`). The detail is the panel's `errorMessage` or `staleReason`, verbatim.
  - `people_stale`: the people panel has `staleReason === "people_sync_stale"`. The action is `/tracker/scheduler/setup`.
  - `outbox_failed`: one aggregate signal with the count of `notion_outbox` rows in status `failed`. The detail is the count and kinds, never `last_error`. The action is `/tracker/schedule`, where the existing exports strip offers Retry.
- **When a source fails.** If the source a kind needs failed, that kind is not computed and the matching `provider_failure` stands in its place. This is how a failed check never looks like no exceptions. The panel's `checks` array records each kind as `ok`, `failed` or `skipped`.
- **`health`:** the seven providers of AC7, each `HealthProvider` (`healthOf` in `contracts.ts`):
  - Notion leads is the `leads` panel.
  - Notion lessons is the `trialLessons` panel and the operations lessons read: the worse of the two wins.
  - Notion invoices and Notion work are the `invoices` and `work` panels.
  - Scheduler tables is the operations schedule read.
  - People sync is the `people` panel.
  - Outbox is the outbox read: `error` if the read failed, `stale` (reason "N failed exports") if there are failed rows, `ready` otherwise.
- **`protectedTime`:** `{ state: "teaching", until, title } | { state: "free" } | { state: "unknown", reason }`.
- **New `apps/tracker/lib/console/signals-read.ts`** (select-only, owner's own client, Zod-parsed, throws on error like `operations-read.ts`):
  - `readFailedOutbox(viewer)`: selects `id, kind, finished_at` from `tracker.notion_outbox` where `status = 'failed'`, ordered by `finished_at` descending, limit 100.
  - `readOwnerTeaching(viewer, now, reader)`:
    1. Finds the owner's `notion_staff_id` from `tracker.staff_links` where `user_id = viewer.userId` and `revoked_at is null`.
    2. Expands today's occurrences through `reader.schedule({from: today, to: today})` and `expandOccurrences`, for that staff id only.
    3. Returns `teaching` when now falls between an occurrence's start and `endsAt` and it is not cancelled.
    4. Returns `unknown` with "Owner has no staff link" when there is no link, and with "Schedule unavailable" when the read fails.
- **`apps/tracker/lib/console/handlers.ts`:** add `handleConsoleSignals`, with the same `gateOwner`, `no-store` headers and 503 on throw as `handleConsoleSales`.
  - It runs `loadConsolePanels`, `loadOperationsPanels`, `readFailedOutbox` and `readOwnerTeaching` together, each under `withTimeout`.
  - The response is parsed with `SignalsViewSchema` before sending.
- **New `apps/tracker/app/api/console/signals/route.ts`:** GET only, a copy of the sales route. It sits under `/api/console/`, which is already an origin-checked prefix.
- **`apps/tracker/app/console/page.tsx`:** compute the initial `SignalsView` from the facade and ops results the page already loads, plus the two new reads. Pass it to `ConsoleBridge`. The page makes no second facade load.

### Client: polling, watermark, snooze, quiet mode

- **`apps/tracker/lib/console/sync-poller.ts`:**
  - Replace `SYNC_INTERVAL_MS` with `TUNING.consoleSignalsPollMs`.
  - Add backoff: after a network error or non-200, the next tick waits the interval times 2^failures, capped at `TUNING.consolePollMaxBackoffMs`, and resets on a 200.
  - A 200 with `degraded` is not an error, so a failing provider is still re-checked every minute.
  - Hidden-tab behaviour stays as it is.
- **New `apps/tracker/lib/console/signals-state.ts`** (pure reducer, node-tested):
  - **State:** `{ view, watermark, acked: Record<id, createdAt>, announced: string[], snoozed: Record<signalKey, untilIso>, dismissed: Record<signalKey, atIso>, quiet: boolean }`.
  - **Derived lists:**
    - `band` holds active signals that are not snoozed, not dismissed inside the window, not protected, and are fresh leads past the watermark that have not been acked.
    - `deferred` holds snoozed signals, plus signals that arrived while protected.
    - `toAnnounce` holds band items not yet in `announced`.
  - **Watermark:** it only moves forward. After each ack it advances to the largest `createdAt` at or below which every candidate is acked, and acked ids at or below it are pruned.
  - **First visit:** with no stored watermark, the watermark is `now - consoleFreshLeadLookbackHours`.
  - **Quiet mode and teaching** move new arrivals to `deferred` and mark them announced, so nothing pulses when protected time ends.
  - **Snooze options:** 15 min, 1 h, "after this class" (when `protectedTime.until` is known), and tomorrow 08:00 Toronto.
- **Storage.** Every read and write is wrapped in try/catch. With storage unavailable, the state lives in memory and the panel says "Signal memory is this tab only".
  - In `localStorage`, under `console.signals.v1:<orgId>`: `watermark`, `acked`, `announced` and `snoozed`. These are ids and times only, never names or rows.
  - In `sessionStorage`: `quiet` and `dismissed`.
- **New `apps/tracker/components/console/signals/signals-provider.tsx`:** refreshes `/tracker/api/console/signals` in step with the sync poll, using the same `shouldRefreshOnSync` pattern as `SalesProvider`. It keeps one request at a time and holds the last good view, marked stale with "Refresh failed HH:MM", in React state only.
- **New `components/console/signals/signal-band.tsx`:** rendered once under the header in every mode.
  - It shows fresh leads with a text "NEW" label, "Call now", "Seen" and "Snooze".
  - The pulse is a CSS class, at most 1.5 s, turned off under `prefers-reduced-motion` and when protected.
  - It has a polite `aria-live` region, and an assertive one only when not protected.
- **New `components/console/signals/deferred-strip.tsx`:** always present. It shows "N deferred", expands to the list, and each row has "Show now".
- **New `components/console/signals/signal-list.tsx`:** the `SignalList` instrument in the `signals` slots. It groups rows by kind and gives each row "Dismiss" and "Snooze".
  - Empty text: "No exceptions found" only when every check is `ok`; otherwise "Some checks failed", with the failed kinds named.
  - Its `FreshnessLine` uses the view's `checkedAt`.
- **New `components/console/signals/quiet-toggle.tsx`:** sits in `HeaderRail`. It is a toggle button with `aria-pressed`, and when protected it shows "Teaching until HH:MM" or "Quiet".
- **New `components/console/signals/health-rail.tsx`:** a list of seven entries inside `PhysicalRail`, above the indicators. Each entry has a dot, a text status, "last ok HH:MM" and, on failure, the reason in text. Colour is never the only cue. The same component fills `operations.integrations` in its detailed variant.
- **`components/console/shell/sync-line.tsx`:** add the constant text "Polling, not live".
- **`components/console/shell/bridge.tsx`:**
  - Take `signals?: SignalsView` and wrap `<main>` and the band in `SignalsProvider`. `SalesProvider` moves up to wrap the band too, which adds no DOM, so "Call now" can call `setMode("sales")` (mode context) and dispatch `{ type: "select", id }`.
  - Route the `signals` slot id to `SignalList` and `integrations` to `HealthRail`.
- **`lib/console/panel-slots.ts`:** add `slot("operations", "signals", "list", "Signals", "No exceptions found")` so every mode lists exceptions. Add the matching grid area in `app/console/console.css`. Operations shows "N of 7 connected".
- **`lib/console/modes.ts`:** add `parseLead(value)` (uuid only), so `?lead=` preselects in `initialSalesState`.

### UI sketch (Sales, 1440 px)

```
Row 1, horizon: the existing horizon band, unchanged.
Row 2, header: AP ACADEMY // FOUNDER CONSOLE; mode tabs Sales, Creation, Operations; clock 14:02; "Sources checked 14:01 · Polling, not live"; Quiet toggle (off).
Row 3, signal band: NEW  Nova New · Meta form · created 13:58 · checked 14:01  [Call now] [Seen] [Snooze v]; right side "2 deferred v".
Row 4, grid (Sales): Next contact; North star; Signals panel listing Follow-up overdue 1, Trial undecided 1, Missing lesson log 0, Provider failure 1, People sync stale 0, Outbox failed 1.
Row 5, health rail, seven entries in order:
  Notion leads: ok, last ok 14:01
  Notion lessons: error, "Timed out after 8 s", last ok 13:40
  Notion invoices: ok, last ok 14:01
  Notion work: ok, last ok 14:01
  Scheduler tables: ok, last ok 14:01
  People sync: ok, last ok 13:55
  Outbox: stale, "2 failed exports", last ok 14:01
Row 6, rail indicators: Sources · Access · Panels · Motion · Mode.
```

- **States:** Loading: "Checking sources". Empty: "No exceptions found", only when every check is ok. Error: the route failed; the last good view stays, marked stale, and the health rail entries go red. Stale: the last refresh failed.
- **Widths.** At 390 px the band stacks: the actions go on a second line and the deferred strip on a third. The health rail wraps to two columns. There is no horizontal scroll.

### Docs

- Add tracker ADR `apps/tracker/docs/decisions/0077-console-signals-and-protected-time.md`. It records polling over push, the browser-held watermark and snoozes, the "skipped kind becomes a provider failure" rule, and backoff. Add it to the README index.
- `docs/spec/founder-console/02-data-contracts.md` §3.9 and §3.10: change "Adapter today" to the new files.
- `docs/readiness.md`: Production status line.

## Migration

None. Watermark, acknowledgements and snoozes live in the owner's browser, which the card allows. The two new reads (`notion_outbox`, `staff_links`) are already owner-select under RLS.

## Test plan

| Test | Type | Covers |
| --- | --- | --- |
| `lib/console/signals.test.ts`: duplicate rows for one page id (dashed and undashed ids) give one `fresh_lead`. A lead with a newer `last_edited` and the same `created_time` gives no new key. Stage ≠ New and createdAt outside the lookback are excluded. | unit | AC1 |
| `lib/console/signals-state.test.ts` (T1): out-of-order polls; an offline poll (refreshFailed) keeps the last view; the watermark only moves forward and survives a state round-trip through a fake storage; ack prunes; snooze moves to deferred and back at `until`; storage that throws falls back to memory. | unit | AC1, AC4 |
| `signals-state.test.ts`: quiet mode and `protectedTime.teaching` put new arrivals in `deferred` and `announced`, and `toAnnounce` is empty; leaving protected time does not re-announce. | unit | AC2 |
| `signals-state.test.ts`: dismiss hides the signal until `consoleSignalDismissMinutes`, then it shows again if it is still in the view; a signal gone from the view stays gone. | unit | AC4 |
| `signals.test.ts` (T3): a leads panel `error` adds `provider_failure:leads`, skips `fresh_lead`, `followup_overdue` and `trial_undecided`, and marks those checks `skipped`; health shows `error`; the result is the same across three polls; a name-join-only stale adds no provider failure. | unit | AC3, AC7 |
| `signals.test.ts`: each kind's threshold at the boundary (23 h 59 m vs 24 h 1 m, 47 h vs 49 h); every signal has `sourceLabel`, `checkedAt` and `action.href`. | unit | AC3 |
| `signals.test.ts`: a lead fixture with `parentPhone`, `parentEmail` and an outbox `last_error`, parsed through `SignalsViewSchema`; the JSON contains none of `555-0177`, `@` or the error text. | unit | AC5 |
| `signals-read.test.ts`: the owner with a staff link and a class now gives `teaching` with `until`; a cancelled occurrence gives `free`; no link gives `unknown`; a query error throws. | unit | AC2 |
| `app/api/console/console-routes.test.ts`: the signals route runs every row of the ADR 0006 rejection table (teacher, student, parent, none, signed out, not configured) and gets the exact `CONSOLE_DENIALS` bodies; the owner gets 200 with `no-store`. | integration | AC5 |
| `lib/console/sync-poller.test.ts`: fake timers give 60 s, then 120, 240 and so on, capped at 600 s after errors, reset after a 200; `degraded` does not back off; hidden sends nothing; focus polls once. | unit | AC6 |
| `lib/console-scan.test.ts`: covers the new files; no `new Audio`, `<audio`, `tel:`, `sms:`, `mailto:`, non-GET `fetch` or write calls in the signals files; the header source holds "Polling, not live". | unit | AC2, AC4, AC6 |
| `components/console/signals/signals.test.ts`: SignalList shows "Some checks failed" when any check is not ok; HealthRail renders 7 entries in order, with "Not checked" for a missing provider and a text reason on error. | unit | AC3, AC7 |
| `e2e/tracker/flows.mjs` (T2, run with `pnpm test:tracker` before the PR). Mock Notion gains `POST /__console/add-lead`, which appends a Stage = New lead created now. The owner sees one NEW band row for Nova New; after add-lead and a forced poll there are two, and repeated polls still give two. Snooze moves one to "deferred" and "Show now" brings it back. Seeding a `staff_links` row for the owner (`user_id` set) and a one-off class covering now (via `psql`) shows "Teaching until"; a new lead goes to deferred and the band has no `data-pulse`. The quiet toggle does the same. With `/__console/leads-fail`, Notion leads is red in the health rail with its reason and the signals panel reads "Some checks failed". `page.evaluate` in a hidden tab (`visibilityState` override) records no `/api/console/signals` request for 2 intervals with fake clock. Teacher, outsider and guest requests to `/api/console/signals` get 403, 403 and 307. Widths 390, 1280, 1440 and 1920 show no horizontal scroll. | e2e | AC1, AC2, AC3, AC5, AC6, AC7 |

## Out of scope

- No webhook, push, SMS, email, Notion comment, sound or service worker.
- No server-side poller or cron, and no server-held signal state.
- No change to `apps/tracker/lib/notion/`.
- No write of any kind, including outbox Retry, which stays on the schedule page.
- No schedule of protected time other than the owner's own scheduler occurrences: no calendar integration.

## Risks and edge cases

- **Notion load.** Each minute now brings three facade loads: health, sales and signals. Each load is five reads of at least one page, so about 15 requests a minute (about 0.25/s), against Notion's 3/s average. The backoff limits failure storms. A shared per-request facade between routes is deferred to REQ-63, if needed.
- **A new browser or cleared storage.** Candidates from the last 72 h show as fresh again. They are still Stage = New, so they genuinely need contact, and dedupe still holds within that browser.
- **Owner with no staff link.** Teaching suppression reads "unknown: Owner has no staff link". The quiet toggle still works, and the header says why teaching time is not detected. It never falsely says "free".
- **Clock and timezone.** Occurrence start and end come from the existing wallclock helpers (Toronto), and "tomorrow 08:00" uses `localToUtc`.
- **REQ-60 (In Review, PR #125) and REQ-61** both edit `bridge.tsx`, `panel-slots.ts`, `page.tsx` and `console.css`. The builder rebases on whichever merges first. The operations `signals` slot does not touch the creation slots.
- **`last_error` and `errorMessage` text.** Facade `errorMessage` is already the fixed or Notion-message text the health route exposes today. Outbox `last_error` is never sent.

## Decisions for approval

| # | Decision | Options | Default if you say nothing |
| --- | --- | --- | --- |
| 1 | New dependencies | None | None |
| 2 | Schema placement | None: no migration. Tracker ADR number 0077 is the first free one: main has up to 0075, open PRs hold 0059, 0069, 0070 and 0074, and REQ-61's design holds 0076. | No migration; ADR `apps/tracker/docs/decisions/0077-console-signals-and-protected-time.md` |
| 3 | Where watermark, acks and snoozes live | (a) `localStorage` per browser, keyed by org; (b) a new `tracker.console_signal_state` table | (a). Ids and times only; quiet mode and dismissals go in `sessionStorage`, per the card's "session" wording |
| 4 | New `TUNING` keys | Values adjustable | `consoleSignalsPollMs` 60 000, `consolePollMaxBackoffMs` 600 000, `consoleFreshLeadLookbackHours` 72, `consoleTrialDecisionHours` 24, `consoleLessonGapSignalHours` 48, `consoleSignalDismissMinutes` 120 |
| 5 | AC5's "403 with an empty body" | (a) the existing fixed `{"error":"forbidden"}` denial (REQ-53 AC5, byte-for-byte tests); (b) a literally empty body | (a). It carries no signal data, and every console route stays consistent |
| 6 | Backoff applies to the shared health poller (which also drives Sales) | (a) one poller with backoff; (b) a separate signals poller | (a). One clock for the console, and Sales backs off too on errors |
| 7 | An Operations `signals` slot is added | (a) add it (Operations shows 7 slots); (b) band only | (a) |
| 8 | Health rail placement | (a) in the bottom `PhysicalRail` and the `operations.integrations` slot; (b) the slot only | (a). The card asks for a bottom rail, and the slot gives the detailed view |
| 9 | Teaching time source | (a) the owner's own `class_series` occurrences via their `staff_links` row; (b) also an owner-entered protected block | (a). With no staff link the state is shown as "unknown" |
| 10 | `SalesProvider` moves up to wrap the band, so "Call now" can select the lead | (a) move it up (no DOM change); (b) a URL navigation with `?lead=` only | (a), with `?lead=` also parsed for a reload or deep link |
| 11 | Outbox signal granularity | (a) one aggregate signal with a count; (b) one per failed row | (a). The exports strip already lists rows |
