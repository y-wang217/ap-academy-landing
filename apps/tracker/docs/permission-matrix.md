# Permission matrix

Who reads and writes what in the Student Tracker and the Scheduler, for every
role and every table in the `tracker` schema, plus the five reads that come
from Notion. Decided in [ADR 0052](decisions/0052-permission-matrix.md).

`supabase/tests/permission_matrix.sql` proves every cell against a real
Postgres (`pnpm test:rls`), `app/api/scheduler/scope-matrix.test.ts` proves the
Notion rows' server checks, and `lib/permission-matrix.test.ts` fails when this
file and the SQL test disagree. A new table fails `pnpm test:rls` until it has a
section here and rows in the SQL test.

## Roles

| role | what makes it | scheduler scope |
|---|---|---|
| owner | a `memberships` row with role `owner` | admin |
| grade teacher | a `memberships` row with role `teacher` | none |
| scheduling-only teacher | a live `staff_links` row (`revoked_at` null) claimed by the login, and no membership | teacher |
| student | `students.user_id` set by `claim_student_invites`, plus a `student` membership | none |
| parent | a claimed `parent_links` row, plus a `parent` membership unless the login already holds one | none |

The combinations that exist today: owner + staff link, grade teacher + staff
link, staff link + parent link, and grade teacher + parent link.

## How to read a cell

A cell starts with `none`, `read` or `read, write`. After `write:` come the
direct writes (insert, update, delete) and the functions that write the table.
The brackets give the row scope: `org` (every row of the caller's org), `own`
(the caller's own rows), `own, published` (the student's own rows once
published), `linked published child`, `own series` or `own staff ID`. Then the
policy, grant or server check that enforces it.

A refused write never succeeds: an insert raises `42501`, and an update or
delete either raises `42501` or touches no row.

## Rules

- **Scheduling-only teachers see their own series only.** A staff link reads
  the `class_series` rows with its own staff ID, the exceptions of those
  series, its own availability, and its own Notion staff record. It reads no
  student row, no grade, no summary and no other teacher's classes, including
  another teacher's classes for the same student. Student names reach it only
  for students in its own occurrences.
- **Multi-role is the union, and nothing more.** Each policy is an `or` of the
  role helpers, and each helper reads its own table (`memberships`,
  `staff_links`, `students.user_id`, `parent_links`), so a login with two roles
  reads exactly the rows either role reads. A grade teacher who claims a parent
  link keeps the `teacher` membership.
- **Revocation cuts access on the next request.** Revoking a staff link
  (`staff_links.revoked_at`), removing a parent link (`remove_parent_link`) or
  deleting a membership (operator SQL) takes effect on the next statement.
  Revoking one role of a combination leaves the other role exactly.
- **A parent never reads another family.** Every parent policy goes through
  `parent_links` for the caller's own login, and every function granted to
  `authenticated` raises or returns nothing for another family's IDs.
- **Landing.** `/tracker` sends a login to the first that applies: owner, grade
  teacher, student, parent (`getViewer`). A staff link + parent link login
  lands on `/parent`; its scheduler pages still work by URL. The scheduler picks
  owner first, then the staff link (`resolveSchedulerIdentity`).
- **Known limit.** A staff record's Notion Status is checked only in the app.
  The database cut-off is `staff_links.revoked_at`, so offboarding a teacher
  means revoking the link.

## Organisation and membership

### `orgs`

| role | access |
|---|---|
| owner | read (own org). `orgs are readable by their members`. No client writes |
| grade teacher | read (own org). Same policy |
| scheduling-only teacher | none. A staff link is not a membership |
| student | read (own org). The membership comes from `claim_student_invites` |
| parent | read (own org). The membership comes from `claim_parent_invites` |
| owner + staff link | read: the union of the `owner` and `scheduling-only teacher` rows |
| grade teacher + staff link | read: the union of the `grade teacher` and `scheduling-only teacher` rows |
| staff link + parent link | read: the union of the `scheduling-only teacher` and `parent` rows |
| grade teacher + parent link | read: the union of the `grade teacher` and `parent` rows |

### `memberships`

| role | access |
|---|---|
| owner | read (own rows). `memberships are self-readable`. No client writes: rows change only through the claim functions, `unlink_student`, `remove_parent_link` or operator SQL |
| grade teacher | read (own rows). Same policy |
| scheduling-only teacher | none. They hold no membership |
| student | read (own rows). Same policy |
| parent | read (own rows). Same policy |
| owner + staff link | read: the union of the `owner` and `scheduling-only teacher` rows |
| grade teacher + staff link | read: the union of the `grade teacher` and `scheduling-only teacher` rows |
| staff link + parent link | read: the union of the `scheduling-only teacher` and `parent` rows |
| grade teacher + parent link | read: the union of the `grade teacher` and `parent` rows |

## Grade tables

### `students`

| role | access |
|---|---|
| owner | read, write: insert, update, `unlink_student` (org). `staff read students`, `staff create students`, `staff update students`; column grants; `notion_student_id` changes only for an owner (`students_guard_notion_link`, ADR 0048). No delete: students are archived |
| grade teacher | read, write: insert, update (org). Same policies; cannot change `notion_student_id` |
| scheduling-only teacher | none. `is_org_staff` needs a membership |
| student | read (own, published). `student reads own published record` |
| parent | read (linked published child). `parent reads linked students` (`is_my_linked_student`) |
| owner + staff link | read, write: the union of the `owner` and `scheduling-only teacher` rows |
| grade teacher + staff link | read, write: the union of the `grade teacher` and `scheduling-only teacher` rows |
| staff link + parent link | read: the union of the `scheduling-only teacher` and `parent` rows |
| grade teacher + parent link | read, write: the union of the `grade teacher` and `parent` rows |

### `goals`

| role | access |
|---|---|
| owner | read, write: insert, update, delete (org). `staff read goals`, `staff create goals`, `staff update goals`, `staff delete goals` (`is_org_staff`) |
| grade teacher | read, write: insert, update, delete (org). Same policies as the owner |
| scheduling-only teacher | none. `is_org_staff` needs a membership |
| student | read (own, published). `student reads own goals` |
| parent | read (linked published child). `parent reads linked goals` (`is_my_linked_student`) |
| owner + staff link | read, write: the union of the `owner` and `scheduling-only teacher` rows |
| grade teacher + staff link | read, write: the union of the `grade teacher` and `scheduling-only teacher` rows |
| staff link + parent link | read: the union of the `scheduling-only teacher` and `parent` rows |
| grade teacher + parent link | read, write: the union of the `grade teacher` and `parent` rows |

### `courses`

| role | access |
|---|---|
| owner | read, write: insert, update, delete (org). `staff read courses`, `staff create courses`, `staff update courses`, `staff delete courses` (`is_org_staff`) |
| grade teacher | read, write: insert, update, delete (org). Same policies as the owner |
| scheduling-only teacher | none. `is_org_staff` needs a membership |
| student | read (own, published). `student reads own courses` |
| parent | read (linked published child). `parent reads linked courses` (`is_my_linked_student`) |
| owner + staff link | read, write: the union of the `owner` and `scheduling-only teacher` rows |
| grade teacher + staff link | read, write: the union of the `grade teacher` and `scheduling-only teacher` rows |
| staff link + parent link | read: the union of the `scheduling-only teacher` and `parent` rows |
| grade teacher + parent link | read, write: the union of the `grade teacher` and `parent` rows |

### `syllabus_versions`

| role | access |
|---|---|
| owner | read, write: insert, update, delete (org). `staff read syllabus_versions`, `staff create syllabus_versions`, `staff update syllabus_versions`, `staff delete syllabus_versions` (`is_org_staff`) |
| grade teacher | read, write: insert, update, delete (org). Same policies as the owner |
| scheduling-only teacher | none. `is_org_staff` needs a membership |
| student | read (own, published). `student reads own syllabus_versions` |
| parent | read (linked published child). `parent reads linked syllabus_versions` (`is_my_linked_student`) |
| owner + staff link | read, write: the union of the `owner` and `scheduling-only teacher` rows |
| grade teacher + staff link | read, write: the union of the `grade teacher` and `scheduling-only teacher` rows |
| staff link + parent link | read: the union of the `scheduling-only teacher` and `parent` rows |
| grade teacher + parent link | read, write: the union of the `grade teacher` and `parent` rows |

### `categories`

| role | access |
|---|---|
| owner | read, write: insert, update, delete (org). `staff read categories`, `staff create categories`, `staff update categories`, `staff delete categories` (`is_org_staff`) |
| grade teacher | read, write: insert, update, delete (org). Same policies as the owner |
| scheduling-only teacher | none. `is_org_staff` needs a membership |
| student | read (own, published). `student reads own categories` |
| parent | read (linked published child). `parent reads linked categories` (`is_my_linked_student`) |
| owner + staff link | read, write: the union of the `owner` and `scheduling-only teacher` rows |
| grade teacher + staff link | read, write: the union of the `grade teacher` and `scheduling-only teacher` rows |
| staff link + parent link | read: the union of the `scheduling-only teacher` and `parent` rows |
| grade teacher + parent link | read, write: the union of the `grade teacher` and `parent` rows |

### `assessments`

| role | access |
|---|---|
| owner | read, write: insert, update, delete (org). `staff read assessments`, `staff create assessments`, `staff update assessments`, `staff delete assessments` (`is_org_staff`) |
| grade teacher | read, write: insert, update, delete (org). Same policies as the owner |
| scheduling-only teacher | none. `is_org_staff` needs a membership |
| student | read, write: `set_assessment_done` (own, published). `student reads own assessments`; the function writes the done stamp only |
| parent | read (linked published child). `parent reads linked assessments` (`is_my_linked_student`) |
| owner + staff link | read, write: the union of the `owner` and `scheduling-only teacher` rows |
| grade teacher + staff link | read, write: the union of the `grade teacher` and `scheduling-only teacher` rows |
| staff link + parent link | read: the union of the `scheduling-only teacher` and `parent` rows |
| grade teacher + parent link | read, write: the union of the `grade teacher` and `parent` rows |

### `tasks`

| role | access |
|---|---|
| owner | read, write: insert, update, delete (org). `staff read tasks`, `staff create tasks`, `staff update tasks`, `staff delete tasks` (`is_org_staff`) |
| grade teacher | read, write: insert, update, delete (org). Same policies as the owner |
| scheduling-only teacher | none. `is_org_staff` needs a membership |
| student | read, write: `set_task_done` (own, published). `student reads own tasks`; the function writes the done stamp only |
| parent | read (linked published child). `parent reads linked tasks` (`is_my_linked_student`) |
| owner + staff link | read, write: the union of the `owner` and `scheduling-only teacher` rows |
| grade teacher + staff link | read, write: the union of the `grade teacher` and `scheduling-only teacher` rows |
| staff link + parent link | read: the union of the `scheduling-only teacher` and `parent` rows |
| grade teacher + parent link | read, write: the union of the `grade teacher` and `parent` rows |

### `grade_flags`

| role | access |
|---|---|
| owner | read, write: update `resolved_at` (org). `staff read grade_flags`, `staff update grade_flags` |
| grade teacher | read, write: update `resolved_at` (org). Same policies |
| scheduling-only teacher | none. `is_org_staff` needs a membership |
| student | read, write: `flag_assessment`, `unflag_assessment` (own, published). `student reads own grade_flags` |
| parent | none. No parent policy |
| owner + staff link | read, write: the union of the `owner` and `scheduling-only teacher` rows |
| grade teacher + staff link | read, write: the union of the `grade teacher` and `scheduling-only teacher` rows |
| staff link + parent link | none. Neither role reads it |
| grade teacher + parent link | read, write: the union of the `grade teacher` and `parent` rows |

### `ai_drafts`

| role | access |
|---|---|
| owner | read, write: insert, update (org). `staff read ai_drafts`, `staff create ai_drafts` (`requested_by` is the caller), `staff update ai_drafts` |
| grade teacher | read, write: insert, update (org). Same policies |
| scheduling-only teacher | none. Staff only |
| student | none. Staff only |
| parent | none. Staff only |
| owner + staff link | read, write: the union of the `owner` and `scheduling-only teacher` rows |
| grade teacher + staff link | read, write: the union of the `grade teacher` and `scheduling-only teacher` rows |
| staff link + parent link | none. Neither role reads it |
| grade teacher + parent link | read, write: the union of the `grade teacher` and `parent` rows |

## Audit

### `audit_log`

| role | access |
|---|---|
| owner | read (org, every table). `owner reads their org's audit log` (migration 0020). Nobody writes: the trigger appends, and update, delete and truncate raise |
| grade teacher | read (org, grade tables only: students, goals, courses, syllabus_versions, categories, assessments, tasks, grade_flags). `grade staff read grade audit rows` (migration 0020) |
| scheduling-only teacher | none. No audit policy covers a staff link |
| student | none. No audit policy covers a student |
| parent | none. No audit policy covers a parent |
| owner + staff link | read: the union of the `owner` and `scheduling-only teacher` rows |
| grade teacher + staff link | read: the union of the `grade teacher` and `scheduling-only teacher` rows |
| staff link + parent link | none. Neither role reads it |
| grade teacher + parent link | read: the union of the `grade teacher` and `parent` rows |

## Scheduling

### `staff_links`

| role | access |
|---|---|
| owner | read, write: insert, update `email` and `revoked_at` (org). `owner reads their org's staff links, others their own`, `owner approves staff links`, `owner edits and revokes staff links`. No delete: revoke |
| grade teacher | none. Owner policies only |
| scheduling-only teacher | read (own row, live or revoked). Same read policy; `user_id` is set only by `claim_staff_link` |
| student | none. Owner policies only |
| parent | none. Owner policies only |
| owner + staff link | read, write: the union of the `owner` and `scheduling-only teacher` rows |
| grade teacher + staff link | read: the union of the `grade teacher` and `scheduling-only teacher` rows |
| staff link + parent link | read: the union of the `scheduling-only teacher` and `parent` rows |
| grade teacher + parent link | none. Neither role reads it |

### `availability_windows`

| role | access |
|---|---|
| owner | read, write: insert, update, delete (org). `owner or that teacher ... availability windows` (`is_org_owner`) |
| grade teacher | none. Owner or that teacher only |
| scheduling-only teacher | read, write: insert, update, delete (own staff ID). Same policies (`notion_staff_id = my_staff_id(org_id)`) |
| student | none. Owner or that teacher only |
| parent | none. Owner or that teacher only |
| owner + staff link | read, write: the union of the `owner` and `scheduling-only teacher` rows |
| grade teacher + staff link | read, write: the union of the `grade teacher` and `scheduling-only teacher` rows |
| staff link + parent link | read, write: the union of the `scheduling-only teacher` and `parent` rows |
| grade teacher + parent link | none. Neither role reads it |

### `availability_exceptions`

| role | access |
|---|---|
| owner | read, write: insert, update, delete (org). `owner or that teacher ... availability exceptions` (`is_org_owner`) |
| grade teacher | none. Owner or that teacher only |
| scheduling-only teacher | read, write: insert, update, delete (own staff ID). Same policies (`notion_staff_id = my_staff_id(org_id)`) |
| student | none. Owner or that teacher only |
| parent | none. Owner or that teacher only |
| owner + staff link | read, write: the union of the `owner` and `scheduling-only teacher` rows |
| grade teacher + staff link | read, write: the union of the `grade teacher` and `scheduling-only teacher` rows |
| staff link + parent link | read, write: the union of the `scheduling-only teacher` and `parent` rows |
| grade teacher + parent link | none. Neither role reads it |

### `class_series`

| role | access |
|---|---|
| owner | read, write: insert, update, `schedule_write`, `split_class_series` (org). `owner or that teacher reads class series`, `owner adds class series`, `owner edits class series`. No delete |
| grade teacher | none. A membership is not a staff link |
| scheduling-only teacher | read (own series). `owner or that teacher reads class series` (`notion_staff_id = my_staff_id(org_id)`). Not another teacher's series for the same student. Writes go through the owner |
| student | none. No student policy |
| parent | read (linked published child). `parent reads linked class_series` (`is_my_childs_schedule`) |
| owner + staff link | read, write: the union of the `owner` and `scheduling-only teacher` rows |
| grade teacher + staff link | read: the union of the `grade teacher` and `scheduling-only teacher` rows |
| staff link + parent link | read: the union of the `scheduling-only teacher` and `parent` rows |
| grade teacher + parent link | read: the union of the `grade teacher` and `parent` rows |

### `class_exceptions`

| role | access |
|---|---|
| owner | read, write: insert, update, `schedule_write` (org). `owner or that teacher reads class exceptions`, `owner adds class exceptions`, `owner edits class exceptions`. No delete |
| grade teacher | none. A membership is not a staff link |
| scheduling-only teacher | read (own series). Exceptions of their own series only. Writes go through the owner |
| student | none. No student policy |
| parent | read (linked published child). `parent reads linked class_exceptions` (`is_my_childs_series`) |
| owner + staff link | read, write: the union of the `owner` and `scheduling-only teacher` rows |
| grade teacher + staff link | read: the union of the `grade teacher` and `scheduling-only teacher` rows |
| staff link + parent link | read: the union of the `scheduling-only teacher` and `parent` rows |
| grade teacher + parent link | read: the union of the `grade teacher` and `parent` rows |

### `schedule_summaries`

| role | access |
|---|---|
| owner | read, write: insert, update, `adopt_student_schedule` (org). `owner reads schedule summaries`, `owner adds schedule summaries`, `owner edits schedule summaries` |
| grade teacher | none. owner-only policies |
| scheduling-only teacher | none. owner-only policies |
| student | none. owner-only policies |
| parent | none. owner-only policies |
| owner + staff link | read, write: the union of the `owner` and `scheduling-only teacher` rows |
| grade teacher + staff link | none. Neither role reads it |
| staff link + parent link | none. Neither role reads it |
| grade teacher + parent link | none. Neither role reads it |

### `daily_tasks`

| role | access |
|---|---|
| owner | read, write: insert, update, `claim_daily_task` (org). `owner reads daily tasks`, `owner adds daily tasks`, `owner edits daily tasks` |
| grade teacher | none. owner-only policies |
| scheduling-only teacher | none. owner-only policies |
| student | none. owner-only policies |
| parent | none. owner-only policies |
| owner + staff link | read, write: the union of the `owner` and `scheduling-only teacher` rows |
| grade teacher + staff link | none. Neither role reads it |
| staff link + parent link | none. Neither role reads it |
| grade teacher + parent link | none. Neither role reads it |

### `daily_task_teachers`

| role | access |
|---|---|
| owner | read, write: insert, update (org). `owner reads daily task teachers`, `owner adds daily task teachers`, `owner edits daily task teachers` |
| grade teacher | none. owner-only policies |
| scheduling-only teacher | none. owner-only policies |
| student | none. owner-only policies |
| parent | none. owner-only policies |
| owner + staff link | read, write: the union of the `owner` and `scheduling-only teacher` rows |
| grade teacher + staff link | none. Neither role reads it |
| staff link + parent link | none. Neither role reads it |
| grade teacher + parent link | none. Neither role reads it |

### `booking_stamps`

| role | access |
|---|---|
| owner | read (org). `owner reads booking stamps`. Written only by the `bump_booking_stamps` trigger |
| grade teacher | none. owner-only policies |
| scheduling-only teacher | none. owner-only policies |
| student | none. owner-only policies |
| parent | none. owner-only policies |
| owner + staff link | read: the union of the `owner` and `scheduling-only teacher` rows |
| grade teacher + staff link | none. Neither role reads it |
| staff link + parent link | none. Neither role reads it |
| grade teacher + parent link | none. Neither role reads it |

### `schedule_writes`

| role | access |
|---|---|
| owner | read, write: insert, update, `schedule_write` (org; update only rows the caller claimed). `owner reads schedule writes`, `owner claims schedule writes`, `owner records schedule write results` |
| grade teacher | none. owner-only policies |
| scheduling-only teacher | none. owner-only policies |
| student | none. owner-only policies |
| parent | none. owner-only policies |
| owner + staff link | read, write: the union of the `owner` and `scheduling-only teacher` rows |
| grade teacher + staff link | none. Neither role reads it |
| staff link + parent link | none. Neither role reads it |
| grade teacher + parent link | none. Neither role reads it |

### `occurrence_outcomes`

| role | access |
|---|---|
| owner | read, write: insert, update, delete (org). `owner or that teacher reads occurrence outcomes`, `owner or that teacher records occurrence outcomes`, `owner or that teacher completes occurrence outcomes`, `owner clears occurrence outcomes`; update only `notion_lesson_id`, `lesson_date`, `claimed_at` |
| grade teacher | none. Owner and the series' teacher only |
| scheduling-only teacher | read, write: insert, update (own series). Inserts only a pending logged row or a no-show, with no lesson ID, for a linkable occurrence; completes only their own pending row; never deletes |
| student | none. Owner and the series' teacher only |
| parent | none. Owner and the series' teacher only |
| owner + staff link | read, write: the union of the `owner` and `scheduling-only teacher` rows |
| grade teacher + staff link | read, write: the union of the `grade teacher` and `scheduling-only teacher` rows |
| staff link + parent link | read, write: the union of the `scheduling-only teacher` and `parent` rows |
| grade teacher + parent link | none. Neither role reads it |

## Parents

### `parent_links`

| role | access |
|---|---|
| owner | read, write: insert, `remove_parent_link` (org). `owner reads parent_links`, `owner adds parent_links`; `parent_user_id` is set only by `claim_parent_invites` |
| grade teacher | none. Owner and the parent only |
| scheduling-only teacher | none. Owner and the parent only |
| student | none. Owner and the parent only |
| parent | read (own links). `parent reads own parent_links` |
| owner + staff link | read, write: the union of the `owner` and `scheduling-only teacher` rows |
| grade teacher + staff link | none. Neither role reads it |
| staff link + parent link | read: the union of the `scheduling-only teacher` and `parent` rows |
| grade teacher + parent link | read: the union of the `grade teacher` and `parent` rows |

## Notion-backed reads

These never touch Postgres rows; the scheduler route guards and the parent shell enforce them.

### Notion: staff list

| role | access |
|---|---|
| owner | read (every active teaching staff record, with email). `/api/scheduler/staff`, `/staff/[id]`, scope admin |
| grade teacher | none. Scope none, 403 |
| scheduling-only teacher | read (own record, no email). `/api/scheduler/me`, `/staff/[own id]` (`assertStaffAccess`), scope teacher |
| student | none. Scope none, 403 |
| parent | none. Scope none, 403 |
| owner + staff link | read: the union of the `owner` and `scheduling-only teacher` rows |
| grade teacher + staff link | read: the union of the `grade teacher` and `scheduling-only teacher` rows |
| staff link + parent link | read: the union of the `scheduling-only teacher` and `parent` rows |
| grade teacher + parent link | none. Neither role reads it |

### Notion: student names

| role | access |
|---|---|
| owner | read (every student). The import and the all-teachers week, scope admin |
| grade teacher | none. Scope none, 403; the tracker's own `students` rows are a separate column |
| scheduling-only teacher | read (students in own occurrences only). `loadWeek` looks names up after choosing the teacher's occurrences (ADR 0037) |
| student | none. Not read from Notion |
| parent | read (a sibling's first name on a shared invoice in the same Billing Family only, ADR 0049). The child's own name comes from `students` |
| owner + staff link | read: the union of the `owner` and `scheduling-only teacher` rows |
| grade teacher + staff link | read: the union of the `grade teacher` and `scheduling-only teacher` rows |
| staff link + parent link | read: the union of the `scheduling-only teacher` and `parent` rows |
| grade teacher + parent link | read: the union of the `grade teacher` and `parent` rows |

### Notion: Weekly Schedule text

| role | access |
|---|---|
| owner | read, write (every adopted student). Import preview and run, summary sync, monthly review, scope admin |
| grade teacher | none. Scope none, 403 |
| scheduling-only teacher | none. Admin-only routes, 403 |
| student | none. Scope none, 403 |
| parent | none. Scope none, 403 |
| owner + staff link | read, write: the union of the `owner` and `scheduling-only teacher` rows |
| grade teacher + staff link | none. Neither role reads it |
| staff link + parent link | none. Neither role reads it |
| grade teacher + parent link | none. Neither role reads it |

### Notion: daily task

| role | access |
|---|---|
| owner | read, write (org). `/api/scheduler/daily-task`, scope admin; the hourly run uses its own secret, not a login |
| grade teacher | none. Scope none, 403 |
| scheduling-only teacher | none. Admin-only routes, 403 |
| student | none. Scope none, 403 |
| parent | none. Scope none, 403 |
| owner + staff link | read, write: the union of the `owner` and `scheduling-only teacher` rows |
| grade teacher + staff link | none. Neither role reads it |
| staff link + parent link | none. Neither role reads it |
| grade teacher + parent link | none. Neither role reads it |

### Notion: parent billing

| role | access |
|---|---|
| owner | none. The tracker has no billing view for the owner |
| grade teacher | none. Parent shell only |
| scheduling-only teacher | none. Parent shell only |
| student | none. Parent shell only |
| parent | read (linked children only: invoices, credits, PDFs). Gated on `students.notion_student_id` read under RLS (ADR 0049) |
| owner + staff link | none. Neither role reads it |
| grade teacher + staff link | none. Neither role reads it |
| staff link + parent link | read: the union of the `scheduling-only teacher` and `parent` rows |
| grade teacher + parent link | read: the union of the `grade teacher` and `parent` rows |
