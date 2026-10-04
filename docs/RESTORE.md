# Backups and restore

Covers the one shared Supabase project (ref `lfvyrwzqibunljndsnxk`): SAT
accounts in `public` and the Student Tracker in `tracker`. Decision: tracker
ADR 0020.

## What runs

| What | Where | How often | Kept |
|---|---|---|---|
| Supabase's own backups | Supabase dashboard | daily on Pro; limited on Free | per plan |
| `scripts/backup.sh` | GitHub Actions artifact on this repo (`Nightly database backup`) | nightly, 03:17 Toronto | 30 days |

Each archive is AES-256 encrypted with `BACKUP_PASSPHRASE` and holds:

- `manifest.txt`: time, git commit, migration list, row count per table
- `schema.sql`: schema-only dump of `public` and `tracker`, for reference
- `auth_users.sql`: the `auth.users` rows every other table points at
- `data.sql`: every row in `public` and `tracker`, including the audit log

The schema is restored from `supabase/migrations/`, not from the dump, so the
repo stays the source of truth.

## One-time setup (not done yet)

1. In Supabase: Project Settings > Database > Connection string > **Session
   pooler**. Copy the URI and put the database password in it. Use the session
   pooler: GitHub runners can't reach the direct connection, which is IPv6 only.
2. In GitHub: repo Settings > Secrets and variables > Actions, add
   - `SUPABASE_DB_URL`: that URI
   - `BACKUP_PASSPHRASE`: a long random string. **Store it in your password
     manager.** Without it, every backup is unreadable.
3. Actions > Nightly database backup > Run workflow. Check that an artifact
   named `db-backup-<run id>` appears.

Until the secrets exist, the workflow runs and skips with a notice instead of
failing.

## Restore

Restore into an empty database. In an incident, that is a new Supabase
project: never restore over the live one.

1. Download the artifact from the workflow run and unzip it to get
   `apacademy-db-<time>.tar.gz.gpg`.
2. Create a new Supabase project (same region) and copy its session pooler
   URI.
3. From a checkout of this repo at the commit in the manifest, or a later one
   with the same migrations, run:
   ```bash
   TARGET_DB_URL='postgresql://...' BACKUP_PASSPHRASE='...' \
     scripts/restore.sh apacademy-db-<time>.tar.gz.gpg
   ```
   It refuses a target that already has `public` or `tracker` tables. It
   applies the migrations, then loads the data with
   `session_replication_role = replica`, so the signup and audit triggers do
   not fire a second time and the circular `courses`/`syllabus_versions` keys
   load in any order.
4. Compare the two count blocks it prints: `-- manifest` and `-- restored`.
   They must match exactly.
5. In the new project: add `tracker` under API settings > Exposed schemas, set
   the Auth Site URL and redirect list (see `apps/landing/CLAUDE.md`), then
   point both Vercel projects' `NEXT_PUBLIC_SUPABASE_URL` and
   `NEXT_PUBLIC_SUPABASE_ANON_KEY` at it and redeploy.
6. Users keep their accounts. Sessions are not restored, so everyone signs in
   again with a magic link.

`pg_dump` warns about circular foreign keys between `courses` and
`syllabus_versions` during backup. That is expected and handled by step 3.

## Drills

| Date | Where | Result |
|---|---|---|
| 2026-10-04 | Local Postgres 16 (`pnpm test:restore`): migrate, fill with test data, back up encrypted, restore into an empty database | Passed. All 13 tables' counts match, sampled assessment rows match, and the audit log was not duplicated. |
| pending | A scratch Supabase project, from a real nightly artifact | Needs the one-time setup above. Do it once before real students use the tracker. |

`pnpm test:restore` runs the local drill on every CI run, so a migration that
breaks restores fails the build.
