# REQ-4: Scheduler 3/8: Import Weekly Schedule and keep it as a generated summary

Approved design, copied from the Notion card:
https://app.notion.com/p/3f9d6ae73dd78136b135d65897d240e2

**Summary:** Adds an admin-only import that turns clean Weekly Schedule lines into class series one student at a time (all or nothing per student), lists every rejected line with a reason, and from then on writes Weekly Schedule back from the scheduler in a format the monthly admin script still parses. Moved and cancelled classes show on a monthly review list for Charlie.
**Risk:** High (new migration with a table, RLS and a transactional function; the Notion integration gains read and write access to Students & Parents; it writes to a field the billing run reads).

Key facts behind the design: monthly admin's `parse_slot` reads the part before the first `|`, uses the next field as the course, ignores later fields, and raises on any non-empty line it cannot match, so the generated summary holds slot lines only. `from`/`until` dates go in fields after the course. Live data (2026-10-14): 7 students, 12 lines, none names a teacher, so the first live import adopts nobody.

## Acceptance criteria
- AC1: `parseScheduleLine("Tue 17:30-18:30 | MPM2D Math | Jane Doe")` returns `{ ok: true, weekday: 2, startTime: "17:30", durationMinutes: 60, subject: "MPM2D Math", teacherName: "Jane Doe" }`.
- AC2: Legacy forms parse to the same result as the canonical line: `\|` and `\:` escapes; `<br>` and CRLF as line breaks; en dash, em dash or ` to ` between times; lowercase or full day names and `Tues`, `Thur`, `Thurs`; single-digit hours; extra spaces; an explicit `am`/`pm` suffix. Blank lines are ignored.
- AC3: Each rejected line returns exactly one reason code: `unparseable_day`, `unparseable_time`, `no_fixed_time`, `invalid_duration`, `missing_course`, `missing_teacher`, `teacher_not_found`, `teacher_ambiguous`, `teacher_inactive`, `extra_fields`, `duplicate_line`.
- AC4: A teacher is resolved only by exact full-name match against Staff, ignoring case and repeated spaces, to exactly one active teaching staff member. No match gives `teacher_not_found` (same-first-name hint only, never applied). Student `Owner` and `Trial Teacher` are never read; a source-scan test checks this.
- AC5: All or nothing per student. A student with any rejected line gets no series, no adoption row and no Notion write. All their lines appear on the repair list.
- AC6: Only students with Stage `Active` or `Onboarding` and a non-empty Weekly Schedule are considered. Already-adopted students are skipped and reported as `adopted`.
- AC7: Running the import twice, or retrying after a timeout, leaves the same series and adoption rows. Each line's `request_id` comes from the org, the student page ID and the normalised line. `tracker.adopt_student_schedule()` runs in one transaction.
- AC8: Each clean line becomes one `weekly` series starting on the first date on that weekday on or after today (America/Toronto), `effective_until` null, with the matched staff ID and the student's Notion page ID.
- AC9: `POST /api/scheduler/import` with `{ "dryRun": true }` returns the same plan as a real run and writes nothing (no Postgres inserts, no Notion PATCH).
- AC10: `renderSummary` writes one line per weekly series, `Tue 17:30-18:30 | MPM2D Math | Jane Doe`, sorted Monday to Sunday, then start time, then subject. It leaves out one-offs and series that ended before today. A series that starts after today gets `| from YYYY-MM-DD`; one with an end date on or after today gets `| until YYYY-MM-DD`. `|` and line breaks are stripped.
- AC11: Every rendered line passes `monthlyAdminParseSlot` (a TypeScript test copy of the skill's `parse_slot`) and yields the same day, start, end, hours and course as the source line.
- AC12: Round trip: for a clean student, `parse_slot` over the rendered summary gives the same set of slots as over the legacy text.
- AC13: For an adopted student the summary is regenerated after adoption, after creating a series and after a "This class and future" split (both students if the student changes). Notion is written only when the text differs. A single-occurrence move or cancel makes no Notion request.
- AC14: If the Notion write fails, the class write still succeeds (2xx) with `summarySync: "failed"`. The summary row records state `failed` and the error. `POST /api/scheduler/summaries/sync` retries and writes once.
- AC15: If the Notion text no longer matches the last text the scheduler wrote, the sync overwrites it. The replaced text is kept in `last_drift_text` and shown on the admin page.
- AC16: `POST /api/scheduler/classes` for a student who is not adopted checks the legacy text first. Empty: adopt and sync. Not empty: `409 { "error": "legacy_schedule_pending" }`, nothing written.
- AC17: `GET /api/scheduler/monthly-review?month=YYYY-MM` returns per adopted student: cancelled and moved occurrences, one-offs, `from`/`until` dates in the month, and any sync state that is not synced or a stored summary that differs from a fresh render, with a `needsReview` flag.
- AC18: The only Notion write is a PATCH to `/v1/pages/{studentPageId}` whose `properties` keys are exactly `["Weekly Schedule"]`. Source scans check nothing else is written and nothing touches Lessons or Payouts.
- AC19: All new endpoints are admin-only: teacher 403, signed out 401, Notion not configured 503. In Postgres a teacher JWT selects 0 rows of `tracker.schedule_summaries`, cannot insert or update, and gets `42501` from `adopt_student_schedule`.
- AC20: The Students read asks Notion only for `Student Name`, `Stage` and `Weekly Schedule` (`filter_properties`) and the parse step drops anything else. Student names are never written to Postgres.
- AC21: Existing behaviour is unchanged. `pnpm --filter tracker test`, `pnpm test:rls` and `pnpm test:tracker` pass. The only edited assertion is the 2/8 source-scan allow-list, which now also allows `lib/notion/students.ts`.

## Approach (outline)
- Migration `supabase/migrations/0011_scheduler_import.sql`: `tracker.schedule_summaries` (owner-only RLS, no delete) and `tracker.adopt_student_schedule(p_student_id, p_source_text, p_series jsonb)` (security invoker, one transaction, returns the existing row on repeat).
- Pure domain under `apps/tracker/lib/domain/schedule/`: `legacy-line.ts`, `import-plan.ts`, `summary.ts`.
- Notion: `lib/notion/students.ts` (read three properties, write one), config for the Students data source.
- `lib/scheduler/summary-sync.ts`, `import-handlers.ts`, new routes `import`, `summaries/sync`, `monthly-review`; `handleCreateClass` and the "future" split call the sync.
- Admin page `app/scheduler/schedules/page.tsx` with `components/scheduler/schedule-import.tsx`.
- ADR 0035, decisions index, PLAN progress line.

## Test plan
Vitest: `legacy-line.test.ts`, `import-plan.test.ts`, `summary.test.ts`, `monthly-admin-compat.test.ts`, `lib/notion/students.test.ts`, `lib/scheduler/summary-sync.test.ts`, `app/api/scheduler/import-routes.test.ts`. RLS: `supabase/tests/scheduler_import.sql`. Source scans in `import-routes.test.ts` and the updated 2/8 scan.

## Open questions (as put to Charlie on the card)
1. No live line names a teacher, so the first import adopts nobody and lists all 12 lines for repair. Proposed: Charlie adds `| Teacher Name` to each line in Notion and runs Check again.
2. The monthly admin skill lives outside this repo; a 5-line change would honour `from`/`until`. Until then Charlie relies on the monthly review list.
3. The operator grants the integration read and update on Students & Parents and changes the Weekly Schedule description.
4. All or nothing per student (protects billing) rather than partial adoption.
5. One card, not two: adopting without write-back would create two sources of truth.
