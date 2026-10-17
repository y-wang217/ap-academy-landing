# 0052: One permission matrix for every role, proven cell by cell
Status: accepted
Date: 2026-10-17

## Context
The 2026-10-16 readiness review (finding F11, REQ-32) found no single contract for who reads and writes what. Access comes from four places: `memberships` (owner, grade teacher, student, parent), `staff_links` (scheduling-only teachers, ADR 0033), `students.user_id` and `parent_links` (ADR 0045). Logins that hold two of them (an owner who teaches, a teacher who is also a parent) and revocation were untested. Charlie decided on 2026-10-16 that scheduling-only teachers see assigned students only.

An audit of the policies against that decision found one rule wider than intended: `tracker.audit_log` was readable by any org staff (`is_org_staff`, migration 0005), so a grade teacher read the full before and after rows of `parent_links` and `staff_links` (emails), `schedule_summaries` (Weekly Schedule text), every teacher's classes and availability, and membership removals. Their own policies hide every one of those tables.

## Decision
- **One matrix.** [`docs/permission-matrix.md`](../permission-matrix.md) lists, for the owner, grade teacher, scheduling-only teacher, student and parent and the four combinations that exist today, every table in the `tracker` schema and five Notion-backed reads (staff list, student names, Weekly Schedule text, daily task, parent billing). Each cell says `none`, `read` or `read, write`, the row scope, and the policy or server check that enforces it.
- **Proven, not described.** `supabase/tests/permission_matrix.sql` holds the same matrix as data and checks every cell against a real Postgres: the rows each role reads from a two-org, two-family fixture, and whether a direct insert, update and delete get past the grants and RLS. It fails when a `tracker` table is missing from the matrix or a view appears. `lib/permission-matrix.test.ts` fails when the doc and the SQL disagree. `app/api/scheduler/scope-matrix.test.ts` checks the scheduler route guards behind the Notion rows.
- **Scheduling-only teachers see their own series.** A staff link reads only `class_series` rows with its own staff ID, those series' exceptions and its own availability. That is narrower than "every series of a student they teach": another teacher's class for the same student stays hidden. No policy changed for this role.
- **Multi-role is the union, and nothing more.** Every policy is an `or` of role helpers that read different tables, so two roles see exactly what either sees. The SQL test reads each combination with each role alone and with both, and compares.
- **Revocation is the next statement.** Revoking a staff link (`revoked_at`), removing a parent link (`remove_parent_link`) or deleting a membership cuts that role's access on the next request. Removing a grade teacher's membership stays operator SQL; a new owner function would change what the owner can do, which is out of scope.
- **A parent never reads another family.** Every parent policy goes through the caller's own `parent_links` rows. The SQL test calls every function granted to `authenticated` with another family's IDs, in the same org and across orgs, and requires it to raise or return nothing and change no row. A new function fails the test until it is classified.
- **Audit log readers narrowed (migration 0020).** The owner reads every audit row of the org. A grade teacher reads only rows of the eight grade tables (`students`, `goals`, `courses`, `syllabus_versions`, `categories`, `assessments`, `tasks`, `grade_flags`). Everyone else reads none. No app code reads the log.
- **Denied writes.** An insert that RLS refuses raises `42501`; a refused update or delete raises `42501` or touches no row, because that is how RLS behaves. The test accepts either and checks the row is unchanged.
- **Landing, as the code does it.** `getViewer` sends a login to owner, then grade teacher, then student, then parent. A staff link is not a membership, so a staff link + parent link login lands on `/parent`; its scheduler pages still work by URL. Access is the union either way. This corrects ADR 0045's "staff wins" line, which read as if a staff link counted.

## Alternatives considered
- **Audit log owner only.** Simpler, but a grade teacher would lose the history of the grade tables they edit.
- **Leave the audit log and record it in the matrix.** Records a known leak of emails and schedule text instead of closing it.
- **Widen scheduling teachers to every series of their students.** The card's wording allows it, but it shows other teachers' classes and adds a policy for no current need.
- **A JSON file that generates the doc and the SQL.** One source, but a generator to maintain; the drift test keeps two plain files honest.
- **A schedule link in the parent shell for dual-role logins.** A UI change for a later card.

## Consequences
- Migration 0020 ships in its own PR and must be live before the feature PR merges.
- Amends ADR 0033 (its Consequences said the audit log is readable by org staff) and ADR 0045 (the "staff wins" line). Their decisions otherwise stand.
- A new table or function fails `pnpm test:rls` until it is added to the matrix, the doc and the SQL test, in the same PR.
- Known limit: a staff record's Notion Status is checked only in the app. The database cut-off is `staff_links.revoked_at`, so offboarding a teacher means revoking the link.
