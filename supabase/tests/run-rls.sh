#!/usr/bin/env bash
# Applies every migration to a throwaway local Postgres, on top of a minimal
# Supabase stub, then runs each *.sql check in this folder against its own
# fresh copy of that database. Needs the Postgres server binaries (15+), not
# Docker. Usage: pnpm test:rls
set -euo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
migrations="$here/../migrations"

bindir="${PG_BINDIR:-}"
if [[ -z "$bindir" ]]; then
  bindir="$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1 || true)"
fi
if [[ -z "$bindir" || ! -x "$bindir/initdb" ]]; then
  echo "Postgres server binaries not found. Set PG_BINDIR." >&2
  exit 1
fi

work="$(mktemp -d)"
port="${PG_TEST_PORT:-54329}"
# initdb refuses to run as root; drop to the postgres user when we are root.
as_pg=()
if [[ "$(id -u)" == "0" ]]; then
  as_pg=(runuser -u postgres --)
  chown postgres "$work"
fi

cleanup() {
  "${as_pg[@]}" "$bindir/pg_ctl" -D "$work/data" -m immediate stop >/dev/null 2>&1 || true
  rm -rf "$work"
}
trap cleanup EXIT

"${as_pg[@]}" "$bindir/initdb" -D "$work/data" -U postgres --auth=trust >/dev/null
"${as_pg[@]}" "$bindir/pg_ctl" -D "$work/data" -l "$work/log" \
  -o "-p $port -k $work -c listen_addresses=''" -w start >/dev/null

psql_run() {
  local db="$1"; shift
  "${as_pg[@]}" psql -h "$work" -p "$port" -U postgres -d "$db" \
    -v ON_ERROR_STOP=1 -q -X "$@"
}

psql_run postgres -c "create database migrated"
psql_run migrated -f "$here/supabase-stub.sql"
for file in "$migrations"/*.sql; do
  echo "apply $(basename "$file")"
  psql_run migrated -f "$file"
done

n=0
for check in "$here"/*.sql; do
  [[ "$(basename "$check")" == "supabase-stub.sql" ]] && continue
  n=$((n + 1))
  echo "check $(basename "$check")"
  psql_run postgres -c "create database check_$n template migrated"
  psql_run "check_$n" -f "$check"
done
