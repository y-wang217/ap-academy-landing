# REQ-53: Console 2/12: Founder-only /tracker/console route, owner gate and secure API boundary

Copied from the approved design on the Notion card (https://app.notion.com/p/400d6ae73dd781aeacadf88fe9efc5e1) so the reviewer can read it next to the diff. Risk High: Charlie approved the design by hand.

## Build notes (where the build differs from the text below)
- Tracker ADR number: 0062 as designed. `main` ends at 0060 (REQ-40 merged), open PR #107 (REQ-43) holds 0061.
- The session-expired render test is `lib/console/session-expired.test.ts` (the design's path); the component is plain `<p>` and `<a>`, rendered with `react-dom/server`.

## Summary
Charlie (the org owner) reaches an empty, protected console shell at `/tracker/console` with his existing session, and every other visitor gets the tracker's usual 404 from the page and a fixed 403 JSON from the one console API route (`GET /api/console/health`), decided before any read, with console writes origin-checked in the proxy.

**Risk:** High (it adds a new permission surface over owner-visible data and widens the proxy's cross-site write check, a security boundary; Charlie approves and merges).

## Problem
Console 1/12 (REQ-52, PR #108) fixed the placement in workspace ADR `docs/adr/0006-founder-console-placement.md`: a tracker route at `/tracker/console`, gated in the page with `getViewer()` like the owner setup page, every read through the owner's own client. This card builds only the gate and the shell that later Console cards put panels into, so the boundary is proven once, with tests, before any business data is read.

## Acceptance criteria
- AC1: The owner's session (`teacher@example.com` in the e2e seed) reaches `/tracker/console` through the landing rewrite with no second sign-in: 200, heading "Console", and `GET /tracker/api/console/health` answers 200 `{"status":"ok","checkedAt":"<ISO>"}` with `Cache-Control: no-store`.
- AC2: A signed-out request to `/tracker/console` gets a 307 whose `Location` is `/login?next=/tracker/console`, and the response body contains neither "Console" nor `data-console`. A signed-out `GET /tracker/api/console/health` gets the same 307.
- AC3: A scheduling teacher (Ryan), a grade teacher (teacher2), a student (sam), a parent, a role-less signed-in user (nobody), a revoked staff link (Ryan after REQ-32 revokes him) and a deleted membership (teacher2 after removal) each get 404 from `/tracker/console` and 403 `{"error":"forbidden"}` from `GET /api/console/health`, and the health route makes no database call after the role check fails.
- AC4: Existing tracker, parent, Iris and SAT flows and sign-out are unchanged: `pnpm test:tracker`, `pnpm test:sso` and every unit suite in `gate_commands` pass with only the additions below.
- AC5: Every denied API body is byte-equal to a fixed template (`{"error":"forbidden"}`, `{"error":"unauthenticated"}`, `{"error":"console_not_configured"}`, `{"error":"console_unavailable"}`). Every denied page body in AC3 is byte-identical to the body the role-less user gets, and none contains "Console", `data-console`, a seeded student name, a parent email or the owner's email.
- AC6: A cross-site POST to `/tracker/api/console/health` (header `Origin: https://evil.example`) is refused with 403 `{"error":"forbidden"}` by the proxy before the session is read, while the same POST same-site reaches the route and gets 405 (the route has GET only).
- AC7: No console file imports `@ap-academy/db/service`, `resolveSchedulerIdentity`, `requireScheduler` or anything under `lib/notion/`, calls `claim_staff_link`, or writes (`.insert(`, `.update(`, `.upsert(`, `.delete(`); the only database call is `rpc("is_org_owner")` on the owner's own client (`viewer.db`).
- AC8: `apps/tracker/app/console/` has no `not-found.tsx` and no `error.tsx`; the layout and the page both call `ownerViewer()` and export `dynamic = "force-dynamic"`; `ownerViewer()` contains the gate `viewer.kind !== "staff" || viewer.role !== "owner"` followed by `notFound()`.
- AC9: A viewer whose session is gone when the page renders (the proxy was skipped for a prefetch) sees only "Your session has ended." and a plain `<a href="/login?next=/tracker/console">` link, no console markup.

## Approach

### Owner gate (server)
- `apps/tracker/lib/console/guard.ts` (new, pure, imports only the `Viewer` type): `requireOwner(viewer)` returns `{ ok: true, viewer }` (narrowed to staff owner) or a typed `ConsoleDenial`: `not_configured` is 503 `console_not_configured`, `signed_out` is 401 `unauthenticated`, everything else is 403 `forbidden`. One `CONSOLE_DENIALS` constant holds the bodies.
- `apps/tracker/lib/pages.ts`: new `ownerViewer = cache(async () => ...)`. It calls `getViewer()`; `signed_out` returns `{ kind: "expired" }`; then `if (viewer.kind !== "staff" || viewer.role !== "owner") notFound();`; else `{ kind: "owner", viewer }`. No `resolveSchedulerIdentity()`.

### Pages
- `app/console/layout.tsx`: `force-dynamic`, awaits `ownerViewer()` before rendering children (a `loading.tsx` boundary would stream a 200 before a page-level `notFound()`). `expired` renders `SessionExpired`.
- `app/console/page.tsx`: `force-dynamic`, calls `ownerViewer()` again, renders `TopBar` and `Page` titled "Console" in `<div data-console>`, with one `Notice`: "The console is ready. Panels arrive in the next updates."
- `app/console/loading.tsx`: static "Loading console", no data import.
- `components/console/session-expired.tsx`: "Your session has ended." and a plain `<a>` to `loginRedirectFor({ basePath: "/tracker", pathname: "/console", search: "" })`.
- `app/page.tsx`: one owner-only `Link` "Console" beside "Iris inbox".

### API boundary
- `lib/console/handlers.ts`: `handleConsoleHealth({ viewer, now })`. `requireOwner` first; a denial is sent as is with `Cache-Control: no-store`. Then `viewer.db.tracker.rpc("is_org_owner", { target_org: viewer.orgId })`: `true` is 200 `{ status: "ok", checkedAt }`, `false` is 403, an error is 503 `console_unavailable`. Never throws.
- `app/api/console/health/route.ts`: `force-dynamic`, `GET` only.
- `lib/cross-site.ts`: `ORIGIN_CHECKED_PREFIXES` becomes `["/api/scheduler/", "/api/iris/", "/api/console/"]`. `proxy.ts` is not edited.

### Docs
- Tracker ADR `0062-founder-console-owner-gate.md` and its README row.
- `docs/permission-matrix.md`: new `## Founder Console` section at the end.
- Root `CLAUDE.md`: link to workspace ADR 0006.
- `docs/readiness.md`: finding F14 on the auth callback's local `safeNext` (Decision 5).
- `apps/tracker/docs/PLAN.md` progress line.

## Migration
None.

## Test plan
| Test | Type | Covers |
| --- | --- | --- |
| `lib/console/guard.test.ts`: every `Viewer` kind maps to the expected status; bodies byte-equal `CONSOLE_DENIALS` | unit | AC3, AC5 |
| `app/api/console/console-routes.test.ts`: `handleConsoleHealth` with fake viewers and an rpc spy; non-owners 403 with no call; signed out 401; not configured 503; owner 200 with injected clock; rpc false 403; rpc error 503; `no-store` everywhere; every `route.ts` under `app/api/console/` calls a handler from `lib/console/handlers.ts` | unit | AC1, AC3, AC5 |
| `lib/console-scan.test.ts`: gate expression, `force-dynamic`, no `not-found.tsx`/`error.tsx`, no service client, Notion, scheduler identity, `claim_staff_link` or writes, only `rpc("is_org_owner")`, `loading.tsx` imports no data, no em dash | unit | AC7, AC8 |
| `lib/cross-site.test.ts`: prefix pin with `/api/console/` | unit | AC6 |
| `daily-task-routes.test.ts` service-client allowlist unchanged | unit | AC7 |
| `lib/permission-matrix.test.ts` still passes | unit | AC4 |
| `e2e/tracker/flows.mjs` REQ-53 block after REQ-33's setup-page checks | e2e | AC1, AC2, AC3, AC5, AC6 |
| `e2e/tracker/flows.mjs` after REQ-32 revocation and membership deletion | e2e | AC3 |
| `e2e/sso/checks.mjs`: signed out lands on `/login?next=/tracker/console`; mock teacher membership gets 404 | e2e | AC2, AC3, AC4 |
| `lib/console/session-expired.test.ts` | unit | AC9 |

## Decisions (defaults taken)
1. No new dependencies. 2. No migration; tracker ADR 0062. 3. Add `/api/console/` to `ORIGIN_CHECKED_PREFIXES`; `proxy.ts` not edited. 4. `requireOwner` over `getViewer()`. 5. Record F14, leave the callback alone. 6. Gate in layout and page, `cache`d. 7. No console `not-found.tsx`. 8. Expired notice and plain link. 9. Health does the `is_org_owner` RPC. 10. Owner-only home link. 11. `console_*` 503 names. 12. Permission matrix doc section only. 13. Add the ADR 0006 link to root `CLAUDE.md`.
