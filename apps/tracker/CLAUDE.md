# CLAUDE.md: AP Academy Student Tracker

> **Workspace overrides.** This app lives in the AP Academy pnpm workspace. Where
> this file and the workspace decisions disagree, the workspace wins, until a
> tracker ADR says otherwise:
>
> - **Spec and plan.** There is no `docs/SPEC.md`. This file and
>   [`docs/spec/tracker-plan.md`](docs/spec/tracker-plan.md) are the spec. Both
>   are recorded verbatim in `docs/spec/`.
> - **Region.** The shared Supabase project stays in its current East region
>   (ADR 0001). Not Canada. One project, not separate dev and prod projects:
>   local Postgres for development and RLS tests, the live project for prod.
> - **Schema.** Tables live in the `tracker` Postgres schema, not `public`.
>   Migrations go in the repo-root `supabase/migrations/`, never in this app.
> - **Auth.** The tracker never renders a login page. `proxy.ts` sends
>   signed-out users to landing's `/login?next=...` (ADR 0002). Magic-link
>   sign-in and `/auth/callback` live in `apps/landing`.
> - **Roles.** Permissions come only from `tracker.memberships`. There is no
>   global role on `public.profiles`.
> - **Routing.** `basePath: '/tracker'`. Links to anything outside `/tracker` are
>   plain `<a>` tags. Redirects never use `request.url`'s host.
> - **Shared code.** Supabase clients, session refresh and safe redirect paths
>   come from `@ap-academy/db`. Domain logic stays in `lib/domain/`.
> - **Zod.** Parses every row read and every form submitted (ADR 0017).
> - **Decisions and progress.** ADRs in `docs/decisions/`, progress in `docs/PLAN.md`.
>
> Workspace rules: the repo-root `CLAUDE.md`. Decisions: `docs/adr/` at the root.

You are building a small, mobile-first web app for AP Academy tutoring students. Read this file fully before writing code. The product spec lives at `docs/SPEC.md` and the work plan at `docs/PLAN.md`. If anything here conflicts with the spec, the spec wins. Stop and ask instead of guessing.

## Core promise

Within seconds of opening the app, a student should know: how on-track am I for my target program, and what should I focus on next?
This is a school-grade and school-work tracker. It is NOT an LMS, a content generator or an admissions predictor.

## Stack (do not add services without an ADR)

* Next.js (App Router) + TypeScript, deployed on Vercel
* Supabase: Postgres, Auth (email magic link / OTP), RLS. Canada region.
* Tailwind for styling. No component library unless an ADR justifies it.
* Zod for validation at every boundary.
* Vitest for unit tests. Playwright for a few critical end-to-end flows.
* No Redis, no queues, no separate backend, no ORM beyond the Supabase client plus generated types.

## Non-negotiables

1. Security is enforced in the database. Every table has RLS. Students read only their own rows. Teachers act only on students in their org. Never rely on hidden UI for permissions.
2. The grade engine is pure. `lib/domain/grades.ts` imports nothing from React, Next or Supabase. It is deterministic and fully unit-tested.
3. Only teacher-entered school scores affect grades. Supplemental work never enters the calculation.
4. Done never awards marks. Completion (`student_done_at`) and scoring (`score_earned`) are independent fields.
5. Unmarked is not zero. `score_earned = null` means unmarked and is excluded. `0` is a real zero and counts.
6. Never show a failed save as successful. Optimistic UI must roll back and show an error.
7. No AI writes. AI (v1) only produces a draft change set that the teacher confirms.
8. Multi-tenant from day one. `org_id` on every tenant table, even with one teacher.
9. Minimal personal data. First name, last initial, grade level, email. Nothing else without an ADR.

## Data model (starting point; refine via migrations plus an ADR)

```
orgs(id, name, logo_url)
memberships(user_id, org_id, role: owner|teacher|student)
students(id, org_id, teacher_id, user_id NULL, first_name, last_initial,
         grade_level, status: setup|active|archived, published_at)
goals(id, student_id, school, program, application_year,
      target_six_avg numeric, benchmark_note)
courses(id, student_id, code, name, term, status: planned|active|completed,
        in_six_plan bool, target_grade numeric, active_syllabus_version_id)
syllabus_versions(id, course_id, version int, confirmed_by, confirmed_at, notes)
categories(id, syllabus_version_id, name, weight numeric,
           aggregation_method: mean_of_percentages|pooled_points,
           needs_review bool)
assessments(id, course_id, category_id, title, due_date date,
            student_done_at NULL, score_earned numeric NULL,
            score_possible numeric, excused bool, graded_at NULL)
tasks(id, student_id, course_id NULL, title, kind: school|supplemental,
      pinned bool, rank int, reason text, done_at NULL)
audit_log(id, org_id, actor_id, table_name, row_id, action,
          before jsonb, after jsonb, at)   -- trigger-written, append-only

```

Assessment display state is derived, not stored: upcoming → done (student tapped) → awaiting result (due date passed) → graded (score present).

## Grade engine spec

* Per category: aggregate scored, non-excused assessments by that category's `aggregation_method`.
   * `mean_of_percentages`: average of `earned / possible` for each assessment.
   * `pooled_points`: `sum(earned) / sum(possible)`.
* Course grade = sum(category_pct × weight) ÷ sum(weights of categories that have scores).
* No scored categories → return `null` ("No grades yet"), never 0.
* Any category with `needs_review` → still compute, but return a `warnings` array that the UI shows to the teacher.
* Validation: weights in a syllabus version sum to 100 (tolerance 0.001). `score_possible > 0`. `0 <= score_earned`. Allow over 100% (bonus) but warn.
* Return full precision. Round only in the UI (1 decimal place).
* Six-course view: report `graded_count / 6`, the average of graded courses and the target. Never label a partial average as the six-course average.

## Required tests (write these first)

* Brief reference example: Tests 50% (30/32, 41/42), Assignments 20% (10/10, 9/10, 10/10), Final 20% (none), Participation 10% (3/3) → 96.47% (approximately 96.4709).
* The same example with `pooled_points` on Tests → 71/74 used for that category.
* A real zero lowers the grade. A null score does not.
* All categories empty → `null`.
* Weights not summing to 100 → validation error.
* An excused assessment is ignored.

## Build order (finish each with passing tests before moving on)

1. Scaffold: Next.js, Supabase clients (server and browser), env handling, CI (lint, typecheck, test).
2. Migrations plus RLS, including RLS tests: a student JWT cannot read another student's rows.
3. Grade engine plus tests.
4. Teacher onboarding wizard: goal → six courses → targets (warn if course targets don't average to the six-course target) → syllabus categories → starting grades and upcoming work → review → publish (sets `published_at`, sends invite).
5. Teacher course view: assessment list. Add upcoming items. Enter a score on the same record. Pin priorities. Add supplemental items.
6. Student dashboard and subject drill-down plus Done button. Students see nothing until `published_at` is set.
7. Reliability: audit triggers, last-updated stamps, empty and missing-data states, save error handling, backup script (`scripts/backup.sh` via a GitHub Action) and `docs/RESTORE.md` with a tested restore.
8. Stop. v1 items (AI drafts, student flags, auto priorities) need explicit go-ahead.

## UX rules

* Mobile first (375px). Student screens need zero typing except the Done button.
* Dashboard order: target → progress → active subjects → next priorities → upcoming.
* Always show "Current grades are calculated based on existing marked grades."
* Show progress against the teacher's target. Never use admission likelihood language.
* UI copy: plain, short, no em-dashes.

## Documenting design decisions (required)

Record every meaningful decision as an ADR in `docs/decisions/NNNN-short-title.md`:

```
# NNNN: Title
Status: accepted | superseded by NNNN
Date: YYYY-MM-DD
## Context
What forced the decision.
## Decision
What we chose.
## Alternatives considered
What we rejected and why.
## Consequences
Trade-offs, follow-ups, what would make us revisit.

```

Write an ADR when you: add a dependency or service, change the schema shape, choose between grading methods, change a permission rule, pick a default the spec left open, or deviate from this file.
Seed ADRs to write in step 1 (decisions already made):

* 0001 Stack: Next.js + Supabase + Vercel, no extra infrastructure
* 0002 Security via Postgres RLS, not app code
* 0003 Multi-tenant schema (org_id) from day one with a single teacher
* 0004 Student record separate from auth user
* 0005 Pure, deterministic grade engine. Normalize over scored categories only.
* 0006 Per-category aggregation method. Default `mean_of_percentages`.
* 0007 Unmarked (null) vs zero vs excused
* 0008 Done and grading are independent. Assessment state is derived.
* 0009 Syllabus versioning plus trigger-based append-only audit log
* 0010 Six-course progress shows graded count, never a partial average presented as final
* 0011 AI produces draft change sets only (deferred to v1)
* 0012 Minimal PII, Canada region, magic-link auth

Keep `docs/decisions/README.md` as an index (number, title, status). Never edit an accepted ADR's decision. Supersede it with a new one.

## Working conventions

* Domain logic in `lib/domain/`, data access in `lib/data/`, UI in `app/` and `components/`. Components never compute grades.
* Every schema change is a migration in `supabase/migrations/`. Regenerate types afterwards.
* Validate all mutations with Zod on the server.
* Before marking a step done, run lint, typecheck and tests, and update `docs/PLAN.md` progress.
* If a task would expand scope (see the out-of-scope list), stop and ask.

## Out of scope (do not build)

Backup programs, parent accounts or views, auto-updated benchmarks, admission probability, content or worksheet generation, LMS integrations, multi-teacher management UI, student self-onboarding, student grade entry.
