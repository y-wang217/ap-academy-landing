# REQ-61: Console 7/12: Explicit call outcomes and next-action follow-ups written to Notion

Copied from the Notion card (https://app.notion.com/p/400d6ae73dd781d1a66bc894421327a0) at build time, 2026-10-23. Risk High; approved by Charlie.

## Build notes

- Numbers re-checked at build: migration `0029_console_transitions.sql`, workspace ADR 0007 and tracker ADR 0076 are free on `main` and in every open `req/` PR.
- `LeadSnapshot` also carries `nextActionDue`, `owner` and `lastContact`, so the read-back can compare every patched key.
- The transition row's `touch` also keeps the form's next action and due time (never the note), so a reused request id with a different form is refused (AC7).
- `lostReason` joins `lastEditedAt` on the wire `SalesLead`, so the form can hide outcomes for a permanent Lost Reason.
- Unconfirmed saves are kept in memory per lead in the Sales provider, so selecting another lead and coming back keeps the request id and note for Retry.

After a real call, the founder records an explicit outcome and the next action in the authoritative Notion records (one Touches row plus the Students & Parents fields the OPS SYSTEM rules prescribe), the write is idempotent and read back, and the Rolodex advances without losing an unresolved contact. Nothing external is sent.

**Seed:** FC-06. **Sources:** the write contract recorded by Console 1/12 from the Notion page "OPS SYSTEM (agents.md)" (allowed Stage transitions, contracts A to D, cadence, exceptions, Layer 2 note about `Txn ID` and `Last Txn` properties and a Supabase transition log); workspace ADR 0004 ("Nothing is written back to Notion except the Weekly Schedule summary"), which this card amends; the outbox pattern in `apps/tracker/lib/scheduler/outbox*.ts` and migration 0021_notion_outbox (tracker ADR 0054); `schedule_write` idempotency by `request_id` (migration 0018). **Blocked by:** Console 6/12.

## Requirements

- Workspace ADR amending ADR 0004: the console may create Touches rows and update exactly these Students & Parents properties: Stage (only along the allowed transitions), Owner, Next Action, Next Action Due, Attempts, Last Contact, Lost Reason, and the milestone stamps Contacted At, Trial Booked At, Closed At (never cleared). Parent fields, rates, invoices, Sales Notes, Notes and Weekly Schedule are never written by the console. Number reserved under REQ-51 rules.
- Outcome set exposed to the founder, each mapped to its OPS SYSTEM side effects: No answer (Touch Outcome No answer, Attempts +1, Next Action Due per the two-slot cadence), Contacted / call back later (Touch Follow-up, Attempts 0, Next Action Due = the time given, Last Contact), Trial booked (contract A: requires Parent Name, Student Name, Parent Phone, Subjects, Grade, Target Program, Trial Time, Sales Notes already present on the row; stamps Trial Booked At and Contacted At if empty, Stage = Trial Booked, Owner cleared, Next Action = Deliver trial, Touch Outcome Trial booked), Follow-up scheduled (Next Action + Next Action Due), Not interested or Wrong number or Do not contact (Stage = Lost with the matching Lost Reason; Do not contact is permanent), Won (contract C: requires Lesson Cadence, Hourly Rate (CAD), Last Payment Date, Subjects already present; stamps Closed At, Stage = Onboarding, Next Action = Assign teacher, Next Action Due = now + 24h, Touch Outcome Won). A contract whose fields are missing is refused server-side with the missing field names and a deep link to fill them in Notion; the console never fills them itself.
- "Paid" or "Enrolled" is never a console outcome: Won requires Last Payment Date already set in Notion; the console never writes Last Payment Date, Invoices or Hours Paid. A verbal yes or a completed trial does not satisfy it.
- Idempotency and durability: a migration adds a `tracker` (or `console`) transition-log table keyed by `request_id` (unique), with the target page id, the intended patch, the Notion result, `state` (pending, running, done, failed, uncertain), `attempts`, timestamps and `created_by`, RLS owner-only read, service or security-definer write; a duplicate submit with the same `request_id` returns the stored result; a timeout after commit is marked `uncertain` and resolved by a read-back of the Notion page before any retry; non-idempotent retries are blocked with guidance. If the OPS SYSTEM `Txn ID` and `Last Txn` properties exist in Notion they are written; if not, the design lists adding them by hand as a decision for Charlie.
- Server action or `POST /api/console/outcomes` under the origin check (Console 2/12), owner only, Zod-validated, stale-state check (the row's current Stage and last_edited_time must match what the founder saw, else refuse and refresh), read-back after write, one audit event through the existing audit pattern (`tracker.audit_log` via `write_audit_keyed`, migration 0022) with page id, outcome and result.
- Queue progression: after a verified write the Rolodex re-reads and selects the next eligible item; a failed or uncertain write keeps the item selected with the error and a retry; the draft note text stays in the form until success.
- Call and text remain deep links (`tel:` and the Notion page); no SMS, email or dial API; the form has no send button.

## Acceptance criteria

- AC1: Each outcome applies exactly the side effects in the design's transition table and is refused with named missing fields when its contract is not met (table-driven test over every outcome and the disallowed transitions).
- AC2: After a verified write the queue advances to the next eligible item and the previous item leaves or stays per its new state; a failed write keeps it visible with a retry.
- AC3: Two submits with one `request_id` create one Touches row and one patch; an `uncertain` state is resolved by read-back and never retried blindly.
- AC4: No outcome sets Last Payment Date, Invoices, Hours Paid or any billing field, and Won is refused without Last Payment Date (source scan plus tests).
- AC5: Opening a lead, saving a note or logging an outcome makes no outbound request other than to Notion and Supabase (mock Notion request log in e2e).
- AC6: Every mutation leaves one transition-log row and one audit event carrying the page id and the actual result.

## Test coverage

- T1: Transition matrix and contract tests; owner, teacher, parent, student and cross-site requests against the write route (403 or 401 before any read).
- T2: Duplicate submit, timeout-after-commit and read-back recovery tests against the mock Notion.
- T3: Playwright: founder logs an outcome on a seeded lead, the queue advances, a reload shows the Touch in history and the new Stage (`pnpm test:tracker`; the diff touches `apps/tracker/lib/notion/`, so the PR carries needs-human-merge); `pnpm test:rls` for the new table.

## Out of scope

No bulk outreach, no payment or invoice writes, no appointment or Calendly changes, no setter or teacher cards, no Trial Attended or Awaiting Close transitions (those belong to the trial teacher's report).

## Why High

It is the first console write into Notion people records, amends ADR 0004, adds a table and touches `apps/tracker/lib/notion/`; Charlie approves the design and merges.

## Global guardrails (all Console cards)

Founder-only, enforced server-side (owner membership via `getViewer()`, `tracker.is_org_owner` RLS), never by hidden UI; every read through the owner's own client. Notion stays the editor of record for people, leads, touches, lessons, invoices and work (workspace ADR 0004, OPS SYSTEM page); no shadow copies beyond what ADR 0004 allows; joins by Notion page id, never by name. No fabricated values: every panel carries a status (ready, empty, loading, stale, error, unverifiable), its source ids and last successful fetch time; one failed provider never blanks another panel and unknown is never shown as zero. The console never sends a message, places a call, books, pays or publishes; deep links only. No new dependency without a Decisions-for-approval row. Visual fidelity is contractual: `docs/spec/founder-console/handoff/VISUAL_DIRECTION.md`, `PANEL_STATES.md` and `visual-assets/founder-command-bridge-reference.png`, built from HTML, CSS and SVG components, never a raster with baked text; reduced motion, keyboard operation and 390, 1280, 1440 and 1920 px widths. Demo data lives only in tests and an isolated preview, never in production source (automated scan). Migrations ship in their own PR; High risk and `apps/tracker/lib/notion/` changes carry needs-human-merge. Readiness is Charlie's call in `docs/readiness.md`, never implied by a merge.

---

# Design: REQ-61: Console 7/12: Explicit call outcomes and next-action follow-ups written to Notion

**Summary:** Under the Rolodex on `/tracker/console` (Sales mode), the founder picks an outcome for the lead he just called, adds an optional note and presses "Log outcome". The server checks the transition and its handoff contract, writes one Touches row and the allowed Students & Parents fields to Notion idempotently (keyed by a `request_id` in a new `tracker.console_transitions` log), reads both back, and the queue moves to the next lead. Nothing is sent to anyone.
**Risk:** High. It is the first console write into Notion people records: it rewrites existing Students & Parents rows (Stage, Attempts, Next Action and the rest), amends workspace ADR 0004's "nothing is written back to Notion" rule, and edits `apps/tracker/lib/notion/`. Charlie approves the design and merges.

## Problem

Charlie (org owner, the only console viewer) calls the lead the Rolodex (REQ-57, tracker ADR 0071) puts first. Today he then opens Notion, fills the "Log a Touch" form and edits the lead row by hand, following the OPS SYSTEM rules recorded in `docs/spec/founder-console/02-data-contracts.md` section 4 (allowed Stage transitions, contracts A to D, two-slot cadence, exceptions). The console should take one explicit outcome and apply exactly those side effects, safely under double clicks, timeouts and stale screens, without ever filling a contract field, touching billing, or contacting anyone.

What exists:

- Owner gate for console JSON routes: `requireOwner` in `apps/tracker/lib/console/guard.ts` and `gateOwner` in `apps/tracker/lib/console/handlers.ts` (app check, then `is_org_owner` RPC on the owner's client). `/api/console/` is already in `ORIGIN_CHECKED_PREFIXES` (`apps/tracker/lib/cross-site.ts`), so `apps/tracker/proxy.ts` rejects a cross-site POST before the session is read.
- Read side: `fetchLeads` (`apps/tracker/lib/notion/leads.ts`), `fetchRecentTouches` (`apps/tracker/lib/notion/touches.ts`), `readConsoleNotionConfig` with the Touches id (`apps/tracker/lib/notion/config.ts`), the sales view and queue (`apps/tracker/lib/console/sales-view.ts`, `sales-queue.ts`, `sales-state.ts`) and the Rolodex UI (`apps/tracker/components/console/sales/next-lead.tsx`, `sales-provider.tsx`). `apps/tracker/lib/notion/console-readers-scan.test.ts` keeps `leads.ts`, `touches.ts` and `paged.ts` write-free; that stays true.
- Write precedents: `writeStudentSchedule` (one PATCH with a fixed key list, `students.ts`) and `createLessonsPort` (create plus patch with a schema check that refuses with `lessons_not_ready` when a property is missing, `lessons.ts`).
- Idempotency precedents: `request_id` on scheduler writes (migration 0018), the outbox state machine with `uncertain` and lease (`supabase/migrations/0021_notion_outbox.sql`, tracker ADR 0054), and `tracker.write_audit_keyed` (migration 0022).

Live Notion on 2026-10-23 (fetched at design time): Touches has `Touch` (title), `Type`, `Outcome`, `Student`, `Staff`, `Note`, `When`. **Neither ****`Txn ID`**** (Touches) nor ****`Last Txn`**** (Students & Parents) exists yet** (Decision 4). Students & Parents has every other property named below.

## Transition table

"Today" and times are America/Toronto (`SCHEDULE_TIME_ZONE` in `apps/tracker/lib/time.ts`). Dates written as date-only unless marked datetime. "If empty" means the console sets it only when the property is empty and never overwrites or clears a milestone. Every row also writes `Last Txn = request_id` and creates one Touch with `Txn ID = request_id`, `Student = the lead`, `Staff = the owner's staff id` (Decision 13), `Type = Close call` when the starting Stage is Awaiting Close and `Call` otherwise, `Note` = the founder's note, title `<Type> · <Mon D HH:MM>`.

| Outcome (form label) | Allowed from Stage | Stage written | Other Students & Parents writes | Touch Outcome | Requires |
| --- | --- | --- | --- | --- | --- |
| No answer | New, Working, Awaiting Close | New → Working; otherwise unchanged | Attempts = current + 1 (absolute value, computed once); Next Action Due = `nextCallSlot(now)` (datetime); Next Action = Call if empty. When the new Attempts reaches `TUNING.consoleNoAnswerCadenceAttempts` (4): Next Action = Text, Next Action Due = now + 7 days, and the form says "Cadence used up. Send the final approved text from your phone." | No answer | nothing |
| Contacted, call back later | New, Working | Working | Attempts = 0; Next Action = Call; Next Action Due = the time given (datetime); Last Contact = today; Contacted At = today if empty | Follow-up | a callback time in the future |
| Follow-up scheduled | Working, Trial Booked, Trial Claimed, Awaiting Close, Onboarding | unchanged | Next Action = the one chosen (Call, Text, Book trial, Close call, Rebook trial, Schedule first lesson); Next Action Due = the time given (datetime); Last Contact = today; Contacted At = today if empty | Follow-up | Next Action and a future time |
| Trial booked (contract A) | New, Working | Trial Booked (New passes through Working: New → Working → Trial Booked, both allowed edges) | Trial Booked At = today if empty; Contacted At = today if empty; Owner cleared; Next Action = Deliver trial; Next Action Due = Trial Time; Last Contact = today | Trial booked | Parent Name, Student Name, Parent Phone, Subjects, Grade, Target Program, Trial Time, Sales Notes all non-empty |
| Not interested | New, Working, Awaiting Close | Lost | Lost Reason = Not interested; Next Action = None; Next Action Due cleared; Last Contact = today; Contacted At = today if empty | Not interested | nothing |
| Wrong number | New, Working | Lost | Lost Reason = Wrong number; Next Action = None; Next Action Due cleared | Wrong number | nothing |
| Do not contact | New, Working, Awaiting Close | Lost | Lost Reason = Do not contact; Next Action = None; Next Action Due cleared; Last Contact = today; Contacted At = today if empty | Do not contact | nothing |
| Won (contract C) | Awaiting Close | Onboarding | Closed At = today if empty; Next Action = Assign teacher; Next Action Due = now + 24 h (datetime); Last Contact = today | Won | Lesson Cadence, Hourly Rate (CAD), Last Payment Date, Subjects all non-empty |

Refusals, each before any write:

- Any outcome for a row whose Lost Reason is Do not contact or Duplicate (permanent; the queue already hides them): `disallowed`.
- Any outcome from a Stage not listed in its row (Trial Booked or Trial Claimed to Lost, anything from Active, Paused, Lost, the legacy Trial and Churned, or no Stage): `disallowed`, message "Change the Stage in Notion first" with the lead link.
- A contract field empty: `contract_missing` with the exact missing property names and the lead's Notion URL. The console has no input for any contract field and never fills one.

`nextCallSlot(now)`: business days are Monday to Friday. If today is a business day and the local time is before 15:00, the slot is 15:00 today; otherwise 12:00 on the next business day. (No answer at 12 gives 3 PM today; no answer at 3 gives 12 PM next business day, as the OPS cadence says.)

## Acceptance criteria

- [ ] AC1: `planOutcome` returns exactly the Students & Parents patch and Touch fields in the transition table for every (outcome, allowed Stage) pair, and refuses with `disallowed` naming the Stage for every pair the table does not list and for any row whose Lost Reason is Do not contact or Duplicate. A table-driven test covers every outcome against all eleven Stage options plus no Stage.
- [ ] AC2: Trial booked with any one of its eight contract fields empty, and Won with any one of its four empty, returns 422 `{ error: "contract_missing", missing: [...], notionUrl }` listing exactly the empty property names, and the fake Notion records zero PATCH and zero page-create requests.
- [ ] AC3: The writer accepts only these Students & Parents keys: Stage, Owner, Next Action, Next Action Due, Attempts, Last Contact, Lost Reason, Contacted At, Trial Booked At, Closed At, Last Txn; any other key throws before a request is made. No outcome writes Last Payment Date, Invoices, Hours Paid (either), Hourly Rate (CAD), Lesson Cadence, Parent fields, Sales Notes, Notes or Weekly Schedule (unit test over every plan plus a source scan of the writer's PATCH body builder), and Won is refused while Last Payment Date is empty even when the other three contract C fields are set.
- [ ] AC4: `nextCallSlot` gives: Monday 10:00 to Monday 15:00; Monday 12:05 to Monday 15:00; Monday 15:10 to Tuesday 12:00; Friday 15:10 to Monday 12:00; Saturday 11:00 to Monday 12:00; and correct UTC offsets on both sides of the November and March DST changes. The fourth No answer switches Next Action to Text with a due 7 days out.
- [ ] AC5: `POST /api/console/outcomes` returns 401 signed out, 403 `{ "error": "forbidden" }` for teacher, student, parent and role-less viewers, 503 when Supabase is not configured, and 400 for a body that fails the Zod schema; each of these makes zero Notion and zero transition-log calls. A cross-site POST gets 403 from the proxy before the session is read.
- [ ] AC6: When the lead's current Stage, Attempts or `last_edited_time` differs from the `expected` values the founder's screen sent, the route returns 409 `{ error: "stale", current }`, makes no Notion write and inserts no transition row.
- [ ] AC7: Two submits with one `request_id` (one after the other, and two at once) produce one Students & Parents PATCH, one Touches create and one transition row. The later submit returns the stored result with the same body, or 409 `in_progress` while the first still holds its lease. Reusing a `request_id` with a different page, outcome, form values or note hash returns 409 `request_id_reused`.
- [ ] AC8: A Notion timeout, network error or 5xx on any write leaves the row `uncertain` and returns 202 with a retry message. A retry with the same `request_id` reads Notion back before writing: if `Last Txn` already equals the `request_id` it sends no second PATCH; if a Touch with that `Txn ID` exists it creates none; if a create was sent less than `TUNING.consoleTouchSettleSeconds` (60) ago and is not yet found it stays `uncertain` with `retryAfterSeconds` and creates nothing. A new `request_id` for a page that has a `running` or `uncertain` transition returns 409 `unresolved_transition` with the open `request_id`.
- [ ] AC9: A transition is `done` only after a GET of the lead page shows every patched property equal to the intended value (datetimes compared as instants) with `Last Txn` equal to the `request_id`, and the Touch is found with that `Txn ID` and the lead in `Student`. Any mismatch leaves it `uncertain` with "Notion shows different values; check the page". The 200 response carries the read-back values.
- [ ] AC10: Every request that reaches a Notion write leaves exactly one `tracker.console_transitions` row. Each change of its state to `done`, `failed` or `uncertain` writes one `tracker.audit_log` row with `table_name = 'console_transitions'`, `row_id` = the Notion page id, and `after` holding the state and result, so a clean write leaves one row and one audit event. The note text is never stored in Supabase; the row keeps only its length and SHA-256.
- [ ] AC11: After a `done` response the form clears, the Sales queue re-reads, and selection moves to the first visible lead that is not the one just logged. The logged lead leaves the queue (Lost) or stays in its new place (any active Stage). After `stale`, `contract_missing`, `disallowed`, `uncertain` or `failed` the same lead stays selected, the note text stays in the form, and the message shows with Retry (uncertain), Refresh (stale) or "Fill in Notion" (contract).
- [ ] AC12: The outcome form has no send, call or text control and no `tel:`, `sms:` or `mailto:` link. In the e2e run, opening a lead, typing a note and logging an outcome makes browser requests only to the app origin, and the server's only outbound requests are to the mock Notion (`/v1/pages`, `/v1/data_sources` paths) and PostgREST.
- [ ] AC13: While Touches has no `Txn ID` text property or Students & Parents has no `Last Txn` text property, the route returns 503 `{ error: "notion_not_ready", missing: [...] }` and writes nothing, and the form says "Add the Txn ID and Last Txn properties in Notion before logging outcomes."
- [ ] AC14: In `supabase/tests/console_transitions.sql`, the org owner reads, inserts and updates only their own org's rows; a teacher, student, parent, anon and another org's owner read none and cannot insert or update; nobody can delete; an update that changes `request_id`, `notion_page_id`, `outcome`, `patch`, `touch`, `expected` or `created_by`, or moves a `done` or `failed` row, is refused; two open rows for one page are refused.
- [ ] AC15: Workspace ADR `docs/adr/0007-console-writes-notion-people.md` and tracker ADR `apps/tracker/docs/decisions/0076-console-call-outcomes.md` exist with every section, the tracker decisions `README.md` lists 0076, ADR 0004's status line reads "amended in part by ADR 0005 and ADR 0007", root `CLAUDE.md` links ADR 0007, and none of them has an em dash. `apps/tracker/docs/permission-matrix.md`, `supabase/tests/permission_matrix.sql` and `apps/tracker/lib/permission-matrix.test.ts` gain the new table and route.

## Approach

### 1. Pure rules (new) `apps/tracker/lib/console/outcomes.ts`

No I/O; imports `lib/time.ts` and `lib/domain/tuning.ts` only, so the client form can import `allowedOutcomes`.

```ts
export const OUTCOMES = ["no_answer", "call_back", "follow_up", "trial_booked", "not_interested", "wrong_number", "do_not_contact", "won"] as const;
export type Outcome = (typeof OUTCOMES)[number];
export type LeadSnapshot = {
  id: string; stage: string | null; lostReason: string | null; attempts: number | null; nextAction: string | null;
  contactedAt: string | null; trialBookedAt: string | null; closedAt: string | null; trialTime: string | null;
  lastEditedAt: string; lastTxn: string | null;
  present: Record<ContractField, boolean>; // booleans only: Parent Phone, Sales Notes and the rest never leave the writer as values
};
export type LeadPatch = Partial<{ stage: string; owner: null; nextAction: string; nextActionDue: string | null; attempts: number;
  lastContact: string; lostReason: string; contactedAt: string; trialBookedAt: string; closedAt: string }>;
export type TouchPlan = { type: "Call" | "Close call"; outcome: string; title: string };
export function allowedOutcomes(stage: string | null, lostReason: string | null): Outcome[];
export function nextCallSlot(now: Date): string; // ISO datetime with the Toronto offset
export function planOutcome(input: { outcome: Outcome; lead: LeadSnapshot; form: { nextAction?: string; due?: string }; now: Date }):
  | { ok: true; patch: LeadPatch; touch: TouchPlan; cadenceUsedUp: boolean }
  | { ok: false; code: "disallowed" | "contract_missing" | "bad_form"; missing?: string[]; message: string };
```

`lib/time.ts` gains `zonedIso(dateIso: string, hhmm: string): string` (Toronto wall time to ISO with offset). `lib/domain/tuning.ts` gains `consoleNoAnswerCadenceAttempts: 4`, `consoleTouchSettleSeconds: 60`, `consoleTransitionLeaseSeconds: 30`, `consoleNoteMaxChars: 2000`.

### 2. Notion writer (new) `apps/tracker/lib/notion/lead-writer.ts` (human-merge path)

`server-only`, plain fetch like `lessons.ts`, base URL honouring `notionApiBaseOverride()`. `createLeadWriter({ token, studentsId, touchesId }, fetcher)` returns:

- `checkReady()`: GET both data source schemas; returns the missing names among `Txn ID` (Touches, rich_text) and `Last Txn` (Students & Parents, rich_text), plus the property ids for `filter_properties`.
- `readLead(pageId)`: GET `/v1/pages/{id}` with `filter_properties` for Stage, Lost Reason, Attempts, Next Action, Next Action Due, Owner, Last Contact, Contacted At, Trial Booked At, Closed At, Trial Time, Last Txn and the twelve contract fields. The parser turns every contract field into a boolean at once (`present`), so Parent Phone, Sales Notes, Hourly Rate and Last Payment Date values never leave this file. Returns `LeadSnapshot` plus the written values for read-back.
- `patchLead(pageId, patch, requestId)`: one PATCH whose property keys come from a fixed map `WRITABLE` (AC3); an unknown key throws `NotionError` before fetch. Null dates send `{ date: null }`; Owner cleared sends `{ relation: [] }`.
- `findTouches(requestId)`: POST `/v1/data_sources/{touches}/query` with `{ filter: { property: "Txn ID", rich_text: { equals } }, page_size: 5 }`.
- `createTouch({ studentId, staffId, type, outcome, title, note, requestId })`: POST `/v1/pages` with exactly `Touch`, `Type`, `Outcome`, `Student`, `Staff` (omitted when null), `Note` (omitted when empty), `Txn ID`.
- `getTouch(id)`: GET for the read-back after a create whose response arrived.

Errors: 4xx except 409, 429 throws `NotionError` with status (the write did not land); timeout, network failure, 409, 429 and 5xx throw `NotionUncertain`. Each call uses `AbortSignal.timeout(TUNING.consoleProviderTimeoutMs)`.

`apps/tracker/lib/notion/config.ts`: `readConsoleWriteConfig()` returns `{ token, studentsId, touchesId }` from the same env as `consoleDataSourceIds()`.

### 3. Lead read gains `last_edited_time` (`apps/tracker/lib/notion/leads.ts`, human-merge path)

`Page` gains `last_edited_time: z.string()`; `LeadSource`, `LeadRow` (`apps/tracker/lib/console/contracts.ts`) and the wire `SalesLead` (`sales-view.ts`, `SalesViewSchema`) gain `lastEditedAt`. The form sends it back as `expected.lastEditedAt`. `console-readers-scan.test.ts` still passes: no write call is added to `leads.ts`.

### 4. Transition log store (new) `apps/tracker/lib/console/outcome-store.ts`

Over `viewer.db.tracker` (the owner's client; RLS decides, no service role): `get(requestId)`, `insert(row)`, `claim(requestId)` (RPC `claim_console_transition`), `mark(requestId, fields)` (`patch_sent_at`, `patch_verified_at`, `touch_sent_at`, `touch_page_id`), `finish(requestId, state, result, error)`. A unique violation on insert maps to `in_progress` (request id) or `unresolved_transition` (open row for the page). `outcome-store.fake.ts` for tests.

### 5. Orchestration (new) `apps/tracker/lib/console/outcome-run.ts`

`runOutcome({ body, viewer, store, writer, staffId, now })`, ports injected, never throws:

1. `writer.checkReady()`; missing → `notion_not_ready` (AC13).
2. `store.get(body.requestId)`. Found: compare page, outcome, form and `note_sha256`; differ → `request_id_reused`. `done` or `failed` → return the stored result. `running` with a live lease → `in_progress`. Otherwise `store.claim` and go to step 6 (resume).
3. `writer.readLead(pageId)`; compare Stage, Attempts and `lastEditedAt` with `body.expected` → `stale` with current values (AC6).
4. `planOutcome(...)`; refusal → `disallowed`, `contract_missing` or `bad_form`, with no row (Decision 16).
5. `store.insert` with state `running`, lease, the absolute patch, the touch plan (no note), `expected`, `note_chars`, `note_sha256`.
6. Patch step: if `patch_verified_at` is null, `readLead`; if `lastTxn === requestId` the patch landed, so mark it verified; else if `lastEditedAt` still equals `expected` mark `patch_sent_at` and `patchLead`; else finish `uncertain` "The page changed in Notion after the first try; check it before logging again".
7. Touch step: `findTouches(requestId)`. One found → keep its id. None and `touch_sent_at` null, or set more than 60 s ago → mark `touch_sent_at`, `createTouch`. None and sent under 60 s ago → finish `uncertain` with `retryAfterSeconds`. More than one → finish `uncertain` "Duplicate touches found; delete one in Notion" (never deletes).
8. Read-back (AC9): `readLead` and `getTouch`; equal → finish `done` with `{ stage, nextAction, nextActionDue, attempts, touchId, readBackAt }`; else `uncertain`.
9. `NotionError` before any write landed → `failed`; `NotionUncertain`, or `NotionError` after the patch landed → `uncertain`.

The note travels in each request body (the form keeps it until success) and is checked against the stored hash, so a resume can create the Touch without the note ever being stored.

### 6. Route and handler

- `apps/tracker/app/api/console/outcomes/route.ts`: `POST` only, `dynamic = "force-dynamic"`, calls `handleConsoleOutcome({ viewer: getViewer, deps })`.
- `apps/tracker/lib/console/handlers.ts`: `handleConsoleOutcome` runs `gateOwner` first (AC5), parses the body with `OutcomeBodySchema` (strict), resolves `staffId` with the `my_staff_id` RPC on the owner's client, then `runOutcome`. Status map: done 200, uncertain 202, stale, in_progress, request_id_reused and unresolved_transition 409, contract_missing, disallowed and bad_form 422, failed 502, notion_not_ready 503. `Cache-Control: no-store` as the other console routes.
- `apps/tracker/lib/console/outcome-schema.ts`: `{ requestId: uuid, pageId: guid, outcome: enum OUTCOMES, expected: { stage: string | null, attempts: number | null, lastEditedAt: string }, note: string max 2000 (default ""), nextAction?: enum, due?: ISO datetime }`.

### 7. UI `apps/tracker/components/console/sales/outcome-form.tsx` (new), wired in `next-lead.tsx`

Below the Rolodex fields, for the selected lead only:

```txt
LOG OUTCOME                        (radio group, only allowedOutcomes for this Stage)
( ) No answer   ( ) Contacted, call back later   ( ) Follow-up scheduled
( ) Trial booked   ( ) Not interested   ( ) Wrong number   ( ) Do not contact   ( ) Won
[Call back at: datetime-local]      (call back, follow-up)
[Next action: select]               (follow-up)
Note (optional, 2000 max) [..................................]
Trial booked needs in Notion: Parent Name, Student Name, ... (hint line, from the lead's known fields)
[Log outcome]                       Open in Notion
status line: Saving to Notion... | Logged. Next lead. | <error text> [Retry] / [Refresh] / [Fill in Notion]
```

- `requestId` is `crypto.randomUUID()` made when the founder presses Log outcome for a new payload and kept until `done`. While a submit is `uncertain` the inputs are disabled and Retry resends the identical body; "Start over" appears only after a `failed`.
- States: idle; saving (button disabled, `aria-busy`); done (status text, then `useSales().refresh()` and select the next lead, AC11); stale (Refresh re-reads the queue); refused (missing names, link to the lead page); uncertain (Retry, plus the wait when `retryAfterSeconds` is set); failed (message, Start over); not ready (the AC13 text).
- Keyboard: radio group with arrow keys, Enter in the note does not submit, the existing queue shortcuts stay inactive while focus is in a field (`inField` in `next-lead.tsx` already). Text 12 px minimum, existing console tokens, no motion; copy plain, no em dashes. Styles as `.console-outcome-*` in `apps/tracker/app/console/console.css`.
- `sales-provider.tsx` exposes `refresh()` and `select(id)`; `sales-state.ts` gains `nextAfter(state, loggedId)` (pure).

### 8. Docs, scans and fixtures

- Workspace ADR `docs/adr/0007-console-writes-notion-people.md`: the console may create Touches rows and update exactly the eleven keys in AC3, under the transition table, only after a verified owner request; everything ADR 0004 lists as never written stays never written; amends ADR 0004 (status line only, and its Readers and writers table gains `apps/tracker/lib/notion/lead-writer.ts`). Root `CLAUDE.md` links it beside ADR 0004.
- Tracker ADR `apps/tracker/docs/decisions/0076-console-call-outcomes.md` (and README row): outcome set and table, cadence, transition log and state machine, settle window, read-back rule, no note in Supabase, the decisions below.
- `apps/tracker/lib/console-scan.test.ts` (and the new `outcome-scan.test.ts`): no `tel:`, `sms:`, `mailto:` or `fetch(` to anything but `/tracker/api/console/outcomes` in `components/console/sales/`; the writer's PATCH map contains none of the billing or parent names.
- `apps/tracker/lib/notion/lead-writer.fake.ts` with request log and fault injection (timeout before or after commit, 500, 400, query lag).
- `docs/readiness.md`: the builder records the card's Production status on ship.

## Migration

- File: `supabase/migrations/0029_console_transitions.sql` (additive only: create table, index, functions, triggers, policies, grants; no drop or delete, so not a human migration).
- Creates `tracker.console_transitions`:

| Column | Definition |
| --- | --- |
| `id` | uuid pk default `gen_random_uuid()` |
| `org_id` | uuid not null references `tracker.orgs` on delete restrict |
| `request_id` | uuid not null unique |
| `notion_page_id` | uuid not null (Students & Parents page) |
| `outcome` | text not null, check in the eight outcome keys |
| `patch` | jsonb not null (the absolute Notion values; no free text) |
| `touch` | jsonb not null (type, outcome, title, staff id, `note_chars`, `note_sha256`), check `not (touch ? 'note')` |
| `expected` | jsonb not null (stage, attempts, last_edited_at) |
| `state` | text not null default `running`, check in `running`, `done`, `failed`, `uncertain` |
| `attempts` | integer not null default 1 |
| `lease_until` | timestamptz |
| `patch_sent_at`, `patch_verified_at`, `touch_sent_at` | timestamptz |
| `touch_page_id` | uuid |
| `result` | jsonb (read-back values) |
| `last_error` | text, at most 300 characters |
| `created_by` | uuid not null default `auth.uid()` |
| `created_at`, `updated_at`, `finished_at` | timestamptz |

- Partial unique index on `(org_id, notion_page_id)` where `state in ('running', 'uncertain')` (one open transition per lead); index on `(org_id, created_at)`.
- RLS enabled. Policies: select `tracker.is_org_owner(org_id)`; insert with check `tracker.is_org_owner(org_id) and created_by = auth.uid() and state = 'running'`; update using and with check `tracker.is_org_owner(org_id)`. No delete policy. `revoke all from anon, authenticated`; `grant select, insert to authenticated`; `grant update (state, lease_until, attempts, patch_sent_at, patch_verified_at, touch_sent_at, touch_page_id, result, last_error, finished_at) to authenticated`; `grant all to service_role`.
- `tracker.console_transitions_guard()` before-update trigger: refuses changes to `org_id`, `request_id`, `notion_page_id`, `outcome`, `patch`, `touch`, `expected`, `created_by`, `created_at`; allows only `running` to `running`, `done`, `failed` or `uncertain`, and `uncertain` to `running`.
- `tracker.claim_console_transition(p_request_id uuid, p_lease_seconds integer) returns setof tracker.console_transitions`, security invoker (RLS applies): sets `running`, a new lease and `attempts + 1` where the row is `uncertain`, or `running` with an expired lease. Execute granted to authenticated.
- `set_updated_at` trigger; audit trigger `after update ... when (old.state is distinct from new.state and new.state in ('done', 'failed', 'uncertain')) execute function tracker.write_audit_keyed('notion_page_id')`.
- Check: `supabase/tests/console_transitions.sql` (picked up by `run-rls.sh`) proves AC14 and the audit row on a state change, and `supabase/tests/permission_matrix.sql` gains the table.
- Ships as its own PR first (`req/REQ-61-migration`, human-merged and applied). The feature PR assumes it is live.

## Test plan

| Test | Type | Covers |
| --- | --- | --- |
| `apps/tracker/lib/console/outcomes.test.ts`: every outcome against all eleven Stages and no Stage; Do not contact and Duplicate refuse all; milestone stamped only when empty; New to Working on No answer, call back and Trial booked; Trial booked Next Action Due equals Trial Time; Lost outcomes clear the due; contract A and C missing lists one field at a time; Won refused with only Last Payment Date empty; `allowedOutcomes` per Stage; past callback time is `bad_form` | unit (vitest) T1 | AC1, AC2, AC3 |
| same file, `nextCallSlot` and cadence table including both DST weeks and the fourth No answer | unit | AC4 |
| `apps/tracker/lib/notion/lead-writer.test.ts`: PATCH body keys exactly the mapped names; unknown key throws with zero fetch; Owner clear and null date shapes; Touch create keys exactly the seven; `findTouches` filter body; `readLead` returns booleans for contract fields and never the Parent Phone or Sales Notes value (assert the returned object has no such string); error classification (400 to `NotionError`, timeout, 429, 5xx to `NotionUncertain`); `checkReady` names missing `Txn ID` and `Last Txn` | unit | AC3, AC13 |
| `apps/tracker/lib/console/outcome-run.test.ts` with the fake writer and fake store: happy path (one PATCH, one create, read-back, `done`); stale on each of Stage, Attempts, lastEditedAt with zero writes and no row; duplicate submit returns stored result; concurrent submit `in_progress`; reused id with a different note hash; timeout after PATCH commit then retry sends no second PATCH; create timeout then retry within 60 s stays `uncertain`, after 60 s with no Touch creates once, with the Touch present creates none; two Touches found stays `uncertain`; read-back mismatch never `done`; 400 on the first PATCH is `failed`; open transition blocks a new id; Attempts written as the same absolute value on every retry | unit T2 | AC6, AC7, AC8, AC9 |
| `apps/tracker/app/api/console/console-routes.test.ts` additions: the five rejection rows of ADR 0006 on `POST /api/console/outcomes` with zero writer and store calls; 400 on bad bodies; the status map | unit T1 | AC5 |
| `apps/tracker/lib/console/sales-state.test.ts` additions: `nextAfter` picks the first visible lead other than the logged one, and keeps the logged one when it is the only item | unit | AC11 |
| `apps/tracker/components/console/sales/outcome-form.test.ts` (renderToStaticMarkup, as `next-lead.test.ts`): only allowed outcomes render; conditional fields; each status text; no `tel:`, `sms:`, `mailto:` and no button labelled Send, Call or Text; inputs disabled while uncertain | unit (component) | AC11, AC12, AC13 |
| `apps/tracker/lib/console/outcome-scan.test.ts`: billing and parent names absent from the writer's PATCH map; no external `fetch(` in the form; `outcomes.ts` imports nothing from Next, React or Supabase | unit (scan) | AC3, AC12 |
| `apps/tracker/lib/console/outcome-adr.test.ts` (as `lib/lesson-adr.test.ts`): ADRs 0007 and 0076 sections, README row, ADR 0004 status line, CLAUDE.md link, no em dash; `apps/tracker/lib/permission-matrix.test.ts` row for the route and table | unit (doc) | AC15 |
| `supabase/tests/console_transitions.sql` and the `permission_matrix.sql` addition | integration (`pnpm test:rls`) T3 | AC10, AC14 |
| `e2e/tracker/mock-notion.mjs`: schemas carry `Txn ID` and `Last Txn` (a `POST /__console/not-ready` toggle drops them); PATCH, GET of console lead pages; Touches create, query by `Txn ID`, GET; `GET /__console/requests` request log; `POST /__console/commit-then-timeout` (next Touch create applied, answer delayed past the timeout). `e2e/tracker/flows.mjs` REQ-61: the owner opens Sales, selects Gail Overdue, logs No answer with a note; the queue advances to the next lead; reload shows Gail's Attempts + 1 and the Touch in history; Nova New logs Trial booked with a missing field and sees the field list, with no write in the request log; commit-then-timeout then Retry leaves one Touch; Ryan (teacher) gets 403 on the route; the browser request list holds only the app origin and the mock log only `/v1/` paths; not-ready shows the AC13 text. The builder runs `pnpm test:tracker` before the PR (`apps/tracker/app/`, `components/` and `e2e/` are `e2e_paths`) | e2e T3 | AC2, AC7, AC8, AC11, AC12, AC13 |

## Out of scope

- Trial cancelled, Trial no-show, Teacher cannot attend, Trial Claimed and Awaiting Close transitions, Onboarding to Active, reactivation (Lost to Working), Pause and Churn: they stay in Notion (card out of scope plus Decision 15).
- Automatic Lost after the 7-day cold period, any background job, bulk outreach.
- Any payment, invoice, rate, cadence, Hours Paid or Last Payment Date write; Calendly or appointments; setter and teacher cards.
- Any message, call or text from the console; any `tel:` link (Decision 5).
- Editing contract fields from the console.

## Risks and edge cases

- **Two writes, no transaction.** Notion has none. The patch goes first and is marked by `Last Txn`; the Touch second, marked by `Txn ID`. Every retry reads both markers before writing, and Attempts is stored as an absolute value, so a retry never double-counts.
- **Query lag after create.** A Notion database query can miss a page created seconds ago. The 60 s settle window stops a blind second create; the response says when to retry.
- **`last_edited_time`**** is minute-granular.** Two edits in the same minute could pass the stale check. Stage and Attempts are compared too, and the founder's write still applies only the table's allowed edge from the Stage read at write time.
- **Someone edits the page between the first try and the retry.** The resume sees `Last Txn` absent and a changed `last_edited_time`, and stops `uncertain` instead of overwriting.
- **Touches not shared with the integration, or the Txn properties missing.** `checkReady` fails closed with `notion_not_ready`; reads elsewhere in the console are unaffected.
- **Contract fields hold private text.** Parent Phone, Sales Notes, Hourly Rate and Last Payment Date are reduced to booleans inside the writer and never reach the browser, the log or the audit row.
- **Owner without a staff link.** The Touch is written without `Staff` and the status line says so; setter conversion reports read `Staff` (Decision 13).
- **Shared files.** REQ-62 also edits `next-lead.tsx`, `sales-provider.tsx` and `console.css`; this card adds one component and two provider functions.

## Decisions for approval

| # | Decision | Options | Default if you say nothing |
| --- | --- | --- | --- |
| 1 | New dependencies | None | None. `crypto.randomUUID` and `node:crypto` SHA-256 are built in. |
| 2 | Schema placement and numbers | Migration, workspace ADR and tracker ADR numbers | Migration `supabase/migrations/0029_console_transitions.sql`: schema `tracker`, table `console_transitions`, RLS owner-only select, insert and update through `tracker.is_org_owner`, no delete, column-limited update grants. Workspace ADR `docs/adr/0007-console-writes-notion-people.md`. Tracker ADR `apps/tracker/docs/decisions/0076-console-call-outcomes.md`. Checked 2026-10-23 with `gh api` and the board: `main` has migrations to 0027, workspace ADRs to 0006, tracker ADRs to 0075 (0069, 0070, 0074 absent); open `req/` PRs: #122 adds migration 0028 and tracker ADR 0069, #123 adds 0074, #125 adds 0070. Active card designs (Status not Done or Backlog): REQ-45 names 0028 and 0069 (its PR moved to 0027 and 0074), REQ-60 names 0070, REQ-62 has no design. So 0029, 0007 and 0076 are the first numbers nothing uses. If another PR reaches one first, the lower PR number keeps it and the other renumbers (REQ-51). |
| 3 | Schema: `tracker` or a new `console` schema (ADR 0006 suggests a later card makes its own) | `tracker.console_transitions`; `console.transitions` | `tracker`. The console is a tracker route (ADR 0006), `tracker.notion_outbox` is the precedent for Notion write state, and a new schema would need the Supabase exposed-schemas setting, the e2e PostgREST `db-schemas`, and a `packages/db` type change. Recorded in ADR 0076. |
| 4 | `Txn ID` and `Last Txn` do not exist in Notion (checked 2026-10-23) | Charlie adds them by hand (Touches: `Txn ID`, text; Students & Parents: `Last Txn`, text) and shares Touches with the integration with insert access; or a weaker read-back without markers | **For Charlie:** add both by hand before use. Until then the route returns `notion_not_ready` and writes nothing (AC13), so merging is safe. No fallback without markers. |
| 5 | Call and text links | No `tel:` link (tracker ADR 0071: the phone is never read into the page; "Open in Notion" is the deep link); add a `tel:` link as the card's text suggests | No `tel:`. ADR 0071 is accepted and REQ-57 shipped it. Changing it is a separate decision for Charlie. |
| 6 | Write surface | `POST /api/console/outcomes` (already origin-checked, testable like the other console routes); a server action | The JSON route. |
| 7 | "Contacted, call back later" Touch Outcome | Follow-up (the card and the OPS exceptions table); Contacted | Follow-up. |
| 8 | New leads | New moves to Working on No answer and call back; Trial booked from New passes New → Working → Trial Booked; or refuse Trial booked from New | Pass through Working. Both edges are allowed, and a first call that books a trial is common. |
| 9 | Milestone stamps | Set only when empty, never overwrite or clear; Contacted At also on call back, follow-up, Not interested, Do not contact (any outcome where someone answered); only on Trial booked | Only when empty, and on every answered outcome. Recorded in ADR 0076. |
| 10 | Next Action Due on Trial booked | Set to Trial Time; leave it | Trial Time, so the lead is not shown overdue. |
| 11 | Lost outcomes | Next Action None and due cleared; Not interested from Awaiting Close uses Lost Reason Not interested (not Closed lost) | As written. |
| 12 | Cadence end | After 4 No answers (two business days of two sessions), Next Action Text, due +7 days, and the form reminds the founder to send the final text himself; the automatic Lost after 7 days is not built | As written. `TUNING.consoleNoAnswerCadenceAttempts` changes the count. |
| 13 | Touch `Staff` | `tracker.my_staff_id(org)` on the owner's client; empty when the owner has no staff link | As written. A later setter card passes its own staff id (the adapter takes it as input, spec section 7). |
| 14 | Note storage | Notion only; Supabase keeps length and SHA-256, the form resends the note on retry; or store the note | Notion only, so there is no shadow copy (ADR 0004). Max 2000 characters. |
| 15 | Outcomes not offered | Trial cancel or no-show, teacher cannot attend, reactivation, pause, churn | Not offered (card out of scope; they stay in Notion). |
| 16 | Refusals and the log | Stale, contract and disallowed refusals make no Notion write and no transition row (they are not mutations); or log them too | No row. The response carries the reason. |
| 17 | Timings | Settle window 60 s, lease 30 s, per-call timeout `consoleProviderTimeoutMs` (8 s) | As written, in `TUNING`. |
| 18 | Stale check | Stage, Attempts and `last_edited_time` from the screen; `last_edited_time` only | All three. |
| 19 | Audit events | One per state change to `done`, `failed` or `uncertain` (a clean write gives one; uncertain then done gives two) | As written, through `write_audit_keyed`. |
| 20 | Lead read change | Add `last_edited_time` to the REQ-54 lead read and the wire view; separate read | Add it. `leads.ts` stays write-free. |
| 21 | Card size | One card (the rules, writer, log and form only work together; the migration ships first as its own PR anyway); split the form into its own card | One card. |
