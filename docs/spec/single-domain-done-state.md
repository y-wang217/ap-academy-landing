# Done state: AP Academy single-domain, multi-app setup

## Decision (supersedes any subdomain plan)
All AP Academy apps live on ONE domain and are routed by path, not subdomain.
Each app is its own Next.js app and its own Vercel project inside one monorepo.
All apps share one Supabase project, so one account works everywhere (SSO).
SAT is out of scope. It stays inside the landing app, untouched.

## Repo layout (monorepo, restructured from ap-academy-landing)
- apps/landing     existing site, including SAT. Behavior unchanged.
- apps/tracker     new student tracker app.
- packages/db      generated Supabase types plus shared Supabase client helpers.
- supabase/        the ONLY place migrations and Supabase config live.
- docs/adr/        ADR recording this decision.
Use the workspace tooling already in the repo. Do not introduce a new package manager.

## Vercel (scope: charlies-projects-9b525b67, NOT charlies-projects)
- Two projects: landing (root dir apps/landing), tracker (root dir apps/tracker).
- apacademy.ca is attached to the landing project only.
- The tracker project has no custom domain, only its *.vercel.app URL.
- Landing has env var TRACKER_URL = tracker's production Vercel URL.
- Both projects have the same NEXT_PUBLIC_SUPABASE_URL and anon/publishable key.

## Routing
- apps/tracker/next.config: basePath '/tracker'. Set before any routes exist.
- apps/landing/next.config rewrites:
  - /tracker          -> ${TRACKER_URL}/tracker
  - /tracker/:path*   -> ${TRACKER_URL}/tracker/:path*
- Links that cross apps are plain <a> tags, never next/link.
  (Inside the tracker, next/link would prefix /tracker onto landing URLs.)

## Auth (single sign-on)
- Both apps use @supabase/ssr with cookie-based sessions.
- Default host-only cookies. Do NOT set a cookie domain option. Same origin makes
  the session shared automatically.
- Login UI and /auth/callback exist ONLY in the landing app:
  - /login accepts ?next=<path>. Only same-origin relative paths are honored,
    anything else falls back to a default (prevents open redirects).
  - Sign-out also lives in landing (or a shared helper in packages/db).
- Each app has its own middleware that refreshes the Supabase session.
- Tracker middleware redirects unauthenticated users to /login?next=/tracker/...
  The redirect must target the root-level /login, outside the tracker basePath.
- The tracker never renders its own login page.
- Supabase Auth settings: Site URL https://apacademy.ca, redirect allowlist
  includes https://apacademy.ca/** and the Vercel preview URL patterns.

## Database
- All migrations in root supabase/migrations. No app holds its own migrations.
- Types are generated into packages/db and imported by both apps.
- public.profiles table:
  - id uuid primary key referencing auth.users
  - role enum: student, parent, tutor, admin. Default student.
  - row created automatically on signup (trigger).
  - users can read their own profile and cannot change their own role.
- Row Level Security enabled on every table, with explicit policies.
- Existing Supabase project is reused. Do not create a new one or change region.

## Non-goals
- No subdomains, no cookie-domain config.
- No Vercel Microfrontends. Plain rewrites only.
- No SAT changes.
- No tracker features beyond one protected placeholder page that shows the
  logged-in user's email and role. Feature work follows the MVP spec separately.

## Acceptance checks
1. apacademy.ca loads the landing site exactly as before.
2. apacademy.ca/tracker while logged out redirects to /login?next=/tracker.
3. After login, the user lands on /tracker and sees their email and role.
4. Navigating back to the landing site shows the user still logged in,
   with no second login.
5. Signing out on either side logs the user out of both.
6. Tracker assets load from /tracker/_next/... with no 404s.
7. A new signup produces a profiles row with role student.
8. A logged-in user cannot read another user's rows (RLS verified).
9. Both apps build and deploy independently from the monorepo.
10. ADR is committed describing this decision and why subdomains were rejected.

## Adding a future app
New folder in apps/, new Vercel project, its own basePath, two rewrite lines in
landing, session middleware. No auth or schema work required.

---

## Answers given on 2026-10-02 (verbatim)

Answers to 1 through 6:

1. Reuse the existing public.profiles table. Do not add a role column (see 5).
   Acceptance check 7 becomes: a new signup produces a profiles row, as today.
2. Keep pnpm and PR #4 as is. Strike "do not introduce a new package manager".
3. Correct. Use https://www.apacademy.ca everywhere: Site URL, allowlist, spec.
4. Verify acceptance check 4 on /sat. No new signed-in element on marketing
   pages. Check 1 stands.
5. No global profiles.role. Tracker permissions come only from memberships
   (owner, teacher, student). The placeholder tracker page shows the user's
   email, plus membership role if one exists.
6. Tracker tables go in their own `tracker` schema. SAT stays in public,
   untouched. Drop the trigger rewrite. The new ADR must state explicitly that
   it replaces 0001's subdomains, parent-domain cookie, and trigger rewrite,
   and keeps per-product schemas for new products only.

Accept everything in your "things the build has to get right" list and add it
to the spec. Redirect ap-academy.online and [www.ap-academy.online](https://www.ap-academy.online) to
[www.apacademy.ca](https://www.apacademy.ca). Baseline the migration history before any CLI use, and stop
before any live migration as you said.
