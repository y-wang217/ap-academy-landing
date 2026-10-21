#!/usr/bin/env bash
# Starts a local Supabase-shaped stack for the tracker and leaves it running:
#   Postgres  127.0.0.1:54340  (stub + every migration + seed.sql)
#   PostgREST 127.0.0.1:54331  (db-schemas public,tracker; test JWT secret)
#   mock      127.0.0.1:54321  (Auth endpoints, /rest/v1 proxy, /__session)
#   mock      127.0.0.1:54332  (Anthropic Messages API, fixed AI draft)
#   mock      127.0.0.1:54333  (Notion: Staff query, Students, Work and Work Log pages in memory)
#   mock      127.0.0.1:54334  (Gmail for Iris: token, messages.list, messages.get; REQ-42)
# Prints the env the apps need. Stop with: e2e/tracker/stack.sh stop
# Needs Postgres server binaries and a PostgREST binary (POSTGREST_BIN).
set -euo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
root="$here/../.."
state="${STACK_DIR:-/tmp/ap-tracker-stack}"
export JWT_SECRET="local-test-secret-not-for-production-0123456789"

if [[ "${1:-}" == "stop" ]]; then
  [[ -f "$state/pids" ]] && kill $(cat "$state/pids") 2>/dev/null || true
  bindir="$(ls -d /usr/lib/postgresql/*/bin | sort -V | tail -1)"
  runuser -u postgres -- "$bindir/pg_ctl" -D "$state/data" -m immediate stop >/dev/null 2>&1 \
    || "$bindir/pg_ctl" -D "$state/data" -m immediate stop >/dev/null 2>&1 || true
  rm -rf "$state"
  exit 0
fi

bindir="${PG_BINDIR:-$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)}"
postgrest="${POSTGREST_BIN:-$(command -v postgrest || true)}"
[[ -x "$bindir/initdb" ]] || { echo "Postgres server binaries not found" >&2; exit 1; }
[[ -x "$postgrest" ]] || { echo "PostgREST not found: set POSTGREST_BIN" >&2; exit 1; }

rm -rf "$state" && mkdir -p "$state"
as_pg=()
if [[ "$(id -u)" == "0" ]]; then as_pg=(runuser -u postgres --); chown postgres "$state"; fi

"${as_pg[@]}" "$bindir/initdb" -D "$state/data" -U postgres --auth=trust >/dev/null
"${as_pg[@]}" "$bindir/pg_ctl" -D "$state/data" -l "$state/pg.log" \
  -o "-p 54340 -c listen_addresses=127.0.0.1 -k $state" -w start >/dev/null

export PG_URL="postgres://postgres@127.0.0.1:54340/migrated"
psql -X -q -v ON_ERROR_STOP=1 "postgres://postgres@127.0.0.1:54340/postgres" -c "create database migrated" >/dev/null
psql -X -q -v ON_ERROR_STOP=1 "$PG_URL" -f "$root/supabase/tests/supabase-stub.sql" >/dev/null
for f in "$root"/supabase/migrations/*.sql; do psql -X -q -v ON_ERROR_STOP=1 "$PG_URL" -f "$f" >/dev/null 2>&1; done
psql -X -q -v ON_ERROR_STOP=1 "$PG_URL" -f "$here/seed.sql" >/dev/null

cat > "$state/postgrest.conf" <<CONF
db-uri = "postgres://authenticator:authenticator@127.0.0.1:54340/migrated"
db-schemas = "public,tracker,iris"
db-anon-role = "anon"
jwt-secret = "$JWT_SECRET"
server-host = "127.0.0.1"
server-port = 54331
CONF
"$postgrest" "$state/postgrest.conf" >"$state/postgrest.log" 2>&1 & echo $! >> "$state/pids"
PG_URL="$PG_URL" node "$here/mock-supabase.mjs" >"$state/mock.log" 2>&1 & echo $! >> "$state/pids"
node "$here/mock-anthropic.mjs" >"$state/mock-anthropic.log" 2>&1 & echo $! >> "$state/pids"
node "$here/mock-notion.mjs" >"$state/mock-notion.log" 2>&1 & echo $! >> "$state/pids"
node "$here/mock-gmail.mjs" >"$state/mock-gmail.log" 2>&1 & echo $! >> "$state/pids"

for _ in $(seq 1 40); do curl -sf -o /dev/null http://127.0.0.1:54331/ && curl -s -o /dev/null http://127.0.0.1:54321/ && curl -s -o /dev/null http://127.0.0.1:54334/__gmail/calls && break; sleep 0.25; done

anon="$(node -e '
const {createHmac}=require("crypto");const b=v=>Buffer.from(JSON.stringify(v)).toString("base64url");
const h=b({alg:"HS256",typ:"JWT"}),p=b({role:"anon",iss:"local",exp:4102444800});
console.log(h+"."+p+"."+createHmac("sha256",process.env.JWT_SECRET).update(h+"."+p).digest("base64url"));')"
# REQ-42: the Iris run's service-role key, and a throwaway service account key for the mock Gmail token call.
service="$(node -e '
const {createHmac}=require("crypto");const b=v=>Buffer.from(JSON.stringify(v)).toString("base64url");
const h=b({alg:"HS256",typ:"JWT"}),p=b({role:"service_role",iss:"local",exp:4102444800});
console.log(h+"."+p+"."+createHmac("sha256",process.env.JWT_SECRET).update(h+"."+p).digest("base64url"));')"
irisKey="$(node -e '
const {generateKeyPairSync}=require("crypto");
const {privateKey}=generateKeyPairSync("rsa",{modulusLength:2048});
process.stdout.write(privateKey.export({type:"pkcs8",format:"pem"}).replace(/\n/g,"\\n"));')"
cat > "$state/env" <<ENV
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=$anon
ANTHROPIC_BASE_URL=http://127.0.0.1:54332
ANTHROPIC_API_KEY=test-key-for-the-local-mock
NOTION_TOKEN=test-token-for-the-local-mock
NOTION_API_BASE=http://127.0.0.1:54333
PG_URL=$PG_URL
SCHEDULER_CRON_SECRET=e2e-cron-secret-not-for-production
NEXT_PUBLIC_SITE_URL=http://localhost:3000
SUPABASE_SERVICE_ROLE_KEY=$service
IRIS_CRON_SECRET=e2e-iris-secret-not-for-production
IRIS_ORG_ID=10000000-0000-0000-0000-00000000aaaa
IRIS_GMAIL_CLIENT_EMAIL=iris-mail@e2e.iam.example
IRIS_GMAIL_PRIVATE_KEY="$irisKey"
IRIS_GMAIL_MAILBOX=charlie@apacademy.ca
IRIS_GMAIL_API_BASE=http://127.0.0.1:54334
ENV
cat "$state/env"
