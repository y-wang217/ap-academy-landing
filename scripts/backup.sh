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
# The archive is encrypted to a public key, so whoever runs this (CI) can never
# decrypt it. There is no plaintext or passphrase mode.
#
# Usage: SUPABASE_DB_URL=... BACKUP_PUBLIC_KEY="$(cat backup-public.asc)" scripts/backup.sh <out-dir>
set -euo pipefail

: "${SUPABASE_DB_URL:?SUPABASE_DB_URL is required}"
: "${BACKUP_PUBLIC_KEY:?BACKUP_PUBLIC_KEY is required (armored public key, docs/RESTORE.md)}"
out="${1:?usage: backup.sh <out-dir>}"
root="$(cd "$(dirname "$0")/.." && pwd)"
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
work="$(mktemp -d)"
export GNUPGHOME="$work/gnupg"
trap 'gpgconf --kill gpg-agent >/dev/null 2>&1 || true; rm -rf "$work"' EXIT
mkdir -m 700 "$GNUPGHOME"

# Validate the key before dumping anything: exactly one public key, no secret material.
keyinfo="$(gpg --batch --with-colons --import-options show-only --import <<<"$BACKUP_PUBLIC_KEY" 2>/dev/null || true)"
if grep -qE '^(sec|ssb):' <<<"$keyinfo"; then
  echo "BACKUP_PUBLIC_KEY holds a private key; CI must only ever hold the public key" >&2
  exit 1
fi
[[ "$(grep -c '^pub:' <<<"$keyinfo")" == "1" ]] || { echo "BACKUP_PUBLIC_KEY must hold exactly one public key" >&2; exit 1; }
fpr="$(awk -F: '$1 == "fpr" { print $10; exit }' <<<"$keyinfo")"
gpg --batch --quiet --import <<<"$BACKUP_PUBLIC_KEY" 2>/dev/null
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

# The plaintext tarball stays in $work; $out only ever receives the encrypted file.
tarball="$work/apacademy-db-$stamp.tar.gz"
tar -C "$work" -czf "$tarball" manifest.txt schema.sql auth_users.sql data.sql

archive="$out/apacademy-db-$stamp.tar.gz.gpg"
gpg --batch --yes --quiet --trust-model always --recipient "$fpr" --encrypt --output "$archive" "$tarball"
echo "encrypted to $fpr" >&2
echo "$archive"
