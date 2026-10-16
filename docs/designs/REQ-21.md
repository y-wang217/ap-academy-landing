# Design: REQ-21 Benchmark script and Server-Timing on tracker API routes

Card: https://app.notion.com/p/3fad6ae73dd7813d8e02e97917f4b5cd (the Notion card holds the full approved design; this is the working copy for the reviewer.)

**Summary:** The tracker's GET scheduler routes return a `Server-Timing` header (`auth`, `db`, `total`), and a new `scripts/bench.sh` times public and scheduler URLs through `www.apacademy.ca` and directly on the tracker host. Measures only; fixes nothing.

**Risk:** Low. `needs-human-merge` because it touches `scripts/` and `packages/db/`.

## Acceptance criteria
- AC1: `apps/tracker/lib/server-timing.ts` exports a request-scoped timer. Inside `withServerTiming(handler)`, Supabase calls through `getDb()` are recorded: `/auth/v1/` adds to `auth`, `/rest/v1/` to `db`; each holds summed ms (1 decimal) and call count.
- AC2: Header is `auth;dur=<ms>;desc="<n> calls", db;dur=<ms>;desc="<n> calls", total;dur=<ms>`. Zero-call metrics emit `dur=0`. `total` is handler wall time.
- AC3: Outside `withServerTiming`, `getDb()` behaves as today (plain global `fetch`, records nothing).
- AC4: Every GET in `me`, `staff`, `staff/[staffId]`, `week`, `classes/occurrences`, `conflicts`, `availability`, `import`, `monthly-review` is wrapped. `daily-task/route.ts` untouched. Non-GET exports unchanged.
- AC5: Header set on every response of a wrapped route including 401/403/400/503; status, body and other headers unchanged.
- AC6: A throwing handler's error is rethrown unchanged.
- AC7: Through the landing proxy, a signed-in GET of `/tracker/api/scheduler/me` carries `auth`, `db`, `total`.
- AC8: `scripts/bench.sh` is GET only, `BENCH_RUNS` (default 20) runs per URL, prints per URL and origin median and max of DNS, connect, TLS, TTFB, total, last status, last `x-vercel-id`, median of each Server-Timing metric.
- AC9: `BENCH_COOKIE` goes to curl on stdin (`-H @-`), never argv, and never appears in output or files.
- AC10: Without `BENCH_COOKIE` the script runs and prints one note; without `BENCH_TRACKER_ORIGIN` direct rows are skipped with one note.
- AC11: `docs/PERF.md` explains running, every column, and holds a baseline table.

## Approach
`AsyncLocalStorage` timer; `timedFetch` injected through optional `getServerClient({ fetch })` in `packages/db/src/server.ts`; `getDb()` passes it; nine routes become `export const GET = withServerTiming(...)`; `scripts/bench.sh` (bash + curl); `docs/PERF.md`; tracker ADR 0044. No migration, no new dependency.

## Test plan
Vitest for the helper and route wiring; one new `e2e/tracker/flows.mjs` check for AC7 (`pnpm test:tracker`); gate commands; `bash -n` / shellcheck and a flag grep on `bench.sh`; a local run with a sentinel cookie for AC9 and a run without env for AC10.

## Decisions (defaults taken)
1 no new deps; 2 header on every response (A); 3 timed fetch via `getServerClient` option (A); 4 `scripts/bench.sh` (A); 5 `BENCH_TRACKER_ORIGIN` env, no default (A); 6 builder fills unauthenticated rows, Charlie the signed-in ones (A); 7 nine routes; 8 write ADR 0044; 9 no schema; 10 label `needs-human-merge`.
