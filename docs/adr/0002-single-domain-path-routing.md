# ADR 0002: One domain, apps routed by path

- **Status:** Accepted
- **Date:** 2026-10-02
- **Decided by:** Charlie
- **Supersedes:** parts of ADR 0001 (listed below). The rest of 0001 stands.
- **Spec:** `docs/spec/single-domain-done-state.md`

## Context

ADR 0001 put every app on its own subdomain and carried the login across them
with a session cookie scoped to the parent domain. It also planned to rewrite
the `on auth.users` trigger so it created only a generic account row, with each
product creating its own profile on first use.

Before any of that was built, SAT accounts went live on `www.apacademy.ca`
(2026-10-02) with one real user. That made two things concrete: any change to
the SAT tables or trigger is now a change to a live product, and the session
already lives on one host.

## Decision

1. **One domain, routed by path.** Every app is served under
   `https://www.apacademy.ca`. The landing app owns the domain and proxies each
   other app's path to that app's Vercel deployment with a plain Next.js
   rewrite (`/tracker` and `/tracker/:path*` to `${TRACKER_URL}/tracker...`).
   Each app sets a matching `basePath`.
2. **Host-only cookies.** No cookie `domain` option anywhere. Because every app
   is served from the same origin, the browser sends the same Supabase session
   cookie to all of them.
3. **Login lives in landing only.** `/login` and `/auth/callback` exist only in
   the landing app. Other apps redirect to `/login?next=<their path>` and never
   render a login page. Each app runs its own middleware to refresh the session.
4. **SAT is untouched.** `public.profiles` and `public.attempts` stay where they
   are, and the existing trigger keeps creating a `profiles` row on signup.
   There is no global role column. Tracker permissions come only from tracker
   memberships.
5. **Per-product schemas for new products only.** The tracker's tables live in
   a `tracker` schema with their own RLS. SAT's existing tables do not move.

## What this replaces in ADR 0001

| 0001 said | Now |
|---|---|
| Each app on its own subdomain (decision 4) | One domain, path routing |
| A session cookie scoped to the parent domain (decision 4) | Host-only cookies, no domain option |
| Rewrite the `on auth.users` trigger to create only a generic account row; product profiles created on first use (decision 3) | Dropped. The trigger is unchanged and `public.profiles` stays the account row |
| One schema per product, including `sat` (decision 2) | Kept for new products only. SAT stays in `public` |

Everything else in 0001 stands: one monorepo, one Supabase project and auth
pool, one root `supabase/` folder, one Vercel project per app, the existing
project kept in its current region.

## Options considered

### A. Subdomains with a parent-domain cookie (0001's plan)
Rejected.
- Login has to work across hosts. That needs a cookie `domain` option on every
  client, and a wrong value logs people out silently or leaks the session to
  hosts that should not see it.
- Each subdomain needs DNS records, a Vercel domain, and an entry in the Supabase
  redirect allowlist. Every new app repeats that.
- The magic link uses PKCE, so it only works where the code verifier cookie was
  set. A login started on one subdomain and finished on another fails.
- It would move SAT's live login off the host it runs on today.

### B. Vercel Microfrontends
Rejected for now. It solves the same routing problem, but it is a newer
platform feature with its own config and pricing. Plain rewrites do the job
with nothing extra to learn or pay for.

### C. One domain, path routing with plain rewrites (chosen)
- One origin, so the session is shared with no cookie configuration.
- Login stays where it already works.
- Each app still builds, deploys and versions its dependencies on its own.

## Consequences and accepted risks

| Risk | Mitigation |
|---|---|
| Landing is a single point of failure for every app's URL | Landing changes rarely. Each app stays reachable at its own vercel.app URL for debugging (logged out there, by design). |
| `TRACKER_URL` is read at landing build time | Changing it needs a landing redeploy. When it is unset the rewrites are skipped. |
| Behind the proxy, `request.url` carries the tracker's vercel.app host | Tracker redirects are relative and never built from `request.url`. |
| Landing previews proxy to the tracker's production deploy | Tracker previews are tested on the tracker's own preview URL. |
| `next/link` inside an app prefixes its `basePath` onto landing URLs | Links that cross apps are plain `<a>` tags. |
| A second domain (`ap-academy.online`) would hold its own session | It redirects to `www.apacademy.ca`. |

## Revisit this decision if

- An app needs to be on its own domain for a partner or a school.
- The landing proxy becomes a measurable latency or reliability problem.
- Vercel Microfrontends become the simpler option.

## Adding a future app

A new folder in `apps/`, a new Vercel project, its own `basePath`, two rewrite
lines in landing, its session middleware, and its own schema if it stores data.
No auth work.
