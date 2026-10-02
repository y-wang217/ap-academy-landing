# Done state: AP Academy single-domain, multi-app setup

Amended 2026-10-02 with the answers to the six review questions and the build
requirements found in review. The text as first supplied, and the answers
verbatim, are in this file's first commit (`git log --follow` this file).
Decision record: `docs/adr/0002-single-domain-path-routing.md`.

## Decision (supersedes any subdomain plan)
All AP Academy apps live on ONE domain, `https://www.apacademy.ca`, and are
routed by path, not subdomain. Each app is its own Next.js app and its own
Vercel project inside one monorepo. All apps share one Supabase project, so one
account works everywhere (SSO). SAT is out of scope. It stays inside the landing
app, untouched.

## Repo layout (monorepo, restructured from ap-academy-landing)
- apps/landing     existing site, including SAT. Behavior unchanged.
- apps/tracker     new student tracker app.
- packages/db      generated Supabase types plus shared Supabase client helpers.
- supabase/        the ONLY place migrations and Supabase config live.
- docs/adr/        ADR recording this decision.
The workspace uses pnpm (introduced by the restructure, PR #4).

## Vercel (scope: charlies-projects-9b525b67, NOT charlies-projects)
- Two projects: landing (root dir apps/landing), tracker (root dir apps/tracker).
- www.apacademy.ca (with apex apacademy.ca redirecting to it) is attached to the
  landing project only.
- ap-academy.online and www.ap-academy.online redirect to https://www.apacademy.ca.
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
- Supabase Auth settings: Site URL https://www.apacademy.ca, redirect allowlist
  includes https://www.apacademy.ca/** and the Vercel preview URL patterns.

## Database
- All migrations in root supabase/migrations. No app holds its own migrations.
- Types are generated into packages/db and imported by both apps.
- public.profiles is the existing table, reused as is. No role column. A row is
  created automatically on signup by the existing trigger, as today.
- No global role. Tracker permissions come only from tracker memberships
  (owner, teacher, student).
- Tracker tables live in their own `tracker` schema. SAT stays in `public`,
  untouched. New products get their own schema; existing SAT tables do not move.
- The `on auth.users` trigger is not rewritten.
- Row Level Security enabled on every table, with explicit policies.
- Existing Supabase project is reused. Do not create a new one or change region.
- The migration history is baselined before any Supabase CLI use. No migration
  is applied to the live database without sign-off.

## Build requirements
- Tracker redirects. Requests reach the tracker through the landing proxy, so
  `request.url` carries the tracker's vercel.app host. Redirects are relative
  (or built from a configured public origin), never from `request.url`.
- TRACKER_URL is read when landing builds, so changing it needs a landing
  redeploy. When it is unset (local dev), the rewrites are skipped, not broken.
  Landing preview deploys proxy to the tracker's production deploy.
- Landing middleware refreshes the session on /login as well as /sat and /auth,
  and on any page that shows signed-in state.
- The shared /auth/callback sends a failed link back to the login page that
  started it: /sat/login for SAT, /login for everything else. Its default
  destination stays /sat so the SAT flow is unchanged.
- Supabase env vars on Vercel are stored as "sensitive" and cannot be read
  back. They are re-entered from the Supabase dashboard into the tracker project.
- supabase/ gets a config.toml, and the hand-applied migrations are recorded in
  the migration history (baselined) before the CLI is used against the project.
- Host-only cookies mean ap-academy.online would hold a separate session, so it
  redirects to www.apacademy.ca.
- Both Vercel projects build on every push unless "skip unaffected projects" is
  turned on.

## Non-goals
- No subdomains, no cookie-domain config.
- No Vercel Microfrontends. Plain rewrites only.
- No SAT changes.
- No new signed-in element on the marketing pages.
- No tracker features beyond one protected placeholder page that shows the
  logged-in user's email, plus their membership role if one exists. Feature
  work follows the MVP spec separately.

## Acceptance checks
1. www.apacademy.ca loads the landing site exactly as before.
2. www.apacademy.ca/tracker while logged out redirects to /login?next=/tracker.
3. After login, the user lands on /tracker and sees their email, plus their
   membership role if one exists.
4. Navigating back to /sat shows the user still logged in, with no second login.
5. Signing out on either side logs the user out of both.
6. Tracker assets load from /tracker/_next/... with no 404s.
7. A new signup produces a profiles row, as today.
8. A logged-in user cannot read another user's rows (RLS verified).
9. Both apps build and deploy independently from the monorepo.
10. ADR is committed describing this decision and why subdomains were rejected.

## Adding a future app
New folder in apps/, new Vercel project, its own basePath, two rewrite lines in
landing, session middleware, and its own schema if it stores data. No auth work
required.
