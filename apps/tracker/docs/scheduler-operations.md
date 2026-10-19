# Scheduler: operator guide

Four jobs keep the scheduler running. Background for each is in the ADR linked beside it.

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

## 5. Names and the people sync
Background: [0053](decisions/0053-people-sync.md), workspace ADR 0004.
1. The tracker keeps a copy of staff names, subjects and active state, and student names and stage, from Notion. It never copies parent details, email, rates or notes. Edit people in Notion as before.
2. The copy refreshes every hour (the Daily teacher texts workflow) and when you tap Sync now on `/tracker/schedule`. A rename or a new student shows after the next sync.
3. Under today's task on `/tracker/schedule` you see "Names synced N minutes ago." or "Last sync failed at HH:MM. Names are from HH:MM." Sync now waits a minute between taps.
4. When the copy is older than two hours every schedule page and the parent calendar show "Names last updated N hours ago". The classes still show, with the names from the last good sync. Check that the Notion integration still has access to Staff and Students & Parents, then tap Sync now.
5. A teacher set to inactive in Notion loses scheduler access on their next page load after a sync. To cut access at once, revoke the link (section 2).
6. First deploy: apply migration 0021, deploy, then tap Sync now. Until then teachers see "Scheduling is not available right now."
