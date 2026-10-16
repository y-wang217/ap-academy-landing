# REQ-36: Feedback 0: ADR for option B, Notion edits people, Supabase holds synced operational copies, the app reads local

Card: https://app.notion.com/p/3fbd6ae73dd781459b0cfac4b62043bb (design approved there; this is the build copy).

**Summary:** Adds workspace ADR 0004 recording option B, with a field-ownership table, a reader and writer inventory, lifecycle rules and the parent-data boundary, marks the superseded parts of tracker ADRs 0033 and 0037, and adds one vitest file that keeps the ADR honest.

**Risk:** Low. Documentation plus one test that reads files; no runtime code, table, permission or data flow changes in this card. The High-risk work is REQ-38 (Feedback 9).

## Problem
Charlie chose option B on 2026-10-16: people are edited in Notion (Staff, Students & Parents), Supabase holds synced operational copies, the tracker reads the local copies. Today the rules for who edits what, what may be copied, and what happens on rename, archive, revoke and delete exist only in people's heads, and two accepted tracker ADRs (0033 and 0037) still describe the live five-minute Notion read. REQ-38 builds the sync and needs a written decision and a field inventory to build from.

## Acceptance criteria
- AC1: `docs/adr/0004-notion-edits-people-supabase-reads-local.md` exists, in the format of `docs/adr/0003-event-chained-pipeline.md` (Status, Date, Decided by Charlie), with the sections Context, Decision, Options rejected, Field ownership, Readers and writers, Lifecycle, Consequences, Numbering. Options A and C are each named with the reason they were rejected.
- AC2: The Field ownership table has one row per field: staff name, staff greeting name, staff active (Status plus Function), staff subjects, staff email, student display name, student stage, student Notion page id, student grade, parent name, parent email. Each row gives editor of record, readers, copied to Supabase (Yes or No) and retention. Exactly these six are Yes: staff name, staff active, staff subjects, student display name, student stage, student Notion page id. Staff greeting name is No, derived at read time from the copied name. Parent name and parent email are No, citing Iris spec decision 28.
- AC3: The Readers and writers table lists every file path with a State column of `exists`, `planned` or `outside repo`. Every `exists` path is a real file on the branch. It includes at least the files named in the card, the billing reader, the daily-task route, the parent calendar page and data file, the Notion link writer, the staff link seed, `lib/notion/parents.ts` as `planned`, and the monthly-admin and onboarding skills as `outside repo`.
- AC4: The Lifecycle section has one rule each for rename, archive or Lost or Churned stage, staff deactivated, and delete in Notion (copy follows on next sync; row kept, inactive, hidden from pickers, series untouched; teacher scope lost on the next request after the sync even with a live staff link; soft delete locally, never cascade to series).
- AC5: The Status lines of tracker ADRs 0033 and 0037, and their rows in `apps/tracker/docs/decisions/README.md`, read "accepted in part" and name the superseded part and workspace ADR 0004. The decision text of both ADRs is unchanged.
- AC6: The repo-root `CLAUDE.md` and `apps/tracker/CLAUDE.md` each link to the new ADR.
- AC7: When the tracker vitest suite reads the full text of the ADR from disk, it finds zero em-dash characters (U+2014); if one is present, the test fails and names the line number that contains it.
- AC8: The Numbering section says migration and ADR numbers in specs (Iris reserves migrations 0018 to 0020 and tracker ADRs 0050 to 0058) are placeholders, and the file on `main` wins.
- AC9: The ADR states that Notion page ids are the join key everywhere and Supabase row ids are local, naming `tracker.class_series.notion_student_id`, `tracker.students.notion_student_id`, `tracker.staff_links.notion_staff_id` and `tracker.schedule_summaries.notion_student_id`.

## Approach
New file `docs/adr/0004-notion-edits-people-supabase-reads-local.md`. Header: Status Accepted, Date 2026-10-16, Decided by Charlie, Implemented by REQ-38, Supersedes parts of tracker ADR 0033 and 0037. Sections Context, Decision (contains verbatim: "Notion page ids are the join key everywhere: `tracker.class_series.notion_student_id`, `tracker.students.notion_student_id`, `tracker.staff_links.notion_staff_id` and `tracker.schedule_summaries.notion_student_id` hold Notion ids, and Supabase row ids are local."), Options rejected (A, C), Field ownership (pipe table: Field, Editor of record, Readers, Copied, Retention), Readers and writers (pipe table: Path, Role, Data, State), Lifecycle, Consequences (freshness lag, Notion down, revocation path, stale or failed sync, personal data, planned table names), Numbering.

Edited files:
- `apps/tracker/docs/decisions/0033-scheduler-staff-identity.md`: Status line becomes `accepted in part; the live Notion read and five-minute recheck are superseded by workspace ADR 0004 once REQ-38 ships`. Nothing else.
- `apps/tracker/docs/decisions/0037-teachers-see-own-student-names.md`: Status line becomes `accepted in part; the names cache and "never stored" are superseded by workspace ADR 0004 once REQ-38 ships`. Nothing else.
- `apps/tracker/docs/decisions/README.md`: the 0033 and 0037 rows get the same status text.
- `CLAUDE.md` (root): one line under the opening paragraph pointing at the ADR.
- `apps/tracker/CLAUDE.md`: rule 9 gets a pointer to workspace ADR 0004.

New test `apps/tracker/lib/people-adr.test.ts` (vitest, the `readFileSync` pattern of `lib/domain/boundaries.test.ts`).

## Migration
None. The tables are REQ-38's.

## Test plan
All in `apps/tracker/lib/people-adr.test.ts`, unit:

| Test | Covers |
|---|---|
| ADR file exists; header fields and eight section headings; Options rejected names A and C | AC1 |
| Field ownership has the eleven fields; Copied Yes for exactly the six; greeting name, staff email, grade, parent name and parent email say No; parent rows mention decision 28 | AC2 |
| Every `exists` row names a path `existsSync` finds from the repo root; required paths present, `lib/notion/parents.ts` planned, both skills outside repo | AC3 |
| Lifecycle has rename, archive, staff deactivated and delete, and the phrases "never cascade to series", "next request" and "even if", each asserted separately | AC4 |
| 0033 and 0037 Status lines and README rows contain "accepted in part" and "0004"; Decision sections equal the text on `main` | AC5 |
| Root and tracker `CLAUDE.md` contain the ADR path | AC6 |
| Lines containing U+2014 list is empty; failure names the line numbers | AC7 |
| Numbering contains "placeholders" and "the file on `main` wins" | AC8 |
| Decision section contains the four Notion id columns and "Supabase row ids are local" | AC9 |

No e2e. Gate: `pnpm --filter tracker test`, `lint`, `typecheck`.

## Out of scope
Any table, sync job, reader change or UI (REQ-38 and Feedback 6). Editing the Iris spec. Changing the rule text of any accepted tracker ADR beyond its Status line. A `docs/adr/README.md` index (none exists; not created).

## Decisions for approval (defaults taken)
1. No new dependencies. 2. No schema in this card. 3. Field inventory inside the ADR. 4. Test in tracker vitest. 5. Supersession "once REQ-38 ships". 6. Staff active copied as one boolean. 7. Hourly sync on the :05 cron plus owner sync now, stale after 2 hours, as `TUNING` defaults. 8. Staff email not copied. 9. Pointers in both `CLAUDE.md` files. 10. Designed first as Feedback 0. 11. Staff greeting name derived at read time, not copied.
