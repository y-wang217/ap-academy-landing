---
description: Sync Notion card statuses with GitHub PR state and write Work Log entries for finished cards.
---

Sync the Dev Requirements board with GitHub. Config is in `.claude/pipeline.json`.

For every card with Status **In Review** that has a PR link:

1. `gh pr view <url> --json state,reviewDecision,mergedAt,labels`
2. If `state` is MERGED:
   - Set Status to **Done**.
   - Write one AP Academy Work Log entry to `notion.work_log_data_source`. Fetch that data source's schema first and fill its real property names:
     - Summary: "<card-id> shipped: <card title>"
     - Date: today
     - Source: Claude
     - Logged by: Session itself
     - Session link: the PR URL (and this session's URL if you have one)
     - Bet and Alignment: pick the closest existing option for a product or systems improvement to the tracker; leave blank if none fits
     - Decisions: one line on what was built and anything notable from review
     - New todos: follow-ups the PR or review mentioned, or blank
3. If `state` is CLOSED without merge: set Status to **Blocked** and comment "PR closed without merge" on the card.
4. If `reviewDecision` is CHANGES_REQUESTED: set Status to **Changes Requested**.
5. Otherwise leave it.

Also: if any card has sat in **Designing** or **Building** for more than 3 hours (check its last edited time), a previous run died mid-way. Move it back to Ready or Approved respectively and comment "Recovered from a stalled run."

Return a one-line summary, for example: "Sweep: 1 Done, 1 Changes Requested, 0 recovered."
