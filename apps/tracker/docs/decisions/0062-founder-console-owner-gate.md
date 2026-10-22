# 0062: The founder console is gated by getViewer() in its layout, and its API writes are origin-checked
Status: accepted
Date: 2026-10-22

## Context
Workspace ADR 0006 (REQ-52) placed the Founder Console in the tracker at `/tracker/console`, founder only, every read through the owner's own client. REQ-53 builds the gate and an empty shell before any panel reads business data, so the boundary is proven once. The tracker already has two owner checks: `getViewer()` with `kind = staff` and `role = owner` (the setup page, ADR 0053) and the scheduler identity's `admin` scope (`requireScheduler`, used by Iris). Writes under `/api/scheduler/` and `/api/iris/` are origin-checked in the proxy (ADR 0042).

## Decision
- **Owner check.** Pages call `ownerViewer()` in `lib/pages.ts`: `getViewer()`, then `viewer.kind !== "staff" || viewer.role !== "owner"` is a `notFound()`. JSON routes call `requireOwner(viewer)` in `lib/console/guard.ts` over the same `getViewer()`. Neither uses `resolveSchedulerIdentity()`, so the console runs no `claim_staff_link`, needs no Notion and schedules no outbox drain.
- **Gate in the layout and the page.** `app/console/layout.tsx` awaits the gate before rendering children, because a `loading.tsx` boundary streams a 200 shell before the page runs and a later page-level `notFound()` cannot set a 404. The page checks again; React `cache` makes it one `getViewer()` per request.
- **No console 404.** `app/console/` has no `not-found.tsx` and no `error.tsx`: a denied visitor gets the tracker's usual 404, with no console chrome.
- **Session expired.** A render with no session (a prefetch skips the proxy) shows "Your session has ended." and a plain `<a>` to `/login?next=/tracker/console`. Real navigations get the proxy's 307.
- **Fixed denials.** Console JSON denials are `{"error":"unauthenticated"}` (401), `{"error":"forbidden"}` (403), `{"error":"console_not_configured"}` and `{"error":"console_unavailable"}` (503), all `Cache-Control: no-store`, and a denial reads nothing.
- **Data layer agrees.** `GET /api/console/health` calls `tracker.is_org_owner(org)` on the owner's cookie client after the app check; `false` is a 403, so a policy drift fails closed.
- **Origin check.** This amends ADR 0042: `ORIGIN_CHECKED_PREFIXES` gains `/api/console/`, so a cross-site write under it is refused before the session is read. `proxy.ts` is unchanged; it already applies the list.

## Alternatives considered
- `requireScheduler(["admin"])` like Iris: runs `claim_staff_link` and depends on Notion for a check the membership row answers alone.
- Gating only in the page: a 200 status after streaming, so a non-owner would see a blank 200 instead of a 404.
- A console-styled 404: shows console chrome to people who should not know the route exists.
- No origin-check prefix and server actions only for writes: later console cards will have JSON writes, and the prefix costs nothing now.

## Consequences
- Every later console route lives under `/api/console/`, calls a `lib/console/handlers.ts` handler that runs `requireOwner` first, and is covered by the console source scan (`lib/console-scan.test.ts`).
- A scheduling-only teacher who is not an org member gets a 404 even with a staff link: the console is for the owner membership only.
- If the owner role ever moves out of `tracker.memberships`, both this gate and `is_org_owner` change together.
