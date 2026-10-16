# AP Academy workspace

A pnpm workspace. Every app is served from one domain, `https://www.apacademy.ca`,
routed by path. Why, and what would make us revisit it:
[`docs/adr/0001-monorepo-shared-identity.md`](docs/adr/0001-monorepo-shared-identity.md)
and [`docs/adr/0002-single-domain-path-routing.md`](docs/adr/0002-single-domain-path-routing.md),
which supersedes parts of 0001. The done state they describe:
[`docs/spec/single-domain-done-state.md`](docs/spec/single-domain-done-state.md).
Who edits people data and what the apps may copy:
[`docs/adr/0004-notion-edits-people-supabase-reads-local.md`](docs/adr/0004-notion-edits-people-supabase-reads-local.md).
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
  0002 by hand, 0003 to 0005 on 2026-10-04, 0006 and 0007 on 2026-10-05, 0008 on 2026-10-06, 0009, 0010, 0011 and 0012 on 2026-10-14, 0013 and 0014 on 2026-10-15, 0015, 0016 and 0017 on 2026-10-16.

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
Also set `NEXT_PUBLIC_SITE_URL=http://localhost:3000` in `apps/tracker/.env.local`,
or scheduler writes return 403 (tracker ADR 0042).

## Agent pipeline

This repo is built by an agent pipeline driven from the Notion **Dev Requirements** board. Config: `.claude/pipeline.json`.

Flow: Backlog (waiting on **Blocked by** cards) → Ready → Designing → Design Review (human approves) → Approved → Building → In Review → Done.
Side paths: Revise (human sent the design back), Changes Requested (reviewer sent the PR back), Blocked (needs a human).

- Stage commands: `/design-next`, `/build-next`, `/pipeline-sweep`.
- Design approver: `.github/workflows/design-approver.yml` runs `scripts/design-approver.mjs` (hourly as a safety net, and on a kick from design-next). Claude judges each Needs Approval card against `.claude/agents/design-approver.md` and only returns JSON; the script moves the card to Approved or Revise with its own Notion integration token. It never approves High risk. After `max_attempts` revise rounds it approves anyway and leaves the open gaps on the card for the builder, unless the card is High risk, the judge fails C8 (risk understated) or flags an injection; those go to Charlie. It only skips an unchanged design when its last verdict was Needs Charlie, so moving a Revise card back to Needs Approval re-judges it.
- Agent roles: `.claude/agents/designer.md`, `builder.md`, `reviewer.md`.
- Stages chain by events ("kicks", `docs/adr/0003-event-chained-pipeline.md`): design-next dispatches the approver workflow as soon as a card is in Needs Approval and fires the `ap-build` or `ap-design` routine when work waits; the approver fires `ap-build` on Approved and `ap-design` on Revise; the bot reviewer fires `ap-build` on changes requested (`review_round_cap` rounds per PR, then Charlie is asked); a merged `req/` PR starts `ap-design` through the routine's GitHub trigger. A routine run never holds a fire token: it dispatches `.github/workflows/kick.yml` (`actions_run_trigger`), which fires the routine with the repository secrets, the only copy of the tokens (`docs/spec/pipeline-kick-via-actions.md`). The `ap-design` and `ap-build` schedules (every 3 hours) and the hourly approver are a safety net. Every kick carries a chain depth; no stage kicks at or above `max_chain` (pipeline.json). Kicks are best effort and never fail a run. Paused stops every stage and every kick.
- Claims: the designer and builder set Status and **Claimed by** (their session ID) in one update and re-read the card; a run that does not see its own ID picks nothing. Two sweeps can overlap, so the Work Log "shipped" check runs again right before the write.
- Charlie is notified only when the next move is his: a card entering Blocked or a "Needs Charlie" verdict, that is High risk, an understated risk, a suspected injection or a question only he can answer (a Notion comment from the approver integration that mentions him), a bot-approved PR that carries `needs-human-merge`, or the review-round cap (a `github-actions[bot]` comment that mentions him, `.github/workflows/notify-human.yml`). Approved, Revise, In Review, Changes Requested under the cap, auto-merges and Done never notify.
- Every change ships on a `req/<card-id>-<slug>` branch through a PR. Nothing is pushed to `main` directly.
- GitHub is the truth for card status: the sweep sets In Review, Changes Requested, Done or Blocked from the PR state, promotes Backlog cards whose blockers are Done, and is the only writer of "shipped" Work Log rows.
- The bot reviewer runs only after CI finishes green (`workflow_run` on CI) and reports a `review` commit status. The builder watches `gh pr checks` and fixes red CI before setting In Review.
- Dependabot (`.github/dependabot.yml`) opens weekly npm and GitHub Actions PRs on `dependabot/` branches. They are not `req/` branches, so the Claude reviewer and auto-merge skip them; a human merges each one after the CI gate passes.
- The Stop hook runs `gate_commands` and will not let a session finish with failing tests when code changed.
- The SessionStart hook runs `pnpm install --frozen-lockfile` in cloud sessions, installs PostgREST and smoke-starts the local tracker stack, so `pnpm test:tracker` and `pnpm test:sso` run there. The builder runs them before any PR touching `e2e_paths`. Local sessions skip the hook.
- The guard hook blocks pushes to main, merges, remote database changes, production deploys, and edits to `.env`, hooks, settings, `pipeline.json` and workflows. A change to those files is delivered as patch blocks for a human to apply (`PIPELINE.md`, Editing the pipeline itself).
- PRs touching `apps/tracker/lib/notion/` or `apps/tracker/app/api/scheduler/daily-task/` (what the tracker writes to Notion) are in `human_merge_paths`, so they carry `needs-human-merge` and never auto-merge.
- Database migrations are written as files only and ship in their own `req/<card-id>-migration` PR (`needs-human-merge`); a human merges and applies it. The feature PR is based on that branch, carries `awaiting-migration`, and auto-merges once the sweep sees the migration live.
- Risk High is reserved for auth, permissions or RLS changes, payments, personal data to a new destination, deleting or rewriting rows, and irreversible work. A migration alone is not High.
- Kill switch: tick **Paused** on the Pipeline Control page in Notion.

When working by hand in this repo, follow the same conventions: tests first, card ID in commit messages, one card per branch.
