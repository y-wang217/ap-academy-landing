# Scheduler: verification report (REQ-9, Scheduler 8/8)

Run 2026-10-14 on the REQ-9 branch. PASS means the command passed in that run. NOT RUN means the environment could not run it (no PostgREST, so `pnpm test:tracker` and `pnpm test:sso` were not run here; CI runs them). MANUAL rows need a person.

## Integration
- **Reads from Notion:** Staff (name, email, function, status, subjects), Students & Parents (name, stage, Weekly Schedule).
- **Writes to Notion:** the `Weekly Schedule` property of one student page (ADR 0035), and, from REQ-8, one Work page per date with a Work Log entry (ADR 0039). Nothing else. Lessons is never read or written (ADR 0040).
- **Postgres (`tracker` schema):** `class_series`, `class_exceptions`, `schedule_summaries`, availability tables, `staff_links`, `daily_tasks`, `daily_task_teachers`. Grade-tracker tables are not touched.
- **Lesson link:** a pure extension point only (`lib/domain/schedule/lesson-link.ts`), not wired.

## Storage ownership
| What | Authoritative in |
|---|---|
| Recurring and one-off classes, moves, cancellations | Postgres `class_series`, `class_exceptions` |
| Teacher availability and days off | Postgres availability tables |
| Which teacher may sign in | Postgres `staff_links` |
| Weekly Schedule text on a student | Generated from Postgres; Notion holds a copy that billing reads |
| Staff and student names | Notion (never copied to Postgres) |
| Today's texting task and Charlie's ticks | Notion Work page; Postgres keeps only the page ID, state and per-block fingerprints |
| Delivered lessons, Paid to Teacher, Pay Period | Notion Lessons, untouched by the scheduler |

## Checks performed
| Section 7 item | Evidence | Command | Date | Result |
|---|---|---|---|---|
| Teacher login and server-side rejection | `lib/scheduler/guard.test.ts`, `app/api/scheduler/scheduler-routes.test.ts`, `supabase/tests/scheduler_identity.sql` | `pnpm --filter tracker test`; `pnpm test:rls` | 2026-10-14 | PASS |
| Teacher gets 403 in the browser | e2e teacher PATCH and week checks in `e2e/tracker/flows.mjs` | `pnpm test:tracker` | 2026-10-14 | NOT RUN (see MANUAL 1) |
| Availability, dated exceptions, conflict flags | `lib/domain/schedule/availability.test.ts`, `conflicts.test.ts`, `app/api/scheduler/conflicts-routes.test.ts` | `pnpm --filter tracker test` | 2026-10-14 | PASS |
| Drag Monday to Wednesday, persists, same duration | `lib/view/drag.test.ts`, e2e drag checks | `pnpm --filter tracker test`; `pnpm test:tracker` | 2026-10-14 | PASS (unit); e2e NOT RUN |
| This-only versus future edits, preserved cancellations, unchanged history | `lib/domain/schedule/recurrence.test.ts` (`planSplit`), `edits.test.ts`, `app/api/scheduler/booking-routes.test.ts`, `supabase/tests/scheduler_core.sql` | `pnpm --filter tracker test`; `pnpm test:rls` | 2026-10-14 | PASS |
| Conflict rejection, rollback, duplicates, DST | `lib/domain/schedule/booking.test.ts`, `wallclock.test.ts`, `booking-routes.test.ts`, e2e clash check | `pnpm --filter tracker test`; `pnpm test:tracker` | 2026-10-14 | PASS (unit); e2e NOT RUN |
| Import with incomplete entries surfaced | `legacy-line.test.ts`, `import-plan.test.ts`, `app/api/scheduler/import-routes.test.ts`, `supabase/tests/scheduler_import.sql` | `pnpm --filter tracker test`; `pnpm test:rls` | 2026-10-14 | PASS |
| No delivered-lesson or payout entries (handlers) | `app/api/scheduler/payout-guardrails.test.ts` (REQ-9 AC5) | `pnpm --filter tracker test` | 2026-10-14 | PASS |
| No delivered-lesson or payout entries (end to end) | `e2e/tracker/flows.mjs` journal, table snapshot and seeded-lesson checks (REQ-9 AC6 to AC8) | `pnpm test:tracker` | 2026-10-14 | NOT RUN (see MANUAL 1) |
| Exactly one daily task, all teachers, same-day updates | `lib/domain/schedule/daily-texts.test.ts`, `lib/scheduler/daily-task.test.ts`, `app/api/scheduler/daily-task-routes.test.ts`, `supabase/tests/scheduler_daily_task.sql` | `pnpm --filter tracker test`; `pnpm test:rls` | 2026-10-14 | PASS |
| Daily task in the live Notion workspace, sent manually | none possible in CI | see MANUAL 2 | | MANUAL |
| Availability editor on a phone | e2e at 375px | `pnpm test:tracker` | 2026-10-14 | NOT RUN |
| Forms and calendar on a real phone | none possible in CI | see MANUAL 3 | | MANUAL |
| Lesson-link extension point is pure and unused | `lib/domain/schedule/lesson-link.test.ts` | `pnpm --filter tracker test` | 2026-10-14 | PASS |
| Existing tracker lint, typecheck, tests | whole tracker | `pnpm --filter tracker lint`, `typecheck`, `test` (513 tests) | 2026-10-14 | PASS |

### MANUAL steps
1. After CI, open the REQ-9 PR checks and confirm the `test:tracker` job is green. If it is red, open its log; a failing check names the table or request that changed.
2. After the REQ-8 setup is done (migration 0012 applied, workflow added, secrets set): (1) open `/tracker/schedule` and press Create now; (2) open the Notion link and check there is one task for today with one checkbox per active teacher; (3) press Refresh now and check there is still one task; (4) tick one teacher, move one of that teacher's classes today, press Refresh now, and check the label `Resend: schedule changed after you texted.` appears and the tick stays; (5) tick it again after resending and check the label clears on the next refresh. Tick this row when all five hold.
3. On a real phone signed in as a teacher: (1) open `/tracker/schedule/availability`, add and save a window; (2) open `/tracker/schedule` and open a class; (3) signed in as Charlie, open Book a class and book one. Check nothing scrolls sideways and every button is reachable.

## Remaining setup
The REQ-8 human steps are done as of 2026-10-16; the last item is still open.
- Migration `0012_scheduler_daily_task` applied on 2026-10-14 through the Supabase MCP `apply_migration`, with Charlie's sign-off (tables, six policies and `claim_daily_task` verified on the live project).
- GitHub Actions workflow `daily-teacher-texts.yml` added on 2026-10-15 (#46); scheduled runs green since.
- `SUPABASE_SERVICE_ROLE_KEY`, `SCHEDULER_CRON_SECRET` and `DAILY_TASK_ORG_ID` set in the tracker Vercel project on 2026-10-15, and the secret in GitHub.
- Notion integration shared with Work and Work Log: the 2026-10-15 task was created and refreshed in Notion (`tracker.daily_tasks` row `ready`, refresh count 1).
- Decide how to wire the lesson link (ADR 0040).
