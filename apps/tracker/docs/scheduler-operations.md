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

## 6. Lesson logging
Background: [0054](decisions/0054-lesson-link-and-outcomes.md).

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
