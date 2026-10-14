---
description: Pipeline stage 1. Sweep finished PRs, then design the next Ready or Revise card.
---

Run the pipeline design stage for ap-academy-landing.

1. Read `.claude/pipeline.json`.
2. Run `/pipeline-sweep` steps first (follow `.claude/commands/pipeline-sweep.md` inline).
3. Check the Pipeline Control page. If **Paused** is checked, reply "Paused." and stop.
4. Hand off to the `designer` subagent with this instruction: "Design the next card per your instructions. Config is in .claude/pipeline.json."
5. Reply with the designer's one-line result and the sweep summary. Nothing else.
