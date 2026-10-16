# Pipeline setup checklist (human steps)

Things Claude Code cannot do for you. Tick them off once.

## GitHub
- [ ] Secret `CLAUDE_CODE_OAUTH_TOKEN`: output of `claude setup-token`.
- [ ] Bot account (for example `apacademy-bot`) added as a collaborator with Write access.
- [ ] Fine-grained PAT from the bot account, scoped to this repo only: Pull requests read/write, Contents read, Checks read, **Actions read** (without it the reviewer cannot read failing CI logs; its reviews said "log access was denied"). Save as secret `REVIEWER_PAT`.
- [ ] Settings → General → Pull Requests: enable **Allow auto-merge** and **Automatically delete head branches** (the second also retargets a feature PR to `main` when its migration PR merges).
- [ ] Branch protection (or a ruleset) on `main`:
  - Require a pull request, 1 approval, dismiss stale approvals on new commits.
  - Require status checks: `gate` (CI) and `review`. `review` is a commit status the reviewer workflow posts on the PR head (pending while CI is red, success or failure after the bot's verdict); the workflow runs from `workflow_run`, which GitHub does not list as a PR check on its own.
  - Block force pushes. Include administrators is optional; leaving it off lets you hotfix.
- [ ] Labels exist: `pipeline`, `needs-human-merge`, `migration`, `awaiting-migration`.
- [ ] Settings → Advanced Security: enable Dependabot alerts and Dependabot security updates (`.github/dependabot.yml` only configures the weekly version updates).
- [ ] Claude GitHub App installed on the repo (`/install-github-app` in Claude Code).

## Claude
- [ ] Notion connector enabled on your claude.ai account (Routines use it).
- [ ] After the manual dry run works, create two Routines with `/schedule`:
  - `design-next`, hourly, prompt: `/design-next`
  - `build-next`, hourly offset by 30 min, prompt: `/build-next`

## Design approver (optional: replaces the human design gate for Low and Medium cards)
- [ ] Notion → Settings → Connections → Develop or manage integrations: create an internal integration `design-approver` with Read content, Update content, Read comments, Insert comments, and Read user information without email. Share the **Dev Requirements** database and the **Pipeline Control** page with it (••• → Connections).
- [ ] Save its token as the GitHub secret `NOTION_APPROVER_TOKEN`. `CLAUDE_CODE_OAUTH_TOKEN` is reused.
- [ ] Add `.github/workflows/design-approver.yml` by hand (the guard hook keeps agents out of workflows).
- [ ] Actions → Design approver → Run workflow with **dry run** ticked; read the verdicts in the run summary. The hourly schedule (:20) writes for real.

Claude only returns a verdict against `.claude/agents/design-approver.md`; `scripts/design-approver.mjs` makes the writes with the integration token. It never approves a High-risk card (it comments and leaves it for you), sends a card to Revise at most `max_attempts` times before handing it to you, and re-reads the status before writing. Every write leaves a `[design-approver]` comment on the card. Pausing the pipeline pauses it too.

## Daily use
- Add requirements to the board as **Ready**. A card that depends on another goes in as **Backlog** with **Blocked by** set; the sweep moves it to Ready when every blocker is Done.
- Check the **Needs Approval** view (the design approver handles Low and Medium cards once set up; High cards, and anything it comments "Needs Charlie" on, wait for you). The design's **Decisions for approval** table lists every dependency and schema choice with the default the builder will use; approve by setting Status to **Approved** (the defaults stand), or comment and set **Revise**.
- A card with a migration produces two PRs: `<id>: migration NNNN ...` (labelled `migration`, `needs-human-merge`) and the feature PR (labelled `awaiting-migration`, based on the migration branch). Merge the migration PR, apply the migration with the Supabase MCP `apply_migration`, record it in `CLAUDE.md`. The sweep then releases the feature PR and it auto-merges once the bot has approved.
- Check **Blocked** and anything labelled `needs-human-merge`.
- Card statuses follow GitHub: the sweep sets In Review, Changes Requested, Done or Blocked from the PR, whatever the card said. Only the sweep writes "shipped" Work Log rows.
- Kill switch: tick **Paused** on the Pipeline Control page.

## Cloud sessions
The SessionStart hook installs dependencies, installs PostgREST 14.5 and starts and stops the local tracker stack once, so `pnpm test:tracker` and `pnpm test:sso` run in a cloud session. The builder runs them before any PR that touches `e2e_paths` (pipeline.json). If the hook prints `e2e: ... failed`, the session can still design and build, but not prove browser flows.

## Editing the pipeline itself
The guard hook blocks agents from editing hooks, settings, pipeline.json and workflows. Edit those by hand, or run Claude Code with the hooks temporarily disabled in a session you are watching.
