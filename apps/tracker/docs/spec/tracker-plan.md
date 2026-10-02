plan: AP Academy Student Tracker: Work Plan and Scalability Notes
Scope: the MVP brief, built small first (v0), with the schema shaped so multi-teacher, parents and AI can be added later without a rewrite.
1. Work required
Phase 0: Foundation

* Next.js (App Router, TypeScript) deployed on Vercel. Supabase for Postgres, Auth and backups.
* Repo hygiene: migrations in the repo, generated DB types, lint, typecheck and unit tests in CI.
* Separate Supabase projects for dev and prod.

Phase 1: Data model and security

* Tables for orgs, memberships, students, goals, courses, syllabus versions, categories, assessments, tasks and the audit log.
* Row-level security (RLS) on every table. Students read only their own rows. Teachers read and write only students in their org.
* Audit triggers on grades, syllabus and targets.

Phase 2: Grade engine

* Pure TypeScript module with no database or UI imports.
* Weighted categories, normalized over categories that have scores. Zero is distinct from unmarked. Full precision is kept and only display values are rounded.
* Unit tests, including the brief's reference example (96.47%).

Phase 3: Teacher flows

* Onboarding wizard covering goal, six-course plan, targets, syllabus categories and weights, starting grades and upcoming work, then a review screen before the student gets access.
* Per-course assessment list that moves each item from upcoming to scored in the same record.
* Pinning priorities and adding supplemental recommendations.

Phase 4: Student flows

* Dashboard: target, progress toward the target, active subjects, next priorities, upcoming work.
* Subject drill-down: current vs target, category breakdown, past scores, to-dos, upcoming work, and supplemental work kept separate.
* Done button.

Phase 5: Reliability

* Save states that never show a false success. Last-updated stamps. Missing-data states.
* Backup schedule plus one tested restore drill.

Phase 6 (v1, after real use)

* AI paste, preview, confirm, save.
* Student flag/feedback on a grade.
* Rule-based priority suggestions with explanations.

2. Scalability concerns and proposed solutions
Each item is tagged Now (cheap to do from day one, expensive to retrofit) or Later (design for it, build when needed).
Multi-tenancy and roles
1. Single teacher now, multiple teachers later. Now. Concern: if data is keyed only to "the teacher", adding teachers means migrating every table and rewriting every security policy. Solution: add `org_id` to every tenant table and give each student a `teacher_id` from day one. Write RLS against a `memberships` table even while it holds one teacher.
2. Hard-coded roles. Now. Concern: `if user is Charlie` logic breaks the moment a second teacher or a parent exists. Solution: use a `memberships(user_id, org_id, role)` table with roles `owner`, `teacher` and `student`. Permissions come from the role, never from identity.
3. Parent accounts later. Later, with a Now prep step. Concern: if the student record is the login account, parents and siblings get awkward to model. Solution: keep the student record (`students`) separate from the login (`auth.users`). A student record exists before anyone logs in. Add `student_guardians` later and give parents a read-only role.
Grade correctness at scale
4. Schools grade differently. Now. Concern: some syllabi average percentages, some pool raw points, some drop the lowest score. One hard-coded formula will eventually be wrong. Solution: store an `aggregation_method` per category (start with `mean_of_percentages` and `pooled_points`). The engine selects a strategy per category. Unknown rules set `needs_review` and are shown to the teacher instead of being guessed.
5. Syllabus edits rewrite history. Now. Concern: changing a weight mid-term silently changes every past grade, and there is no trace of what the grade used to be. Solution: version syllabi (`syllabus_versions`), audit every change, and recompute against the active version. Grade-over-time trends can come later from snapshots.
6. Computation cost. Later. Concern: computing grades on every page load. Solution: compute on read. That is trivially fast for hundreds of students. If trend charts or thousands of students arrive, add a `grade_snapshots` table written on each score change. Do not cache derived grades early, because a stale cache is a correctness bug.
Data integrity and recovery
7. Audit log reliability. Now. Concern: logging in app code gets skipped by bugs, scripts and manual SQL. Solution: log through Postgres triggers into an append-only `audit_log` table that has no update or delete policies. Size is not a concern for years.
8. Backups and recovery. Now. Concern: the Supabase free tier has limited backups and pauses inactive projects, so students could open a dead app. Solution: move to Supabase Pro before real students use it (daily backups, no pausing). Add a nightly `pg_dump` via a GitHub Action to separate storage. Run one restore drill into a scratch project and document it. Add point-in-time recovery once revenue depends on it.
9. Term and year rollover. Now. Concern: Grade 11 becomes Grade 12, courses finish, and deleting data loses history. Solution: give courses a `term` and a `status` (`planned`, `active`, `completed`). Students get an `archived` status. Nothing is hard-deleted from the UI.
Privacy and access
10. Student data of minors in Ontario. Now. Concern: data collected grows over time, and it belongs to minors. Solution: collect only first name, last initial, grade level and a contact email. No date of birth, OEN or address. Host in Supabase's Canada region. Add a per-student export and delete script.
11. Teen login friction. Now. Concern: forgotten passwords mean support load for you. Solution: teacher-issued invites with email magic links or OTP through Supabase Auth, and long-lived sessions. Add SSO later only if a school partnership needs it.
Product growth
12. AI coupling and cost. Later. Concern: if AI writes straight to tables, one bad parse corrupts grades. Providers and prices also change. Solution: AI runs only in a server route that outputs a JSON "draft change set" validated by a schema. Manual edits use the same change-set shape. Nothing is saved without teacher confirmation. Keep the provider behind one interface, rate-limit per org, and strip student names from prompts.
13. Program benchmarks. Later. Concern: manual benchmarks per student get duplicated and drift. Solution: create an org-wide `programs` table (school, program, benchmark average, source, last-verified date). Students reference it. Automating updates later then changes values, not schema.
14. Priority logic becomes a black box. Later. Concern: automated priorities that can't be explained lose student trust. Solution: teacher-pinned items come first. Rule-based suggestions always carry a stored plain-language `reason` ("Chemistry is 6% below target and has a test in 4 days").
15. Codebase entropy as features land. Now. Concern: business rules scattered across UI components. Solution: keep domain logic in `lib/domain`, with components only rendering. Record decisions as ADRs (see CLAUDE.md) so later work does not reopen settled choices.
16. Branding for other tutors. Later. Concern: the app being "AP Academy" everywhere. Solution: use theme tokens and an org name/logo field. Do not hard-code brand strings into components.
3. Explicitly not doing
Backup programs, parent accounts, auto benchmarks, admission probabilities, content generation, LMS integrations, multi-teacher UI, student self-onboarding, student grade entry.
