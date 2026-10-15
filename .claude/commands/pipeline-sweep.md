---
description: Sync Notion card statuses with GitHub PR state, unblock Backlog cards whose blockers are Done, and write Work Log entries for finished cards.
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

Then unblock the queue. Do this after the PR step so a card whose blocker just became Done moves in the same sweep:

6. For every card with Status **Backlog** whose **Blocked by** relation is not empty: if every card it is blocked by has Status **Done**, set Status to **Ready** and comment "Unblocked: every blocker is Done." A Backlog card with an empty **Blocked by** is parked on purpose (for example a human checklist); leave it alone. A Backlog or Ready card that already has a PR link was moved by hand after the builder ran: set it to **In Review** and apply steps 1 to 5 to it instead of unblocking it.

Also: if any card has sat in **Designing** or **Building** for more than 3 hours (check its last edited time), a previous run died mid-way. Move it back to Ready or Approved respectively and comment "Recovered from a stalled run."

Return a one-line summary, for example: "Sweep: 1 Done, 1 Changes Requested, 2 unblocked, 0 recovered."
