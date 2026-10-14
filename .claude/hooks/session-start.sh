#!/bin/bash
# SessionStart hook: install workspace dependencies in Claude Code cloud
# sessions so the Stop hook's test gate (gate_commands in pipeline.json) has
# node_modules to run against. Local sessions are left alone.
set -euo pipefail

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "${CLAUDE_PROJECT_DIR:-$(pwd)}"

# The lockfile is the contract; pnpm's store makes a repeat run a no-op.
pnpm install --frozen-lockfile
