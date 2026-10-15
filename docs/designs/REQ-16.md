# REQ-16: Cross-site request check for the scheduler API

Notion card: https://app.notion.com/p/3f9d6ae73dd7817f9184fad373332e0f

**Summary:** The tracker's proxy rejects any state-changing request to `/tracker/api/scheduler/*` that comes from another site with `403 {"error":"forbidden"}`, before the session is touched.

**Risk:** Medium. No migration, no dependency. `apps/tracker/proxy.ts` is in `human_merge_paths`.

## Acceptance criteria
- AC1: `isCrossSiteWrite` (pure, `apps/tracker/lib/cross-site.ts`) denies POST, PATCH, PUT, DELETE when `Sec-Fetch-Site` is `cross-site`, whatever the Origin.
- AC2: It denies those methods when `Origin` is present and its host is not allowed, including `null` and unparseable values.
- AC3: It allows the site host with or without `www.`, case-insensitively.
- AC4: It allows GET, HEAD, OPTIONS, and a write with neither header.
- AC5: `allowedSiteHosts(siteUrl)` returns the host plus its `www.`-less form, deduplicated (same list as `next.config.ts` `allowedOrigins`).
- AC6: Under `/api/scheduler/`, `proxy()` answers a denied request 403, `{"error":"forbidden"}`, `Cache-Control: no-store`, without calling `updateSession`.
- AC7: Paths outside `/api/scheduler/` are not checked; `daily-task/run` stays excluded from the matcher.
- AC8 (e2e): a signed-in admin POST to `/tracker/api/scheduler/daily-task` with `Origin: https://evil.example` is 403; without it, 200, and the Work page count stays 1.
- AC9 (e2e): every existing `flows.mjs` check still passes.
- AC10: No file under `apps/landing/` changes.

## Approach
- New `apps/tracker/lib/cross-site.ts` and `cross-site.test.ts`.
- `apps/tracker/proxy.ts`: `SITE_HOSTS = allowedSiteHosts(SITE_URL)` at module level; check at the top of `proxy()` for paths starting `/api/scheduler/`.
- New `apps/tracker/proxy.test.ts` (403 shape, pass-through, matcher exclusion).
- `e2e/tracker/stack.sh`: add `NEXT_PUBLIC_SITE_URL=http://localhost:3000` to the env.
- `e2e/tracker/flows.mjs`: evil-Origin and plain POST checks after "a second press adds no page", via `teacher.context().request.post`, `date: isoIn(0)`.
- Docs: tracker ADR 0042 plus README row; root `CLAUDE.md` local-dev note about `NEXT_PUBLIC_SITE_URL`.

## Out of scope
CSRF tokens, cookie attributes, Origin checks on pages or server actions, Referer fallback, Vercel preview hosts.

## Decisions (defaults)
Proxy for the whole prefix; `cross-site` denies even with an allowed Origin; host and port compared, scheme ignored; previews not allowed; no new dependency or migration.
