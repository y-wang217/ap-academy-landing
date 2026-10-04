# 0020: Nightly encrypted pg_dump to GitHub Actions artifacts
Status: accepted
Date: 2026-10-04

## Context
The free Supabase plan has limited backups and pauses inactive projects. The plan asks for a nightly dump to separate storage and a tested restore.

## Decision
`scripts/backup.sh` runs `pg_dump` (Postgres 17 client) against the live database, compresses and encrypts the dump with a passphrase, and the nightly GitHub Action stores it as an artifact for 30 days. It needs two repository secrets, `SUPABASE_DB_URL` and `BACKUP_PASSPHRASE`; without them the job skips with a notice instead of failing. The restore is documented and drilled in `docs/RESTORE.md`.

## Alternatives considered
- Rely on Supabase backups alone: the plan asks for separate storage.
- An S3 bucket: a new service and new credentials.

## Consequences
Move to Supabase Pro before real students use the tracker. Add point-in-time recovery once revenue depends on it.
