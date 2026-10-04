#!/usr/bin/env bash
# The restore drill, end to end, on a throwaway local Postgres:
#   1. migrate a database and fill it (the RLS check fixtures)
#   2. back it up with backup.sh, encrypted
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

export BACKUP_PASSPHRASE="drill-passphrase"
archive="$(SUPABASE_DB_URL="$(url source)" "$here/backup.sh" "$work/out")"
[[ "$archive" == *.gpg ]] || { echo "backup was not encrypted" >&2; exit 1; }
echo "backup  $(basename "$archive") ($(du -h "$archive" | cut -f1))"

TARGET_DB_URL="$(url target)" "$here/restore.sh" "$archive" > "$work/restore.out"
manifest="$(sed -n '/^-- manifest/,/^-- restored/p' "$work/restore.out" | grep -v '^--')"
restored="$(sed -n '/^-- restored/,$p' "$work/restore.out" | grep -v '^--')"
echo "$restored" | sed 's/^/restored  /'
[[ "$manifest" == "$restored" ]] || { echo "row counts differ"; diff <(echo "$manifest") <(echo "$restored"); exit 1; }
[[ "$(echo "$restored" | awk '$2 > 0' | wc -l)" -ge 13 ]] || { echo "too little data to prove anything" >&2; exit 1; }

sample="select string_agg(format('%s|%s|%s', id, score_earned, student_done_at is not null), ',' order by id) from tracker.assessments"
[[ "$(q source -t -A -c "$sample")" == "$(q target -t -A -c "$sample")" ]] || { echo "assessment rows differ" >&2; exit 1; }
audit="select count(*) from tracker.audit_log"
[[ "$(q source -t -A -c "$audit")" == "$(q target -t -A -c "$audit")" ]] || { echo "audit log differs (triggers fired during restore?)" >&2; exit 1; }
echo "restore drill passed"
