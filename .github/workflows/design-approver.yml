name: Design approver

# Checks every card in Needs Approval against .claude/agents/design-approver.md
# and moves it to Approved or Revise, or leaves it for Charlie with a comment
# that mentions him. Claude only returns a verdict (no tools);
# scripts/design-approver.mjs makes the Notion writes with the
# NOTION_APPROVER_TOKEN integration, then kicks the next stage: an approval
# fires the ap-build routine, a revise fires ap-design, each at chain depth + 1
# and never at or above max_chain (ADR 0003). It also notifies Charlie once per
# card that entered Blocked. Runs on a workflow_dispatch kick from the design
# stage (K1) and hourly at :20 as a safety net. Kill switch: Paused on Pipeline
# Control (it stops the kicks too).
on:
  schedule:
    - cron: "20 * * * *"
  workflow_dispatch:
    inputs:
      dry_run:
        description: "Report verdicts in the run summary, write nothing to Notion, kick nothing"
        type: boolean
        default: true
      chain:
        description: "Depth of the kick that started this run (0 for a manual or scheduled run)"
        type: string
        default: "0"

permissions:
  contents: read

concurrency:
  group: design-approver
  cancel-in-progress: false

jobs:
  approve:
    runs-on: ubuntu-24.04
    timeout-minutes: 30
    steps:
      - name: Check configuration
        id: cfg
        env:
          NOTION_TOKEN: ${{ secrets.NOTION_APPROVER_TOKEN }}
        run: |
          if [ -z "$NOTION_TOKEN" ]; then
            echo "::notice::Skipped: set the NOTION_APPROVER_TOKEN repository secret (PIPELINE.md, Design approver)."
            echo "skip=true" >> "$GITHUB_OUTPUT"
          fi

      - uses: actions/checkout@v7
        if: steps.cfg.outputs.skip != 'true'

      - uses: actions/setup-node@v7
        if: steps.cfg.outputs.skip != 'true'
        with:
          node-version: 22

      - name: Unit tests
        if: steps.cfg.outputs.skip != 'true'
        run: node --test scripts/design-approver.test.mjs scripts/fire-routine.test.mjs scripts/notify-human.test.mjs

      # Pinned: the script relies on --tools "" and --json-schema.
      - name: Install Claude Code
        if: steps.cfg.outputs.skip != 'true'
        run: npm install -g @anthropic-ai/claude-code@2.1.301

      - name: Review designed cards, kick the next stage, notify Charlie
        if: steps.cfg.outputs.skip != 'true'
        env:
          NOTION_TOKEN: ${{ secrets.NOTION_APPROVER_TOKEN }}
          CLAUDE_CODE_OAUTH_TOKEN: ${{ secrets.CLAUDE_CODE_OAUTH_TOKEN }}
          DRY_RUN: ${{ github.event_name == 'workflow_dispatch' && inputs.dry_run && '1' || '0' }}
          APPROVER_CHAIN: ${{ github.event_name == 'workflow_dispatch' && inputs.chain || '0' }}
          # Routine API triggers (PIPELINE.md, Event chaining). A missing pair skips that kick with a notice.
          ROUTINE_DESIGN_FIRE_URL: ${{ secrets.ROUTINE_DESIGN_FIRE_URL }}
          ROUTINE_DESIGN_FIRE_TOKEN: ${{ secrets.ROUTINE_DESIGN_FIRE_TOKEN }}
          ROUTINE_BUILD_FIRE_URL: ${{ secrets.ROUTINE_BUILD_FIRE_URL }}
          ROUTINE_BUILD_FIRE_TOKEN: ${{ secrets.ROUTINE_BUILD_FIRE_TOKEN }}
        run: node scripts/design-approver.mjs
