# 0013: Workspace decisions that override this app's CLAUDE.md
Status: accepted
Date: 2026-10-04

Correction (2026-10-16): earlier text named the wrong region; the project runs in us-west-2 (Oregon). The decision to keep it in place is unchanged.

## Context
The tracker CLAUDE.md was written for a standalone app. The workspace ADRs 0001 and 0002 were decided before the tracker was built.

## Decision
- One shared Supabase project in its current region, AWS us-west-2 (Oregon), not Canada, and not separate dev and prod projects. Local Postgres is the dev and test database.
- Tables live in the `tracker` schema. Migrations live in the repo-root `supabase/migrations/`.
- Login UI and `/auth/callback` live in landing. The tracker redirects signed-out users to `/login?next=...`.
- `basePath: '/tracker'`; cross-app links are plain anchors.

## Alternatives considered
- Follow the tracker CLAUDE.md literally: would split the auth pool that the workspace exists to share.

## Consequences
Revisit if a client requires Canadian data residency (workspace ADR 0001 lists this).
