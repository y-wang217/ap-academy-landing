---
description: Read-only. List the things that are waiting on Charlie right now, most urgent first, across the Dev Requirements board, open PRs, migrations and the readiness register. Changes nothing.
---

Build Charlie's "your move" list for ap-academy-landing. This command reads and ranks; it never moves a card, comments, merges, kicks a routine or applies a migration. Keep it cheap: one board query, one PR listing, and extra calls only for the few items that need them.

## 1. Read config
`.claude/pipeline.json` (`repo`, `statuses`, `labels`, `review_round_cap`, `notion`) and `.claude/notion-ids.json` (`charlie_user_id`, `pipeline_control_page_id`).

## 2. Gather, in as few calls as this allows
- **Board.** One SQL query on `notion.board_data_source` for every card whose Status is not Done: Card ID, Title, Track, Status, Risk, Priority, PR, Claimed by, Blocked by.
- **Comments.** Only for cards in **Blocked** and **Needs Approval**: `get-comments` on the card. The latest comment on a Blocked card says what is needed. On a Needs Approval card, a comment from the approver that mentions `charlie_user_id` ("Needs Charlie") means the bot will not approve it.
- **PRs.** One GitHub `list_pull_requests` (state open, fields number, title, labels, head, mergeable_state, updated_at). Then, only for open `req/` PRs that carry `needs-human-merge`, `pull_request_read` method `get_status` to read the `review` commit status (`Bot reviewer approved`). For `req/` PRs whose card is in **Changes Requested**, `get_comments` and look for a `github-actions[bot]` comment that mentions Charlie (the review-round cap).
- **Migrations.** For every open PR on a branch ending in `-migration`, note the migration file names from its title or diff. A title starting with **HUMAN MIGRATION REQUIRED** needs Charlie in the SQL editor, not the MCP.
- **Pause.** Fetch `pipeline_control_page_id` and read the **Paused** checkbox.
- **Readiness.** `docs/readiness.md`: every findings row whose Next step names Charlie or the owner, or that has `Merged: no` with a PR number, and every Audience gate whose State is not Closed. Only Charlie releases a gate.

## 3. Rank
Order the list by what unblocks the most work, then by Priority, then by age:
1. **Pipeline is paused** (if so, say it first and stop ranking the rest as urgent).
2. **Merge now.** A `req/` PR with `needs-human-merge` whose `review` status is success. A migration PR in that state also needs the migration applied (`apply_migration` by name, or the dashboard SQL editor when the title says HUMAN MIGRATION REQUIRED), then the feature PR behind it auto-merges once the sweep sees it live.
3. **Blocked cards.** The whole track behind them is stopped. Quote the question from the latest comment in one line.
4. **Design approvals only Charlie can give.** Needs Approval cards with Risk High, or with a "Needs Charlie" comment.
5. **Review-round cap.** A PR the bot sent back `review_round_cap` times.
6. **Dependabot PRs** with green CI (a human merges each one).
7. **Readiness.** Findings whose next step is Charlie's, and gates waiting on sign-off.
8. **Stalled runs** (Designing or Building for more than 3 hours with no PR) are the sweep's to recover, not Charlie's; mention them only if the sweep has not run since.

A card or PR appears once, under its highest-ranked reason. Do not list Approved, Building, In Review, Revise or Changes Requested under the cap: the pipeline handles those without him.

## 4. Reply
Plain text, no em-dashes, short lines. Shape:

```
Your move (N items)
1. Merge #<n> <card-id> <short title>. Bot approved, CI green[, then apply migration NNNN].  <PR url>
2. Answer on <card-id> <short title>: "<the question in one line>".  <card url>
3. Approve design <card-id> <short title> (High risk).  <card url>
...

Moving without you: <k> building, <m> in review, <j> designing. Next scheduled design/build runs are the 3-hour safety net.
```

If nothing is waiting on him, reply "Nothing needs you right now." followed by the one "Moving without you" line. Never pad the list: an item is on it only when the next action is his.
