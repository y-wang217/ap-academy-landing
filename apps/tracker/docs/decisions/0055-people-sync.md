# 0055: Staff and student names come from a local copy synced from Notion
Status: accepted
Date: 2026-10-19

## Context
Workspace ADR 0004 (option B, Charlie 2026-10-16) decided that Notion stays the editor of people, Supabase keeps synced operational copies, and the tracker reads the copies. Until this card the tracker read Notion Staff and student names live behind a five-minute cache (`lib/notion/cached.ts`): a Notion failure past the cache gave teachers `503`, cards said "Teacher" and "A student", and nothing showed the data was stale. REQ-38 (Feedback 9, finding F05) builds option B.

## Decision
- **Tables (migration 0022).** `tracker.staff` (name, subjects, one `active` boolean computed at sync by `isActiveTeachingStaff`), `tracker.student_people` (display name and stage) and `tracker.sync_runs` (one row per attempt, counts and a short error). Keyed by `(org_id, Notion page id)`. No parent, email, phone, rate, notes, billing or greeting column. Students get their own table, not columns on `tracker.students`, because a `students` row is a grade-tracker student with publish state, parent policies and invites, and a scheduling-only student must never become one.
- **One writer.** `tracker.apply_people_sync` (security definer, owner or service role) takes what the app read from Notion and, in one transaction under a per-org advisory lock: updates rows by Notion id (a rename keeps the row), inserts new rows only when active or already referenced by the org (series, staff links, `students.notion_student_id`), archives rows Notion no longer returns (never deletes), and records the run. An error from Notion, an invalid payload, or an empty list while that table has active rows records a `failed` run and changes no person row, so an outage never empties a calendar. No client role can insert, update or delete the tables directly.
- **Reads (RLS).** The owner reads the org. A scheduling teacher reads every active staff row plus their own, and only the `student_people` rows of students on their own series. A parent reads their published linked child and only the staff rows of that child's teachers. `sync_runs` is owner only; others get the last good time through `people_synced_at`.
- **Cadence.** Hourly, inside `POST /api/scheduler/daily-task/run` (the existing workflow at :05) before the 06:00 check, with the service client. On demand from the owner's Sync now on `/schedule` (`POST /api/scheduler/people/sync`, owner's own client, 60 second cooldown). A failed scheduled sync does not change the run route's status code; the result is in the body and in `sync_runs`.
- **Local reads.** `realDeps().fetchStaff`, `studentNames`, identity, the week views, availability, conflicts, the import screen's teacher names, the daily task (owner path and run route), the summary sync, the parent calendar and the owner's Notion link picker all read the copy on the caller's own client. `lib/notion/cached.ts` no longer has a staff or names cache. Only `lib/scheduler/people-sync-wiring.ts` calls the Notion people readers, through `fetchStaffForSync` and `fetchStudentPeople`, which ask Notion for the copied properties only (`filter_properties`).
- **Reads that stay live.** Weekly Schedule import (`fetchScheduledStudents`, `fetchStudentSchedule`), the summary write (`writeWeeklySchedule`) and billing (`lib/notion/billing.ts`). They need text or fields that are not copied.
- **Teacher scope from the copy.** `resolveSchedulerIdentity` gives `none` to a linked teacher whose local row is inactive, archived or missing, even with an unrevoked link, and `unavailable` when there has never been a good sync or the read fails. An owner keeps `admin`.
- **Freshness.** Every page that shows names shows "Names last updated N hours ago" once the last good sync is older than `TUNING.peopleStaleMinutes` (120), and renders its data anyway. The owner sees "Names synced N minutes ago." or "Last sync failed at HH:MM. Names are from HH:MM."
- **Admin email.** `toAdminStaff` takes the email from the live `staff_links` row, never from Notion.

## Alternatives considered
- **Columns on `tracker.students`.** Would turn scheduling-only students into grade-tracker students with parent and invite rules.
- **Owner insert and update policies.** More surface than one RPC, and the apply would not be atomic.
- **Service role only, with Sync now using the service client too.** The run route would stop being the only importer of the service client.
- **`my_staff_id()` also requiring an active local row.** Would cut every teacher's database access from the moment the migration is applied until the first sync. The app-level cut in identity covers the next request; revoking the link stays the database cut-off.
- **A new cron and workflow.** ADR 0004 names the existing hourly one; no new secret.

## Consequences
- Rollout: apply 0022, deploy, then the owner taps Sync now on `/schedule` (or runs the Daily teacher texts workflow by hand). Until the first good sync, teachers see "Scheduling is not available right now." and names say "Names have not been loaded yet."
- A teacher's student names are now limited by RLS to their own series, which only narrows what they saw before.
- Supersedes the live Notion read and five-minute recheck in ADR 0033 and the names cache in ADR 0037, as ADR 0004 said it would.
- Old `sync_runs` rows are not pruned. Revisit if the table grows past a few thousand rows.

Merged with REQ-33: the owner setup checklist (ADR 0053) counts Teachers approved from this copy, so before the first sync it says no active teachers.
