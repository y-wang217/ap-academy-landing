# REQ-8: Scheduler 7/8: Daily "Text teachers their schedules" Notion task

Card: https://app.notion.com/p/3f9d6ae73dd781a0a545c4a560696200 (design approved there; this is the build copy).

**Summary:** Each morning the tracker creates one Work task in Notion, "Text teachers their schedules — YYYY-MM-DD", with one checkbox per active teacher, that teacher's classes for the day and a copyable message. Same-day class changes refresh the same task, keep Charlie's checkmarks and mark any already-texted teacher "Resend". Nothing is ever sent.
**Risk:** High. A new migration (two tables and one function), a new server credential (Supabase service role key, used by the scheduled run only), an auth change (`apps/tracker/proxy.ts` lets the scheduled-run endpoint through without a session), and student names written into a new Notion database (Work).

## Problem
Charlie texts every teacher their day by hand on WhatsApp. The tracker holds the class schedule (`tracker.class_series` and `tracker.class_exceptions`, migration 0010) but nothing turns it into a daily to-do. This card adds a daily Work task listing every active teacher's classes for the local date, with a ready-to-paste message per teacher. Charlie sends each message himself and ticks the teacher off. Admin only.

## Acceptance criteria
Fixture: Mon 2026-10-19, America/Toronto. Staff: Ryan Test and Kuby Test (Active, Teacher), Sara (Active, Setter only), Olu (Inactive, Teacher). Classes: Sam Student with Ryan 16:00-17:00 MHF4U (weekly), Kim with Ryan 18:00-19:00 SPH3U (one-off). Kuby has none.

- AC1 Content: one to-do per active teaching staff member (Ryan, Kuby), ordered by name; Sara and Olu absent. Ryan lists `16:00-17:00 Sam Student, MHF4U` then `18:00-19:00 Kim, SPH3U`; Kuby says `No classes scheduled today`. Each block links to `TRACKER_URL/schedule?staffId=<id>&date=2026-10-19` and holds a code block with the message text. A cancelled class appears as `Cancelled: 16:00-17:00 Sam Student, MHF4U`. A teacher with a class who is no longer active is listed, marked `(not active in Staff)`.
- AC2 Properties: Name `Text teachers their schedules — 2026-10-19`, Area Delivery, Type Recurring, State Next, Owner Charlie, Alignment Maintenance, Due / Review the date. Never sets Agent permission, Bet or Build hours. To-dos are created unchecked.
- AC3 One task per date: two runs make one page-create call and one `tracker.daily_tasks` row. Two runs at the same moment: one holds the lease, the other returns `busy`. If the page was created but saving its ID failed, the retry adopts it by exact title.
- AC4 Time of day: before `DAILY_TASK_TIME` (default 06:00 local) the run returns `not_yet` and touches nothing. Correct across DST.
- AC5 Same-day change keeps checkmarks: a checked teacher whose class moves gets `Resend: schedule changed after you texted.` and the new times. No request body to Notion ever contains `checked` after creation. Unchanged teachers receive no request.
- AC6 An unchecked teacher gets the new content and no label.
- AC7 After Charlie unticks and reticks, the next refresh removes the label and the tick stays.
- AC8 No change and nothing labelled: zero Notion calls.
- AC9 Never sent: no messaging service or Notion comments in the new files; the page says `Nothing is sent automatically. Tick a teacher after you text them.`
- AC10 Failure keeps scheduling usable: the class save still returns 2xx with `dailyTask: "failed"`, the row is `failed` with a short error and no Notion body, and the admin page shows `Today's Notion task could not be updated.` with Retry. Retry leaves exactly one page.
- AC11 Class create, move, edit and cancel refresh today's task if it exists (`dailyTask: updated | unchanged | failed`); if it does not exist the class write does not create it (`skipped`).
- AC12 Permissions: a teacher gets 403 on `GET`/`POST /api/scheduler/daily-task` and nothing is read. `POST .../run` without the right bearer returns 401 before any database or Notion call; secret unset returns 503. That one path is reachable without a session; every other tracker path still redirects.
- AC13 Guardrails: nothing writes to Lessons, Teacher Payouts, Paid to Teacher, Pay Period, Students & Parents or class tables. Notion writes go only to Work, Work Log and blocks inside the task page. The service-role client is imported only by the run route.
- AC14 Logging per the Playbook: creating the task creates one Work Log entry; refreshes update that entry's Decisions (`Refreshed N times, last at HH:MM`) and never create a second.
- AC15 RLS: the org owner reads and writes both new tables; teacher and anon nothing. No student names in Postgres.
- AC16 Existing behaviour: tracker tests, `pnpm test:rls`, `pnpm test:tracker` pass. The AC15 source scan in `schedule-routes.test.ts` keeps its assertions; its Notion import allowlist gains `work`.

## Approach
- `supabase/migrations/0012_scheduler_daily_task.sql`: `tracker.daily_tasks` (unique `(org_id, kind, local_date)`, lease), `tracker.daily_task_teachers` (per-block hashes), `tracker.claim_daily_task()`. Owner-only RLS, no audit trigger (recorded in ADR 0039). Applied by a human.
- Domain `lib/domain/schedule/daily-texts.ts`: `buildTeacherDays`, `planRefresh`, `dailyTaskTitle`, `isDue`.
- Notion adapter `lib/notion/work.ts` (plain fetch, never sends `checked` after creation); config in `lib/notion/config.ts`.
- Orchestration `lib/scheduler/daily-task.ts` (`ensureDailyTask`, never throws) over a `DailyTaskStore` port (`lib/data/daily-task.ts`) and a `DailyNotion` port.
- Handlers/routes: `GET|POST /api/scheduler/daily-task` (admin), `POST /api/scheduler/daily-task/run` (bearer secret, service client). `packages/db/src/service.ts` adds `getServiceClient()`.
- `proxy.ts` matcher excludes the run path.
- Class write handlers call `refreshToday` and add `dailyTask` to the response.
- UI: one status line on `/tracker/schedule` (admin) with Create now / Refresh now / Retry.
- Scheduled trigger: hourly GitHub Actions workflow (YAML below), added by a human because workflows are guarded.

## Test plan
Unit: `daily-texts.test.ts`, `work.test.ts`, `daily-task.test.ts`. Integration: `daily-task-routes.test.ts`. RLS: `supabase/tests/scheduler_daily_task.sql`. Source scans extended. E2E: `e2e/tracker` mock Notion gains Work endpoints.

## Out of scope
Sending anything, notifications, meeting links (slot kept, always empty), other dates, backfill, teacher-facing views, full operator docs (8/8).

## Open questions, as approved with the proposals
1. Trigger: hourly GitHub Actions workflow plus bearer-protected endpoint using the service role key. 2. Kept as one card. 3. Meeting links: slot left empty, source is a follow-up. 4. Cancelled classes are listed as `Cancelled: ...`. 5. One Work Log entry per day, updated on refresh. 6. Task Type relation: not set (Charlie can add the ID later). 7. Risk raised to High.

## Operator setup (a human does these)
1. Review and apply migration `0012_scheduler_daily_task` through the Supabase MCP `apply_migration`, with Charlie's sign-off.
2. Share the Notion integration with the Work and Work Log databases (it already reads Staff and Students & Parents).
3. In the tracker Vercel project set: `SUPABASE_SERVICE_ROLE_KEY`, `SCHEDULER_CRON_SECRET` (a long random string), `DAILY_TASK_ORG_ID` (the org's UUID), optionally `DAILY_TASK_TIME` (HH:MM, default `06:00`).
4. In GitHub repository secrets set `SCHEDULER_CRON_SECRET` (same value). Optionally the repository variable `TRACKER_RUN_URL` if the host is not `https://www.apacademy.ca`.
5. Add the workflow below as `.github/workflows/daily-teacher-texts.yml`.

```yaml
name: Daily teacher texts task

# Hourly: creates today's "Text teachers their schedules" task once it is past
# DAILY_TASK_TIME local, and refreshes it. Safe to repeat (tracker ADR 0039).
on:
  schedule:
    - cron: "5 * * * *"
  workflow_dispatch:

permissions:
  contents: read

jobs:
  run:
    runs-on: ubuntu-24.04
    steps:
      - name: Call the run endpoint
        env:
          SCHEDULER_CRON_SECRET: ${{ secrets.SCHEDULER_CRON_SECRET }}
          RUN_URL: ${{ vars.TRACKER_RUN_URL || 'https://www.apacademy.ca/tracker/api/scheduler/daily-task/run' }}
        run: |
          if [ -z "$SCHEDULER_CRON_SECRET" ]; then
            echo "::notice::Skipped: set the SCHEDULER_CRON_SECRET repository secret (docs/designs/REQ-8.md)."
            exit 0
          fi
          curl --fail-with-body -sS -X POST -H "Authorization: Bearer $SCHEDULER_CRON_SECRET" "$RUN_URL"
```
