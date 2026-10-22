# REQ-54: Console 3/12: Console read facade, PanelResult contract and Notion-backed read models

Card: https://app.notion.com/p/400d6ae73dd781239249cb46c3813562 (copied from the card on 2026-10-22, approved at sha b150b73230e1).

Server-side, typed, provenance-rich read models for the console's Notion-backed panels, behind one facade that never fabricates a value and never lets one failed provider blank another panel. No UI beyond a JSON health view; no writes.

**Seed:** FC-03, split: this card is the read facade and the Notion read models; the north-star metric is Console 5/12. **Sources:** `docs/spec/founder-console/02-data-contracts.md` (Console 1/12), `01-discovery.md` section 2. **Blocked by:** Console 1/12, Console 2/12.

## Requirements

- Contract types in `apps/tracker/lib/console/` (pure, no React or Next imports, like `lib/domain/`): `PanelStatus` (ready, empty, loading, stale, error, unverifiable), `PanelResult<T>` with `data`, `lastSuccessfulFetchAt`, `lastCheckedAt`, `staleReason`, `sourceEvidence[]` (`source` notion or supabase, `sourceId`, `sourceUrl` for owner-safe deep links, `observedAt`). Every panel read returns a `PanelResult`; a thrown adapter error becomes `error` with a 300-character message, never an empty success.
- Notion readers in `apps/tracker/lib/notion/` (human-merge path), built like `students.ts` with property ids through `filter_properties`, Zod at the boundary (tracker ADR 0017), token from `apps/tracker/lib/notion/config.ts`, returning null when unconfigured:
  - `leads.ts` on Students & Parents (`fe3d651a-...`): page id, Student Name, Stage, Owner (staff page id), Next Action, Next Action Due, Attempts, Last Contact, Source, Lost Reason, Contacted At, Trial Booked At, Trial Attended At, Closed At, Trial Time, Trial Teacher (page id), Level, Major Gaps, Recommended Plan, Trial Summary, Parent Name, and created time. Parent Phone and Parent Email are read only when the designer lists them and they are never logged, cached or copied (ADR 0004 keeps them live). Lead ID is never shown on a card (OPS SYSTEM rule). The existing source-scan test in `students.test.ts` that forbids `Owner` and `Trial Teacher` in `students.ts` keeps applying to that file; the new reader has its own scan listing exactly what it reads.
  - `touches.ts` on Touches (`772939bd-bd88-4272-9f1f-20ce75ef2204`, add `NOTION_TOUCHES_DATA_SOURCE_ID` to config): Type, Outcome, Student, Staff, Note, When; last N per student.
  - `lessons.ts` gains a read of `Type` and `Trial: Diagnosis`, `Trial: Preferred Lesson Day` for trial completion evidence (reads only; the payout guardrail tests in `apps/tracker/app/api/scheduler/payout-guardrails.test.ts` still forbid `Paid to Teacher` and `Pay Period`).
  - `work.ts` gains a reader listing Work (`3031b455-...`) rows by Area, State, Type, Due / Review, Owner, Task Type with page url; the existing seven-property writer is untouched.
  - `billing.ts` gains an org-wide Invoices listing (Status, Paid On, Amount (CAD), Credit Applied (CAD), Issued, Due, Month, Student page id), read-only, no amounts computed into invoices (tracker ADR 0049).
- Supabase inputs come through the owner's client: `tracker.student_people` (stage, name, active) and `tracker.staff` for names, so no live name reads are reintroduced (REQ-38).
- Facade `apps/tracker/lib/console/facade.ts`: loads panels with `Promise.allSettled`, dedupes by Notion page id, bounds pagination (page size and max pages from `TUNING`), stamps `lastCheckedAt` on every call and `lastSuccessfulFetchAt` only on success, caps each provider call with a timeout, and returns a partial set with per-panel status. Unauthorized or unlisted fields are stripped before the result leaves the server.
- Time handling in America/Toronto wall-clock for due dates and day boundaries (`apps/tracker/lib/time.ts`).
- `GET /api/console/health`: per-provider status and freshness only, no business rows, as the first consumer of the facade.

## Acceptance criteria

- AC1: Read models exist and are typed for leads and follow-ups (Students & Parents), touch history (Touches), trial evidence (Lessons Type = Trial), content work (Work) and invoice status (Invoices), each returning `PanelResult`.
- AC2: Every `PanelResult` carries source ids, `lastCheckedAt` and `lastSuccessfulFetchAt`; fields not listed in the design are absent from the result (asserted by a schema test).
- AC3: When one provider fails or times out, the other panels still return their data with `ready` and the failed one returns `error` with a reason; no panel returns zero or an empty list on failure.
- AC4: Incomplete pagination returns `stale` with the count fetched, never `ready`.
- AC5: Joins use Notion page ids only; a fixture with two students of the same name produces two rows.
- AC6: Nothing in this card writes to Notion or Supabase (source scan for `pages.create`, `.patch(`, `.insert(`, `.update(`, `.upsert(` in the new files; `GET`-only routes).

## Test coverage

- T1: Unit tests of the readers with fixture responses (full, paginated, truncated, malformed), including Toronto day boundaries and DST dates (2026-03-08, 2026-11-01).
- T2: Facade tests for partial provider failure, timeout and dedupe.
- T3: Data minimization scan: the reader files name exactly the properties in the design; the facade output schema has no extra keys; no console file imports the service client.
- T4: Reviewer checks each evidence link against the live Notion schema ids in the spec.

## Out of scope

The north-star metric (Console 5/12), the scheduler-backed capacity and lesson-gap models (Console 8/12), any UI panel, any write, any new table.

## Global guardrails (all Console cards)

Founder-only, enforced server-side (owner membership via `getViewer()`, `tracker.is_org_owner` RLS), never by hidden UI; every read through the owner's own client. Notion stays the editor of record for people, leads, touches, lessons, invoices and work (workspace ADR 0004, OPS SYSTEM page); no shadow copies beyond what ADR 0004 allows; joins by Notion page id, never by name. No fabricated values: every panel carries a status (ready, empty, loading, stale, error, unverifiable), its source ids and last successful fetch time; one failed provider never blanks another panel and unknown is never shown as zero. The console never sends a message, places a call, books, pays or publishes; deep links only. No new dependency without a Decisions-for-approval row. Visual fidelity is contractual: `docs/spec/founder-console/handoff/VISUAL_DIRECTION.md`, `PANEL_STATES.md` and `visual-assets/founder-command-bridge-reference.png`, built from HTML, CSS and SVG components, never a raster with baked text; reduced motion, keyboard operation and 390, 1280, 1440 and 1920 px widths. Demo data lives only in tests and an isolated preview, never in production source (automated scan). Migrations ship in their own PR; High risk and `apps/tracker/lib/notion/` changes carry needs-human-merge. Readiness is Charlie's call in `docs/readiness.md`, never implied by a merge.

---

# Design: REQ-54: Console 3/12: Console read facade, PanelResult contract and Notion-backed read models

## Changes from last version

Revise 2 of 2:

- Approver 1, 4 (facade step 4 wording): step 4 now reads "its strip-mode row schema (plain `z.object`, see Decision 16)". No `.strict()` wording is left anywhere in the design.
- Approver 2, 3 (where freshness lives): `lib/console/providers.ts` declares one module-level `consoleFreshness` Map, and every `createConsoleDeps` call passes that same Map (Wiring, facade step 5). New test rows: a `console-routes.test.ts` case with two handler calls (success at T1, then failure at T2) where the second keeps `lastSuccessfulFetchAt` T1, and a new `providers.test.ts` that checks two `createConsoleDeps` calls return the same Map.
- Decision 2 re-checked on 2026-10-22: main ends at tracker ADR 0062, REQ-44 holds 0063 and 0064, open PR #110 adds only `0025_iris_drafts.sql`, and REQ-55 and REQ-34 name no ADR. 0065 is still free.

Revise 1 of 2:

- Approver 1, 6, 7 (strict vs strip): one behaviour. Row schemas are plain `z.object` in Zod's default strip mode, never `.strict()` or `.passthrough()`; a row with extra keys is kept and loses them. AC2, the contracts bullet, the `contracts.test.ts` row and new Decision 16 now say the same thing.
- Approver 2 (AC6 untested for readers): new `lib/notion/console-readers-scan.test.ts` bans write calls and write endpoints in `leads.ts`, `touches.ts` and `paged.ts`; fetcher-spy tests assert every request of all five readers (including `fetchTrialLessons`, `fetchWorkItems`, `fetchOrgInvoices`, whose files already hold writers) is `GET /v1/data_sources/{id}` or `POST /v1/data_sources/{id}/query`. `.patch(` added to the AC6 list.
- Approver 3 (service client): new AC12. `console-scan.test.ts` keeps its ban on `@ap-academy/db/service` and `getServiceClient` (the RLS-bypassing client in `packages/db/src/service.ts`) for every file under `lib/console/`, `app/api/console/`, `app/console/`, `components/console/`; the new readers scan bans it too. Both test rows list it.
- Approver 4, 6 (timeout message): a timeout gives exactly "Timed out after 8 s", carried by the new `ProviderTimeoutError` in `lib/console/facade.ts`; a fetcher abort maps to the same text; a `NotionError` keeps its own message; anything else is "Read failed". AC3, facade step 2 and the facade test row say so.
- Approver 5, 7 (precedence): `error` over `stale` over `empty` over `ready`; a panel both truncated and with a people reason is `stale` with both reasons joined, cap first. AC4, facade step 3, a facade test and new Decision 17.
- Decision 2 re-checked against main (now ends at tracker ADR 0062 after #109) and open PR #110: 0065 is still free.

**Summary:** the owner's `GET /tracker/api/console/health` reports, per provider, whether the console can read leads, touches, trial lessons, content work, invoices and the local people copy, and how fresh each read is; behind it, five typed, read-only Notion read models and one facade return a `PanelResult` each, so later console panels consume values that are never fabricated and never blanked by another provider's failure.
**Risk:** Medium (new read-only Notion reads of Students & Parents lead fields, Touches, Lessons, Work and Invoices behind the existing owner gate; no write, no new table, no new destination: nothing but statuses and times leaves the server in this card. The `apps/tracker/lib/notion/` changes put `needs-human-merge` on the PR regardless.)

## Problem

Console 1/12 (REQ-52) fixed the data contracts (`docs/spec/founder-console/02-data-contracts.md`) and Console 2/12 (REQ-53) built the owner gate and `GET /api/console/health` (`apps/tracker/lib/console/guard.ts`, `handlers.ts`). No console panel can show anything yet: the lead fields, Touches, Lessons `Type = Trial`, an org-wide Work listing and an org-wide Invoices listing have no reader (spec sections 3.1 to 3.8 mark each `undiscovered`), and nothing records when a live Notion read last succeeded (risk register row 1). This card is for Charlie (the org owner): it builds the server-side read layer every later console card (REQ-56 to REQ-60) consumes, with a status vocabulary that makes "unknown" impossible to show as zero.

## Acceptance criteria

- [ ] AC1: Five read models exist, each returning `PanelResult<T>` with a typed `data`: `leads` (Students & Parents), `touches` (Touches, last `TUNING.consoleTouchesPerStudent` per student), `trialLessons` (Lessons `Type = Trial`), `work` (Work, State not Done) and `invoices` (Invoices, org-wide). The facade also reports a sixth provider, `people` (the local `tracker.student_people` and `tracker.staff` copy).
- [ ] AC2: Every `PanelResult` carries `panel`, `status`, `lastCheckedAt` (every call), `lastSuccessfulFetchAt` (set only by a successful read, else the last success remembered by this server instance, else null), `staleReason`, `errorMessage` and at least one `sourceEvidence` entry (`source`, `sourceId`, `sourceUrl`, `observedAt`). The row schemas in `lib/console/contracts.ts` use Zod's default strip mode (plain `z.object`, never `.strict()` or `.passthrough()`): a row that carries an extra key (a fixture adds `parentPhone`, `leadId`, `notes`) is kept, counts as a normal row and leaves the facade without those keys.
- [ ] AC3: With one provider throwing, returning a 500 or exceeding `TUNING.consoleProviderTimeoutMs`, every other panel still returns its data with `ready` (or `empty`), and the failed panel returns `error`, `data: null`, `count: null` and an `errorMessage` of at most 300 characters: exactly "Timed out after 8 s" for a timeout, the `NotionError` message for a Notion failure ("Notion returned 500"), "Read failed" for anything else. No failed panel returns `[]` or `0`.
- [ ] AC4: A read that stops at `TUNING.consoleNotionMaxPages` with `has_more` still true returns `stale`, the rows fetched so far, `count` equal to that number and `staleReason` naming the cap; never `ready` or `empty`. Status precedence is `error` over `stale` over `empty` over `ready`. A panel that is truncated and also has a people reason (AC11) is `stale`, and `staleReason` joins both with "; ", cap first: "Stopped after 10 pages; showing 1000 rows; people_sync_stale".
- [ ] AC5: Rows are keyed and joined by normalised Notion page id only: two Students & Parents pages with the same Student Name give two lead rows, and a touch, trial lesson or invoice resolves its student name by page id from `student_people`, never by name. A row repeated across pages is returned once.
- [ ] AC6: Nothing added here writes: the new reader functions and every console file contain no `POST /v1/pages`, `PATCH`, `DELETE`, `pages.create`, `.patch(`, `.insert(`, `.update(`, `.upsert(` or `.delete(`; every Notion request the readers make is a `GET /v1/data_sources/{id}` or a `POST /v1/data_sources/{id}/query`; `app/api/console/` exports `GET` only. This is proved by a source scan of the new files `leads.ts`, `touches.ts`, `paged.ts` and every console file, and by fetcher-spy tests on all five reader functions (`fetchTrialLessons`, `fetchWorkItems` and `fetchOrgInvoices` live in files that already hold writers, so a file scan cannot cover them).
- [ ] AC7: Each reader names exactly the Notion properties listed under Approach (its exported `*_PROPS` constant equals the list, and the `filter_properties[]` ids sent equal those properties' ids); `leads.ts` never names `Parent Phone`, `Parent Email`, `Lead ID`, `Notes`, `Sales Notes`, `Hourly Rate (CAD)` or `Billing Family`; the Lessons trial read never names `Paid to Teacher` or `Pay Period`.
- [ ] AC8: Due dates and day boundaries are America/Toronto: a `Next Action Due` of `2026-11-01T04:30:00Z` has local date `2026-11-01` and `2026-11-01T03:30:00Z` has `2026-10-31` (the DST end day), and `2026-03-08T05:30:00Z` has `2026-03-08`; a date-only value keeps its date.
- [ ] AC9: `GET /api/console/health` for the owner returns 200 `{ status, checkedAt, providers }`, where `status` is `ok` only when every provider is `ready` or `empty` and `degraded` otherwise, and `providers` holds exactly the six provider keys, each with `status`, `lastCheckedAt`, `lastSuccessfulFetchAt`, `staleReason`, `errorMessage` and nothing else (no rows, no counts, no names). Every non-owner still gets the REQ-53 denial with no read.
- [ ] AC10: With `NOTION_TOKEN` unset, the five Notion panels return `error` with "Notion is not configured", and `people` still returns its own status.
- [ ] AC11: When the people copy is older than `TUNING.peopleStaleMinutes` (or its read fails), panels that resolve names from it return `stale` with `staleReason` `people_sync_stale` (or `names_unavailable`) and keep their Notion data; names are `null`, never guessed.
- [ ] AC12: No file under `lib/console/`, `app/api/console/`, `app/console/` or `components/console/`, and none of `leads.ts`, `touches.ts`, `paged.ts`, imports the service client (`@ap-academy/db/service`) or names `getServiceClient`; every Supabase read in this card goes through `viewer.db.tracker`.

## Approach

### Contract: `apps/tracker/lib/console/contracts.ts` (new, pure: Zod and types only, no React, Next or Supabase import)

- `PanelStatus = "ready" | "empty" | "loading" | "stale" | "error" | "unverifiable"` (spec section 2). The facade never produces `loading` (a server read is either done or not) or `unverifiable` (REQ-56 owns that); both exist for REQ-55's components.
- `SourceEvidence = { source: "notion" | "supabase"; sourceId: string; sourceUrl: string | null; observedAt: string }`. For Notion, `sourceId` is the data source id and `sourceUrl` is `https://www.notion.so/<id without dashes>` (opens only for a Notion member, so owner-safe); for Supabase, `sourceId` is the table name (`tracker.student_people`) and `sourceUrl` null.
- `PanelResult<T> = { panel: PanelId; status: PanelStatus; data: T | null; count: number | null; lastCheckedAt: string; lastSuccessfulFetchAt: string | null; staleReason: string | null; errorMessage: string | null; sourceEvidence: SourceEvidence[] }`.
- Row schemas are plain `z.object` in Zod's default strip mode (no `.strict()`, which would reject the row, and no `.passthrough()`), plus `panelResult(schema)` builders. Parsing a row removes any key its schema does not list; the row itself is kept. This is separate from the reader boundary below, where a Notion page whose listed properties fail to parse is skipped and counted in `skipped`. Every row has `id` (normalised page id) and `pageUrl` (`https://www.notion.so/<id without dashes>`).
  - `LeadRow`: `id`, `pageUrl`, `createdAt`, `name` (Notion Student Name), `stage`, `ownerStaffId`, `ownerName`, `nextAction`, `nextActionDue`, `nextActionDueDate` (Toronto), `attempts`, `lastContact`, `source`, `lostReason`, `contactedAt`, `trialBookedAt`, `trialAttendedAt`, `closedAt`, `trialTime`, `trialTimeDate` (Toronto), `trialTeacherId`, `trialTeacherName`, `level`, `hasMajorGaps`, `recommendedPlan`, `hasTrialSummary`, `parentName`, `inPeopleCopy` (boolean).
  - `TouchRow`: `id`, `pageUrl`, `when`, `whenDate` (Toronto), `type`, `outcome`, `studentId`, `staffId`, `staffName`, `note` (at most 280 characters). `TouchesData = { studentId, studentName, touches: TouchRow[] }[]`.
  - `TrialLessonRow`: `id`, `pageUrl`, `date`, `studentId`, `studentName`, `teacherId`, `teacherName`, `durationHours`, `hasTopic`, `hasDiagnosis`, `preferredDays`.
  - `WorkRow`: `id`, `pageUrl`, `name`, `area`, `state`, `type`, `dueReview`, `dueReviewDate` (Toronto), `owner`, `taskTypeIds`.
  - `InvoiceRow`: `id`, `pageUrl`, `status`, `paidOn`, `amount`, `creditApplied`, `issued`, `due`, `month`, `studentIds`, `studentName` (first resolvable student).
  - `HealthProvider` (the AC9 shape) and `healthOf(result)`.

### Shared bounded pager: `apps/tracker/lib/notion/paged.ts` (new)

- `propertyFilter(token, fetcher, dataSourceId, names, label)`: one schema `GET`, name to id like `schemaLookup` in `billing.ts`; a missing property throws `NotionError("<label> is missing <name>")` (the panel goes to `error`, never a guess).
- `pagedQuery({ token, fetcher, dataSourceId, filterQuery, body, maxPages })` returns `{ rows: unknown[]; complete: boolean; pages: number }`: `POST /v1/data_sources/{id}/query`, `page_size 100`, stops at `maxPages` with `complete: false` instead of throwing "Too many Notion pages". Non-2xx uses `notionHttpError` (keeps Retry-After); bodies are never echoed. Calls `api.notion.com` through `notionApiBaseOverride()`, so it joins the `students.test.ts` list.

### Notion readers (all under `apps/tracker/lib/notion/`, human-merge path; Zod at the boundary, ADR 0017)

Each takes a config, `fetcher` and `maxPages`, asks only for its listed properties via `filter_properties`, drops everything else at the parse step, skips rows that fail to parse (counted in `skipped`), and returns `{ rows, complete, skipped }`.

- **`leads.ts`**** (new).** `LEAD_PROPS = ["Student Name", "Stage", "Owner", "Next Action", "Next Action Due", "Attempts", "Last Contact", "Source", "Lost Reason", "Contacted At", "Trial Booked At", "Trial Attended At", "Closed At", "Trial Time", "Trial Teacher", "Level", "Major Gaps", "Recommended Plan", "Trial Summary", "Parent Name"]`. `fetchLeads(config)`: every Students & Parents row (no stage filter, so REQ-59 can count Lost and Onboarding), sorted by created time descending. `created_time` comes from the page object. Relations return page ids only. `Major Gaps` and `Trial Summary` become booleans in the parser (Decision 5). Parent Phone, Parent Email and Lead ID are not read (Decision 4).
- **`touches.ts`**** (new).** `TOUCH_PROPS = ["Type", "Outcome", "Student", "Staff", "Note", "When"]`. `fetchRecentTouches(config, { since })`: filter `created_time on_or_after since`, sort created time descending. Pure `lastTouchesByStudent(rows, n)` groups by each normalised `Student` id and keeps the newest n.
- **`lessons.ts`**** (extended).** New `TRIAL_PROPS = ["Type", "Date", "Teacher", "Related to Students & Parents (Lessons 1)", "Duration (hrs)", "Topic Covered", "Trial: Diagnosis", "Trial: Preferred Lesson Day"]` and `fetchTrialLessons(config)`: filter `Type select equals "Trial"`, sort Date descending. It does not go through `createLessonsPort`'s `propertyIds`, so a missing `Class occurrence` (spec 3.5, missing live) does not fail it. `Topic Covered` and `Trial: Diagnosis` become booleans. The port, its two write shapes and the header contract are unchanged; the header comment gains one line for the read.
- **`work.ts`**** (extended).** New `WORK_PROPS = ["Name", "Area", "State", "Type", "Due / Review", "Owner", "Task Type"]` and `fetchWorkItems(config)`: filter `State does_not_equal "Done"`, sort `Due / Review` ascending. The seven-property writer and every existing function are untouched.
- **`billing.ts`**** (extended).** New `ORG_INVOICE_PROPS = ["Status", "Paid On", "Amount (CAD)", "Credit Applied (CAD)", "Issued", "Due", "Month", "Student"]` and `fetchOrgInvoices(config)`: every status (Draft, Sent, Paid, Void; the finance card filters), sort Month descending. Values pass through as Notion holds them; nothing is computed (tracker ADR 0049). The parent tab's `fetchInvoices` and its `P` map are untouched.
- **`config.ts`****.** `DEFAULT_TOUCHES_DATA_SOURCE_ID = "772939bd-bd88-4272-9f1f-20ce75ef2204"` and `readConsoleNotionConfig()` returning `{ token, studentsId, touchesId, lessonsId, workId, invoicesId }` (each overridable by `NOTION_*_DATA_SOURCE_ID`, `NOTION_TOUCHES_DATA_SOURCE_ID` new) or null without `NOTION_TOKEN`.
- **`students.test.ts`****.** The `api.notion.com` list becomes `billing.ts, leads.ts, lessons.ts, paged.ts, parents.ts, staff.ts, students.ts, touches.ts, work.ts`. The `students.ts` Owner and Trial Teacher scan stays as it is.

### Time: `apps/tracker/lib/time.ts`

`localDateOf(iso: string | null): string | null`: a `YYYY-MM-DD` value is returned as is; a datetime is formatted in `SCHEDULE_TIME_ZONE` with the same `en-CA` formatter as `todayIso`.

### People inputs: `apps/tracker/lib/console/people-read.ts` (new, select-only)

`createConsolePeopleReader(viewer.db.tracker, orgId)`: `student_people` (`notion_student_id, name, stage, active, archived_at`), `staff` (`notion_staff_id, name, active, archived_at`) and `rpc("people_synced_at")`, all on the owner's own cookie client (RLS `is_org_owner`, migration 0022). Zod-parsed; a query error throws. It does not import `createPeopleStore` (which carries the `apply` write), so no write path enters the console.

### Facade: `apps/tracker/lib/console/facade.ts` (new)

`loadConsolePanels(deps): Promise<ConsolePanels>` with injected `deps = { orgId, now, people, notion (ports or null), timeoutMs, maxPages, touchesPerStudent, touchesWindowDays, freshness }`.

1. `lastCheckedAt = now()`. Six provider calls start together under `Promise.allSettled`; each is raced against `timeoutMs` and also gets a fetcher bound to `AbortSignal.timeout(timeoutMs)`, so a hung request is abandoned. The race rejects with `ProviderTimeoutError` (new, exported from `lib/console/facade.ts`, `extends Error`, message ``Timed out after ${timeoutMs / 1000} s``, so "Timed out after 8 s" at the default). If the abort reaches the fetcher first, the reader rejects with a `DOMException` named `TimeoutError` or `AbortError`, or a `NotionError` with no status whose cause is that abort; the facade maps those to the same message.
2. Per Notion panel: rejected becomes `error`, with `errorMessage` chosen in this order: a `ProviderTimeoutError` or an abort (above) gives "Timed out after 8 s"; a `NotionError` (`apps/tracker/lib/notion/staff.ts`) gives its own message ("Notion returned 500", "Leads is missing Stage"); anything else gives "Read failed"; the result is cut to 300 characters; `complete: false` becomes `stale` with `staleReason` "Stopped after N pages; showing M rows"; zero rows complete becomes `empty`; otherwise `ready`. Rows are deduped in a `Map` keyed by `normalId` (`apps/tracker/lib/domain/billing.ts`).
3. Joins: student and staff names by normalised page id from the people read. If the people read failed, names are null and the panel is `stale` with `names_unavailable`; if `people_synced_at` is older than `TUNING.peopleStaleMinutes`, `stale` with `people_sync_stale`. `work` joins nothing. A panel already in `error` stays `error`. Precedence is `error` over `stale` over `empty` over `ready`. When a panel is stale for two reasons (truncated in step 2 and a people reason here), `staleReason` joins them with "; " in a fixed order, truncation first, people second: "Stopped after 10 pages; showing 1000 rows; people_sync_stale". An empty complete panel has no names to resolve, so it stays `empty`.
4. Each row goes through its strip-mode row schema (plain `z.object`, see Decision 16): `parse` drops unknown keys and keeps the row, so only listed fields leave the facade.
5. `freshness` is a small in-process record (`Map<orgId:panel, ISO>`), set only on a successful read and read on failure. The facade never creates one; it uses the Map passed in `deps`. In production that is the single module-level `consoleFreshness` in `lib/console/providers.ts` (see Wiring), so it carries over between requests on the same server instance. It holds times only, never rows. It resets on a cold start, so `lastSuccessfulFetchAt` can be null after a failure (ADR 0065 records this; a durable record would need a table, which is out of scope).
6. The `people` provider reports its own status: `ready`, `stale` (`people_sync_stale`) or `error`.

The facade never throws; `ConsolePanels = { leads, touches, trialLessons, work, invoices, people }`.

### Wiring: `apps/tracker/lib/console/providers.ts` (new)

`createConsoleDeps(viewer: OwnerViewer)` builds the real ports from `readConsoleNotionConfig()` (null without a token) and the people reader. The file declares one module-level `const consoleFreshness = new Map<string, string>()` (exported for tests only), and every `createConsoleDeps` call passes that same Map as `deps.freshness`; it never builds a Map per request. Keys carry the org id, so one org's times never answer for another. It is the only console file allowed to import from `lib/notion/`, and only `config`, `leads`, `touches`, `lessons`, `work` and `billing`.

### Health: `apps/tracker/lib/console/handlers.ts` and `apps/tracker/app/api/console/health/route.ts`

`handleConsoleHealth` gains a `deps` input: after `requireOwner` and the `is_org_owner` check (unchanged, still first), it calls `loadConsolePanels` and returns `{ status: "ok" | "degraded", checkedAt, providers }` via `healthOf` (AC9), `Cache-Control: no-store`. The route passes `createConsoleDeps`. GET only.

### Tuning: `apps/tracker/lib/domain/tuning.ts`

`consoleProviderTimeoutMs: 8_000`, `consoleNotionMaxPages: 10` (1,000 rows per panel), `consoleTouchesPerStudent: 5`, `consoleTouchesWindowDays: 90`.

### Scans and docs

- `apps/tracker/lib/console-scan.test.ts`: the "covers" list adds `contracts.ts`, `facade.ts`, `people-read.ts`, `providers.ts`; the `lib/notion/` ban gains one exception (`providers.ts`, those six modules only); the rpc allow-list becomes `is_org_owner` and `people_synced_at`; the write-call ban keeps `.insert(`, `.update(`, `.upsert(` and `.delete(`, gains `.patch(`, `pages.create`, `"PATCH"` and `"DELETE"`, and keeps applying to every console file. The existing service-client ban (`@ap-academy/db/service` and `getServiceClient`, the RLS-bypassing client in `packages/db/src/service.ts`) applies unchanged to every file under `lib/console/`, `app/api/console/`, `app/console/` and `components/console/`, the four new files included.
- `apps/tracker/lib/notion/console-readers-scan.test.ts` (new): reads `leads.ts`, `touches.ts` and `paged.ts` and bans `pages.create`, `"PATCH"`, `"DELETE"`, `.patch(`, `.insert(`, `.update(`, `.upsert(`, `.delete(`, `/v1/pages`, `/v1/blocks`, `/v1/comments`, `@ap-academy/db/service` and `getServiceClient`; the only Notion path those files name is `/v1/data_sources/`.
- Tracker ADR `apps/tracker/docs/decisions/0065-console-read-facade.md` (status rules, field lists, free text as presence only, in-memory freshness, no row caching, health shape) plus its `README.md` row.
- e2e `e2e/tracker/flows.mjs` REQ-53 owner health check: replace "exactly two keys" with AC9's shape (six provider keys, each status in the vocabulary, no sentinel name or email in the body). The mock Notion does not serve the new data sources, so those providers report `error` and the top status is `degraded`, which the check accepts. The diff touches `apps/tracker/app/`, so the builder runs `pnpm test:tracker` before the PR.

UI: none (out of scope). The only visible change is the health JSON.

## Migration

None. No table, column, policy or trigger; the reads use existing RLS on `tracker.student_people`, `tracker.staff` and `tracker.people_synced_at` (0022).

## Test plan

| Test | Type | Covers |
| --- | --- | --- |
| `lib/notion/leads.test.ts`: fixture page with every listed property plus Parent Phone, Parent Email, Lead ID, Notes gives a row with exactly the LeadRow source keys; `filter_properties[]` equals the ids of `LEAD_PROPS`; `LEAD_PROPS` equals the design list; malformed row skipped and counted; source scan bans the forbidden names | unit | AC1, AC7 |
| `lib/notion/touches.test.ts`: since filter and sort in the body; `lastTouchesByStudent` keeps the newest 5 per student by page id; Note cut to 280; `TOUCH_PROPS` exact | unit | AC1, AC5, AC7 |
| `lib/notion/lessons.test.ts` additions: `fetchTrialLessons` sends `Type equals Trial`, works with no `Class occurrence` in the schema, `TRIAL_PROPS` exact and without payout names, booleans for Topic and Diagnosis | unit | AC1, AC7 |
| `lib/notion/work.test.ts` additions: `fetchWorkItems` filter, sort, `WORK_PROPS` exact; existing writer tests unchanged | unit | AC1, AC7 |
| `lib/notion/billing.test.ts` additions: `fetchOrgInvoices` has no student filter, returns all four statuses, values passed through, `ORG_INVOICE_PROPS` exact | unit | AC1, AC7 |
| `lib/notion/paged.test.ts`: full (1 page), paginated (3 pages), truncated (`has_more` at the cap gives `complete: false`, rows kept), malformed body throws, 429 keeps Retry-After, missing property throws with its name | unit | AC4 |
| `lib/notion/console-readers-scan.test.ts` (new): `leads.ts`, `touches.ts`, `paged.ts` contain none of the banned write calls, write endpoints or service-client names; the only Notion path is `/v1/data_sources/` | unit | AC6, AC12 |
| Fetcher-spy tests in `leads.test.ts`, `touches.test.ts`, `lessons.test.ts`, `work.test.ts`, `billing.test.ts`: across a full, paginated and truncated read, every request `fetchLeads`, `fetchRecentTouches`, `fetchTrialLessons`, `fetchWorkItems` and `fetchOrgInvoices` make is `GET /v1/data_sources/{id}` or `POST /v1/data_sources/{id}/query` | unit | AC6 |
| `lib/notion/students.test.ts`: updated `api.notion.com` file list | unit | AC6 |
| `lib/time.test.ts`: `localDateOf` for 2026-03-08 and 2026-11-01 boundary instants, date-only passthrough, null | unit | AC8 |
| `lib/console/facade.test.ts` with fake ports: all ready; one port throws, one 500s, one hangs past the timeout (fake timers; `errorMessage` exactly "Timed out after 8 s", and a fetcher that rejects with an `AbortError` gives the same text; a plain `Error` gives "Read failed"): others `ready`, failed ones `error`, `data` null, `count` null, message at most 300; truncated gives `stale` with the count; empty complete gives `empty`; duplicate page across pages returned once; two same-name students give two lead rows and names resolved by id; extra keys stripped; `lastCheckedAt` every call, `lastSuccessfulFetchAt` kept from the previous success on failure; people failure gives `names_unavailable`; people older than 120 min gives `people_sync_stale`; null Notion ports give "Notion is not configured"; a truncated panel with people older than 120 min is `stale` with staleReason "Stopped after 10 pages; showing 1000 rows; people_sync_stale"; a failed panel with stale people stays `error`; an empty complete panel with stale people stays `empty` | unit | AC2, AC3, AC4, AC5, AC10, AC11 |
| `lib/console/contracts.test.ts`: every row schema is a strip-mode `z.object` (not `.strict()`, not `.passthrough()`) whose keys equal the design list; parsing a row with `parentPhone`, `leadId` and `notes` added returns the row without them; `healthOf` output has exactly the AC9 keys | unit | AC2, AC9 |
| `app/api/console/console-routes.test.ts` additions: owner 200 with `ok` when all ready and `degraded` when one fails; providers keys and per-provider keys exact; no row value in the body; non-owners still denied with no deps call | unit | AC9 |
| `app/api/console/console-routes.test.ts` freshness carry-over: two `handleConsoleHealth` calls whose deps share `consoleFreshness`, the first with a `leads` port that succeeds at time T1, the second (clock at T2) with that port throwing; the second body has `providers.leads.status` `error`, `lastCheckedAt` T2 and `lastSuccessfulFetchAt` T1. `lib/console/providers.test.ts` (new): two `createConsoleDeps` calls with different viewers return the same `freshness` object, which is `consoleFreshness` | unit | AC2 |
| `lib/console-scan.test.ts` updates: new files covered, `lib/notion/` only in `providers.ts`, write calls banned (now with `.patch(`, `pages.create`, `"PATCH"`, `"DELETE"`), service client (`@ap-academy/db/service`, `getServiceClient`) banned in every console file, rpc allow-list, GET-only route exports | unit | AC6, AC12 |
| e2e `flows.mjs` REQ-53 health check updated to the AC9 shape, owner 200, guest 307 and non-owner 403 unchanged | e2e (builder runs `pnpm test:tracker` locally before the PR) | AC9 |
| Reviewer check: each `*_PROPS` list and data source id against spec sections 3.1 to 3.8 | review | T4 |

## Out of scope

The north-star metric (REQ-56); scheduler capacity and lesson-gap models (REQ-58); any console UI or panel component (REQ-55 onward); any write to Notion or Supabase; any new table, including a durable last-fetch record; caching row values; reading Parent Phone, Parent Email or Lead ID; updating the "Adapter today" lines in `02-data-contracts.md` (REQ-63's release pass can refresh them).

## Risks and edge cases

- **Touches not shared with the integration.** The Notion token gets 404 on the Touches data source until Charlie shares the integration with it; `touches` reports `error` ("Notion returned 404") and the other panels are unaffected. The PR body lists the one-time sharing step.
- **Rate limits.** One load is about five schema GETs plus five to fifteen queries in parallel. A 429 becomes `error` for that panel with Retry-After kept in the error; nothing retries in this card.
- **Cold-start freshness.** `lastSuccessfulFetchAt` resets on a new serverless instance; the result then says null, never a made-up time.
- **Shifting cursors.** A row edited mid-pagination can appear twice; dedupe by page id handles it. A row can also be missed; that is the same risk the existing readers carry.
- **Personal data.** Parent Name and the 280-character Touch Note are the only free text read; Major Gaps, Trial Summary, Diagnosis and Topic become presence booleans. Nothing is logged, cached or stored, and the health route returns no rows. Error messages are fixed strings, never Notion bodies.
- **Property renamed in Notion.** `propertyFilter` fails that panel to `error` naming the property, never a silent partial.
- **Timeout and abort.** A timed-out read is abandoned through its AbortSignal; its late result is ignored.

## Decisions for approval

| # | Decision | Options | Default if you say nothing |
| --- | --- | --- | --- |
| 1 | New dependencies | None | None. Zod and plain fetch, as in the existing readers. |
| 2 | Schema placement and numbers | Migration; ADR number | No migration. Tracker ADR `0065-console-read-facade.md`: main ends at 0062, REQ-44 (Building) holds 0063 and 0064, the one open `req/` PR (#110, REQ-44's migration) adds only `supabase/migrations/0025_iris_drafts.sql`, and REQ-34 and REQ-55 name no ADR (re-checked 2026-10-22). |
| 3 | Where the new Notion reads live | As the card says (new `leads.ts`, `touches.ts`; new functions in `lessons.ts`, `work.ts`, `billing.ts`); all new files (as spec section 1 suggests) | As the card says, plus one shared pager `paged.ts`. Existing functions in those three files are untouched. |
| 4 | Parent Phone and Parent Email | Not read; read for display | Not read. The console deep-links the Notion page (spec 3.1: contact shown only as deep links). Lead ID is never read. |
| 5 | Free text from Notion | Pass text; presence booleans | Presence booleans for Major Gaps, Trial Summary, Trial: Diagnosis, Topic Covered; Parent Name as text; Touch Note as text, cut to 280 characters (touch history needs it). |
| 6 | Lead name source | Notion Student Name from the same read; `student_people` name only | Notion Student Name (a new lead may not be synced yet). Every other panel resolves names from the people copy by page id (REQ-38), and staff names always come from `tracker.staff`. |
| 7 | Which rows each reader lists | As listed under Approach | Leads all stages; touches the last 90 days; trial lessons all; work State not Done; invoices all statuses. Each capped at 10 pages of 100. |
| 8 | Fields beyond the card's list | Card list only; add what a later panel needs | Adds Work `Name` (a work item needs a label) and Lessons `Date`, `Teacher`, student relation, `Duration (hrs)`, `Topic Covered` (contract B evidence). Nothing else. |
| 9 | Last-successful-fetch record | In-process memory (times only); a new table | In-process memory. A table is out of scope; ADR 0065 says when to revisit. |
| 10 | `NOTION_TOKEN` unset | `error` "Notion is not configured"; `unverifiable` | `error`. `unverifiable` stays reserved for the north star (spec section 2). |
| 11 | Health response shape | Statuses and times only; add counts | Statuses and times only, top-level `ok` or `degraded`. This replaces REQ-53's `{ status, checkedAt }`; the unit and e2e checks change with it. |
| 12 | Console scan exception | Only `lib/console/providers.ts` may import `lib/notion/` (six modules), plus rpc `people_synced_at`; inject everything from the route | `providers.ts` exception. The ban stays for every other console file. |
| 13 | Schema-lookup caching | Uncached schema GET per load; reuse `unstable_cache` as `cached.ts` does for billing | Uncached. One owner, occasional loads; caching can come with the panels. |
| 14 | Tuning values | As listed | Timeout 8 s, 10 pages, 5 touches per student, 90-day window. |
| 15 | Size | One PR; split readers from facade | One PR. The facade and its tests are the readers' only consumer here. |
| 16 | Row schema mode for unknown keys | Strip (default `z.object`, row kept without the key); `.strict()` (row skipped and counted) | Strip. The reader already asks Notion only for listed properties, so an extra key is a code mistake, not bad data; dropping the key keeps the panel truthful without hiding a real row. |
| 17 | Two stale reasons on one panel | Join both, cap first; the cap wins; the people reason wins | Join both with "; ", cap first. Status precedence `error` over `stale` over `empty` over `ready`. |
