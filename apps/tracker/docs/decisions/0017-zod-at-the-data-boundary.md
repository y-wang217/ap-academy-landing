# 0017: Rows are validated with Zod at the data boundary
Status: accepted
Date: 2026-10-04

## Context
Types can only be generated from a running database, and the tracker schema is not applied to the live project yet. The CLAUDE.md asks for Zod at every boundary.

## Decision
`lib/data/` parses every row it reads with a Zod schema and returns typed domain objects. Every mutation is validated with Zod in the server action before it reaches the database. The `tracker` part of `@ap-academy/db` types is a loose record until generated types exist.

## Alternatives considered
- Hand-written row types for every table: drift silently from the migration.

## Consequences
After the migration is applied, generate types and tighten `@ap-academy/db`; the Zod parsing stays as the runtime check.
