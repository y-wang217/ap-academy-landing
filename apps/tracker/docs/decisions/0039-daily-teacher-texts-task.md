# 0039: The daily teacher-texts task is one Notion page per date, kept apart by a lease
Status: accepted
Date: 2026-10-14

## Context
Charlie texts each teacher their day by hand. REQ-8 turns the schedule into one Work task in Notion each morning, with a checkbox and copyable text per teacher. It must be created once per date even when runs overlap or retry, must never overwrite Charlie's ticks, and must not make class saves fail when Notion is down. Nothing is sent automatically.

## Decision
- **Dedupe key.** `tracker.daily_tasks` has `unique (org_id, kind, local_date)`. A run first claims the date with `tracker.claim_daily_task()`, which takes a 60 second lease only if nobody holds a live one; a second run at the same moment returns `busy` and writes nothing. If the page was created but its ID not saved, the retry finds it by exact title in Work and adopts it.
- **Trigger.** An hourly GitHub Actions workflow (the mechanism `backup.yml` already uses) posts to `/tracker/api/scheduler/daily-task/run` with a bearer secret. Hourly covers the configured local time (`DAILY_TASK_TIME`, default 06:00) across DST without editing a cron, and doubles as the retry and label-clearing pass. Before the time it returns `not_yet`. A failed run is a 502 so the workflow turns red.
- **Credential.** The scheduled run has no user, so it uses the Supabase service role key, which bypasses RLS. It is confined to one route behind the bearer secret (constant-time compare, checked before anything else), one org from `DAILY_TASK_ORG_ID`, and reads of the class tables plus the two new tables. A source-scan test allows exactly one importer of `@ap-academy/db/service`. `proxy.ts` exempts only that path from the session check.
- **Ticks are Charlie's.** No request after creation ever contains `checked`. To decide whether to show `Resend: schedule changed after you texted.`, a tick made after our last write (the block's `last_edited_time` is later than the `last_edited_time` Notion returned for our write) acknowledges the version we wrote; a ticked teacher whose current day differs from the acknowledged version is labelled. Unticking and re-ticking after resending clears it on the next refresh.
- **Only changed teachers are written.** Each block stores a sha-256 of its rendered day. If no fingerprint changed and nothing is labelled, a refresh makes zero Notion calls.
- **Failure.** `ensureDailyTask` never throws. A failure sets the row to `failed` with a message of at most 300 characters: a Notion status line, or a generic text, never a response body (bodies can echo student names). Class saves report `dailyTask: "failed"` and stay 2xx.
- **No audit trigger** on the two new tables: they hold operational state and no personal data, and an hourly run would flood `audit_log`.
- **Names.** Student names go to the Work page and the message text, which only Charlie's workspace sees. They are not stored in Postgres or logged.
- **Work Log.** One entry per day, updated on refresh, per the Agent Playbook.

## Alternatives considered
- Vercel Cron: hourly needs the Pro plan.
- Create on Charlie's first visit after 06:00 only: no service key and no proxy change, but no task unless Charlie opens the page. Create now and Retry on the schedule page keep this path available.
- A trigger for every class change: the class write handlers already know when to refresh and need the response field.

## Consequences
- `last_edited_time` is minute-precise: a re-tick in the same minute as our write is not seen, and the label stays until the next tick change.
- Scheduled GitHub workflows can start late; the task may appear a few minutes after 06:00.
- Meeting links are not stored anywhere yet; the line type has a slot that is always empty.
- The workflow file is added by a human (workflows are guarded for the builder).
