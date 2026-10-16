# 0037: Teachers see the names of their own scheduled students
Status: accepted in part; the names cache and "never stored" are superseded by workspace ADR 0004 once REQ-38 ships
Date: 2026-10-14
## Context
Scheduler 5/8 (REQ-6) adds a read-only week calendar. A class card is only useful with a student name on it, but until now student names reached the browser only on Charlie's import page. Teachers are not org members and have no Notion access of their own.
## Decision
- **Names-only Notion read.** `fetchStudentNames` asks Notion for the `Student Name` property alone (`filter_properties`), for students at stage Active or Onboarding. The Weekly Schedule text, parent fields and relations are never requested on this path.
- **Filtered by the occurrences returned.** The names lookup runs after the caller's occurrences are chosen, and only for the student IDs in them. A teacher response is never built from the full name map. A strict output schema and a test with extra students enforce it.
- **Cache holds names only.** `getStudentNames` is cached for five minutes as `[id, name][]`. A renamed student shows the old name for up to five minutes.
- **Null on failure.** If the lookup fails, or a student is not in Active or Onboarding, `studentName` is `null`, cards say "Student", the response carries `namesLoaded: false` on a failure, and the week still returns 200.
- **`namesLoaded`.** The week response says whether the lookup worked, so the page can show one notice instead of guessing from null names.
- **Never stored or logged.** Names are not written to Postgres and not logged.
- **Remaining hours** are available minutes minus the booked minutes that fall inside availability. A class outside hours does not reduce "left", and the result is never below 0. Class spans are unioned per day first, so overlapping classes subtract once.
- **The student link** in the class dialog goes to the student's Notion page for everyone. Notion's own sharing decides whether it opens.
## Alternatives considered
- Initials only for teachers: less useful, and the spec asks for the student on the card.
- A per-page Notion read for each missing name: one request per student, for a rare case.
- Remaining = available minus all scheduled minutes: can go negative and punishes a misplaced class twice.
## Consequences
No migration, no new dependency, no new Notion permission. The Risk is High only because teachers now receive student names (personal data). Students outside Active or Onboarding show as "Student".
