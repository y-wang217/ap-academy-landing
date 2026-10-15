# REQ-12: Dependabot for npm and GitHub Actions

Copied from the Notion card (https://app.notion.com/p/3f9d6ae73dd78162afedf6b1db6f34b3).

**Summary:** A new `.github/dependabot.yml` makes Dependabot open weekly (Monday, Toronto time) dependency PRs for the whole pnpm workspace and for GitHub Actions. npm minor and patch bumps are grouped into one PR, and security updates stay separate. Every Dependabot PR is on a `dependabot/...` branch, so the Claude reviewer and auto-merge skip it and a human merges it once CI passes.

**Risk:** Low. Config and docs only.

## Acceptance criteria
- AC1: `.github/dependabot.yml` exists, parses as YAML, has `version: 2`, and exactly two `updates` entries (`npm`, `github-actions`), both `directory: "/"`.
- AC2: Both: `interval: weekly`, `day: monday`, `time: "06:00"`, `timezone: America/Toronto`.
- AC3: npm entry has `open-pull-requests-limit: 5` and exactly one group (`applies-to: version-updates`, `patterns: ["*"]`, `update-types: [minor, patch]`). No group has `applies-to: security-updates`.
- AC4: No `target-branch` or `pull-request-branch-name`.
- AC5: Both entries set `labels: ["dependencies", "needs-human-merge"]`.
- AC6: Exactly one new bullet in `## Agent pipeline` of root `CLAUDE.md`.
- AC7: One new item in `## GitHub` of `PIPELINE.md` (enable Dependabot alerts and security updates).
- AC8: PR changes only `.github/dependabot.yml`, `CLAUDE.md`, `PIPELINE.md` (plus this design copy, per builder rules); labels `pipeline` and `needs-human-merge`.
- AC9: After merge, the Dependabot tab lists both ecosystems with no error and "Check for updates" on npm finishes without error.

## Test plan
Uncommitted PyYAML structural check of AC1-5; reviewer diff check of AC6-8; CI green; manual post-merge check for AC9.
