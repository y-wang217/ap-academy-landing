# Scheduler: tutorial and live test script

One section per view. Each section says who can open it, what is on the screen, how to use it, and a live test checklist with the result you should see. The operator guide (`scheduler-operations.md`) covers the four maintenance jobs; this file covers everyday use.

All times are Toronto wall-clock. The calendar week runs Monday to Sunday. Student and teacher names come from Notion and are never stored in Postgres, so a name that is wrong on screen is wrong in Notion.

## Before you start

### Accounts
| Role | Who | How the app decides | What they can do |
|---|---|---|---|
| Admin | Charlie (the tracker org owner) | `owner` membership in `tracker.memberships` | Everything: every teacher's week, book, edit, move, cancel, availability for any teacher, conflicts, import, daily task |
| Teacher | A tutor approved by Charlie | A live row in `tracker.staff_links` for their sign-in email, pointing at an active teaching Staff page | Their own week and their own availability. Read only on classes |
| Anyone else | A student login, or a login with no link | neither of the above | Sees "You don't have access to scheduling yet" or a not-found page; every scheduler API answers 403 |

To approve a teacher for a live test: edit `supabase/seed/scheduler-staff-link.sql` with their sign-in email and Notion Staff page ID, run it in the Supabase SQL editor, then have them sign in at `https://www.apacademy.ca/login?next=/tracker` with that email. The first sign-in claims the link. Revoke with the one-line update at the top of that file.

### What must be configured
- `NOTION_TOKEN` on the tracker Vercel project, and the integration shared with Staff and Students & Parents. Without it every scheduler page says "Scheduling is not available right now."
- Migrations 0009 to 0012 applied (they are). The daily task card also needs the hourly GitHub workflow and the Vercel secrets from `scheduler-report.md`; as of 2026-10-16 those are in place and the task has run on schedule, so section 6 is live-testable.
- A teacher only shows up in pickers when their Staff page is Active and has the Teacher function.

### Phone or desktop
The breakpoint is 768 px wide. On a phone the week is a stacked day list and a class can only be moved through the Edit form. On a desktop the week is a 7-column grid and classes can also be dragged. Test both: the acceptance criteria call for no sideways scroll at 375 px.

### Suggested order for a first live run
1. Availability for one teacher (section 3) so there are hours to book inside.
2. Book, move, edit and cancel classes (section 2).
3. Break a window on purpose and read the conflicts page (section 4).
4. Import the Weekly Schedule text from Notion (section 5).
5. The daily Notion task (section 6), once its setup is done.

A fill-in results table is at the end.

## 1. Home page and the week calendar (`/tracker/schedule`)

### Who sees what on `/tracker`
- **Admin** sees the Students page. Beside the title: "Teacher schedules" (opens the All teachers week) and "Teacher availability". When any class sits outside its teacher's hours the availability link carries a badge, "3 classes outside availability".
- **Teacher** sees "Hi <name>" with two buttons: "Your week" and "Set your availability".

### The three week views
| View | URL | Who |
|---|---|---|
| One teacher's week | `/tracker/schedule?staffId=<id>&date=YYYY-MM-DD` | Admin (any teacher), teacher (own only, the `staffId` is ignored or refused) |
| All teachers | `/tracker/schedule?view=all` | Admin only |
| Your week | `/tracker/schedule` | Teacher: always their own week |

A teacher who adds `?view=all` or another teacher's `staffId` by hand sees "This page is not available for your account."

### Controls at the top
- **Previous week, Today, Next week**: plain links that keep the teacher or All teachers choice.
- **All teachers / One teacher** (admin): toggles between the two layouts.
- **Go to date** plus **Teacher** select plus **Go**: jumps to the week containing that date. Works without JavaScript.
- The heading reads "Week of Mon Oct 19, 2026".

### Reading one teacher's week
Under the heading, one line of totals: "Scheduled 4 h · 5.5 h available left". It reads "No availability entered" when the teacher has no hours at all, and adds "⚠ 2 outside hours" when classes sit outside their hours.

On a desktop each day is a column with 15-minute rows from 08:00 (or earlier if a class starts earlier) to 21:00 (or later). Hours the teacher is available are hatched and labelled "Available". The day heading says "(Today)" on today, and "No availability entered" or "Unavailable" when that applies. On a phone each day is a card listing its classes, with the availability written out in words.

A class card shows the student, the subject and the time. Its border and badges tell you its state:
| Looks like | Means |
|---|---|
| Solid border, no badge | Scheduled, inside hours |
| Dashed border with "⚠ Outside hours" or "⚠ Time off" | Scheduled but conflicts with availability |
| "↪ Moved from Mon Oct 19" | A weekly class moved for this one date |
| Struck through with "✕ Cancelled" | Cancelled for this date |
| Two cards side by side in one slot | Overlapping classes, laid out in lanes |

Tap a card to open its details: subject, teacher, date, time, duration, type (Weekly or One-off), status and the original date if moved. "Open student record" opens the student's Notion page in a new tab. Escape or Close returns focus to the card. For admins the dialog also offers Edit and Cancel class on classes dated today or later (section 2).

### All teachers
One bordered box per active teacher, two per row on a wide screen. The name links to that teacher's week. Under it the same totals line, then seven rows, one per day, each listing "16:00 Sam S · MHF4U". Cancelled classes are struck through and say "(Cancelled)". Teachers with no classes still appear, so you can see who is free.

### Live tests
| # | Do | Expect |
|---|---|---|
| 1.1 | As admin open `/tracker`. | "Teacher schedules" and "Teacher availability" beside the title. |
| 1.2 | Press Teacher schedules. | All teachers view, every active teacher listed, sorted by name, each with a totals line. |
| 1.3 | Press a teacher's name. | That teacher's week for the same Monday. Title "<name>'s week". |
| 1.4 | Press Next week, then Today. | Week heading moves forward 7 days, then back to the current week. The teacher stays selected. |
| 1.5 | Pick a date in Go to date, press Go. | The week containing that date. |
| 1.6 | Open a class card, press Escape. | Dialog shows subject, teacher, date, time, duration, type, status. Focus returns to the card. |
| 1.7 | Press Open student record. | The student's Notion page opens in a new tab. |
| 1.8 | Resize to under 768 px (or use a phone). | Stacked day cards, availability in words, no sideways scroll. |
| 1.9 | As a teacher open `/tracker`. | "Hi <name>", Your week and Set your availability buttons only. No student list. |
| 1.10 | As that teacher open `/tracker/schedule?view=all`. | "This page is not available for your account." |
| 1.11 | As that teacher open their week. | Same grid, but no Book a class button, no Edit or Cancel in a card dialog, cards not draggable. |

## 2. Booking, editing, moving and cancelling (admin, inside one teacher's week)

The Book a class button is above the grid on a per-teacher week only, not on All teachers. It is disabled with "Student list could not be loaded." when Notion did not answer.

The server is the only judge. Every save is checked for:
- **Teacher double-booking**: the teacher already has a class overlapping that slot.
- **Student double-booking**: the student already has a class then, with any teacher.
- **Availability**: the class must sit wholly inside one of the teacher's available intervals on that date, and not touch time off. A teacher with no hours entered at all is rejected with "has no availability entered".
- **Every date**: a weekly class, or a "this class and future" change, is checked on every date for the next 26 weeks. The error names the first bad date and counts the rest, for example "Not saved: Ryan has time off then. 1 more date has a problem."

Back-to-back classes are allowed. A class never clashes with itself.

### Book a class
Fields: Student (select), Subject (up to 80 characters), Teacher (defaults to the teacher whose week you are on), Date (today or later), Start time (5-minute steps, defaults to 16:00), Duration in minutes (15 to 480, in steps of 5, defaults to 60), Repeats weekly, and when ticked an optional Until date. Press "Book class". On success the dialog closes, "Saved." shows above the grid and the week reloads. A weekly class also regenerates that student's Weekly Schedule text in Notion.

### Move by dragging (desktop only)
Press and hold a card, drag it, and a dashed ghost follows at the nearest 15 minutes with a label like "Wed Oct 21 16:00-17:00". The ghost keeps the class's length. Release to drop. Dropping on the original slot does nothing; Escape abandons the drag. Only scheduled or moved classes dated today or later can be dragged, and only within the seven days shown.

Dropping a weekly class that has not already been moved asks "Move this class?" with two choices:
- **This class only** (preselected): just this date moves. The card then shows "Moved from Mon Oct 19".
- **This class and future**: the series changes from this date on. Earlier dates and their cancellations are untouched.

A one-off class, or a weekly date that was already moved, skips the question and moves only itself.

While saving, the card sits in its new slot labelled "Saving…". If the server refuses, the card goes back and one sentence explains why. If someone else changed the class in the meantime you see "Someone else changed this. Showing the latest." and the week reloads.

### Edit
Open the card, press Edit. For a weekly class choose the scope first:
- **This class only**: only Date and Start time can change. Subject, Teacher and Duration are greyed out with the note "To change the teacher, subject or length, choose This class and future".
- **This class and future**: everything can change. The series moves to the weekday of the date you pick, from that date on.

A one-off class has no scope choice and every field is editable. Press "Save changes". "Nothing to save." means no field changed. Past classes offer no Edit.

### Cancel
Open the card, press Cancel class. A weekly class asks the same scope question: "This class only" cancels one date (it stays on the calendar struck through, so you can see it happened), "This class and future" ends the series the day before. "Keep class" closes without doing anything. A cancelled date still offers Edit; saving a new date or time for it replaces the cancellation with a move, so the class is back on the calendar.

### Error sentences you may see
| Sentence | Why |
|---|---|
| Not saved: Ryan already has a class Wed Oct 21 16:00-17:00. | Teacher double-booked |
| Not saved: the student already has a class Wed Oct 21 16:00-17:00. | Student double-booked |
| Not saved: Ryan is not available then. | Outside the teacher's hours |
| Not saved: Ryan has time off then. | A day off or partial time off covers the slot |
| Not saved: Ryan has no availability entered. | The teacher has no hours at all |
| Not saved: that class has already started or passed. | Editing the past |
| Not saved: this class was already moved, so change only this class. | "This class and future" on a moved date |
| Someone else changed this. Showing the latest. | Another tab or person saved first |
| Saved. Today's Notion task could not be updated. | The class saved, but the daily Notion task (section 6) did not refresh |

### Live tests
Set up first: a teacher with hours Monday to Friday 15:00 to 21:00 (section 3) and two students in Notion at stage Active or Onboarding.

| # | Do | Expect |
|---|---|---|
| 2.1 | Book a one-off class next Monday 16:00, 60 min, inside hours. | "Saved.", card on Monday 16:00-17:00, solid border. |
| 2.2 | Book the same student with a different teacher at the same time. | "Not saved: the student already has a class Mon … 16:00-17:00." Nothing added. |
| 2.3 | Book a second student with the same teacher 16:30-17:30. | "Not saved: <teacher> already has a class Mon … 16:00-17:00." |
| 2.4 | Book the second student 17:00-18:00 with the same teacher. | Saved. Back-to-back is allowed. |
| 2.5 | Book a class at 22:00. | "Not saved: <teacher> is not available then." |
| 2.6 | Book a weekly class Tuesday 18:00, 60 min, no Until. | Saved. It appears every Tuesday when you press Next week. The student's Weekly Schedule in Notion is rewritten before "Saved." appears and now holds `Tue 18:00-19:00 \| <subject> \| <teacher>` (plus `\| from <date>` while the start date is in the future, and `\| until <date>` when an Until was set). |
| 2.7 | Press Book class twice quickly on one form. | One class, not two. |
| 2.8 | Desktop: drag the Monday one-off card to Wednesday 16:00. | Ghost labelled "Wed … 16:00-17:00", "Saving…", then the card is on Wednesday with the same length. Reload: still there. |
| 2.9 | Drag the weekly Tuesday card to Thursday, choose This class only. | Card on Thursday with "↪ Moved from Tue …". Next week's Tuesday is unchanged. |
| 2.10 | Open the moved card, press Edit. | No scope radios, only this date can change. |
| 2.11 | Drag a card onto a slot the teacher already has a class in. | Card snaps back, "Not saved: <teacher> already has a class …". |
| 2.12 | Start a drag, press Escape. | Ghost disappears, nothing saved. |
| 2.13 | Open the same class in two tabs, move it in one, then move it in the other. | Second tab: "Someone else changed this. Showing the latest." and the week reloads. |
| 2.14 | Edit the weekly class, This class and future, change Duration to 90. | Saved. Every future Tuesday is 90 min; past dates unchanged. |
| 2.15 | Edit the weekly class, This class only, try to change Subject. | Field is disabled with the note about choosing This class and future. |
| 2.16 | Cancel one date of the weekly class (This class only). | Card stays, struck through, "✕ Cancelled". Reload: still cancelled. |
| 2.16b | Open that cancelled card, Edit, set a new time, Save. | The cancellation is gone and the card shows "↪ Moved from …" at the new time. |
| 2.17 | Cancel the weekly class, This class and future, from a date four weeks out. | Dates before it stay; from that date on the series is gone. |
| 2.18 | Go to a past week, open a card. | No Edit or Cancel buttons. |
| 2.19 | Phone (under 768 px): open a card, Edit, change the time, Save. | The form fits with no sideways scroll; the move works without dragging. |
| 2.20 | As a teacher, call the API: `curl -X POST https://www.apacademy.ca/tracker/api/scheduler/classes` with their cookie. | 403. Nothing written. |

## 3. Availability (`/tracker/schedule/availability`)

Who: a teacher edits their own hours (title "Your availability"). Admin picks any teacher from the Teacher select at the top (title "Teacher availability"), and the URL carries `?staffId=`.

Saving availability never changes any class. If you shrink hours over an existing class, the class stays and shows up as a conflict instead (section 4). A teacher who has classes outside their hours sees a yellow line at the top: "2 of your classes are outside your hours. Charlie will sort them out."

### Weekly hours
Monday to Sunday, each with "No hours" or one row per window.
- **+ Add hours** adds a draft row for that day, preset 09:00 to 12:00 starting today. Press Save to keep it or Cancel to drop it.
- On a saved row, change Start or End and press Save. Save is enabled only when something changed and the end is after the start. Remove deletes the window.
- **More** under each row reveals Starts and Ends (optional) dates. Use Ends to retire a window on a date, for example when term ends.
- **Copy to…** appears on days with hours. Tick the target days, optionally "Replace hours already on those days", press Copy. Without Replace the target keeps what it had and gains the source's windows (duplicates are skipped). With Replace the target's windows are deleted first.

### Days off and extra hours
One dated entry at a time: Date (today or later), Type (Time off or Extra hours), All day for time off, otherwise From and To, then Add. Entries for the next 91 days are listed with a Remove button. Time off blocks that interval even inside weekly hours. Extra hours open a one-off interval on a day with no weekly hours.

### Next 14 days
A plain list of what the above adds up to, one line per day, with an icon and words so the state never depends on colour:
| Line | Means |
|---|---|
| ✓ Available 09:00-12:00, 13:00-17:00 | Weekly hours (plus extra hours) on that date |
| ✓ Time off, available 09:00-12:00 | Partial time off that day, these hours remain |
| ✕ Time off | All-day time off |
| ✕ Unavailable | No window that day, but the teacher has entered hours on other days |
| ○ Not entered | This teacher has no hours and no exceptions at all |

Every change is sent to the server and the page then reloads the server's answer, so a failed save is shown as an error ("That did not save. Please try again.") and never as saved.

### Live tests
| # | Do | Expect |
|---|---|---|
| 3.1 | As a teacher open Set your availability on a brand-new account. | "You haven't entered any hours yet." Every day in Next 14 days says "○ Not entered". |
| 3.2 | Monday: + Add hours, set 09:00 to 12:00, Save. Add a second window 13:00 to 17:00, Save. | "Saved" flash. Monday lists both rows. Next Monday in the preview reads "✓ Available 09:00-12:00, 13:00-17:00". |
| 3.3 | Set End before Start on a row. | Save is disabled, red text "End must be after start." |
| 3.4 | Copy to… from Monday, tick Wednesday and Friday, Copy. | "Copied". Wednesday and Friday show both windows. Tuesday still "No hours". |
| 3.5 | Copy Monday to Wednesday again with Replace unticked. | No duplicates on Wednesday. |
| 3.6 | Edit Wednesday's first window to 10:00-12:00, then copy Monday to Wednesday with Replace ticked. | Wednesday returns to 09:00-12:00 and 13:00-17:00. |
| 3.7 | Add Time off, All day, next Monday. | Listed under Days off and extra hours. Preview: "✕ Time off" for that date. |
| 3.8 | Add Extra hours next Sunday 10:00-12:00. | Preview for that Sunday: "✓ Available 10:00-12:00". |
| 3.9 | Remove the time off. | Preview for that Monday is back to "✓ Available …". |
| 3.10 | Open More, set Ends to the end of this month on Friday's window. | After the month ends, that window stops counting (check with Go to date on the week view). |
| 3.11 | With a class booked Monday 16:00 (section 2), change Monday's second window to 13:00-15:00. | Saves fine. The class is still on the calendar, now with "⚠ Outside hours", and the yellow line reads "1 of your classes is outside your hours." |
| 3.12 | As admin, pick a different teacher in the Teacher select. | The URL changes to that `staffId` and the editor shows their hours. |
| 3.13 | As a teacher, open `/tracker/schedule/availability?staffId=<another teacher>`. | Still your own availability. The API refuses the other ID with 403. |
| 3.14 | Phone: add and save a window using only the keyboard. | Every input has a visible label, no sideways scroll. |

## 4. Conflicts (`/tracker/schedule/conflicts`)

Admin only; anyone else gets a not-found page. There is no button to it yet: type the URL, or watch the badge on the home page's Teacher availability link, which counts the same classes.

The page looks 91 days ahead and lists every scheduled or moved class that does not fit inside one available interval on its date. Nothing is stored; it is computed on each visit, so fixing the cause makes the entry disappear on reload.

Layout: one card per date, each class as "16:00-17:00 · Ryan Test · MHF4U", the reason under it ("Outside available hours" or "Time off"), and a link "Ryan Test's availability". A second card, "No availability entered", lists teachers who have classes but no hours at all; their classes are not checked until they enter hours.

When nothing is wrong: "No classes are outside availability".

### Live tests
| # | Do | Expect |
|---|---|---|
| 4.1 | With test 3.11 in place, open `/tracker/schedule/conflicts`. | One entry on that Monday, reason "Outside available hours", with the teacher's availability link. |
| 4.2 | Open `/tracker`. | Teacher availability shows the badge "1 class outside availability". |
| 4.3 | Add all-day time off on a date with a booked class. | A second entry with reason "Time off". |
| 4.4 | Restore the window to 13:00-17:00 and remove the time off, reload conflicts. | Both entries gone, "No classes are outside availability", badge gone. |
| 4.5 | Get a class onto a teacher who has no hours at all. Booking refuses this, so use the import (section 5): the import does not check availability. | Their name under "No availability entered", not in the dated list. |
| 4.6 | Cancel a conflicting class. | Its entry disappears. Cancelled classes are never conflicts. |
| 4.7 | As a teacher open the page. | Not found. |

## 5. Weekly schedule import (`/tracker/scheduler/schedules`)

Admin only. Note the path starts with `/tracker/scheduler/`, not `/tracker/schedule/`.

This page turns the Weekly Schedule text on each student's Notion page (stage Active or Onboarding) into weekly classes, once. After a student is imported the scheduler owns their schedule: it rewrites the Weekly Schedule property from Postgres after every weekly change, and billing keeps reading that text as before. A hand edit to the Notion text after import is overwritten on the next sync and kept on the page under "Replaced edit" so nothing is lost silently.

### The line format
One class per line, three parts separated by `|`:
```
Wed 18:00-19:00 | SCH4U Chemistry | Ryan Test
```
- Day: Mon, Monday, Tue, Tues, Wed, Thu, Thur, Thurs, Fri, Sat, Sun, any case.
- Time: 24-hour or with am/pm, `-`, `–` or `to` between. A length alone such as `Tue 1h` is rejected (no fixed time).
- Course: free text.
- Teacher: the full name exactly as on their Staff page. They must be Active with the Teacher function.
- Length must be 15 to 480 minutes in 5-minute steps. A duplicate line is rejected. Four or more parts are rejected.

### The cards
- **Import**: runs Check when the page opens. Shows "4 students ready, 2 need repair." and a button "Import 4 students". Check again after fixing Notion. Import writes only the ready students; a student is imported only when every one of their lines is clean. Afterwards: "4 imported." or "3 imported, 1 could not be saved."
- **Needs repair**: each student with their lines marked ✓ (ok) or ✗ with a reason, such as "No teacher in Staff with that full name" or "No start and end time, only a length". Fix the text in Notion, press Check.
- **Imported**: every student the scheduler now owns, with the Notion write-back state: ✓ Synced, … Pending, ✗ Failed with the error and a Retry button. Sync all appears when anything is not synced. "Replaced edit" expands to show a hand edit that was overwritten.
- **Monthly review**: pick a month (defaults to next month). Lists students whose month is not just "the weekly schedule": cancelled dates, moved dates, one-offs, series starting or ending that month, and anything whose Weekly Schedule is pending, failed or out of date ("Sync it before the monthly run"). Use it before the monthly billing run.

### Live tests
| # | Do | Expect |
|---|---|---|
| 5.1 | In Notion give a test student the Weekly Schedule `Wed 18:00-19:00 \| SCH4U Chemistry \| <teacher full name>`. Open the page. | Check runs itself. The student counts as ready. |
| 5.2 | Give another test student `Tue 1h \| Biology \| <teacher>` and press Check. | Under Needs repair with "✗ … No start and end time, only a length". |
| 5.3 | Give a third student a teacher name with a typo. | "No teacher in Staff with that full name". |
| 5.4 | Press Import N students. | "1 imported." The first student moves to Imported, ✓ Synced. The Wednesday class appears on the teacher's week. Notion's Weekly Schedule text for that student is rewritten as `Wed 18:00-19:00 \| SCH4U Chemistry \| <teacher full name>`. |
| 5.5 | Fix the second student's line to `Tue 18:00-19:00 \| …`, Check, Import. | Now imported too. |
| 5.6 | Press Check again. | "No schedules to import" or only the students still needing repair. Imported students are not offered twice. |
| 5.7 | Hand-edit the imported student's Weekly Schedule in Notion, then book a second weekly class for them (section 2). | Notion text is regenerated with both classes. Under Imported, "Replaced edit" shows your hand edit. |
| 5.8 | Cancel one date of that class, then open Monthly review for that month. | The student is listed with "Cancelled: <subject> on <date>". |
| 5.9 | Temporarily break Notion access (revoke the integration's share on Students & Parents), press Sync all. | ✗ Failed with an error and a Retry button; nothing else on the page breaks. Restore the share, Retry: ✓ Synced. |
| 5.10 | As a teacher open the page. | "This page is not available for your account." |

## 6. Today's Notion task (card at the top of `/tracker/schedule`, admin only)

This card appears only when the Work database is wired in (migration 0012, workflow, secrets). The task is a page in Notion's Work database named "Text teachers their schedules — 2026-10-19", with one to-do per active teacher. Each to-do lists that teacher's classes today ("16:00-17:00 Sam Student, MHF4U", cancelled ones prefixed "Cancelled:"), links to their week, and holds a code block with the message to copy and text. A teacher with nothing today says "No classes scheduled today". The page says "Nothing is sent automatically. Tick a teacher after you text them." Nothing is ever sent by the app.

### The card's three states
| Text | Button | Meaning |
|---|---|---|
| Today's Notion task is created at 06:00. | Create now | The hourly run has not made it yet (default time 06:00, set by `DAILY_TASK_TIME`). |
| Today's Notion task is ready. Open in Notion | Refresh now | The page exists. Refresh rewrites any teacher block whose classes changed. |
| Today's Notion task could not be updated. | Retry | The last Notion write failed. Retry never creates a second page. |

Booking, moving, editing or cancelling a class dated today refreshes the task on its own. If that refresh fails the class is still saved and the grid says "Saved. Today's Notion task could not be updated."

The ticks are Charlie's. A refresh never unticks anyone. If a ticked teacher's day changes, their to-do gains "Resend: schedule changed after you texted." and the new times; untick and retick after resending and the label clears on the next refresh.

### Live tests
| # | Do | Expect |
|---|---|---|
| 6.1 | Open `/tracker/schedule` before the task exists, press Create now. | Card switches to "ready" with an Open in Notion link. In Notion: one page for today, one unchecked to-do per active teacher, sorted by name, Owner Charlie, State Next. One Work Log entry. |
| 6.2 | Press Refresh now. | Still one page. No new Work Log entry. |
| 6.3 | Tick one teacher in Notion, then move one of their classes today, press Refresh now. | Their to-do shows the new time and "Resend: schedule changed after you texted." The tick is still there. Other teachers' blocks untouched. |
| 6.4 | Untick and retick after "resending", press Refresh now. | Label gone, tick stays. |
| 6.5 | Book a class for today in the grid. | Task updates by itself, no button press. |
| 6.6 | Check the hourly GitHub run the next morning. | The task for that day exists at or after the configured time without anyone pressing Create now. |
| 6.7 | As a teacher, `GET /tracker/api/scheduler/daily-task`. | 403. |

## What the scheduler never touches
Lessons, Teacher Payouts, Paid to Teacher and Pay Period in Notion, and the grade-tracker tables in Postgres. If any live test changes one of those, stop and report it: that is a bug, not a feature.

## Results
Copy this into the Notion card or a message and fill it in.

| Section | Tests passed | Failed (number and what you saw) | Device |
|---|---|---|---|
| 1 Week calendar | /11 | | |
| 2 Booking and moving | /21 | | |
| 3 Availability | /14 | | |
| 4 Conflicts | /7 | | |
| 5 Import | /10 | | |
| 6 Daily task | /7 | | |
