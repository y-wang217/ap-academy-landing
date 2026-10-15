# 0042: The proxy refuses cross-site writes to the scheduler API
Status: accepted
Date: 2026-10-15

## Context
The JSON routes under `app/api/scheduler/` authenticate with the session cookie alone and relied on `SameSite=Lax`. Server actions already get an Origin check from `experimental.serverActions.allowedOrigins`.

## Decision
- `proxy.ts` checks every request under `/api/scheduler/` before `updateSession`. A POST, PATCH, PUT or DELETE is refused with `403 {"error":"forbidden"}` and `Cache-Control: no-store` when `Sec-Fetch-Site` is `cross-site`, or when `Origin` is present and its host (with port) is not the public site host with or without `www.`. `null` and unparseable origins are denied. Requests with neither header pass and still need a session.
- The rule is the pure `isCrossSiteWrite` in `lib/cross-site.ts`; the host list is `allowedSiteHosts(SITE_URL)`, the same source as `allowedOrigins`.
- The check sits in the proxy, not in each handler, so new routes under the prefix are covered. `daily-task/run` stays outside the matcher and keeps its bearer secret.
- No CSRF tokens and no cookie changes.

## Consequences
- Vercel preview hosts are not allowed: a preview needs `NEXT_PUBLIC_SITE_URL` set to its host, as server actions already do.
- Local dev needs `NEXT_PUBLIC_SITE_URL=http://localhost:3000` in `apps/tracker/.env.local`, or scheduler writes return 403. The e2e stack sets it.
