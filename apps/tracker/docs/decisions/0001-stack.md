# 0001: Stack: Next.js, Supabase and Vercel, no extra infrastructure
Status: accepted
Date: 2026-10-04

## Context
The tracker needs auth, a relational database with row-level security, and a web UI on phones. It is built and run by one person, so every extra service is a cost in attention.

## Decision
Next.js (App Router) and TypeScript on Vercel. Supabase for Postgres, Auth and backups. Tailwind for styling. Zod at every boundary. Vitest for unit tests, Playwright for a few end-to-end flows. No Redis, no queues, no separate backend, no ORM beyond the Supabase client.

The app lives in the AP Academy pnpm workspace as `apps/tracker` and shares the one Supabase project with the rest of the site (workspace ADR 0001, ADR 0002).

## Alternatives considered
- A separate backend (Express, Rails): a second deploy and a second auth story for no gain at this size.
- An ORM (Prisma, Drizzle): bypasses RLS unless carefully configured, and RLS is the security model (0002).
- A component library: not needed for a handful of screens; revisit only with an ADR.

## Consequences
Every new service needs an ADR. If background jobs or heavy reporting arrive, revisit.
