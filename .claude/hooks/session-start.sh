#!/bin/bash
# SessionStart hook for Claude Code cloud sessions. Local sessions are left alone.
#  1. Install workspace dependencies so the Stop hook's test gate (gate_commands
#     in pipeline.json) has node_modules to run against.
#  2. Make `pnpm test:tracker` and `pnpm test:sso` runnable here. The image
#     ships Postgres server binaries, a global Playwright and its Chromium, but
#     not PostgREST: install the version the live project runs, then start and
#     stop the local stack once so a broken stack shows up now, not in a
#     builder's run. Nothing in step 2 fails the session: a design run needs
#     none of it, and the Stop hook never runs the browser suites.
set -euo pipefail

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "${CLAUDE_PROJECT_DIR:-$(pwd)}"

# The lockfile is the contract; pnpm's store makes a repeat run a no-op.
pnpm install --frozen-lockfile

# --- e2e prerequisites --------------------------------------------------------
POSTGREST_VERSION=14.5   # keep in step with .github/workflows/ci.yml
if ! command -v postgrest >/dev/null 2>&1; then
  tmp="$(mktemp -d)"
  url="https://github.com/PostgREST/postgrest/releases/download/v${POSTGREST_VERSION}/postgrest-v${POSTGREST_VERSION}-linux-static-x86-64.tar.xz"
  if curl -fsSL --retry 3 "$url" | tar xJ -C "$tmp" postgrest 2>/dev/null \
      && install -m 755 "$tmp/postgrest" /usr/local/bin/postgrest 2>/dev/null; then
    :
  else
    echo "e2e: PostgREST download failed; pnpm test:tracker will not run in this session" >&2
  fi
  rm -rf "$tmp"
fi

ok=true
if command -v postgrest >/dev/null 2>&1; then
  echo "e2e: $(postgrest --version)"
else
  echo "e2e: PostgREST missing"; ok=false
fi
pg="$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1 || true)"
if [ -n "$pg" ] && [ -x "$pg/initdb" ]; then
  echo "e2e: Postgres server binaries in $pg"
else
  echo "e2e: Postgres server binaries missing"; ok=false
fi
if [ -d "$(npm root -g 2>/dev/null)/playwright" ]; then
  echo "e2e: global Playwright $(playwright --version 2>/dev/null | tr -d '\n')"
else
  echo "e2e: global Playwright missing"; ok=false
fi

if [ "$ok" = true ]; then
  if e2e/tracker/stack.sh >/dev/null 2>&1; then
    e2e/tracker/stack.sh stop >/dev/null 2>&1 || true
    echo "e2e: local stack OK; pnpm test:tracker and pnpm test:sso run in this session"
  else
    e2e/tracker/stack.sh stop >/dev/null 2>&1 || true
    echo "e2e: local stack failed to start; run e2e/tracker/stack.sh by hand to see why" >&2
  fi
else
  echo "e2e: prerequisites missing, so pnpm test:tracker will not run here" >&2
fi
