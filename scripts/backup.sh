#!/usr/bin/env bash
# Nightly backup of the shared Supabase database (tracker ADR 0020).
#
# Writes one encrypted archive holding:
#   manifest.txt    when, from which commit, which migrations, row counts
#   schema.sql      schema-only dump of public and tracker, for reference
#   auth_users.sql  data-only dump of auth.users (every tenant row points at it)
#   data.sql        data-only dump of the public and tracker schemas
# Restore: docs/RESTORE.md. The schema itself is restored from
# supabase/migrations, so the dump never fights the repo over DDL.
#
# Usage: SUPABASE_DB_URL=... BACKUP_PASSPHRASE=... scripts/backup.sh <out-dir>
# Without BACKUP_PASSPHRASE (local drills only) the archive is not encrypted.
set -euo pipefail

: "${SUPABASE_DB_URL:?SUPABASE_DB_URL is required}"
out="${1:?usage: backup.sh <out-dir>}"
root="$(cd "$(dirname "$0")/.." && pwd)"
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
mkdir -p "$out"

dump=(pg_dump "$SUPABASE_DB_URL" --no-owner --no-privileges --quote-all-identifiers)

"${dump[@]}" --schema-only --schema=public --schema=tracker > "$work/schema.sql"
"${dump[@]}" --data-only --table=auth.users > "$work/auth_users.sql"
"${dump[@]}" --data-only --schema=public --schema=tracker > "$work/data.sql"

counts="$(psql "$SUPABASE_DB_URL" -X -q -t -A -F ' ' -c "
  select 'auth.users', count(*) from auth.users
  union all select 'public.profiles', count(*) from public.profiles
  union all select 'public.attempts', count(*) from public.attempts
  union all select format('tracker.%s', c.relname), (xpath('/row/n/text()', query_to_xml(format('select count(*) as n from tracker.%I', c.relname), false, true, '')))[1]::text::bigint
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'tracker' and c.relkind = 'r'
  order by 1")"

{
  echo "created_at $stamp"
  echo "git_commit $(git -C "$root" rev-parse HEAD 2>/dev/null || echo unknown)"
  echo "pg_dump $(pg_dump --version | awk '{print $3}')"
  echo "migrations $(ls "$root/supabase/migrations" | tr '\n' ' ')"
  echo "-- row counts"
  echo "$counts"
} > "$work/manifest.txt"

archive="$out/apacademy-db-$stamp.tar.gz"
tar -C "$work" -czf "$archive" manifest.txt schema.sql auth_users.sql data.sql

if [[ -n "${BACKUP_PASSPHRASE:-}" ]]; then
  gpg --batch --yes --quiet --pinentry-mode loopback --passphrase "$BACKUP_PASSPHRASE" \
    --symmetric --cipher-algo AES256 --output "$archive.gpg" "$archive"
  rm "$archive"
  archive="$archive.gpg"
fi
echo "$archive"
