# 0053: The owner setup checklist reads only, and a failed read is never a zero
Status: accepted
Date: 2026-10-19

## Context
The 2026-10-16 readiness review (finding F12, REQ-33) found the scheduler deployed but empty: no class series, no availability, no adopted schedules, no active staff links, no parent links, one tracker student with no Notion record. Nothing told the owner what was still missing, which screen fixes it, or what teachers, students and parents see in the meantime.

## Decision
- **Route.** `/tracker/scheduler/setup`, next to `/tracker/scheduler/schedules`. Linked as Setup on the tracker home and as Setup checklist on `/tracker/schedule`, both for the owner only.
- **Owner gate.** `getViewer()` with `kind = staff` and `role = owner`. Everyone else, a scheduling-only teacher included, gets a 404. The scheduler identity (`scope = admin`) was not used because it also runs `claim_staff_link`.
- **Reads only.** Selects through the owner's own client under RLS, the read-only `tracker.setup_checks(org)` (migration 0021), the cached Staff list and one new names-only Notion query. No write, no service client. A source scan (`lib/setup-scan.test.ts`) holds this.
- **A failed read is its own state.** A Notion failure shows "Could not read Notion" and a database failure "Could not check" on the rows that need that read. Neither is ever shown as 0.
- **Seven rows, one rule.** Count rows are Missing at 0 done or 0 to do, Done when all are done, Partial otherwise. Row specific rules live in `lib/domain/setup-status.ts`.
- **Availability counts linked teachers.** The denominator is live staff links, because only a linked teacher can enter hours; the row then never depends on Notion.
- **Adopted of scheduled.** The denominator is Active and Onboarding students whose Notion Weekly Schedule is not empty. Notion filters on that property, but only Student Name is asked for, so schedule text never reaches the tracker. A student with an empty Weekly Schedule is adopted by their first booking, so counting them would leave a row the owner cannot finish. The query is not cached.
- **Daily task.** Missing unless `NOTION_TOKEN` and `SCHEDULER_CRON_SECRET` are set and `DAILY_TASK_ORG_ID` is this org; then Done when a `ready` teacher-texts task exists for today or yesterday, else Partial. The page names a missing variable, never a value.
- **Guard check is an invoker function.** `pg_catalog.pg_trigger` is readable by `authenticated`, and the select is filtered by `is_org_owner`, so no definer rights are needed. It reports the 0017 trigger as present only when it exists and is not disabled.
- **One Toronto date per request.** The page computes `todayIso()` once and passes it to the loader and the builder, the same date the daily task writes into `local_date`.

## Alternatives considered
- A security definer `setup_checks`, as the card suggested: more rights than the read needs.
- Counting every Active and Onboarding student as "to adopt": leaves the row Partial with nothing to do.
- Caching the scheduled-students query: an adoption would show as missing for up to five minutes.
- Buttons that fix a row from this page: out of scope; the page links to the screens that already do it.

## Consequences
- Each owner page load makes one uncached Notion query (plus the cached Staff read).
- When the people copies of ADR 0004 land (REQ-38), the Staff read switches to the local table.
- New checks can be added as rows of `setup_checks` without a new function.
