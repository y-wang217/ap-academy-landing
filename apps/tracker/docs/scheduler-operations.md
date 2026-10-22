# Scheduler: operator guide

Five jobs keep the scheduler running. Background for each is in the ADR linked beside it.

## 1. Change the time of the daily task
Background: [0039](decisions/0039-daily-teacher-texts-task.md).
1. In the Vercel project for the tracker, open Settings, Environment Variables.
2. Set `DAILY_TASK_TIME` to the local (Toronto) time as `HH:MM`, for example `06:30`. Unset means `06:00`.
3. Redeploy the tracker so the new value is read.
4. The hourly GitHub run creates the task on its first run at or after that time. To make today's task now, open `/tracker/schedule` and press Create now.

## 2. Approve or revoke a teacher login
Background: [0033](decisions/0033-scheduler-staff-identity.md).
1. To approve: open `supabase/seed/scheduler-staff-link.sql`, set `teacher_email` (the address they sign in with) and `staff_page_id` (their Notion Staff page ID).
2. Run it in the Supabase SQL editor. It does nothing if a live link already exists.
3. The teacher signs in with that email by magic link. The first sign-in claims the link.
4. To revoke: run `update tracker.staff_links set revoked_at = now() where email = '<email>' and revoked_at is null;`. Access stops at once.

## 3. Repair an import entry
Background: [0035](decisions/0035-weekly-schedule-import-and-summary.md).
1. Open `/tracker/scheduler/schedules`.
2. Press Check. Students listed under Needs repair show each Weekly Schedule line with `ok` or a reason.
3. In Notion, fix the student's Weekly Schedule text so every line names a day, a time, a course and a teacher's full name exactly as in Staff.
4. Back on the page press Check again, then Import. A student is imported only when every line is clean.
5. Under Imported, a student marked Failed or Pending can be retried with Retry, or all with Sync all.

## 4. Resolve a conflict
Background: [0036](decisions/0036-availability-conflicts-computed.md).
1. Open `/tracker/schedule/conflicts` (or the badge on the home page).
2. Read the reason beside each class, for example Outside available hours.
3. Either move the class on `/tracker/schedule` (drag it, or open it and edit), or ask the teacher to change their hours on `/tracker/schedule/availability`.
4. Reload the conflicts page. The entry disappears once the class fits; conflicts are computed on each visit, nothing needs clearing.

## 5. Check what is still missing
Background: [0053](decisions/0053-owner-setup-checklist.md).
1. Open [`/tracker/scheduler/setup`](https://www.apacademy.ca/tracker/scheduler/setup) (owners only; also linked as Setup on the home page and Setup checklist on `/tracker/schedule`).
2. Each row shows Done, Partial, Missing or Not checked, a count, who is affected while it is missing, and a link to where it is fixed.
3. Not checked with "Could not read Notion" means Notion did not answer; reload in a minute. It never means zero.
4. The page only reads. Fix each row on the screen its link opens, then reload the page.

## 6. A Notion export did not go through
Background: [0054](decisions/0054-notion-export-outbox.md).
1. Open `/tracker/schedule`. A "Notion exports" strip above the week lists every export that is not done. It is hidden when there are none.
2. **Failed** (for example Notion returned 404): fix the cause in Notion first, such as a student page that was moved or a teacher missing from Staff, then press Retry.
3. **May have been updated**: today's task may already have the change. Open today's task in Notion, check the teacher's to-do, then press Retry. Retry rewrites from the schedule, so a duplicate to-do is the only thing to delete by hand.
4. **Waiting since** a time: Notion was busy or down. It retries on its own, at most an hour apart. Retry now sends it at once.
5. Nothing is ever deleted: a line leaves the strip once a Retry or a later save sends that export.

## 7. Names and the people sync
Background: [0055](decisions/0055-people-sync.md), workspace ADR 0004.
1. The tracker keeps a copy of staff names, subjects and active state, and student names and stage, from Notion. It never copies parent details, email, rates or notes. Edit people in Notion as before.
2. The copy refreshes every hour (the Daily teacher texts workflow) and when you tap Sync now on `/tracker/schedule`. A rename or a new student shows after the next sync.
3. Under today's task on `/tracker/schedule` you see "Names synced N minutes ago." or "Last sync failed at HH:MM. Names are from HH:MM." Sync now waits a minute between taps.
4. When the copy is older than two hours every schedule page and the parent calendar show "Names last updated N hours ago". The classes still show, with the names from the last good sync. Check that the Notion integration still has access to Staff and Students & Parents, then tap Sync now.
5. A teacher set to inactive in Notion loses scheduler access on their next page load after a sync. To cut access at once, revoke the link (section 2).
6. First deploy: apply migration 0022, deploy, then tap Sync now. Until then teachers see "Scheduling is not available right now."

## 8. Lesson logging
Background: [0056](decisions/0056-lesson-link-and-outcomes.md).

Set up once, by hand in Notion:
1. In the Lessons database, add a property of type **Text** named exactly `Class occurrence`. Do not rename it later.
2. Share the tracker's Notion integration with Lessons with read, insert and update access (Can edit content).
3. Never edit `Class occurrence` by hand. The tracker writes it; a wrong value is fixed with Clear in the class dialog.

Until the property exists, Log this class answers 503 `lessons_not_ready` before any Notion write, and the class dialog says "Lesson logging is not set up yet." The "Log a Lesson" form keeps working as it does today.

Day to day:
1. A teacher opens a past class on `/tracker/schedule` and presses Log this class (a Lessons row is created with the class link, or the existing one is found) or Mark no-show (kept in the tracker only).
2. Rows sent through the form show on [`/tracker/schedule/lessons`](https://www.apacademy.ca/tracker/schedule/lessons) (Unlinked lessons, owners only) under the class with the same teacher, student and date. Press Link to connect one. Nothing is linked automatically.
3. "Possible double logs" lists form rows on the same day as a class that is already logged. Check them before pay; nothing is deleted automatically.
4. A wrong link or a wrong no-show: open the class and press Clear. The Notion row stays; only its class link is cleared. The old value is kept in the audit log.
5. A logged or marked class cannot be cancelled or moved. Clear it first.

## 9. Billing check
Background: [0060](decisions/0060-structured-billing-input.md). Field reference: [`billing-input.md`](billing-input.md).

1. Open [`/tracker/scheduler/billing`](https://www.apacademy.ca/tracker/scheduler/billing) (owners only), or Compare billing counts in the Monthly review card. Pick the month with the arrows.
2. Each student shows what the Weekly Schedule text method would count next to the classes the scheduler holds, the charge states, and every difference by date and reason.
3. "Weekly Schedule is out of date. Sync it first." means the text is not synced or differs from the classes. Sync it on `/tracker/scheduler/schedules` before the monthly run.
4. "This text would stop the monthly run." means a line the run cannot read. Fix the text in the scheduler, then sync.
5. Download JSON saves the export the monthly run will one day read. Until Charlie records a month with no "no class on this day" and no "class not in the text" differences, keep running the text-based run and use this page to check it.

