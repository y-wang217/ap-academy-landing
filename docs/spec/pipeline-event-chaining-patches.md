# Patch blocks: event-chained pipeline (apply by hand)

Companion to `docs/spec/pipeline-event-chaining.md` and the
`chore/pipeline-event-chaining` PR. The guard hook keeps agent sessions out of
`.github/workflows/*` and `.claude/pipeline.json`, so these four files were
not changed on the branch. Each block below is the **complete** new file
content. Apply them on the PR branch before merging, through the GitHub web
editor (as for #57 and #61) or a local checkout:

1. `.claude/pipeline.json` (replace the file)
2. `.github/workflows/design-approver.yml` (replace the file)
3. `.github/workflows/claude-review.yml` (replace the file)
4. `.github/workflows/notify-human.yml` (new file)

What changes, in short:

- `pipeline.json`: `max_chain` 12, `review_round_cap` 3, the two routine
  trigger IDs under `routines`, and `approver_workflow`.
- `design-approver.yml`: a `chain` input, the four routine fire secrets, the
  wider Unit tests step, and the header comment.
- `claude-review.yml`: the verdict step gets `id: verdict` and exports
  `state`; a new last step kicks `ap-build` on changes requested (under the
  round cap) or posts the "your move" comment at the cap.
- `notify-human.yml`: posts the one "your move" comment when the bot approves
  a `req/` PR that carries `needs-human-merge`.

The secrets referenced (`ROUTINE_DESIGN_FIRE_URL`, `ROUTINE_DESIGN_FIRE_TOKEN`,
`ROUTINE_BUILD_FIRE_URL`, `ROUTINE_BUILD_FIRE_TOKEN`) come from human step 1 in
`PIPELINE.md`, Event chaining. Until they exist the kicks are skipped with a
notice; nothing else breaks.

### `.claude/pipeline.json`

```json
{
  "_comment": "Single source of truth for the agent pipeline. gate_commands are the fast local subset of CI; ci.yml also builds both apps and runs RLS, restore and e2e. The browser suites (pnpm test:tracker, test:sso) are a builder step for diffs touching e2e_paths, not a gate command. max_chain caps how many kicks may follow each other before the 3-hour schedules take over; routines are the ap-design and ap-build trigger IDs the stage commands fire; approver_workflow is what design-next dispatches; review_round_cap is how many bot change requests kick the builder before Charlie is asked (ADR 0003).",
  "repo": "y-wang217/ap-academy-landing",
  "default_branch": "main",
  "notion": {
    "board_data_source": "collection://a855407c-6899-4e31-882a-798ad13be3b6",
    "board_url": "https://app.notion.com/p/a917f1561486420a884da2a330c19998?v=3f9d6ae73dd781e6a7be000c01b59002",
    "control_page": "3f9d6ae7-3dd7-8101-87fa-fcafe0976bb3",
    "work_log_data_source": "collection://03257601-dfe2-42dd-affb-49dcfe1d2dcf"
  },
  "statuses": {
    "backlog": "Backlog",
    "ready": "Ready",
    "designing": "Designing",
    "design_review": "Needs Approval",
    "revise": "Revise",
    "approved": "Approved",
    "building": "Building",
    "in_review": "In Review",
    "changes_requested": "Changes Requested",
    "done": "Done",
    "blocked": "Blocked"
  },
  "blocked_by_property": "Blocked by",
  "labels": {
    "pipeline": "pipeline",
    "migration": "migration",
    "awaiting_migration": "awaiting-migration",
    "human_merge": "needs-human-merge"
  },
  "wip_limit": 1,
  "max_attempts": 2,
  "max_chain": 12,
  "review_round_cap": 3,
  "branch_prefix": "req/",
  "routines": {
    "design": "trig_01JdnScf4xGzsjQwBqxjEJij",
    "build": "trig_01V8Lz7JVrAuzaGEpmip4dxU"
  },
  "approver_workflow": "design-approver.yml",
  "migration_branch_suffix": "-migration",
  "gate_commands": [
    "pnpm --filter @ap-academy/db typecheck",
    "pnpm --filter @ap-academy/db test",
    "pnpm --filter landing test",
    "pnpm --filter landing exec tsc --noEmit",
    "pnpm --filter tracker lint",
    "pnpm --filter tracker typecheck",
    "pnpm --filter tracker test"
  ],
  "gate_ignore_paths": [
    "docs/",
    ".claude/",
    "README.md",
    "PIPELINE.md",
    "CLAUDE.md"
  ],
  "e2e_paths": [
    "apps/tracker/app/",
    "apps/tracker/components/",
    "apps/tracker/proxy.ts",
    "apps/landing/next.config.ts",
    "apps/landing/middleware.ts",
    "e2e/"
  ],
  "human_merge_paths": [
    "supabase/",
    ".env",
    "package.json",
    "pnpm-lock.yaml",
    "pnpm-workspace.yaml",
    "packages/db/",
    "apps/landing/middleware.ts",
    "apps/landing/next.config.ts",
    "apps/landing/app/login/",
    "apps/landing/app/auth/",
    "apps/landing/app/sat/login/",
    "apps/landing/app/sat/supabase/",
    "apps/tracker/proxy.ts",
    "apps/tracker/next.config.ts",
    "scripts/",
    ".github/",
    "apps/tracker/lib/notion/",
    "apps/tracker/app/api/scheduler/daily-task/"
  ]
}
```

### `.github/workflows/design-approver.yml`

```yaml
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
```

### `.github/workflows/claude-review.yml`

```yaml
name: Claude Reviewer

# Runs once per CI result on a req/ branch, after CI has finished, and only
# reviews when CI is green. A workflow_run job is not listed as a check on the
# PR, so the job reports its outcome as a commit status named "review" on the
# PR head; branch protection requires that status. A human re-requesting the
# bot's review runs the same job through pull_request: review_requested.
on:
  workflow_run:
    workflows: [CI]
    types: [completed]
  pull_request:
    types: [review_requested]

concurrency:
  group: claude-review-${{ github.event.workflow_run.head_branch || github.head_ref }}
  cancel-in-progress: true

jobs:
  review:
    # Same-repository req/ branches only. A workflow_run job carries secrets, so
    # a fork branch named req/... must never reach the checkout below.
    if: >
      (github.event_name == 'workflow_run' &&
       github.event.workflow_run.event == 'pull_request' &&
       github.event.workflow_run.head_repository.full_name == github.repository &&
       startsWith(github.event.workflow_run.head_branch, 'req/')) ||
      (github.event_name == 'pull_request' &&
       github.event.pull_request.head.repo.full_name == github.repository &&
       startsWith(github.head_ref, 'req/') &&
       !github.event.pull_request.draft)
    runs-on: ubuntu-latest
    permissions:
      contents: read
      pull-requests: write
      statuses: write
      actions: read
      id-token: write
    steps:
      - name: Resolve the PR and its CI state
        id: pr
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          REPO: ${{ github.repository }}
          EVENT: ${{ github.event_name }}
          RUN_BRANCH: ${{ github.event.workflow_run.head_branch }}
          RUN_SHA: ${{ github.event.workflow_run.head_sha }}
          RUN_PR: ${{ github.event.workflow_run.pull_requests[0].number }}
          RUN_CONCLUSION: ${{ github.event.workflow_run.conclusion }}
          PR_NUMBER: ${{ github.event.pull_request.number }}
          PR_SHA: ${{ github.event.pull_request.head.sha }}
        run: |
          set -euo pipefail
          if [ "$EVENT" = "workflow_run" ]; then
            number="$RUN_PR"
            sha="$RUN_SHA"
            if [ -z "$number" ]; then
              number=$(gh pr list --repo "$REPO" --head "$RUN_BRANCH" --state open --json number --jq '.[0].number // empty')
            fi
            if [ "$RUN_CONCLUSION" = "success" ]; then green=true; else green=false; fi
          else
            number="$PR_NUMBER"
            sha="$PR_SHA"
            # Green means gate and e2e have passed and nothing else has failed.
            # Pending counts as not green: CI's own completion re-runs this job.
            checks=$(gh pr checks "$number" --repo "$REPO" --json name,bucket || echo '[]')
            passed=$(echo "$checks" | jq '[.[] | select(.name == "gate" or .name == "e2e") | select(.bucket == "pass")] | length')
            failed=$(echo "$checks" | jq '[.[] | select(.name != "review") | select(.bucket == "fail" or .bucket == "cancel")] | length')
            if [ "$passed" = "2" ] && [ "$failed" = "0" ]; then green=true; else green=false; fi
          fi
          if [ -z "$number" ]; then echo "No open PR for $RUN_BRANCH"; green=false; fi
          {
            echo "number=$number"
            echo "sha=$sha"
            echo "green=$green"
          } >> "$GITHUB_OUTPUT"
          echo "PR #$number at $sha, green=$green"

      - name: Mark the review as waiting while CI is red
        if: steps.pr.outputs.green != 'true' && steps.pr.outputs.number != ''
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        run: |
          gh api "repos/${{ github.repository }}/statuses/${{ steps.pr.outputs.sha }}" \
            -f state=pending -f context=review \
            -f description="Waiting for green CI before the bot reviews" \
            -f target_url="${{ github.server_url }}/${{ github.repository }}/pull/${{ steps.pr.outputs.number }}/checks"

      - uses: actions/checkout@v7
        if: steps.pr.outputs.green == 'true'
        with:
          ref: ${{ steps.pr.outputs.sha }}
          fetch-depth: 0

      - uses: anthropics/claude-code-action@v1
        if: steps.pr.outputs.green == 'true'
        with:
          claude_code_oauth_token: ${{ secrets.CLAUDE_CODE_OAUTH_TOKEN }}
          # Post the review as the bot account so it counts as a second approver.
          github_token: ${{ secrets.REVIEWER_PAT }}
          prompt: |
            You are the reviewer subagent. Follow .claude/agents/reviewer.md exactly.
            Review PR #${{ steps.pr.outputs.number }} in ${{ github.repository }}.
            CI (gate and e2e) is green on commit ${{ steps.pr.outputs.sha }}; do not ask for a green build.
            Finish by submitting exactly one review with gh pr review (approve or request-changes).
          claude_args: >-
            --max-turns 40
            --allowedTools "Read,Glob,Grep,Bash(gh pr view:*),Bash(gh pr diff:*),Bash(gh pr checks:*),Bash(gh pr review:*),Bash(gh run view:*),Bash(gh run list:*),Bash(git diff:*),Bash(git log:*),Bash(git show:*)"
        env:
          GH_TOKEN: ${{ secrets.REVIEWER_PAT }}

      - name: Report the verdict as the review status
        id: verdict
        if: always() && steps.pr.outputs.green == 'true'
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          REPO: ${{ github.repository }}
          NUMBER: ${{ steps.pr.outputs.number }}
          SHA: ${{ steps.pr.outputs.sha }}
          RUN_URL: ${{ github.server_url }}/${{ github.repository }}/actions/runs/${{ github.run_id }}
        run: |
          set -euo pipefail
          verdict=$(gh pr view "$NUMBER" --repo "$REPO" --json reviews \
            --jq '[.reviews[] | select(.commit.oid == "'"$SHA"'") | select(.state == "APPROVED" or .state == "CHANGES_REQUESTED")] | last | .state // empty')
          case "$verdict" in
            APPROVED) state=success; desc="Bot reviewer approved" ;;
            CHANGES_REQUESTED) state=failure; desc="Bot reviewer requested changes" ;;
            *) state=error; desc="Bot reviewer posted no review on this commit" ;;
          esac
          gh api "repos/$REPO/statuses/$SHA" -f state="$state" -f context=review -f description="$desc" -f target_url="$RUN_URL"
          echo "review status: $state ($desc)"
          echo "state=$state" >> "$GITHUB_OUTPUT"
          [ "$state" != "error" ]

      # K4 and R4 (ADR 0003): a bot "changes requested" kicks the builder now
      # instead of waiting for the build schedule, up to review_round_cap rounds
      # per PR. At the cap the next move is Charlie's, so one comment from
      # github-actions[bot] mentions him (one per head commit). Best effort:
      # the step never fails the run.
      - name: Kick the builder, or notify Charlie at the round cap
        if: always() && steps.pr.outputs.green == 'true' && steps.verdict.outputs.state == 'failure'
        continue-on-error: true
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          REPO: ${{ github.repository }}
          NUMBER: ${{ steps.pr.outputs.number }}
          SHA: ${{ steps.pr.outputs.sha }}
          BRANCH: ${{ github.event.workflow_run.head_branch || github.head_ref }}
          ROUTINE_BUILD_FIRE_URL: ${{ secrets.ROUTINE_BUILD_FIRE_URL }}
          ROUTINE_BUILD_FIRE_TOKEN: ${{ secrets.ROUTINE_BUILD_FIRE_TOKEN }}
        run: |
          set -euo pipefail
          cap=$(jq -r '.review_round_cap // 3' .claude/pipeline.json)
          rounds=$(gh pr view "$NUMBER" --repo "$REPO" --json reviews \
            --jq '[.reviews[] | select(.author.login == "ap-academy-bot") | select(.state == "CHANGES_REQUESTED")] | length')
          card=$(echo "$BRANCH" | sed -E 's#^req/((REQ-)?[0-9]+).*#\1#')
          echo "bot changes-requested rounds on #$NUMBER: $rounds (cap $cap)"
          if [ "$rounds" -lt "$cap" ]; then
            # The reviewer is event-driven, so it sits at depth 0 and its kick carries chain=1.
            node scripts/fire-routine.mjs build --chain 0 --from reviewer --card "$card"
          else
            node scripts/notify-human.mjs --repo "$REPO" --pr "$NUMBER" --sha "$SHA" --reason review-cap --rounds "$rounds"
          fi
```

### `.github/workflows/notify-human.yml`

```yaml
name: Notify human

# Charlie is notified only when the next move is his (ADR 0003). When the bot
# reviewer approves a req/ PR that carries needs-human-merge, the next step is
# a human merge, or a merge plus a migration to apply, so this posts one
# comment as github-actions[bot] that @mentions him. A bot comment notifies
# him; his own PR activity does not. The bot's review is posted with
# REVIEWER_PAT, so it does start this workflow. One comment per head commit:
# scripts/notify-human.mjs de-duplicates with an HTML marker. The review-round
# cap uses the same script from claude-review.yml.
on:
  pull_request_review:
    types: [submitted]

jobs:
  your-move:
    if: >
      startsWith(github.event.pull_request.head.ref, 'req/') &&
      github.event.review.state == 'approved' &&
      github.event.review.user.login == 'ap-academy-bot' &&
      contains(github.event.pull_request.labels.*.name, 'needs-human-merge')
    runs-on: ubuntu-latest
    permissions:
      contents: read
      pull-requests: write
    steps:
      - uses: actions/checkout@v7
        with:
          fetch-depth: 1

      - name: Post the one "your move" comment
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          REPO: ${{ github.repository }}
          NUMBER: ${{ github.event.pull_request.number }}
          SHA: ${{ github.event.pull_request.head.sha }}
          IS_MIGRATION: ${{ contains(github.event.pull_request.labels.*.name, 'migration') }}
        run: |
          set -euo pipefail
          reason=merge
          extra=()
          if [ "$IS_MIGRATION" = "true" ]; then
            # The migration numbers this PR adds, for example "0017" or "0015, 0016".
            migration=$(gh pr view "$NUMBER" --repo "$REPO" --json files \
              --jq '[.files[].path | select(startswith("supabase/migrations/")) | capture("supabase/migrations/(?<n>[0-9]{4})_").n] | unique | join(", ")')
            reason=migration
            extra=(--migration "${migration:-see the diff}")
          fi
          node scripts/notify-human.mjs --repo "$REPO" --pr "$NUMBER" --sha "$SHA" --reason "$reason" "${extra[@]}"
```
