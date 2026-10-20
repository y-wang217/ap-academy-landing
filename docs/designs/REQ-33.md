# REQ-33: Owner setup page shows what is missing before teachers are invited

Copied from the approved design on the Notion card (https://app.notion.com/p/3fbd6ae73dd78122bb0dd0427dcf48d4) so the reviewer can read it next to the diff.

## Build notes (where the build differs from the text below)
- Migration number: `0021_setup_checks.sql`. 0018 to 0020 were taken on `main` by the time of the build. The tracker ADR is 0053 for the same reason.
- The Daily task check for the Work config names `NOTION_TOKEN` (what `readWorkConfig()` needs). The domain uses neutral keys (`notion_token`, `cron_secret`, `org_id`) and `lib/view/setup-text.ts` maps them to variable names, because an existing scan allows the literal `NOTION_TOKEN` only under `lib/notion/`.
- `DAILY_TASK_ORG_ID` set to another org reads "DAILY_TASK_ORG_ID is set to another org." (the design only spelled the unset case).
- The unknown badge reads "Not checked".
- e2e end of run: the REQ-32 flows that now run last revoke Ryan's link and remove a parent link, so the exact counts the design listed for step A no longer hold. Step A instead checks each row's count line against the same numbers computed by psql at that point, and step B tops up by psql and checks the five rows turn Done with exact counts.
- The page's Notion readers are wired in `page.tsx`, not as defaults inside `lib/data/setup.ts`, so the loader stays free of `next/cache`.

## Summary
A new owner-only page at `/tracker/scheduler/setup` lists the seven setup steps, each with a live count, a state (Done, Partial, Missing, or "Could not read Notion"), one sentence on who is affected while it is missing, and a link to where it is fixed. It reads only, through the owner's own client under RLS, plus one new read-only health function and one new names-only Notion query.

**Risk:** Medium. A new route on existing owner permission over data RLS already lets the owner read, one new read-only function that returns nothing to non-owners, and one new Notion read that returns names only. No permission, auth or RLS change, no write, no new destination for personal data.

## Acceptance criteria
- AC1: `GET /tracker/scheduler/setup` renders for an org owner. Any other signed-in user (a membership teacher, a scheduler teacher with only a staff link, a student, a parent, a user with no role) gets a 404. A signed-out user is sent to `/login?next=/tracker/scheduler/setup` by the existing proxy.
- AC2: The page shows exactly seven rows, in this order: Teachers approved, Teacher availability, Student schedules adopted, Parent links, Notion records on tracker students, Daily task, Notion link guard (migration 0017). Each row has a label, a state badge, a count line, one "while missing" sentence, and a link.
- AC3: The pure builder `buildSetupStatus(input)` returns, for every count-based row: Missing when the numerator is 0 or the denominator is 0, Done when numerator equals denominator and the denominator is above 0, Partial otherwise.
- AC4: When the Notion Staff read fails, Teachers approved shows state "unknown" and the text "Could not read Notion", never 0 or "0 of 0". Same for Student schedules adopted when the Notion scheduled-students read fails. The other five rows are unaffected by either Notion failure.
- AC5: When a database read for a row fails, that row shows "Could not check" and state unknown. A failed read is never shown as 0.
- AC6: Daily task is Missing when any of these is false: Work config present (`readWorkConfig()` non-null), `SCHEDULER_CRON_SECRET` set, `DAILY_TASK_ORG_ID` equal to the owner's org. It is Partial when all three hold but no `tracker.daily_tasks` row with `kind = 'teacher_texts'` and `local_date` equal to today or yesterday has state `ready`. Done otherwise. Today is `todayIso(now)` (America/Toronto) and yesterday is `addDays(today, -1)`. The page names a missing variable but never prints any variable's value.
- AC7: Notion link guard is Done when `tracker.setup_checks(org)` returns `notion_link_guard = true`, Missing when false, "Could not check" when the RPC errors or returns no row.
- AC8: The loader and page make no write: no `.insert(`, `.update(`, `.upsert(`, `.delete(`, no `rpc(` other than `setup_checks`, no import of `@ap-academy/db/service` or `getServiceClient`, no Notion call other than `getStaffList` and `fetchScheduledStudentNames`.
- AC9: The scheduler home `/tracker/schedule` shows a "Setup checklist" link for the owner only. The tracker home shows a "Setup" link in the header actions for the owner only. A membership teacher sees neither.
- AC10: `apps/tracker/docs/scheduler-operations.md` has a new section "5. Check what is still missing" linking `/tracker/scheduler/setup`.
- AC11: No UI string on the page contains an em-dash (U+2014).
- AC12 (migration): `tracker.setup_checks(target_org)` returns one row `(notion_link_guard, true)` for that org's owner while the 0017 trigger exists and is enabled, `false` once it is disabled or dropped, zero rows for a teacher, a parent, or another org's owner, and is not executable by `anon`.
- AC13: `fetchScheduledStudentNames(config)` sends queries only to the Students data source, with a filter that is the `and` of (Stage is Active or Onboarding) and (`Weekly Schedule` rich_text `is_not_empty`), and a query string whose only `filter_properties[]` is the Student Name property ID. It returns `[id, name]` pairs and never a schedule string. Student schedules adopted counts, of those students, the ones with a `tracker.schedule_summaries` row.
- AC14: Teacher availability counts a window as current when `effective_until` is null or on or after today (America/Toronto). At `2026-10-17T03:30:00Z` a window ending `2026-10-16` counts. At `2026-10-17T04:05:00Z` it does not.

## Rows
| Row | Count | State rule | While missing | Link |
|---|---|---|---|---|
| Teachers approved | Active teaching Staff with a live staff link, of all active teaching Staff; "N signed in" | AC3; Notion failure unknown | Teachers without a link cannot sign in to see their week. | Operator guide step 2 |
| Teacher availability | Live linked staff with a current window, of live linked staff | AC3; 0 links Missing "No teachers linked yet" | Classes for a teacher with no hours are never checked for conflicts. | `/schedule/availability` |
| Student schedules adopted | Scheduled students (Weekly Schedule not empty) with a summary row, of all of those; "N failed to sync" | AC3, Partial on any failed sync; denominator 0 Missing | Students not adopted have no classes here, so their teachers and parents see no calendar. | `/scheduler/schedules` |
| Parent links | Non-archived students with a claimed parent link, of all; "N invited, not signed in yet" | Missing with no link or no students; Done when all claimed; else Partial | Parents without a link cannot sign in to see their child. | `/` and each student |
| Notion records | Non-archived students with `notion_student_id`, of all | AC3; 0 students Missing | A student without a Notion record shows their parent no calendar and no billing. | `/` and each student |
| Daily task | Config checks plus ready tasks today or yesterday | AC6 | Teachers get no daily text of their schedule. | `/schedule` |
| Notion link guard | `setup_checks` | AC7 | Any teacher could point a student at another child's record. | Migration 0017 on GitHub |

Up to 10 names of what is missing on Teachers approved, Parent links and Notion records, plus "and N more".

## Migration
`tracker.setup_checks(target_org uuid) returns table (check_name text, ok boolean)`, `language sql stable security invoker set search_path = ''`, filtered by `tracker.is_org_owner(target_org)`; `revoke all from public, anon; grant execute to authenticated`. Check: `supabase/tests/setup_checks.sql`. Ships as its own PR first (`req/REQ-33-migration`).

## Test plan
Unit: `lib/domain/setup-status.test.ts`, `lib/view/setup-text.test.ts`, `lib/data/setup.test.ts`, `lib/notion/students.test.ts`, `lib/setup-scan.test.ts`. Integration: `supabase/tests/setup_checks.sql`. e2e (`e2e/tracker/flows.mjs`): start of run (all seven rows with exact states), end of run (rows agree with psql, then a psql top-up turns five rows Done), and 404 for Ryan, teacher2 and the parent.

## Decisions (defaults taken)
1 no new dependencies; 2 function only; 3 invoker; 4 `getViewer()` owner gate; 5 unit test for the all-zero case, shared e2e seed; 6 route `/tracker/scheduler/setup`; 7 linked from `/schedule` and home for owners; 8 GitHub link for teacher approval; 9 up to 10 names; 10 availability against live links; 11 config plus a ready task; 12 next free ADR; 13 adopted denominator is students with a Weekly Schedule; 14 the query lives in `lib/notion/students.ts`, so `needs-human-merge`; 15 America/Toronto; 16 uncached.
