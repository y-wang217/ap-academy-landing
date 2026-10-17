# REQ-32: Permission matrix for owner, scheduling teacher, grade teacher, student and parent, written and tested

Copied from the approved design on the Notion card (Feedback 5). Charlie approved it by hand (High risk).

## Build notes (differences from the design, decided at build time)
- **Migration number.** The design names `0018_audit_log_reader_scope.sql` "or the next free number". 0018 and 0019 are taken on `main` (REQ-30, REQ-31), so the file is `supabase/migrations/0020_audit_log_reader_scope.sql`, shipped first in its own PR.
- **ADR number.** "0050 or the next free number": 0050 and 0051 are taken, so the ADR is `apps/tracker/docs/decisions/0052-permission-matrix.md`.
- **Tables.** REQ-30 added `booking_stamps` and `schedule_writes` before this build, so the matrix covers 23 tables (owner-only per REQ-30's design), as the design's Risks section foresaw.
- **Doc layout.** One small `| role | access |` table per tracker table, grouped by area, instead of one wide table per group, so each stays readable at phone width and parses line by line.
- **SQL matrix columns.** The `expected` rows carry an `rpc` column naming the functions a role writes a table through (for example `set_assessment_done`), so "write" in the doc matches "a direct write or a write function" in the SQL.
- **Combinations (AC9).** Each combination login is read with only its first role, only its second, and both, by changing that login's rows as superuser between reads. The "both" keys must equal the union of the two single-role reads, and each write flag the OR of the two. This computes the union from the roles rather than restating it.
- **Revoked staff link.** After revocation the teacher still reads their own `staff_links` row, now with `revoked_at` set (the 0009 policy "others their own" has no live check). It is history, not scheduling data; the matrix and the test record it.

---

**Summary:** One written permission matrix (doc plus ADR) for the five roles and four multi-role combinations across every `tracker` table and Notion-backed read, proven cell by cell by a data-driven RLS test and direct PostgREST checks, plus one fix: a grade teacher stops reading audit rows of tables they cannot read.
**Risk:** High (it changes what a signed-in user can see: migration 0018 narrows the `tracker.audit_log` read policy, and the card's whole subject is RLS and permissions).

## Problem
Owner (Charlie), grade teachers, scheduling-only teachers, students and parents each get access from a different source (`memberships`, `staff_links`, `students.user_id`, `parent_links`), and no single document says what each one may read or write. Multi-role logins (an owner who teaches, a teacher who is also a parent) and revocation are untested. Charlie decided on 2026-10-16 that scheduling-only teachers see assigned students only. This card is for Charlie and every future reviewer: one contract, and tests that fail when the database drifts from it.

**What the audit found (current code, before this card):**
- Scheduling-only teacher: already "assigned only". `class_series` is read only where `notion_staff_id = tracker.my_staff_id(org_id)`, and `class_exceptions` only through those series (`0010_scheduler_core.sql`). Availability is limited to their own rows. They get zero rows from `students` and the grade tables because `tracker.is_org_staff()` needs a membership. Student names reach them only through `loadWeek` in `apps/tracker/lib/scheduler/schedule-handlers.ts`, looked up after their own occurrences are chosen (ADR 0037). Every scheduler read runs on the user's client (`lib/scheduler/deps.ts`, `lib/data/schedule.ts`), so RLS is the control. Nothing is wider for this role, and no policy change is needed. Their series rows are narrower than "students who have a series with that teacher": a teacher reads only their own series, not another teacher's series for the same student. The matrix records that narrower rule.
- **Wider than the contract:** the `tracker.audit_log` policy "staff read their org's audit log" (`0005_tracker_audit.sql`) uses `is_org_staff`. A grade teacher therefore reads the audit rows (full before and after JSON) of `parent_links` (parent emails), `staff_links` (staff emails), `schedule_summaries` (Weekly Schedule text), and the classes and availability of every teacher, which are all tables their own policies hide. The fix is migration 0018.
- Multi-role at the database level is already a union, because each policy is an `or` of the per-role helpers and the helpers read different tables. A grade teacher who claims a parent link keeps the `teacher` membership (`claim_parent_invites` uses `on conflict do nothing` on the `(user_id, org_id)` key), and `is_my_linked_student` reads `parent_links`, not the membership. So the union holds there too.
- Landing order, a documentation gap only: ADR 0045 says "staff wins", but `getViewer` in `apps/tracker/lib/data/queries.ts` counts only memberships as staff. So a scheduling teacher who is also a parent lands on `/parent`. Their scheduler pages still work by URL. No access is wider or narrower; the ADR wording is corrected.

## Acceptance criteria
- [ ] AC1: `apps/tracker/docs/permission-matrix.md` exists. Its rows are owner, grade teacher (`teacher` membership), scheduling-only teacher (live `staff_link`, no membership), student, parent, and the combinations owner + staff link, grade teacher + staff link, staff link + parent link, and grade teacher + parent link. Its columns are every base table in the `tracker` schema plus five Notion-backed reads: staff list, student names, Weekly Schedule text, daily task, and parent billing. Each cell says `none`, `read` or `read, write` (naming insert, update or delete, or the RPC), the row scope (org, own, linked published child, own series), and the policy or server check that enforces it.
- [ ] AC2: A new tracker ADR (`apps/tracker/docs/decisions/0050-permission-matrix.md`, or the next free number at build time) states the contract: scheduling-only teachers see their own series only; multi-role is the union and nothing more; revocation cuts access on the next request; a parent never reads another family's rows; and the audit-log narrowing. It also corrects ADR 0045's "staff wins" line to say what the code does, and amends the audit sentence in the ADR 0033 Consequences. The README index and `docs/PLAN.md` get one line each.
- [ ] AC3: `pnpm test:rls` fails when the set of base tables in schema `tracker` differs from the tables in the test's expected matrix, so a new table cannot ship unclassified. It also fails if any view exists in `tracker` (there are none today).
- [ ] AC4: For every role or combination and every table, a select as that user returns exactly the expected rows from a two-org, two-family fixture. Every `none` cell returns zero rows.
- [ ] AC5: For every role and table where a write is `none`: insert raises `42501`, and update and delete either raise `42501` or affect zero rows. The test then confirms the target row is unchanged, as superuser.
- [ ] AC6: Every write in a non-`none` cell has a positive test: the role's insert, update or delete succeeds on an in-scope row, or its RPC does (`set_assessment_done`, `set_task_done`, `flag_assessment`, `remove_parent_link`, `unlink_student`, `adopt_student_schedule`, `split_class_series`, `claim_daily_task`).
- [ ] AC7: A scheduling-only teacher reads only `class_series` rows with their own staff ID, only `class_exceptions` of those series, and only their own availability rows. They read zero rows from `students`, the grade tables, `schedule_summaries`, `daily_tasks`, `daily_task_teachers`, `parent_links`, `audit_log` and other teachers' availability, and cannot insert or update `class_series` or `class_exceptions`.
- [ ] AC8: After migration 0018, an owner reads every audit row of the org. A grade teacher reads only audit rows whose `table_name` is one of `students`, `goals`, `courses`, `syllabus_versions`, `categories`, `assessments`, `tasks` or `grade_flags`, and zero rows for `staff_links`, `parent_links`, `schedule_summaries`, `class_series`, `class_exceptions`, `availability_windows`, `availability_exceptions` and `memberships`. A student, parent, scheduling-only teacher or another org's owner reads zero.
- [ ] AC9: For each combination, the visible rows per table equal the union of the visible rows of its single roles. The test computes the union from the single-role expectations rather than restating it, and the write cells are the union too. In particular: grade teacher + staff link reads no other teacher's series, and staff link + parent link reads the teacher's own series plus the child's series, and nothing else.
- [ ] AC10: Revocation takes effect on the next statement. After the owner sets `staff_links.revoked_at`, that login reads zero scheduling rows and cannot insert availability. After `remove_parent_link`, the parent reads zero rows of that child in every table. After the membership row is deleted, the former grade teacher reads zero grade rows. For a combination, revoking one role leaves exactly the other role's rows: staff link + parent link with the link revoked becomes a parent only, and grade teacher + parent link with the link removed keeps the `teacher` membership.
- [ ] AC11: A parent of student A reads zero rows of student B from `students`, `goals`, `courses`, `syllabus_versions`, `categories`, `assessments`, `tasks`, `grade_flags`, `ai_drafts`, `parent_links`, `class_series`, `class_exceptions`, `schedule_summaries` and `audit_log`, and this holds in the same org and across orgs. `my_children()` lists only A. Every function granted to `authenticated`, called by that parent with B's IDs, raises or returns nothing and changes no row.
- [ ] AC12: The Notion-backed columns match the server checks. In a table-driven Vitest test, each scheduler route handler is called with identities `admin`, `teacher` and `none` (a grade teacher with no staff link resolves to `none`), and the status code equals the matrix. A teacher's week carries names only for students in their own occurrences, even when the names map holds more.
- [ ] AC13: In `pnpm test:tracker`, direct PostgREST calls (no UI) with real JWTs prove two things. The seeded parent gets `[]` for another family's `students`, `class_series` and `assessments`. Teacher Ryan gets only his own `class_series` and `[]` from `students`. Then, at the end of the flow, the owner revokes Ryan's staff link through PostgREST, removes the parent link through `rpc/remove_parent_link` and deletes `teacher2`'s membership by psql, and the next PostgREST read by each returns `[]`.
- [ ] AC14: A Vitest test fails if the matrix cells in `permission-matrix.md` and the expected matrix in the SQL test disagree.

## Approach
**Docs (feature PR)**
- New `apps/tracker/docs/permission-matrix.md`. The matrix is one markdown table per group so it stays readable at phone width: grade tables, scheduling tables, links and membership, audit, and Notion reads. A legend explains the cell grammar of AC1. The contract it records:
  - `orgs`: read for anyone with a membership in that org. A scheduling-only teacher has none, so `none` for them. No client writes.
  - `memberships`: own rows read only. No client writes; they change only through the claim RPCs, `unlink_student`, `remove_parent_link`, or the operator's SQL.
  - `students`: owner and grade teacher read, insert and update in the org (column grants; owner only for `notion_student_id`, ADR 0048). Student reads their own row once published. Parent reads linked published children. Scheduling-only teacher `none`.
  - `goals`, `courses`, `syllabus_versions`, `categories`, `assessments`, `tasks`: owner and grade teacher read, insert, update and delete in the org. Student reads their own once published, and writes only the done stamp through `set_assessment_done` and `set_task_done`. Parent reads linked published children. Scheduling-only teacher `none`.
  - `grade_flags`: owner and grade teacher read and update `resolved_at`. Student reads their own and writes through `flag_assessment` and `unflag_assessment`. Parent and scheduling-only teacher `none`.
  - `ai_drafts`: owner and grade teacher read, insert and update. Others `none`.
  - `audit_log`: owner reads the org. Grade teacher reads the grade-table rows only (after 0018). Others `none`. Nobody writes; the trigger appends.
  - `staff_links`: owner reads, inserts, and updates `email` and `revoked_at`. A linked teacher reads their own row. Others `none`.
  - `availability_windows`, `availability_exceptions`: owner reads and writes the org. Scheduling-only teacher reads and writes their own. Others `none`.
  - `class_series`, `class_exceptions`: owner reads, inserts and updates (also `split_class_series`). Scheduling-only teacher reads their own series and those series' exceptions. Parent reads the linked published child's. Grade teacher and student `none`.
  - `schedule_summaries`, `daily_tasks`, `daily_task_teachers`: owner only (also `adopt_student_schedule` and `claim_daily_task`).
  - `parent_links`: owner reads, inserts, and removes through `remove_parent_link`. Parent reads their own rows. Others `none`.
  - Notion staff list: owner reads all active teaching staff with email (`/api/scheduler/staff`, admin). Scheduling-only teacher reads their own record without email (`/me`, `/staff/[id]` with `assertStaffAccess`). Others `none` (scope `none` is 403).
  - Notion student names: owner reads all (import, all-teachers week). Scheduling-only teacher reads names only for their own occurrences (`loadWeek`, ADR 0037). A parent sees a sibling's first name only on a shared invoice in the same Billing Family (ADR 0049); the child's own name comes from `students`. Others `none`.
  - Weekly Schedule text: owner reads and writes (import handlers and summary sync, admin). Others `none`.
  - Daily task: owner (daily-task handlers, admin). Others `none`.
  - Parent billing (invoices, credits, PDFs): parent for linked children only, gated on `students.notion_student_id` read under RLS (ADR 0049). Others `none`, which includes the owner, who has no billing view in the tracker.
  - Multi-role: the union, row by row. Landing at `/tracker`: owner, then grade teacher, then student, then parent (`getViewer`). Scheduler identity: owner, then staff link (`resolveSchedulerIdentity`).
  - Known limit: a staff record's Notion Status is checked only in the app (within the five-minute cache, ADR 0033). The database cut-off is `staff_links.revoked_at`, so offboarding means revoking the link.
- New ADR (0050 or next free). Edit only the Status line and a one-line "Amended by" note in ADRs 0033 and 0045, plus the README row, so the decision text keeps its history. One line in `apps/tracker/docs/PLAN.md`.

**Tests (feature PR)**
- New `supabase/tests/permission_matrix.sql`, run by the existing `run-rls.sh`. Same style as `parent_links.sql`: seed as superuser, then for each actor `set local role authenticated` and `set local request.jwt.claims`.
  - Fixture: Org One with owner O1 (who also holds a staff link), grade teacher GT (also staff linked in the combo cast), scheduling teachers ST1 and ST2, students A and B (both published, in different families) and C (unpublished), parents PA (of A) and PB (of B), and the combo logins. Org Two has its own owner and one student. Each grade table, `grade_flags`, `ai_drafts`, each scheduling table, summaries, daily tasks and links gets at least one row per student, teacher and org, so each scope is visible as a different count.
  - `create temp table expected(actor text, tbl text, rows int, ins bool, upd bool, del bool)` holds the matrix for the single roles. The combo rows are derived with an explicit union of the single roles' row ids (AC9).
  - Loop 1 (AC3): compare `information_schema.tables` for `tracker` with `distinct tbl`, and assert there are zero views.
  - Loop 2 (AC4, AC5): for each actor and table, compare the `count(*)` with `rows`, then try insert, update and delete of a known in-scope or out-of-scope row inside a subtransaction (`begin ... exception`), against the flags. Each check emits `raise notice 'ok: <actor> <tbl> <op>'`, so the log lists every cell.
  - Named blocks for AC6 (positive writes and RPCs), AC7, AC8, AC10 (revocation, run last, each in order: revoke as owner, then read as the revoked user in the next statement) and AC11 (cross-family, including every `authenticated`-granted function, listed from `information_schema.routine_privileges` so a new RPC must be classified).
- New `apps/tracker/lib/permission-matrix.test.ts` (Vitest, AC14). It reads `docs/permission-matrix.md` and `../../supabase/tests/permission_matrix.sql` with `fs`, parses the markdown cells to `{actor, tbl, read, write}` and the SQL `expected` values, and asserts they agree on read versus none and write versus none per cell. It parses text only and imports nothing across apps.
- New `apps/tracker/app/api/scheduler/scope-matrix.test.ts` (AC12). It drives the existing handlers (`handlers.ts`, `schedule-handlers.ts`, `import-handlers.ts`, `daily-task-handlers.ts`) with fake deps for each scope and asserts the status from a table that mirrors the doc's Notion columns. It reuses `booking-world.fake.ts` where it fits. It adds a week case where the names map holds an extra student.
- `e2e/tracker/flows.mjs` (AC13): a final block "REQ-32 direct API". A helper `restAs(email, path, init)` takes the access token from the `/__session` cookie (or calls `sign()` from `mock-supabase.mjs`) and calls `${MOCK}/rest/v1/...` with `Accept-Profile` and `Content-Profile: tracker`. It reuses the existing parent, Ada and Cy, Ryan, Kuby and `teacher2` fixtures. It runs last because it revokes access.

**Migration (own PR first, see below).** No app code changes, because no app code reads `audit_log` (searched `apps/tracker/lib` and `apps/tracker/app`).
**UI:** none.

## Migration
- File: `supabase/migrations/0018_audit_log_reader_scope.sql` (0018 is next free today. REQ-30 and REQ-31 also name 0018 "or next free", so the builder takes the next free number on `main` at build time.)
- Creates:
  - `drop policy "staff read their org's audit log" on tracker.audit_log`.
  - `create policy "owner reads their org's audit log" ... for select to authenticated using (tracker.is_org_owner(org_id))`.
  - `create policy "grade staff read grade audit rows" ... for select to authenticated using (tracker.is_org_staff(org_id) and table_name in ('students','goals','courses','syllabus_versions','categories','assessments','tasks','grade_flags'))`.
  - Grants unchanged (select to `authenticated`, no writes). The trigger and append-only guards are unchanged. No rows change.
- Check: `supabase/tests/audit_reader_scope.sql`. As grade teacher: grade-table audit rows visible; `staff_links`, `parent_links`, `schedule_summaries`, `class_series`, `class_exceptions`, `availability_*` and `memberships` rows return zero. As owner: all rows. As another org's owner, a student, a parent and a scheduling-only teacher: zero. The existing `audit.sql`, `scheduler_identity.sql` and `parent_links.sql` audit checks still pass (the builder confirms each runs as superuser or owner).
- Ships as its own PR first (`req/REQ-32-migration`, `needs-human-merge`, applied by Charlie). The feature PR assumes it is live.

## Test plan
| Test | Type | Covers |
|---|---|---|
| Reviewer reads `permission-matrix.md`, the new ADR, and the 0033, 0045, README and PLAN edits; the AC14 test proves the cells parse | review plus unit | AC1, AC2 |
| `supabase/tests/permission_matrix.sql` loop 1: table set equals the matrix, no views | integration (RLS) | AC3 |
| `permission_matrix.sql` loop 2: count, insert, update and delete per actor and table | integration (RLS) | AC4, AC5 |
| `permission_matrix.sql` positive writes and each RPC | integration (RLS) | AC6 |
| `permission_matrix.sql` scheduling-only teacher block | integration (RLS) | AC7 |
| `supabase/tests/audit_reader_scope.sql` (migration PR) and the audit rows of `permission_matrix.sql` | integration (RLS) | AC8 |
| `permission_matrix.sql` union block for the four combinations | integration (RLS) | AC9 |
| `permission_matrix.sql` revocation block; `flows.mjs` REQ-32 revocation via PostgREST and psql | integration (RLS) plus e2e | AC10, AC13 |
| `permission_matrix.sql` cross-family block, every granted function; `flows.mjs` parent `[]` checks | integration (RLS) plus e2e | AC11, AC13 |
| `app/api/scheduler/scope-matrix.test.ts` | unit | AC12 |
| `lib/permission-matrix.test.ts` | unit | AC14 |

`flows.mjs` is under `e2e/`, an `e2e_paths` entry, so the builder runs `pnpm test:tracker` locally before the feature PR, and `pnpm test:rls` for both PRs.

## Out of scope
New roles. Changing what the owner can do. Notion-side sharing. Any UI change, including a link from the parent shell to the schedule for a dual-role login (see Decision 5). Reading Notion Status in the database. Admin UI for removing a grade teacher's membership (it stays an operator SQL step, recorded in the matrix). Tables that REQ-30 or REQ-31 add: whichever card lands second adds its rows to the matrix, or AC3 fails.

## Risks and edge cases
- **A parallel card adds a table or column first** (REQ-30 adds `booking_stamps` and `schedule_writes`). AC3 makes `test:rls` fail until the matrix classifies the new table, which is the intended guard. The builder rebases and adds the rows (owner-only per REQ-30's design).
- **Existing audit tests:** `scheduler_core.sql`, `scheduler_import.sql` and `scheduler_identity.sql` count scheduler audit rows. If any of them runs that count as a grade teacher, it breaks under 0018. The builder checks each one; they appear to run as superuser.
- **Postgres semantics:** RLS turns a denied update or delete into zero affected rows, not an error. AC5 accepts either and checks that the row is unchanged, instead of the card's hint "a denied write errors". Insert does error.
- **Fixture size:** the matrix test is data-driven, so it adds one file and a fixture of around 60 rows, not hundreds of hand-written checks. Its runtime adds a few seconds.
- **Drift between doc and SQL:** covered by AC14. The doc remains the human source; the SQL `expected` block mirrors it.
- **A Notion-inactive teacher with a live link** can still read their own schedule rows through direct PostgREST until the link is revoked. This is documented as the known limit; offboarding is "revoke the link".

## Decisions for approval
| # | Decision | Options | Default if you say nothing |
|---|---|---|---|
| 1 | New dependencies | None | None |
| 2 | Schema placement | Policy change on `tracker.audit_log` in a migration; or no migration | `supabase/migrations/0018_audit_log_reader_scope.sql` (or next free). Replaces the one audit read policy: owner reads all, grade teacher reads only grade-table rows. No new table or column |
| 3 | Audit log for grade teachers | (a) grade-table rows only; (b) owner only; (c) leave as is and record it in the matrix | (a). It matches their table access exactly, and no app code reads the log today |
| 4 | Which combinations count as "the three that exist today" | owner + staff link, grade teacher + staff link, staff link + parent link; optionally grade teacher + parent link | All four. The fourth is possible in the schema and costs one fixture login |
| 5 | Dual-role landing (staff link + parent link lands on `/parent`) | Correct the ADR 0045 wording only; or also add a schedule link in the parent shell | Wording only. Access is already the union; a UI link is a later card |
| 6 | Scheduling teacher reads series of their students that other teachers teach | Keep own series only; widen to every series of an assigned student | Keep own series only (narrower than the card's wording, no policy change) |
| 7 | Denied write semantics | Error only; error or zero rows with the row unchanged | Error for insert; error or zero rows for update and delete, row verified unchanged |
| 8 | Notion-backed columns | The card's four; plus parent billing | Five: the four plus parent billing (ADR 0049), since parents read it |
| 9 | Matrix source of truth | Markdown doc plus mirrored SQL with a Vitest drift check; a JSON file generating both | Doc plus mirrored SQL plus the AC14 drift test. No generator |
| 10 | Membership revocation path | Operator SQL (as today); a new owner RPC | Operator SQL, tested by psql in e2e and SQL in `test:rls`. A new RPC would change what the owner can do, which is out of scope |
| 11 | New test files beyond the card's hints | `permission_matrix.sql`, `audit_reader_scope.sql`, `lib/permission-matrix.test.ts`, `app/api/scheduler/scope-matrix.test.ts`, the REQ-32 block in `flows.mjs` | All five, as in this design |
| 12 | ADR edits | Rewrite 0033 and 0045; Status line and an "Amended by" note only | Status line and an "Amended by" note only; the new ADR carries the corrected wording |
| 13 | Card pick order | REQ-32 and REQ-41 tied at P1 Ready | REQ-32 taken as the older card |
