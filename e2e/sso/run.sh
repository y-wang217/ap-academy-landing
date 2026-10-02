#!/usr/bin/env bash
# Builds landing and tracker against a mock Supabase, serves them on one origin
# (landing :3000 proxying /tracker to :3001), and runs checks.mjs in Chromium.
# Needs a global Playwright install with its Chromium. Usage: pnpm test:sso
set -euo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
root="$here/../.."
logs="$(mktemp -d)"
pids=()

cleanup() {
  for pid in "${pids[@]}"; do kill "$pid" 2>/dev/null || true; done
  # These builds have mock env baked in; don't leave them for a real deploy.
  rm -rf "$root/apps/landing/.next" "$root/apps/tracker/.next"
}
trap cleanup EXIT

export NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
export NEXT_PUBLIC_SUPABASE_ANON_KEY=mock-key

echo "build tracker";  (cd "$root/apps/tracker" && pnpm build >"$logs/tracker-build.log" 2>&1)
echo "build landing";  (cd "$root/apps/landing" && TRACKER_URL=http://localhost:3001 pnpm build >"$logs/landing-build.log" 2>&1)

node "$here/mock-supabase.mjs" >"$logs/mock.log" 2>&1 & pids+=($!)
(cd "$root/apps/tracker" && exec pnpm exec next start -p 3001) >"$logs/tracker.log" 2>&1 & pids+=($!)
(cd "$root/apps/landing" && exec pnpm exec next start -p 3000) >"$logs/landing.log" 2>&1 & pids+=($!)

for _ in $(seq 1 60); do
  curl -sf -o /dev/null http://localhost:3000/ && curl -s -o /dev/null http://localhost:3001/tracker && break
  sleep 0.5
done

node "$here/checks.mjs" || { echo "logs in $logs" >&2; exit 1; }
