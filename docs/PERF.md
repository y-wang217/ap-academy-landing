# Performance measurement

`scripts/bench.sh` times GET requests; the tracker's scheduler GET routes return a `Server-Timing` header (tracker ADR 0044). This measures. It changes nothing.

## Run it

```bash
bash scripts/bench.sh                                    # public rows, unauthenticated
BENCH_TRACKER_ORIGIN=https://<tracker>.vercel.app bash scripts/bench.sh
```

Copy the tracker's own URL from its Vercel project, Domains page. Without it, direct-host rows are skipped.

For signed-in rows, copy the `Cookie` request header value from browser devtools (Network tab, any `/tracker` request), then:

```bash
export BENCH_COOKIE='sb-...=...'
bash scripts/bench.sh
unset BENCH_COOKIE
```

Do not put the cookie in an `.env` file. The script sends it to curl on stdin, so it is not in `ps` output, and never prints or stores it. Requests are GET only, one at a time.

Other settings: `BENCH_RUNS` (default 20), `BENCH_SITE` (default `https://www.apacademy.ca`), `BENCH_DATE` (default today). Extra paths can be passed as arguments.

## Columns

All times are milliseconds, shown as `median/max` over the runs.

| column | meaning |
|---|---|
| origin, path | what was requested; redirects are not followed, so `/tracker` signed out is one 307 hop |
| status | HTTP status of the last run |
| dns, connect, tls | name lookup; TCP connect; TLS handshake (each as its own step, not cumulative) |
| ttfb | time to first byte, cumulative from the start of the request |
| total | whole request |
| st:auth | median `Server-Timing` `auth`: the in-route session lookup (Supabase Auth calls) |
| st:db | median `db`: summed Supabase REST call time |
| st:total | median `total`: the route handler's wall time |
| vercel-id | last `x-vercel-id`, which shows the edge and function regions |

## Reading it

- Rewrite cost: the `www.apacademy.ca` row minus the direct-host row for the same path.
- Middleware time: the row's `ttfb` minus `st:total`.
- `db` sums parallel calls, so it can exceed `st:total`. The call count is in the raw header (`desc="2 calls"`).
- `st:*` is empty for non-scheduler paths and, if the rewrite drops response headers, for site rows; the direct rows still carry it.
- Notion time is not a metric: it reads as `st:total - st:auth - st:db`.

## Baseline

Unauthenticated production rows, filled by the builder before merge. Signed-out scheduler paths answer with the proxy's 307 to `/login`, not 401, so they time the proxy only. Signed-in and `Server-Timing` rows are filled after deploy.

| date | who | runs | origin | path | status | ttfb med | total med | notes |
|---|---|---|---|---|---|---|---|---|
| 2026-10-16 | builder (sandbox, unauthenticated) | 10 | www.apacademy.ca | `/` | 200 | 184 | 202 | |
| 2026-10-16 | builder (sandbox, unauthenticated) | 10 | www.apacademy.ca | `/health` | 200 | 176 | 176 | |
| 2026-10-16 | builder (sandbox, unauthenticated) | 10 | www.apacademy.ca | `/sat` | 200 | 183 | 183 | |
| 2026-10-16 | builder (sandbox, unauthenticated) | 10 | www.apacademy.ca | `/tracker` | 307 | 227 | 227 | |
| 2026-10-16 | builder (sandbox, unauthenticated) | 10 | www.apacademy.ca | `/tracker/api/scheduler/me` | 307 | 173 | 173 | |
| 2026-10-16 | builder (sandbox, unauthenticated) | 10 | www.apacademy.ca | `/tracker/api/scheduler/staff` | 307 | 171 | 171 | |
| 2026-10-16 | builder (sandbox, unauthenticated) | 10 | www.apacademy.ca | `/tracker/api/scheduler/week?date=2026-10-16` | 307 | 166 | 166 | |
| 2026-10-16 | builder (sandbox, unauthenticated) | 10 | www.apacademy.ca | `/tracker/api/scheduler/classes/occurrences?from=2026-10-16&to=2026-10-23` | 307 | 200 | 200 | |
| 2026-10-16 | builder (sandbox, unauthenticated) | 10 | www.apacademy.ca | `/tracker/api/scheduler/conflicts?from=2026-10-16&to=2026-10-23` | 307 | 173 | 173 | |
| 2026-10-16 | builder (sandbox, unauthenticated) | 10 | www.apacademy.ca | `/tracker/api/scheduler/availability?from=2026-10-16&to=2026-10-23` | 307 | 174 | 174 | |
| 2026-10-16 | builder (sandbox, unauthenticated) | 10 | www.apacademy.ca | `/tracker/api/scheduler/monthly-review?month=2026-10` | 307 | 165 | 165 | |
