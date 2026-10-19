# REQ-39: Feedback 11: Link a delivered lesson to its class occurrence, with attendance states and no payout side effects

Card: https://app.notion.com/p/3fbd6ae73dd7812db6f2eb83b0104c7c (design approved there; this is the build copy).

**Summary:** A teacher can press "Log this class" on a past class in their week view, which creates one Lessons row in Notion carrying the class reference (or finds the one that already has it), or mark the class as a no-show, which is kept only in the tracker. Charlie gets an "Unlinked lessons" list where he links rows that came in through the Notion form one at a time, and can undo a wrong link or a wrong no-show, with the old value kept in the audit log.

**Risk:** High. This is the tracker's first write path into Lessons, a payout-adjacent Notion database that the tracker has never written to, and owner corrections delete outcome rows. The PR also touches `apps/tracker/lib/notion/`, so it carries `needs-human-merge` whatever the risk.

## Build notes (what the build pinned that the design left open)
- **Migration number:** `0023_occurrence_outcomes.sql`. 0021 is on main (`0021_setup_checks.sql`) and 0022 is on `req/REQ-38-migration` (`0022_people_sync.sql`). Migration PR: #96.
- **ADR number:** 0054. 0052 and 0053 were taken by REQ-32 and REQ-33.
- **Week response:** besides `linkable` and `outcome` per occurrence, the head carries `lessonsEnabled` (both the lessons port and the outcome store are wired) and `outcomesLoaded`. The page turns these into `lessonMode` (`off`, `unloaded`, `teacher`, `owner`) on each card. With `off` the dialog shows nothing about lessons; with `unloaded` it says "Could not load lesson status."
- **`has_outcome` in the browser:** the API client keeps a 409 `has_outcome` as a named, non-stale failure, so the booking UI shows "This class is already logged or marked. Ask Charlie to clear it first." instead of "Someone else changed this."
- **Lesson routes and request IDs:** the lesson routes take no client `requestId` (decision 12: the occurrence is the key), so the client calls them through a new `api.act` that sends the body as is and returns the error code by name.
- **Clear on a pending row:** a delivered row with no lesson ID is deleted without a Notion call. If its create had committed, the next Log this class finds it first.
- **Link checks order:** the outcome row, then the find query (`ref_in_use`), then the lesson read (`lesson_linked_elsewhere`, `lesson_mismatch`), then the claim. A failed check writes nothing.
- **Matrix:** `supabase/tests/permission_matrix.sql` and `apps/tracker/docs/permission-matrix.md` gain `occurrence_outcomes` (they fail when a table is unclassified), shipped with the migration.
- **Source scans:** the REQ-6/REQ-7 week and booking scans banned the word "lessons" in UI files. They now ban lesson writes (`createLesson`, `linkLesson`, calls to `/lessons` or `/outcomes`) instead, and a new scan limits the three lesson UI files to `api.act` on the four lesson routes.

## Problem
For teachers and Charlie (org owner). Planned classes (`tracker.class_series` plus `class_exceptions`, ADR 0034) and delivered lessons (Notion Lessons, data source `6300f58a-8b8c-4789-88c1-e44272079b0f`) are never connected. ADR 0040 left `LessonLinkPort` in `apps/tracker/lib/domain/schedule/lesson-link.ts` as a type with no implementation, and a test (`lesson-link.test.ts` AC4) that keeps it unimported. So nothing can say which scheduled class was taught, missed or made up. The card picks option (a) plus the reconciliation list from (b). It also adds `delivered` and `no_show` occurrence states, records them without any money logic, and keeps parents on Feedback 4's "Past".

What the code has today:
- Lessons properties (read from the live schema): `Lesson` (title), `Date` (date), `Teacher` (relation to Staff, `eaf8e9be…`), `Related to Students & Parents (Lessons 1)` (relation to Students & Parents, `fe3d651a…`), `Duration (hrs)` (number), `Paid to Teacher` (checkbox), `Pay Period` (select), `Type` (select, Lesson or Trial), `Subject` (select), and teacher notes fields. There is no class reference property yet.
- `class_series.notion_staff_id` and `notion_student_id` are the same Notion page IDs those two relations hold (0010). So a Lessons row and an occurrence can be matched exactly by IDs and date, never by name.
- Edits refuse only `originalDate < today` (`checkOccurrenceEditable` in `lib/domain/schedule/edits.ts`). Today's occurrence can still be moved, cancelled or split, but `isLinkable` allows today. This design closes that gap with a database freeze (AC9).

## Acceptance criteria
- [ ] AC1: A new tracker ADR (the next free number, 0052 today) records option (a) plus the reconciliation list, names the Notion property `Class occurrence` (Text), and says it supersedes ADR 0040. ADR 0040's status line reads "superseded by \<n\>", and `docs/decisions/README.md` lists both.
- [ ] AC2: `apps/tracker/docs/scheduler-operations.md` has a "Lesson logging" section. It tells Charlie to add a Text property named exactly `Class occurrence` to Lessons, to share the integration with Lessons with read, insert and update access, and never to edit that property by hand. It says the "Log a Lesson" form keeps working. Until the property exists, Log this class answers 503 `lessons_not_ready` before any Notion write, and the UI says "Lesson logging is not set up yet."
- [ ] AC3: Log this class on a linkable occurrence that has no Lessons row with its reference makes exactly one Notion find query (`Class occurrence` equals the ref), then one `POST /v1/pages` with parent Lessons and exactly these six properties: `Lesson` ("Logged from schedule"), `Date` (the occurrence's actual date, so the new date for a moved class), `Teacher` (`[staffId]`), `Related to Students & Parents (Lessons 1)` (`[studentId]`), `Duration (hrs)` (minutes / 60, rounded to 2 decimals, so 50 min gives 0.83), and `Class occurrence` (`sched:<seriesId>:<originalDate>`). It then stores a `delivered` outcome with the new page ID and answers 201 `{ outcome: { state: "delivered", lessonId, lessonDate, lessonUrl }, created: true }`.
- [ ] AC4: If the find query returns one row, nothing is created. The outcome is stored with that row's ID, and the answer is 200 with `created: false`. Two or more rows answer 409 `duplicate_link` and store nothing.
- [ ] AC5: Log this class and Mark no-show refuse an occurrence that is cancelled, dated after today (Toronto), or not a date of the series. The answer is 422 `not_linkable`, and no Notion request is made.
- [ ] AC6: Retry and races. A request for an occurrence that is already `delivered` with a lesson ID answers 200 with the stored outcome and makes no Notion request. Two parallel requests for one occurrence cause at most one Notion create. The loser answers 409 `log_in_progress`, or 200 if the winner had already finished. If Notion fails or times out on the create, the answer is 502 `notion_failed`, and the outcome stays pending (no lesson ID). The next request, once the 60 s claim has lapsed, runs the find query first. So a create that Notion committed is found, not repeated.
- [ ] AC7: Mark no-show stores a `no_show` outcome for a linkable occurrence of the caller's own series (or any series, for the owner). It makes no Notion request. It answers 409 `already_recorded` if the occurrence already has any outcome. A teacher cannot change or remove a no-show.
- [ ] AC8: When the owner sends `DELETE /api/scheduler/outcomes` with a `seriesId` and `originalDate` that have an outcome, the outcome row is deleted and an audit row keeps the old value, as follows:
  - On a `no_show`, the row is deleted.
  - On a `delivered`, the handler first reads the lesson. It clears its `Class occurrence` (a PATCH with only that property, `rich_text: []`) only when the value equals this ref, then deletes the row. A lesson that is gone (404) or now carries another value is left as it is, and only the row is deleted.
  - In both cases `tracker.audit_log` gets a DELETE row with `actor_id` = the owner and `before` holding the old outcome.
  - A teacher gets 403, and nothing is read or written.
- [ ] AC9: An occurrence with an outcome is frozen. The database refuses, with `has_outcome`, any cancel, move or exception change for that `(series_id, original_date)`. It also refuses any series update that changes its teacher, student, start date, start time or duration, or that ends it (`effective_until`) before an outcome's date. That covers `split_class_series` and `schedule_write`. The class handlers answer 409 `has_outcome`, and the UI says "This class is already logged or marked. Ask Charlie to clear it first."
- [ ] AC10: Splitting a series from a date after a linked occurrence keeps that outcome row unchanged, and the ref still parses to the old series. A moved occurrence links under its original date's ref, and its Lessons `Date` is the new date. A makeup, trial or extra one-off (Feedback 4 purpose) is logged and marked like any other class.
- [ ] AC11: Week view (teacher and owner). Each occurrence in the week response carries `linkable` and `outcome` (`null`, `{ state: "logging" }`, `{ state: "delivered", lessonDate, lessonUrl }` or `{ state: "no_show" }`). For a past linkable occurrence the class dialog shows one of these:
  - no outcome: Log this class and Mark no-show
  - delivered: "Logged (Thu Oct 15)" with Open lesson in Notion
  - no-show: "No-show"
  - logging: "Saving to Notion…", or after 60 s, "Not saved to Notion yet." with Try again

  The card face shows "✓ Logged" or "No-show". The owner's dialog also has the Clear button from the AC8 corrections. Future and cancelled occurrences show none of this. Parent calendar output is unchanged, and no parent file reads outcomes.
- [ ] AC12: `/tracker/schedule/lessons` ("Unlinked lessons") is owner-only. For a date range (default the 14 days ending today, at most 31) it has two sections:
  - **Unlinked classes:** every linkable occurrence with no outcome. Under each, its candidates: Lessons rows with an empty `Class occurrence` and the same teacher ID, student ID and date. Each candidate has a Link button, and a class with none says "No matching lesson in Notion."
  - **Possible double logs:** rows with an empty `Class occurrence` that match an occurrence already `delivered`, read-only, with Open in Notion.

  Loading the page writes nothing. Link calls `POST /api/scheduler/lessons/link`. That runs the find query first: another row already carrying the ref answers 409 `ref_in_use`. It then re-reads the row: a non-empty `Class occurrence` answers 409 `lesson_linked_elsewhere`, and a teacher, student or date that differs from the occurrence answers 422 `lesson_mismatch`. Otherwise it patches `Class occurrence` alone and stores a `delivered` outcome with `link_source = 'reconciled'`. Nothing is ever linked without that click. A teacher gets 403 from the page and both routes.
- [ ] AC13: Payout guardrail. Every Notion request from the new paths, driven through the real `lib/notion/lessons.ts` behind a recording fetch, is one of these:
  - a `GET` of the Lessons schema or of one Lessons page, with `filter_properties` limited to `Date`, `Teacher`, the student relation and `Class occurrence`
  - a `POST` query of the Lessons data source with the same `filter_properties`
  - a `POST /v1/pages` with exactly the six AC3 keys
  - a `PATCH /v1/pages/<id>` with exactly `["Class occurrence"]`

  No body at any depth contains `Paid to Teacher`, `Pay Period`, `Type`, `archived` or `in_trash`. No PATCH body contains `Duration (hrs)` or `Teacher`. Every create comes after a find query for the same ref in the same request.
- [ ] AC14: Booking create, move and cancel never call the lessons port, never name the Lessons data source, and never create a Lessons row. The existing `payout-guardrails.test.ts` checks pass unchanged, and a recording lessons fake records zero calls.
- [ ] AC15: For each role signed in to the tracker, the database allows or refuses reads and writes on `tracker.occurrence_outcomes` exactly as below, proved by `supabase/tests/occurrence_outcomes.sql`:
  - A teacher reads, and inserts into, only rows for occurrences of their own series. They can only insert a pending `delivered` row (`link_source = 'logged'`) or a `no_show` row, in both cases with no lesson ID.
  - A teacher updates only `notion_lesson_id`, `lesson_date` and `claimed_at` on their own pending `delivered` row.
  - The owner reads, updates those columns on, and deletes any row in their org.
  - Parents, students, another org's owner and `anon` read and write nothing.
  - An insert for a cancelled, future or non-pattern occurrence is refused by the database.

## Approach
### Domain (pure, `apps/tracker/lib/domain/schedule/lesson-link.ts`)
Keep `occurrenceRef`, `parseOccurrenceRef` and `isLinkable` unchanged (ADR 0040's rule matches the database helper). Add these:
- `LessonLinkPort` gains the methods the contract needs. All are implemented by `lib/notion/lessons.ts`: `findLessonFor(ref)` returns `{ lessonId } | null` and throws `duplicate_link` on two or more matches; `linkLesson(lessonId, ref)`; `unlinkLesson(lessonId, ref)` clears only when the current value equals ref; `getLesson(lessonId)`; `createLesson({ ref, date, staffId, studentId, durationMinutes })`; `listUnlinkedLessons(range)`.
- `lessonHours(minutes)`: rounds to 2 decimals.
- `planLog(local, now)`: given the stored outcome row (none, pending with a fresh claim, pending with a stale claim, delivered, no_show), returns `claim`, `resume`, `replay`, `busy` or `conflict`. The handler follows it, so the retry rules are unit-tested without I/O.
- `reconcile(occurrences, outcomes, lessons)`: returns `{ unlinked: [{ occurrence, candidates }], doubles: [...] }`. Matching is exact on `staffId`, `studentId` and date, and IDs are compared after `normalId` (dash-insensitive, from `lib/domain/billing.ts`). It never chooses a candidate.

### Notion adapter (new `apps/tracker/lib/notion/lessons.ts`)
Plain fetch and Zod, in the same style as `students.ts` and `billing.ts`: `server-only`, `NOTION_VERSION`, `notionApiBaseOverride()`, `NotionError`.
- Property IDs come from one schema GET per call. If `Class occurrence` is missing, it throws `NotionError("lessons_not_ready")` before any write.
- Every read sends `filter_properties` for `Date`, `Teacher`, `Related to Students & Parents (Lessons 1)` and `Class occurrence` only, and the parse drops everything else.
- The find query uses `{ property: "Class occurrence", rich_text: { equals: ref } }` with `page_size: 2`.
- `listUnlinkedLessons` uses `Date` on or after / on or before plus `Class occurrence` `is_empty`. It is capped at 10 pages of 100.
- The only two write shapes are those in AC3 and AC13.

`apps/tracker/lib/notion/config.ts` gains `DEFAULT_LESSONS_DATA_SOURCE_ID = "6300f58a-8b8c-4789-88c1-e44272079b0f"` and `readLessonsConfig()` (env `NOTION_LESSONS_DATA_SOURCE_ID`).

### Storage
- New `apps/tracker/lib/scheduler/outcome-store.ts` (port) and `apps/tracker/lib/data/outcomes.ts`: a Supabase implementation on the signed-in user's client (RLS decides), with every row parsed with Zod. Methods: `listForOccurrences(refs)`, `get(seriesId, originalDate)`, `claim(...)` (an insert; a unique violation becomes `exists`), `takeOver(id, seenClaimedAt)` (compare-and-set; zero rows means `busy`), `complete(id, lessonId, lessonDate)`, `insertNoShow(...)`, `remove(id)`.
- `apps/tracker/lib/data/schedule.ts`: maps the new `has_outcome` exception to `{ status: 409, error: "has_outcome" }`, next to `past_occurrence`.

### Handlers and routes
New `apps/tracker/lib/scheduler/lesson-handlers.ts`, in the same pattern as `daily-task-handlers.ts`. The guard runs first (`requireScheduler`, then `assertStaffAccess` on the series' `staffId`), so a forbidden caller causes no database or Notion read. The file never names the Lessons data source ID or the word "payout" (the `import-routes.test.ts` scan).
- `POST /api/scheduler/lessons`, body `{ seriesId, originalDate }`, teacher or admin, `handleLogClass`: load the series (404 if not visible); expand the one occurrence and check `isLinkable` plus `isPatternDate` (422); follow `planLog` (claim or take over); run `findLessonFor`, then `createLesson` only on null; complete the row. A Notion error leaves the claim pending and answers 502. `lessons_not_ready` answers 503.
- `POST /api/scheduler/outcomes`, `{ seriesId, originalDate, outcome: "no_show" }`, `handleNoShow`.
- `DELETE /api/scheduler/outcomes`, admin only, `handleClearOutcome`. Follows AC8.
- `GET /api/scheduler/lessons/unlinked?from&to`, admin only, `handleUnlinked`.
- `POST /api/scheduler/lessons/link`, `{ seriesId, originalDate, lessonId }`, admin only, `handleLinkLesson`. Follows AC12. It uses the same claim, so a double click links once.

All of these routes sit under `/api/scheduler/`, so the existing origin check in `apps/tracker/proxy.ts` (ADR 0042) covers them. `ScheduleDeps` gains optional `lessons?: LessonLinkPort` and `outcomes?: OutcomeStore`, wired in `lib/scheduler/deps.ts` only when `readLessonsConfig()` is set. Without them the routes answer 503 `lessons_not_ready`.

### Week response
`loadWeek` reads outcomes for the week's occurrences, in parallel with names, only when `deps.outcomes` is set. It then adds `linkable` (`isLinkable(o, today)`) and `outcome` to each occurrence. `lessonUrl` is `https://www.notion.so/<id without dashes>`. A claim older than 60 s is shown as `logging` with `stale: true`. If the outcome read fails, the week still loads with `outcome: null` and `outcomesLoaded: false`, and the dialog then hides the buttons and says "Could not load lesson status."

### UI
- `components/scheduler/class-card.tsx`: `CardData` gains `linkable` and `outcome`. The card face shows the badge from `outcomeBadge(card)`. The dialog renders `components/scheduler/outcome-actions.tsx` when `card.linkable`.
- `components/scheduler/outcome-actions.tsx`: a client component that calls the routes through `lib/scheduler/api-client.ts` and then `router.refresh()`. Mark no-show and Clear each ask for confirmation in a native `confirm`.
- `lib/view/lesson-text.ts` holds all the copy (no em-dashes): "Log this class", "Logged (Thu Oct 15)", "Open lesson in Notion", "Add your notes in Notion. Do not also send the Log a Lesson form for this class.", "Mark no-show", "Mark this class as a no-show? Only Charlie can undo it.", "No-show", "Saving to Notion…", "Not saved to Notion yet.", "Try again", "Clear", "Clear this no-show?", "Unlink this lesson? The Notion row stays. Only its class link is cleared.", and one line for each error code.
- `app/schedule/lessons/page.tsx` is a server page like `app/schedule/conflicts/page.tsx`, with Earlier and Later 14-day links; teachers are sent to `/schedule`. `app/schedule/page.tsx` shows an "Unlinked lessons" link for admins. States: error "Could not load lessons from Notion. Try again."; empty "Every class in these dates is logged or marked."; each Link button shows "Linking…", then the row leaves the list or shows the error line.

### Tests and docs changed on purpose
- `lesson-link.test.ts` AC4 ("imported by no non-test file") is replaced: only the lesson handlers, the Notion adapter and the week files import it, and it still imports nothing from React, Next, Supabase or Notion.
- `import-routes.test.ts`: `lib/notion/lessons.ts` joins the "who calls Notion" and "who writes" lists; a new assertion checks it contains no `DELETE`, `PUT`, `archived` or `in_trash`, and uses only GET, POST and PATCH.
- Also: `apps/tracker/docs/PLAN.md`, ADR 0040's status line, this file, and the operator guide (AC2).

## Migration
`supabase/migrations/0023_occurrence_outcomes.sql` (see Build notes for the number). Creates `tracker.occurrence_outcomes` (id, org_id, series_id, original_date, outcome, link_source, notion_lesson_id, lesson_date, claimed_at, created_by, created_at, updated_at), `unique (series_id, original_date)`, a partial unique index on `(org_id, notion_lesson_id)`, an index on `(org_id, series_id)`, the no_show/delivered column check, `set_updated_at` and `write_audit` triggers; `tracker.occurrence_is_linkable(p_series, p_original)` (security invoker); `tracker.freeze_outcome_occurrences()` (security definer trigger raising `has_outcome` on `class_exceptions` insert, update, delete and on `class_series` update); RLS (select: owner or the series' teacher; insert: owner, or that teacher for a pending logged row or a no-show with no lesson ID, always linkable; update: owner, or that teacher completing their own pending row; delete: owner) and column grants. Checked by `supabase/tests/occurrence_outcomes.sql`. Ships first in its own PR (`req/REQ-39-migration`).

## Test plan
| Test | Type | Covers |
|---|---|---|
| `supabase/tests/occurrence_outcomes.sql` | integration (RLS) | AC5 (database side), AC8 (audit row), AC9, AC10 (split keeps the row), AC15 |
| `lib/lesson-adr.test.ts`: the ADR exists, supersedes 0040 and names `Class occurrence`; 0040's status reads "superseded by"; the README lists both; the operator guide has the Lesson logging section | unit (doc scan) | AC1, AC2 |
| `lib/domain/schedule/lesson-link.test.ts`: `lessonHours`, `planLog` for every state, `reconcile` exact matching, two candidates and none chosen, doubles | unit | AC4, AC6, AC10, AC12 |
| `lib/notion/lessons.test.ts` with a recording fetch: find query shape, create's six keys, link and unlink, `lessons_not_ready`, Paid to Teacher dropped | unit | AC2, AC3, AC4, AC8, AC13 |
| `app/api/scheduler/lesson-routes.test.ts` with `booking-world.fake.ts`, a fake port and an in-memory store | unit (route) | AC2 to AC8, AC12 |
| `app/api/scheduler/payout-guardrails.test.ts` new `describe("REQ-39: lesson write path")` through the real `lessons.ts` | unit (guardrail) | AC13, AC14 |
| `booking-routes.test.ts` and `lib/data/schedule.test.ts`: 409 `has_outcome` | unit (route) | AC9 |
| `week-routes.test.ts`: linkable and outcome per occurrence, moved under original date, stale claim, failed read | unit (route) | AC10, AC11 |
| `lib/view/lesson-text.test.ts`: exact lines per state, `outcomeBadge`, one line per error code, no U+2014 | unit | AC11 |
| `import-routes.test.ts` scan updates; `PARENT_FORBIDDEN` gains `/occurrence_outcomes/` | unit (scan) | AC11, AC13 |
| `e2e/tracker/flows.mjs` lesson section with the mock Lessons database | e2e | AC3, AC6, AC7, AC9, AC11, AC12, AC13 |

## Out of scope
Teacher payouts. Invoices or credits (Feedback 12): a no-show is a state, not a forfeit. Showing delivered or no-show to parents. Replacing the Notion "Log a Lesson" form. Writing `Subject` or `Type` on the created row. Any automatic matching, or any backfill. Unlinked Lessons rows that match no class. A UI for the audit log.

## Decisions for approval (as approved)
1. No new dependencies. 2. Schema as described. 3. Option (a) plus (b). 4. The ref in Notion is the link, plus a local `delivered` row as claim and cache. 5. A database trigger freezes occurrences with an outcome. 6. `Subject` not written. 7. `Type` not written. 8. Title "Logged from schedule"; Duration = minutes / 60 to 2 decimals. 9. The series' teacher and the owner may log and mark. 10. Today's class is linkable from the start of the day. 11. Corrections are owner deletes, audited. 12. The occurrence is the idempotency key. 13. "Possible double logs" included. 14. One card. 15. Next free ADR number; `needs-human-merge`.
