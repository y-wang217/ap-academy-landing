#!/usr/bin/env bash
# The restore drill, end to end, on a throwaway local Postgres:
#   1. migrate a database and fill it (the RLS check fixtures)
#   2. back it up with backup.sh, encrypted to a throwaway public key
#   3. restore into a second, empty database with restore.sh
#   4. fail unless every row count and a sample of rows match
# Usage: pnpm test:restore
set -euo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
root="$here/.."
bindir="${PG_BINDIR:-$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)}"
[[ -x "$bindir/initdb" ]] || { echo "Postgres server binaries not found" >&2; exit 1; }
work="$(mktemp -d)"
port="${PG_DRILL_PORT:-54350}"
as_pg=()
if [[ "$(id -u)" == "0" ]]; then as_pg=(runuser -u postgres --); chown postgres "$work"; fi
cleanup() { "${as_pg[@]}" "$bindir/pg_ctl" -D "$work/data" -m immediate stop >/dev/null 2>&1 || true; rm -rf "$work"; }
trap cleanup EXIT

"${as_pg[@]}" "$bindir/initdb" -D "$work/data" -U postgres --auth=trust >/dev/null
"${as_pg[@]}" "$bindir/pg_ctl" -D "$work/data" -l "$work/log" -o "-p $port -c listen_addresses=127.0.0.1 -k $work" -w start >/dev/null
url() { echo "postgres://postgres@127.0.0.1:$port/$1"; }
q() { psql "$(url "$1")" -X -q -v ON_ERROR_STOP=1 "${@:2}"; }

q postgres -c "create database source" -c "create database target"
q source -f "$root/supabase/tests/supabase-stub.sql" >/dev/null
for f in "$root"/supabase/migrations/*.sql; do q source -f "$f" >/dev/null 2>&1; done
# Fixture data: the tracker checks leave real rows behind, plus SAT attempts.
q source -f "$root/supabase/tests/tracker.sql" >/dev/null 2>&1
q source -c "insert into public.attempts (user_id, word_id, correct) select id, 7, true from auth.users" >/dev/null

q target -f "$root/supabase/tests/supabase-stub.sql" >/dev/null

# Throwaway keypairs: the drill proves the round trip with no real key.
pass="drill-key-passphrase"
gen_key() { # <name> -> exports <name>.pub.asc and <name>.sec.asc under $work/keys
  GNUPGHOME="$work/drill-gnupg" gpg --batch --quiet --pinentry-mode loopback --passphrase "$pass" \
    --quick-gen-key "AP Academy restore drill $1 <$1@invalid>" default default never 2>/dev/null
  GNUPGHOME="$work/drill-gnupg" gpg --batch --armor --export "$1@invalid" > "$work/keys/$1.pub.asc"
  GNUPGHOME="$work/drill-gnupg" gpg --batch --quiet --pinentry-mode loopback --passphrase "$pass" \
    --armor --export-secret-keys "$1@invalid" > "$work/keys/$1.sec.asc"
}
mkdir -m 700 "$work/drill-gnupg" "$work/caller-gnupg" "$work/keys"
gen_key drill
gen_key other
# From here on the caller's keyring is empty; the scripts must not touch it.
export GNUPGHOME="$work/caller-gnupg"
fail() { echo "$*" >&2; exit 1; }

# AC2: no public key means no backup, even with the old passphrase variable set.
if BACKUP_PASSPHRASE=x BACKUP_PUBLIC_KEY= SUPABASE_DB_URL="$(url source)" "$here/backup.sh" "$work/out-nokey" >/dev/null 2>&1; then
  fail "backup.sh ran without BACKUP_PUBLIC_KEY"
fi
[[ -z "$(ls -A "$work/out-nokey" 2>/dev/null)" ]] || fail "backup.sh wrote output without a public key"

# AC3: a secret key, or two public keys, in BACKUP_PUBLIC_KEY is refused.
for bad in "$(cat "$work/keys/drill.sec.asc")" "$(cat "$work/keys/drill.pub.asc" "$work/keys/other.pub.asc")"; do
  if BACKUP_PUBLIC_KEY="$bad" SUPABASE_DB_URL="$(url source)" "$here/backup.sh" "$work/out-bad" >/dev/null 2>&1; then
    fail "backup.sh accepted a bad BACKUP_PUBLIC_KEY"
  fi
  [[ -z "$(ls -A "$work/out-bad" 2>/dev/null)" ]] || fail "backup.sh wrote output for a bad BACKUP_PUBLIC_KEY"
done

# AC1: exactly one file, public-key encrypted, no symmetric packet.
archive="$(BACKUP_PUBLIC_KEY="$(cat "$work/keys/drill.pub.asc")" SUPABASE_DB_URL="$(url source)" "$here/backup.sh" "$work/out")"
[[ "$archive" == *.tar.gz.gpg ]] || fail "backup was not encrypted"
[[ "$(ls -A "$work/out" | wc -l)" == "1" ]] || fail "out dir should hold exactly the encrypted archive"
packets="$(gpg --list-packets "$archive" 2>&1 || true)"
grep -q ':pubkey enc packet:' <<<"$packets" || fail "archive has no public-key packet"
! grep -q ':symkey enc packet:' <<<"$packets" || fail "archive has a symmetric packet"
echo "backup  $(basename "$archive") ($(du -h "$archive" | cut -f1))"

# AC6: restore without the key, and with the wrong key, fails and leaves the target empty.
if TARGET_DB_URL="$(url target)" "$here/restore.sh" "$archive" >/dev/null 2>&1; then fail "restore ran without a private key"; fi
if TARGET_DB_URL="$(url target)" BACKUP_PRIVATE_KEY="$(cat "$work/keys/other.sec.asc")" BACKUP_PRIVATE_KEY_PASSPHRASE="$pass" \
  "$here/restore.sh" "$archive" >/dev/null 2>&1; then fail "restore ran with the wrong private key"; fi
[[ "$(q target -t -A -c "select count(*) from information_schema.tables where table_schema in ('public','tracker')")" == "0" ]] \
  || fail "failed restore touched the target"

export BACKUP_PRIVATE_KEY="$(cat "$work/keys/drill.sec.asc")" BACKUP_PRIVATE_KEY_PASSPHRASE="$pass"
TARGET_DB_URL="$(url target)" "$here/restore.sh" "$archive" > "$work/restore.out"

# AC7: manifest line order is unchanged.
mkdir "$work/peek"
GNUPGHOME="$work/drill-gnupg" gpg --batch --quiet --pinentry-mode loopback --passphrase "$pass" --decrypt "$archive" | tar -xzO manifest.txt > "$work/peek/manifest.txt"
[[ "$(head -5 "$work/peek/manifest.txt" | awk '{print $1}' | tr '\n' ' ')" == "created_at git_commit pg_dump migrations -- " ]] || fail "manifest layout changed"

manifest="$(sed -n '/^-- manifest/,/^-- restored/p' "$work/restore.out" | grep -v '^--')"
restored="$(sed -n '/^-- restored/,$p' "$work/restore.out" | grep -v '^--')"
echo "$restored" | sed 's/^/restored  /'
[[ "$manifest" == "$restored" ]] || { echo "row counts differ"; diff <(echo "$manifest") <(echo "$restored"); exit 1; }
[[ "$(echo "$restored" | awk '$2 > 0' | wc -l)" -ge 13 ]] || { echo "too little data to prove anything" >&2; exit 1; }

sample="select string_agg(format('%s|%s|%s', id, score_earned, student_done_at is not null), ',' order by id) from tracker.assessments"
[[ "$(q source -t -A -c "$sample")" == "$(q target -t -A -c "$sample")" ]] || { echo "assessment rows differ" >&2; exit 1; }
audit="select count(*) from tracker.audit_log"
[[ "$(q source -t -A -c "$audit")" == "$(q target -t -A -c "$audit")" ]] || { echo "audit log differs (triggers fired during restore?)" >&2; exit 1; }
# AC4: the caller's keyring was never used.
[[ -z "$(ls -A "$work/caller-gnupg")" ]] || fail "scripts wrote to the caller's GNUPGHOME"
echo "restore drill passed"
