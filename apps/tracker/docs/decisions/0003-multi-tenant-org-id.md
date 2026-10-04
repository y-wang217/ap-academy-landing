# 0003: Multi-tenant schema with org_id from day one
Status: accepted
Date: 2026-10-04

## Context
There is one teacher today. Keying data to "the teacher" would mean migrating every table and rewriting every policy when a second tutor joins.

## Decision
`tracker.orgs` and `tracker.memberships(user_id, org_id, role)` exist from the start, with roles owner, teacher and student. Every tenant table carries `org_id`, and policies are written against memberships even while one teacher exists. Permissions come from the role, never from identity.

## Alternatives considered
- A single-tenant schema now, tenancy later: cheap now, a rewrite later.

## Consequences
A multi-teacher management UI is out of scope. The first org and owner membership are created by a one-off SQL script (`supabase/seed/tracker-bootstrap.sql`).
