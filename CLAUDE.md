# AP Academy workspace

A pnpm workspace. Every app is served from one domain, `https://www.apacademy.ca`,
routed by path. Why, and what would make us revisit it:
[`docs/adr/0001-monorepo-shared-identity.md`](docs/adr/0001-monorepo-shared-identity.md)
and [`docs/adr/0002-single-domain-path-routing.md`](docs/adr/0002-single-domain-path-routing.md),
which supersedes parts of 0001. The done state they describe:
[`docs/spec/single-domain-done-state.md`](docs/spec/single-domain-done-state.md).
Each app has its own `CLAUDE.md`. Read the one for the app you are working in.

## Layout

| path | what | notes |
|---|---|---|
| `apps/landing` | marketing site, `/sat`, `/learn` engine, `/login`, `/auth/callback` | [`apps/landing/CLAUDE.md`](apps/landing/CLAUDE.md). Owns the domain. Tests run on `node --test`. |
| `apps/tracker` | Student Tracker, served at `/tracker` | [`apps/tracker/CLAUDE.md`](apps/tracker/CLAUDE.md). `basePath: '/tracker'`, session check in `proxy.ts`. Vitest. |
| `packages/db` | shared Supabase client helpers and types | Imported as TypeScript source; each app lists it in `transpilePackages`. |
| `supabase/` | the single migrations folder for the one shared Supabase project | RLS and audit checks in `supabase/tests/`; one-off live scripts in `supabase/seed/`. |
| `scripts/` | workspace scripts | `backup.sh`, `restore.sh`, `restore-drill.sh`. Restore guide: [`docs/RESTORE.md`](docs/RESTORE.md). |
| `e2e/` | browser tests across apps | `sso/` (mock auth) and `tracker/` (Postgres, PostgREST 14.5, mock auth). |
| `docs/adr/` | workspace-level decisions | App-level decisions live inside each app. |
| `docs/spec/` | workspace-level prompts, committed verbatim before work begins | |

## Where new work goes

| work | where |
|---|---|
| marketing pages, enrollment, privacy | `apps/landing` |
| SAT flashcards, quiz, SAT accounts | `apps/landing/app/sat` (SAT is a route of the landing app) |
| `/learn` lesson engine, question generators | `apps/landing/lib/lesson`, `apps/landing/lib/questions` |
| login, sign-in emails, the auth callback | `apps/landing/app/login`, `apps/landing/app/auth` |
| Student Tracker | `apps/tracker` |
| a new product | a new folder under `apps/`, with its own `basePath`, two rewrite lines in landing, and its own Postgres schema if it stores data |
| any table, policy or trigger | a new file in the root `supabase/migrations/` |

Moving any product into a separate repo reverses ADR 0001 and needs a
superseding ADR first.

## Rules

- One domain, path routing. No subdomains and no cookie `domain` option.
  Sessions are shared because every app is served from the same origin.
- Login UI and `/auth/callback` exist only in landing. Other apps redirect to
  `/login?next=<path>` and never render a login page.
- Redirects inside a proxied app are relative. Behind the landing rewrite,
  `request.url` carries the app's own vercel.app host.
- Links that cross apps are plain `<a>` tags, never `next/link`.
- One Supabase project, one auth pool, one `supabase/migrations/` folder at the
  root. No app keeps its own migrations.
- SAT's tables stay in `public`, untouched. New products get their own schema
  with RLS on every table. There is no global role; permissions come from each
  product's own tables.
- Apps never import from each other. Shared code goes in `packages/`.
- Each app owns its dependencies, test runner and Vercel project. Adding a
  dependency to one app never adds it to another.
- No migration is applied to the live database without Charlie's sign-off.
- Live migrations are applied through the Supabase MCP `apply_migration`,
  named after the file (`0004_tracker_core`). The live history records them
  under timestamp versions, so `supabase db push` would see every file as
  unapplied: never run it against the live project. Applied so far: 0001 and
  0002 by hand, 0003 to 0005 on 2026-10-04, 0006 and 0007 on 2026-10-05, 0008 on 2026-10-06.

## Commands

```bash
pnpm install                 # from the repo root, always
pnpm --filter landing dev    # http://localhost:3000
pnpm --filter tracker dev    # http://localhost:3001/tracker
pnpm --filter landing test   # node --test, lib/questions and lib/lesson
pnpm --filter tracker test   # vitest
pnpm --filter @ap-academy/db test
pnpm test:rls                # RLS tests against a throwaway local Postgres
pnpm test:sso                # single-domain SSO acceptance checks in Chromium
pnpm test:tracker            # tracker flows through the landing proxy, real RLS
pnpm test:restore            # backup, encrypted, then restore into an empty db
```

`test:rls` and `test:restore` need Postgres server binaries (no Docker).
`test:sso` and `test:tracker` build both apps against a local stack, need a
global Playwright install (and `POSTGREST_BIN` for `test:tracker`), and delete
those builds when they finish.

Each app's Vercel project sets its Root Directory to `apps/<name>`. For both
apps on one origin locally, set `TRACKER_URL=http://localhost:3001` in
`apps/landing/.env.local` and browse via `http://localhost:3000`.
