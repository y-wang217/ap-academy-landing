# 0070: Creation mode reads open Marketing Work rows, pins the weekly review by page id and writes nothing
Status: accepted
Date: 2026-10-22

## Context
The founder console's Creation mode (REQ-60) answers "what creative thing do I do next?" and shows
the weekly media review. Spec `docs/spec/founder-console/02-data-contracts.md` section 3.8 names
the Notion Work database (`3031b455-9be0-4f8d-b200-70fcfcf1a0b8`) as the authority. REQ-54's
reader returned every open Work row with seven properties and left `Expected result` out. Daily
Delivery rows (the teacher-texts task) sit in Next by the dozen and would fill the facade's page
cap. The card left open the queue order, the weekly review match and an optional one-step
"set State to Done" action.

## Decision
- **Area filter in Notion.** The console's Work query filters State is not Done and Area is
  Marketing (Area = Marketing), sorted by Due / Review. The facade's `work` panel is open Marketing
  work; Creation mode is its only consumer. `buildCreation` checks Area and State again.
- **Extra read properties.** The reader also reads `Parent Project` and `Expected result`, cut to
  500 characters. This amends REQ-54 (ADR 0065), which left Expected result unread. Alignment,
  Build hours, Bet, Agent permission and Work Log are never read.
- **Task Type names.** Inside the same `work` provider, only when a row has a Task Type, one
  read-only query of the Task Type data source (`80e411f2-eb5b-4055-b560-55061669d9f7`, title
  `Task type`, env `NOTION_TASK_TYPES_DATA_SOURCE_ID`) fills each name. A failed name read shows
  "Name unavailable" with the link; the rows and the panel status stand. The health route keeps
  six providers.
- **Order and grouping.** State rank Doing, Next, Defined, Inbox, then no or unknown State
  ("State not set"), then Waiting / Blocked last. Within a rank: Due / Review ascending with
  missing dates last, then name, then id. A row whose first Parent Project is an open Project row
  is listed only under it, one level deep; any other row with a parent is top-level with a parent
  link. Children come from each child's Parent Project, so Notion's 25-id relation cap on a
  project's Children does not matter. Overdue (Due / Review before today in Toronto) is a label,
  not an order.
- **Next asset rule.** The first row in that order whose Type is not Project or Recurring and
  whose State is Doing, Next, Defined or Inbox. A `?task=<id>` selection, kept by the mode tabs
  and a reload, replaces it and is marked Selected; an id that is no longer open falls back to
  the next asset with a note.
- **Weekly review pin.** The row with page id `3ead6ae7-3dd7-811e-b525-e3626520b805`
  ("Weekly marketing performance review"), only while it is open, in Marketing and Recurring.
  Otherwise the panel says "No weekly media review task found", why it may be missing, and links
  to the pinned page and the Work database. To repin, change `WEEKLY_MEDIA_REVIEW_PAGE_ID` in
  `lib/console/creation.ts`.
- **No Done action.** The optional one-step set State to Done action was not built. Completion
  stays in Notion and shows on the next load. The console has no button, form, server action or
  route that writes Work, and creates no Work row.

## Alternatives considered
- Filtering Area only in the builder: daily Delivery rows would reach the page cap and turn the
  panel stale.
- Matching the weekly review by name or Task Type: the guardrail joins by page id, and the live
  row has no Task Type.
- A seventh provider for Task Types: it would change the health route's shape for a label.
- Building the Done action: it needs a workspace ADR 0004 amendment for one more Notion write
  channel, to save opening a link.

## Consequences
- If Charlie archives the pinned review and makes a new one, the panel says none found until the
  constant is changed.
- Any other future reader of open Work rows (Delivery, Sales) needs its own query; this one is
  Marketing only.
- A later card can add the Done action with its own write guard, audit event and ADR.
