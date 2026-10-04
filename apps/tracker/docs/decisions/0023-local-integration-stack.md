# 0023: End-to-end tests run on Postgres, PostgREST and a mock auth server
Status: accepted
Date: 2026-10-04

## Context
Docker is not available everywhere this repo is developed, so the Supabase CLI's local stack cannot be relied on. RLS must be exercised through the real data API, not just SQL.

## Decision
The end-to-end harness runs a throwaway local Postgres with the migrations applied, PostgREST 14.5 (the version the live project runs) with a test JWT secret, and a small mock of the Auth endpoints the apps call. Playwright drives both apps through the landing proxy.

## Alternatives considered
- Unit tests only: would not catch an RLS or query mistake.
- The live project: tests would write into production.

## Consequences
The mock covers only the Auth endpoints used (`/user`, `/logout`). The real magic-link email is checked by hand after deploy.
