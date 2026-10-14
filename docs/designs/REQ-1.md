# REQ-1: Pipeline smoke test: add a /health page that returns 'ok'

Approved design, copied from the Notion card:
https://app.notion.com/p/3f9d6ae73dd78110acb3ece4b10d1b6f

**Summary:** `GET https://www.apacademy.ca/health` returns HTTP 200 with the plain-text body `ok`, served by a new Next.js Route Handler in the landing app.
**Risk:** Low (one new route file and one test file in `apps/landing`; no data, auth, dependencies, migrations or personal data).

## Problem
The agent pipeline needs a trivial, low-risk change to prove Ready → Design → Build → Review → Done works end to end. The deliverable is a health endpoint at `/health` that returns `ok`. Audience: Charlie and any uptime check, not students or parents. Because landing owns the domain (ADR 0002), `/health` belongs in `apps/landing`.

## Acceptance criteria
- [ ] AC1: `GET /health` responds with status 200 and a body of exactly `ok` (no trailing newline, no HTML).
- [ ] AC2: The response has `Content-Type: text/plain; charset=utf-8`.
- [ ] AC3: The response has `Cache-Control: no-store`, and the route module exports `dynamic = "force-dynamic"` so it is not prerendered at build time (a hit proves a live function answered, not a cached file).
- [ ] AC4: The response has `X-Robots-Tag: noindex` so the endpoint never lands in search results.
- [ ] AC5: The route has no dependency on Supabase or any other module: `apps/landing/app/health/route.ts` contains no `import` statements, and `apps/landing/middleware.ts` (matcher `/sat/:path*`, `/auth/:path*`, `/login`) is unchanged, so `/health` answers even when Supabase env vars are unset or the project is paused.
- [ ] AC6: `pnpm --filter landing test` runs the new test file and it passes.

## Approach
**New file `apps/landing/app/health/route.ts`** (App Router Route Handler, not a `page.tsx`, so the body is plain text rather than an HTML document inside the root layout):

```typescript
export const dynamic = "force-dynamic";

export function GET(): Response {
  return new Response("ok", {
    status: 200,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex",
    },
  });
}
```

- Uses the global Web `Response`, not `NextResponse`, so the module has zero imports and can be loaded directly by `node --test` (Node 24 type stripping) without resolving `next/server`.
- Next auto-implements `HEAD` from `GET`, so `HEAD /health` also works with no extra code.

**New file `apps/landing/app/health/route.test.ts`** (node:test + node:assert/strict, same style as `apps/landing/lib/questions/rng.test.ts`; imports `./route.ts` with the explicit extension, which `tsconfig.json` allows via `allowImportingTsExtensions`). Next ignores non-special filenames in `app/`, so this file is not served.

**Edit `apps/landing/package.json`** scripts:
- Add `"test:app": "node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test \"app/**/*.test.ts\""`
- Change `"test"` to `"npm run test:questions && npm run test:lesson && npm run test:app"`

The current `test` script only globs `lib/questions/**` and `lib/lesson/**`, so without this the new test would never run in the gate or CI (`.github/workflows/ci.yml` runs `pnpm --filter landing test`). The test cannot live under `lib/lesson/` because `lib/lesson/boundaries.test.ts` forbids imports from `app/`.

**Not changed:** `apps/landing/middleware.ts`, `apps/landing/next.config.ts` (no rewrite or redirect touches `/health`), `apps/landing/app/sitemap.ts`, `apps/landing/public/robots.txt`.

**Data model changes:** None.

**UI:** None. The only state is success: `200 ok`. There is no loading, empty or error state; if the function cannot run, the platform returns its own 5xx, which is exactly what a health check should surface.

## Test plan
| Test (in `apps/landing/app/health/route.test.ts`) | Type | Covers |
|---|---|---|
| `GET()` returns status 200 and `await res.text()` strictly equals `"ok"` | unit | AC1 |
| `res.headers.get("content-type")` equals `"text/plain; charset=utf-8"` | unit | AC2 |
| `res.headers.get("cache-control")` equals `"no-store"`, and the imported `dynamic` equals `"force-dynamic"` | unit | AC3 |
| `res.headers.get("x-robots-tag")` equals `"noindex"` | unit | AC4 |
| Read `route.ts` source with `readFileSync(new URL("./route.ts", import.meta.url), "utf8")` and assert no line matches `/^\s*import\s/m` | unit | AC5 |
| `pnpm --filter landing test` output lists the `route.test.ts` cases as passing (builder pastes the pass count in the PR) | integration (gate) | AC6 |
| Manual, after `pnpm --filter landing dev`: `curl -i http://localhost:3000/health` shows `200`, the three headers, body `ok`. CI's `pnpm --filter landing build` confirms Next accepts the route and lists `/health` as dynamic (ƒ), not static (○) | manual / CI build | AC1–AC3 |

Tests are written first and must fail (module not found) before `route.ts` exists.

## Out of scope
- A health endpoint for the tracker (`/tracker/health`) or any check of Supabase, Stripe or the tracker rewrite. This is a liveness check of landing only.
- Version or commit info in the body. The body is exactly `ok`.
- An e2e test in `e2e/`; the unit tests plus the CI build are enough for a two-line route.
- Adding `/health` to the sitemap or changing `robots.txt`.

## Risks and edge cases
- **Static prerender:** a constant `GET` with no request access could be prerendered at build time, so a hit would only prove the CDN works. `dynamic = "force-dynamic"` plus `no-store` prevents that (AC3).
- **Supabase outage or unset env vars:** the route imports nothing and `middleware.ts` does not match `/health`, so it stays up (AC5).
- **Path collision:** nothing in `apps/landing/app/` or the rewrites in `apps/landing/next.config.ts` uses `/health` today. The `ap-academy.online` redirect still sends that host's `/health` to `https://www.apacademy.ca/health`, which is fine.
- **`human_merge_paths`:** `.claude/pipeline.json` lists `package.json`. If that entry is matched by basename rather than as the repo-root path, editing `apps/landing/package.json` will put `needs-human-merge` on the PR. That is acceptable for a smoke test and does not change Risk.
- **Node test loader:** `route.ts` uses only syntax Node 24 type stripping supports (no enums, no namespaces, no parameter properties), matching the existing `lib/**` tests.

## Open questions
None.
