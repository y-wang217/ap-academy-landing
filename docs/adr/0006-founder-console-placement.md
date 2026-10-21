# ADR 0006: The Founder Console is a tracker route at /tracker/console, owner-gated in the page

- **Status:** Accepted
- **Date:** 2026-10-21
- **Decided by:** REQ-52 design approval, default C1. Charlie may supersede.
- **Implemented by:** REQ-53
- **Card:** REQ-52 (Console 1/12)

The data each console panel reads is specified in
[`docs/spec/founder-console/02-data-contracts.md`](../spec/founder-console/02-data-contracts.md).
The handoff pack and the discovery notes this ADR rests on are in
[`docs/spec/founder-console/`](../spec/founder-console/README.md).

## Context

Observed in the repository at `main` `b3f45e5` on 2026-10-21.

- One domain, path routing: workspace ADR 0002. Every app is served from
  `https://www.apacademy.ca`, so the session cookie is shared without a
  cookie `domain` option.
- Login exists only in landing. The tracker never renders a login page:
  `apps/tracker/proxy.ts` sends signed-out visitors to
  `/login?next=<path>` through `loginRedirectFor` in
  `apps/tracker/lib/login-redirect.ts`, which keeps the `/tracker` basePath;
  `loginPath` and `safeNextPath` live in `packages/db/src/paths.ts`.
- Owner authority is a `tracker.memberships` row with role `owner`
  (`supabase/migrations/0003_tracker_schema.sql`), checked in SQL by
  `tracker.is_org_owner(target_org)`
  (`supabase/migrations/0009_scheduler_staff_links.sql`), which every later
  owner-only RLS policy uses.
- App code has two resolvers:
  - `getViewer()` in `apps/tracker/lib/data/queries.ts` returns a `Viewer`
    of kind `not_configured`, `signed_out`, `staff` (role `owner` or
    `teacher`), `student`, `parent` or `none`. An owner membership wins over
    a teacher one (line 36).
  - `resolveSchedulerIdentity()` in `apps/tracker/lib/scheduler/identity.ts`
    with `requireScheduler()` in `apps/tracker/lib/scheduler/guard.ts` (line
    17), which returns 401, 403 or 503 JSON. This resolver runs
    `claim_staff_link` and needs Notion configured.
- Precedent: the owner setup page,
  `apps/tracker/app/scheduler/setup/page.tsx`, gates with
  `if (viewer.kind !== "staff" || viewer.role !== "owner") notFound();` at
  line 20 (tracker ADR 0053). `apps/tracker/lib/setup-scan.test.ts` pins it.
  ADR 0053 chose `getViewer()` over the scheduler resolver because a read-only
  owner page should have no `claim_staff_link` side effect.
- The permission contract across the five roles is tracker ADR 0052,
  `apps/tracker/docs/permission-matrix.md`,
  `supabase/tests/permission_matrix.sql` and
  `apps/tracker/lib/permission-matrix.test.ts`.
- Cross-site writes: `apps/tracker/proxy.ts` rejects a cross-site write with
  403 `forbidden` before it touches the session, but only under
  `ORIGIN_CHECKED_PREFIXES` in `apps/tracker/lib/cross-site.ts`
  (`/api/scheduler/` and `/api/iris/`, tracker ADR 0042). Server actions get
  Next's own origin check through `allowedOrigins` in
  `apps/tracker/next.config.ts`.
- Precedent for an owner-only product inside the tracker: Iris, at
  `/tracker/iris` (`apps/tracker/app/iris/`, tracker ADR 0057), with its own
  schema in `supabase/migrations/0024_iris_core.sql`, owner-read through
  `tracker.is_org_owner`.
- `apps/landing` has no owner concept. Its middleware refreshes the session on
  `/sat`, `/auth` and `/login` and never redirects, and apps never import each
  other (root `CLAUDE.md`).

## Decision

- The console is a tracker route group at **`/tracker/console`**
  (`https://www.apacademy.ca/tracker/console`), app folder
  `console/` under `apps/tracker/app/` (created by REQ-53).
- Every console page is a server component that calls `getViewer()` and calls
  `notFound()` unless `viewer.kind === "staff" && viewer.role === "owner"`,
  exactly as `apps/tracker/app/scheduler/setup/page.tsx` does. REQ-53 wraps
  this in an `ownerViewer()` helper in `apps/tracker/lib/pages.ts` (where
  `staffStudent` and `parentChild` already live), with no `claim_staff_link`
  side effect, and pins it with a source scan like `setup-scan.test.ts`.
- Supabase reads go through `viewer.db`, the owner's own client, so RLS is the
  real boundary. No console read uses the service role.
- Notion reads run server side with the integration token
  (`apps/tracker/lib/notion/config.ts`) and return data only to a caller that
  has already passed the owner check.
- Writes are server actions by default. A console JSON write route must sit
  under a prefix in `ORIGIN_CHECKED_PREFIXES`. Adding a prefix (for example
  `/api/console/`) amends tracker ADR 0042 and is decided in REQ-53.

## Rejection table

What each visitor gets, and which code produces it. "Console JSON route" means
a route REQ-53 or a later card adds; none exists today.

| Visitor | Console page (`/tracker/console`) | Console JSON route |
| --- | --- | --- |
| signed out | 307 to `/login?next=/tracker/console` from `apps/tracker/proxy.ts` (`redirectKeepingCookies` in `packages/db/src/middleware.ts`, target from `loginRedirectFor`) | the same 307 from the proxy |
| teacher (`kind: "staff"`, `role: "teacher"`) | 404 from `notFound()` in the page | 403 `forbidden` |
| student (`kind: "student"`) | 404 from `notFound()` | 403 `forbidden` |
| parent (`kind: "parent"`) | 404 from `notFound()` | 403 `forbidden` |
| role-less (`kind: "none"`) | 404 from `notFound()` | 403 `forbidden` |
| Supabase not configured (`kind: "not_configured"`) | 404 from `notFound()` (the proxy passes the request through when not configured) | 503 (`scheduler_not_configured` when the route uses `requireScheduler`) |
| cross-site write to a route under `ORIGIN_CHECKED_PREFIXES` | n/a | 403 `forbidden` from `apps/tracker/proxy.ts`, before the session is read |
| any non-owner whose query reaches the database | RLS through `tracker.is_org_owner` returns no rows | RLS returns no rows |

Notes:

- Prefetch requests skip the proxy (the `missing` header rules in the
  `apps/tracker/proxy.ts` matcher), so the page check, not the proxy, is the
  gate. A skipped prefetch neither refreshes nor grants a session.
- The 401 `unauthenticated` from `requireScheduler` is a backstop behind the
  proxy redirect: a signed-out request normally never reaches the route.
- The 403 and 503 bodies are the `Denial` shapes in
  `apps/tracker/lib/scheduler/guard.ts`. A console route that uses
  `getViewer()` instead returns the same codes with the same bodies; REQ-53
  picks one and tests every row of this table.

## Options rejected

- **A landing `/console` route.** Landing has no owner concept, its
  middleware never redirects, and apps never import each other, so it would
  need its own copy of the owner check and the tracker's data code.
- **A new console app under `apps/`.** It needs a Vercel project, two landing rewrite
  lines, and copies of the proxy, the login redirect and the origin check, all
  for one user. Root `CLAUDE.md` reserves a new app for a new product.
- **An apex `/console` rewrite.** Deferred. If Charlie wants that address it
  is a later landing decision (two rewrite lines), not part of these cards.

## Consequences

- REQ-53 adds no schema. A later card that needs one creates its own schema
  with RLS on every table through `tracker.is_org_owner`, and extends
  `apps/tracker/docs/permission-matrix.md`,
  `supabase/tests/permission_matrix.sql` and
  `apps/tracker/lib/permission-matrix.test.ts` in the same PR.
- Console writes to Notion (REQ-61) need a new ADR that amends workspace ADR
  0004 ("nothing is written back to Notion except the generated Weekly
  Schedule summary"). This ADR does not amend 0004.
- The e2e gate pattern is the setup-page status check in
  `e2e/tracker/flows.mjs` (around line 1388), which requests the page with
  `maxRedirects: 0` for each seeded role.
- `safeNext` in `apps/landing/app/auth/callback/route.ts` is weaker than
  `safeNextPath` in `packages/db/src/paths.ts` (it does not reject `/\host`
  or control characters). REQ-53 records it as a finding before it adds
  `/tracker/console` as a `next` target.
- Root `CLAUDE.md` does not list this ADR yet; REQ-53 adds the link when it
  ships the route (this card changes only `docs/`).

## Revisit when

- a second person needs the console (a setter, Layer 2 of the OPS SYSTEM
  plan), which turns the owner gate into a permission of its own; or
- the console needs its own deploy cadence or its own domain.
