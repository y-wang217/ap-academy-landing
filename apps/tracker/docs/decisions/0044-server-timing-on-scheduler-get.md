# 0044: Server-Timing on the scheduler GET routes
Status: accepted
Date: 2026-10-16

## Context
The app sometimes feels slow and nothing in the repo says where the time goes. The Vercel plan is Hobby, so the dashboard cannot run timing queries. REQ-21 adds measurement only.

## Decision
- The nine scheduler GET routes (`me`, `staff`, `staff/[staffId]`, `week`, `classes/occurrences`, `conflicts`, `availability`, `import`, `monthly-review`) are wrapped in `withServerTiming` (`lib/server-timing.ts`). The response carries `Server-Timing: auth;dur=..., db;dur=..., total;dur=...` with call counts in `desc`.
- `auth` and `db` come from a timed `fetch` passed to the Supabase client through a new optional `getServerClient({ fetch })` in `@ap-academy/db`. `getDb()` passes it; no other caller changes. Outside `withServerTiming` the timed fetch is the plain global `fetch`.
- The header is sent on every response of those routes, including 401 and 403. It holds durations and call counts only. Supabase Auth timing is not secret.
- `daily-task`, `proxy.ts` and the Notion client are untouched. Notion time reads as `total - auth - db`.

## Consequences
- `db` sums parallel calls, so it can exceed `total`; the call count shows why.
- Anyone, signed in or not, can read these timings from the nine routes. If that becomes a concern, gate the header behind a request flag.
