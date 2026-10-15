---
description: Reconcile the Dev Requirements board with GitHub (GitHub is the truth), unblock Backlog cards whose blockers are Done, release feature PRs whose migration is live, and write one Work Log entry per shipped card.
---

Sync the Dev Requirements board with GitHub. Config is in `.claude/pipeline.json`. GitHub is the truth for anything that has a PR: a card's status follows its PR whatever Notion says.

## 1. Read both sides
- PRs: `gh pr list --repo <repo> --label pipeline --state all --limit 50 --json number,url,state,headRefName,baseRefName,reviewDecision,mergedAt,labels,isDraft` (or the read-only GitHub MCP `list_pull_requests` when `gh` has no token). The card ID is the `req/<CARD-ID>-` prefix of `headRefName`. A branch ending in `migration_branch_suffix` is a migration PR: it never drives the card's status, only step 4.
- Cards: query `notion.board_data_source` for every card whose Status is not Done.

## 2. Card status follows the feature PR
For every card that has a feature PR (matched by branch, or by the card's **PR** property), whatever its current Status, Backlog and Ready included (a card moved by hand after the builder ran):
- `MERGED` → Status **Done**, then step 5.
- `CLOSED` without merge → Status **Blocked** and comment "PR closed without merge".
- `OPEN` with `reviewDecision` = `CHANGES_REQUESTED` → Status **Changes Requested**.
- `OPEN` otherwise (including a draft) → Status **In Review**.
- Set the card's **PR** property to the PR URL when it is empty.
Change the status only when it differs; say which cards moved.

## 3. Stalled runs
A card in **Designing** or **Building** for more than 3 hours (last edited time) with no PR died mid-run: move it back to **Ready** or **Approved** respectively and comment "Recovered from a stalled run."

## 4. Migrations and dependencies
Do this after step 2, so a card whose blocker just became Done moves in the same sweep.
- For every open PR labelled `awaiting-migration`: find its migration PR (same card ID, branch ending in `-migration`) and the migration file name it added (`gh pr view <migration-pr> --json files`). Call the Supabase MCP `list_migrations`; if a version named like that file (`NNNN_<slug>`) is live, `gh pr edit <n> --remove-label awaiting-migration` and comment on the card "Migration NNNN is live; the feature PR can merge." The label removal starts the auto-merge workflow.
- For every card in **Backlog** whose **Blocked by** relation is not empty: if every card it is blocked by is **Done**, set Status **Ready** and comment "Unblocked: every blocker is Done." A Backlog card with an empty **Blocked by** is parked on purpose (for example a human checklist); leave it alone.
- For every card in **Ready** whose **Blocked by** has a card that is not Done, set Status **Backlog** (it was filed early).

## 5. Work Log, once per shipped card
Only the sweep writes "shipped" rows, and only in the run that moved the card to Done. Before writing, query `notion.work_log_data_source` for a row whose Summary starts with `<card-id> shipped`; if one exists, skip. Otherwise write one entry (fetch the schema first and use its real property names):
- Summary: "<card-id> shipped: <card title>"
- Date: today
- Source: Agent
- Logged by: Session itself
- Session link: the PR URL
- Bet and Alignment: pick the closest existing option for a product or systems improvement to the tracker; leave blank if none fits
- Decisions: one line on what was built and anything notable from review
- New todos: follow-ups the PR or review mentioned, or blank

## 6. Summary
Return one line, for example: "Sweep: 1 Done, 1 In Review (was Building), 1 Changes Requested, 2 unblocked, 1 migration released, 0 recovered."
