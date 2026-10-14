---
description: Pipeline stage 2. Sweep finished PRs, then build the next Changes Requested or Approved card.
---

Run the pipeline build stage for ap-academy-landing.

1. Clear any stale block marker: `node -e "require('fs').rmSync('.claude/state/blocked',{force:true})"`
2. Read `.claude/pipeline.json`.
3. Run the `/pipeline-sweep` steps first (follow `.claude/commands/pipeline-sweep.md` inline).
4. Check the Pipeline Control page. If **Paused** is checked, reply "Paused." and stop.
5. Do the work as the `builder` described in `.claude/agents/builder.md`. Do it in this main session (not a subagent) so the Stop hook gates your finish.
6. Reply with the one-line result and the sweep summary. Nothing else.
