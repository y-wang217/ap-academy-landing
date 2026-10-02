# ADR 0001: Monorepo with one shared identity layer

- **Status:** Accepted
- **Date:** 2026-10-02
- **Decided by:** Charlie
- **Suggested path in repo:** `docs/adr/0001-monorepo-shared-identity.md`

## Context

AP Academy is adding a Student Tracker (student progress dashboard) alongside the existing landing app, which already hosts the SAT product and its Supabase auth.

Two questions came up when deciding where the tracker should live:

1. **Where does the code live?** Same app, separate repo, or monorepo.
2. **Where does the data live?** Shared Supabase project and auth pool, or a separate one.

These were treated as separate decisions. The repo boundary is cheap to change later (moving folders). The auth boundary is expensive to change later (merging or splitting user pools).

Business context that drove the outcome: AP Academy plans to acquire users through free-tier software and convert them into paid tutoring clients. That makes the user account the core asset, and it needs to be one account across every product.

## Decision

1. **One monorepo.** Restructure `ap-academy-landing` into a pnpm workspace:
   - `apps/landing`: the existing app, including SAT
   - `apps/tracker`: the new Student Tracker
   - `packages/db`: shared Supabase client and generated types
   - `supabase/`: the single migrations folder, at the repo root
2. **One Supabase project as the shared identity layer.** A generic `accounts` table, plus one schema per product (`sat`, `tracker`), each with its own RLS policies.
3. **Rewrite the `on auth.users` trigger** so it creates only the generic account row. Product profiles (for example the SAT profile) are created on first use of that product.
4. **One Vercel project per app**, each on its own subdomain, with its own dependencies and test setup. A session cookie scoped to the parent domain carries login across apps.
5. **Keep the existing Supabase project in its current East region.** No migration to a new project.

## Options considered

### A. Tracker as a `/tracker` route inside the landing app
Rejected. One deploy pipeline means a tracker bug can block a landing page fix. It also forces two test setups (`node --test` and Vitest) and tracker-only dependencies (Zod) into an app that has none today. Every future tool would make the app heavier.

### B. Separate repo with its own Supabase project
This was the original recommendation and is the cleanest option in isolation: independent deploys, independent dependencies, and minors' grade data kept out of the SAT auth pool. Rejected because it creates two user pools. A free-tier user who converts to tutoring would need a second account, and merging auth pools later is a painful migration.

### C. Separate repos sharing one Supabase project
Rejected. Two repos writing migrations against one database is a maintenance hazard: no single source of truth for schema, and migration ordering conflicts.

### D. Monorepo, one Supabase project, separate Vercel projects (chosen)
Keeps apps isolated at the deploy and dependency level, keeps all AP Academy development in one place, and gives one account per user across products.

## Rationale

- **Single sign-on supports the funnel.** Free software users convert to paid tutoring on the same account, with no re-registration.
- **One database needs one migrations owner.** Once the auth pool is shared, the monorepo stops being overhead and becomes the simplest way to keep schema changes in one place.
- **App isolation is preserved.** Functionality is not grouped into one app. Each app deploys, tests, and versions its dependencies on its own.
- **Future tools have an obvious home.** A new product is a new folder under `apps/` and a new schema, reusing `packages/db` and the existing accounts.
- **Region.** The target market is Ontario, so the East region is close enough for latency. Staying on the existing project avoids a user migration.

## Accepted risks and mitigations

| Risk | Mitigation |
|---|---|
| Minors' grade data shares a database with a public free-tier product. A leaked service-role key exposes everything. | Service-role key is server-only. Tracker data sits in its own schema with RLS. Write RLS tests for the tracker schema before real grades are stored. |
| A bad migration can affect every product. | All migrations go through the root `supabase/` folder and are reviewed there. |
| Student data is stored outside Canada. | Disclose the storage location in the privacy policy and in parent-facing onboarding. |
| Upfront restructuring cost. | One-time work: move landing to `apps/landing`, repoint Vercel's root directory, add pnpm workspaces. No Turborepo until builds are slow. |

## Assumptions, and what would disprove them

- **Assumption: free-tier users convert to tutoring.** This is a hypothesis, not a measured result. Check: track how many SAT users become tutoring leads. Until some do, hold off on cross-product features (upsell prompts, shared dashboards). The shared auth pool is cheap enough to keep regardless.
- **Assumption: the East region is acceptable to clients.** Check: if a parent, school, or partner requires Canadian data residency, revisit. Supabase regions cannot be changed in place, so that would mean a new project and a user migration.

## Revisit this decision if

- A client or partner contract requires Canadian data residency.
- A product needs a compliance boundary that schema separation and RLS cannot satisfy.
- AP Academy takes on other developers who need access to one app but must not see another's data.

## Follow-ups

- [ ] Rewrite the `on auth.users` trigger to create only the generic account row
- [ ] Move the existing app to `apps/landing` and repoint the Vercel root directory
- [ ] Create `packages/db` and the root `supabase/` migrations folder
- [ ] Scaffold `apps/tracker` with its own Vercel project and subdomain
- [ ] Write RLS tests for the `tracker` schema before storing real grades
- [ ] Add data storage location to the privacy policy
