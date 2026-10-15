# Pipeline setup checklist (human steps)

Things Claude Code cannot do for you. Tick them off once.

## GitHub
- [ ] Secret `CLAUDE_CODE_OAUTH_TOKEN`: output of `claude setup-token`.
- [ ] Bot account (for example `apacademy-bot`) added as a collaborator with Write access.
- [ ] Fine-grained PAT from the bot account, scoped to this repo only: Pull requests read/write, Contents read, Checks read. Save as secret `REVIEWER_PAT`.
- [ ] Settings → General → Pull Requests: enable **Allow auto-merge** and **Automatically delete head branches**.
- [ ] Branch protection (or a ruleset) on `main`:
  - Require a pull request, 1 approval, dismiss stale approvals on new commits.
  - Require status checks: `gate` (CI) and `review`.
  - Block force pushes. Include administrators is optional; leaving it off lets you hotfix.
- [ ] Labels exist: `pipeline`, `needs-human-merge`.
- [ ] Settings → Advanced Security: enable Dependabot alerts and Dependabot security updates (`.github/dependabot.yml` only configures the weekly version updates).
- [ ] Claude GitHub App installed on the repo (`/install-github-app` in Claude Code).

## Claude
- [ ] Notion connector enabled on your claude.ai account (Routines use it).
- [ ] After the manual dry run works, create two Routines with `/schedule`:
  - `design-next`, hourly, prompt: `/design-next`
  - `build-next`, hourly offset by 30 min, prompt: `/build-next`

## Daily use
- Add requirements to the board as **Ready**.
- Check the **Design Review** view. Approve by setting Status to **Approved**, or comment and set **Revise**.
- Check **Blocked** and anything labelled `needs-human-merge`.
- Kill switch: tick **Paused** on the Pipeline Control page.

## Editing the pipeline itself
The guard hook blocks agents from editing hooks, settings, pipeline.json and workflows. Edit those by hand, or run Claude Code with the hooks temporarily disabled in a session you are watching.
