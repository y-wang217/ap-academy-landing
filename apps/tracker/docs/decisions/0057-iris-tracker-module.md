# 0057: Iris is a tracker module with its own `iris` schema
Status: accepted
Date: 2026-10-20

## Context
Parents email Charlie about cancellations, pauses, billing and questions, and he answers each one by hand. Iris (REQ-42, Iris 2/9) is the first step toward sorting and later drafting those replies. It needs a home: a place to keep the mail it reads, a scheduled run, owner-only pages, and the existing auth, Supabase and Notion adapters. The workspace rules say a product either lives in an existing app or gets its own folder under `apps/`, and new products get their own Postgres schema with RLS on every table.

## Decision
- **A tracker module, not a new app.** Iris lives in `apps/tracker` under `lib/iris/`, `app/iris/` and `app/api/iris/`. It reuses the tracker's session, `requireScheduler` owner check, Notion adapters, Zod rows and test harness. No new service, queue or hosting.
- **Its own schema.** Migration 0024 adds `iris` with `settings`, `runs`, `threads`, `messages`, `ai_calls` and `events`, with RLS on every table. The org owner (`tracker.is_org_owner`) reads; `service_role` writes. Teachers, students, parents and `anon` read nothing. Deletion goes only through `iris.purge_expired` and `iris.delete_thread`.
- **One bearer-protected run.** `POST /tracker/api/iris/run`, called every 15 minutes by a workflow, authenticates itself with `IRIS_CRON_SECRET` (constant-time compare) before any database, Gmail or Notion call, like the daily-task run (ADR 0039). The proxy exempts exactly `api/iris/run`; `api/iris/run-now` stays behind the session. It is the second, and last, allowed importer of the service-role client.
- **Run now goes through the bearer path.** The owner-only `POST /api/iris/run-now` calls the run route server-side with the secret, so the secret never reaches the browser and no third service-role importer appears.
- **Iris starts paused.** A `settings` row created with only `org_id` is paused with sending off. Unpausing needs the owner to tick that the privacy page is live and families are writing to the mailbox, and the server refuses `paused: false` without that tick.
- **Origin check.** The ADR 0042 cross-site write check covers `/api/iris/` as well as `/api/scheduler/`.

## Alternatives considered
- **A separate `apps/iris`.** A second Next app with its own Vercel project, basePath and rewrite lines, for what is today an inbox list and a settings page. Rejected: it duplicates auth, Notion adapters and the test harness for no isolation gain, since both run against the same Supabase project.
- **Tables in `tracker`.** Rejected: the workspace rule gives each product its own schema, and a separate schema makes "who can read parent mail" one place to audit.
- **The run route also accepts an owner session.** Rejected: one auth mode per route is simpler to prove.

## Consequences
- `iris` must be added to the Supabase API's Exposed schemas before the run works. Until then it answers 503 `iris_unavailable`.
- The service-role client now has two importers, pinned by `app/api/scheduler/daily-task-routes.test.ts`.
- Later Iris cards (classification, drafting, sending) add their tables to `iris` and their routes under `app/api/iris/`.
