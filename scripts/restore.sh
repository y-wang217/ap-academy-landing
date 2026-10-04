#!/usr/bin/env bash
# Restores a backup.sh archive into an EMPTY target database that already has
# the Supabase auth schema (a scratch Supabase project, or the local stub).
# Applies supabase/migrations first, then loads the data with triggers off, so
# signup and audit triggers do not fire twice. Prints row counts to compare
# with the archive's manifest. See docs/RESTORE.md.
#
# Usage: TARGET_DB_URL=... [BACKUP_PASSPHRASE=...] scripts/restore.sh <archive>
set -euo pipefail

: "${TARGET_DB_URL:?TARGET_DB_URL is required}"
archive="${1:?usage: restore.sh <archive>}"
root="$(cd "$(dirname "$0")/.." && pwd)"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

if [[ "$archive" == *.gpg ]]; then
  : "${BACKUP_PASSPHRASE:?BACKUP_PASSPHRASE is required for an encrypted archive}"
  gpg --batch --yes --quiet --pinentry-mode loopback --passphrase "$BACKUP_PASSPHRASE" \
    --decrypt --output "$work/backup.tar.gz" "$archive"
else
  cp "$archive" "$work/backup.tar.gz"
fi
tar -C "$work" -xzf "$work/backup.tar.gz"

run() { psql "$TARGET_DB_URL" -X -q -v ON_ERROR_STOP=1 "$@"; }

existing="$(run -t -A -c "select count(*) from information_schema.tables where table_schema in ('public', 'tracker')")"
if [[ "$existing" != "0" ]]; then
  echo "Target already has public or tracker tables. Restore into an empty database." >&2
  exit 1
fi

for f in "$root"/supabase/migrations/*.sql; do
  echo "migrate $(basename "$f")"
  run -f "$f" >/dev/null 2>&1 || { run -f "$f"; exit 1; }
done

# Triggers and foreign-key checks off for the load, in one session.
{
  echo "set session_replication_role = replica;"
  cat "$work/auth_users.sql" "$work/data.sql"
} | run >/dev/null

echo "-- manifest"
sed -n '/-- row counts/,$p' "$work/manifest.txt" | tail -n +2
echo "-- restored"
run -t -A -F ' ' -c "
  select 'auth.users', count(*) from auth.users
  union all select 'public.profiles', count(*) from public.profiles
  union all select 'public.attempts', count(*) from public.attempts
  union all select format('tracker.%s', c.relname), (xpath('/row/n/text()', query_to_xml(format('select count(*) as n from tracker.%I', c.relname), false, true, '')))[1]::text::bigint
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'tracker' and c.relkind = 'r'
  order by 1"
