#!/usr/bin/env bash
# Tracker end-to-end, production builds, on one origin: starts the local stack
# (stack.sh), builds both apps against it, serves landing on :3000 proxying
# /tracker to the tracker on :3001, and runs flows.mjs through landing.
# Needs Postgres server binaries, POSTGREST_BIN and a global Playwright.
# Usage: pnpm test:tracker
set -euo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
root="$here/../.."
logs="$(mktemp -d)"
pids=()
cleanup() {
  for pid in "${pids[@]}"; do kill "$pid" 2>/dev/null || true; done
  "$here/stack.sh" stop
  # These builds point at the local stack; never leave them for a deploy.
  rm -rf "$root/apps/landing/.next" "$root/apps/tracker/.next"
}
trap cleanup EXIT

"$here/stack.sh" > "$logs/env"
set -a; source "$logs/env"; set +a

echo "build tracker"; (cd "$root/apps/tracker" && pnpm build >"$logs/tracker-build.log" 2>&1) || { tail -30 "$logs/tracker-build.log"; exit 1; }
echo "build landing"; (cd "$root/apps/landing" && TRACKER_URL=http://localhost:3001 pnpm build >"$logs/landing-build.log" 2>&1) || { tail -30 "$logs/landing-build.log"; exit 1; }

(cd "$root/apps/tracker" && exec pnpm exec next start -p 3001) >"$logs/tracker.log" 2>&1 & pids+=($!)
(cd "$root/apps/landing" && exec pnpm exec next start -p 3000) >"$logs/landing.log" 2>&1 & pids+=($!)
for _ in $(seq 1 60); do
  curl -sf -o /dev/null http://localhost:3000/ && curl -s -o /dev/null http://localhost:3001/tracker && break
  sleep 0.5
done

TRACKER_BASE=http://localhost:3000/tracker node "$here/flows.mjs" || { echo "logs in $logs" >&2; tail -20 "$logs/tracker.log" >&2; exit 1; }
