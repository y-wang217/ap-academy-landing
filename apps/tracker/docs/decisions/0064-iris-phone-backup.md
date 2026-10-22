# 0064: Iris reaches Charlie's phone through a Notion Work page and a mention comment
Status: accepted
Date: 2026-10-22

## Context
Charlie works the Iris queue in the tracker at a desk, but parents write at any hour, and Iris 4/9 (REQ-44) must get a copy-ready reply to his phone. The tracker has no mobile push of its own, and Charlie already lives in Notion on his phone: the daily teacher-texts task (ADR 0039) uses a Work page of to-dos with copy blocks. A copy of a reply in Notion is parent data in a new place, so what goes there, and for how long, must be fixed.

## Decision
- **One Work page per Toronto date,** titled "Iris replies" plus the date, with Area Delivery, Type Recurring, State Next, Owner Charlie, Alignment Maintenance and Due / Review the date, written through `lib/notion/work.ts`. A retry after a lost write adopts the page by exact title, so a date never gets two pages. Its id is kept in `iris.push_days`.
- **One to-do per new draft or unhandled escalation** (not automated mail, not no-reply-needed). It holds the parent's and child's first names, the intent and reason labels, a link to the tracker message page, a link to the Gmail thread, a ref (the first 8 characters of the message id) and, when a draft exists, a code block with the signed reply. An unknown sender's to-do says "Unknown sender" and names nobody.
- **What never goes to Notion:** the parent's message text, the model's reason and any email address. A test puts a sentinel in a message body and checks every request.
- **One page comment per new to-do** that mentions `NOTION_CHARLIE_USER_ID`, saying only "New Iris item" with the ref and intent label, so Notion notifies his phone. It holds no names, because this integration cannot remove a page comment. With the variable unset, to-dos are written with no comment and the settings page says phone alerts are off.
- **No edits after creation.** A to-do is created unchecked and never updated, ticked or re-sent; the tracker is the approval record.
- **Retention sweep.** Each run first deletes the to-do of any message that is gone (purged or deleted with `delete_thread`) or within 1 day of its purge date, and removes its `iris.pushes` row; a message already that close is never copied. A Notion copy never outlives the tracker's copy. Work pages and Work Log entries stay; once their to-dos are gone they hold no parent data.
- **Failures.** A Notion error leaves the draft in the queue, marks the push failed with a short error and tries again next run, up to 5 attempts, after which the row shows "Phone copy failed". A retry first looks for a to-do with the ref, so a write that reached Notion is adopted, not repeated.
- **One Work Log entry per date,** linked to the day's page, its Decisions line updated with drafts, escalations and failed phone copies on each run that pushed.

## Alternatives considered
- **SMS to Charlie.** Rejected: a new service and a new processor of parent data, and no copy-and-paste block.
- **A Gmail draft in the thread.** Rejected: it needs a Gmail write scope before Iris 8/9, and a draft in the mailbox looks like a sent-ready reply.
- **Mark the to-do done after Approve or Reject.** Rejected: it would edit a block after creation and race Charlie's own tick, as ADR 0039 found for teacher texts.
- **Put the parent's one-line summary on the to-do** (spec 4.6). Rejected: the summary is model text about parent words; the intent label and the tracker link are enough.
- **Keep Notion copies until Charlie deletes them.** Rejected: the privacy text promises Notion keeps nothing longer than the tracker.

## Consequences
- The run writes to Notion Work and Work Log on every run that has a new item, through the existing `NOTION_TOKEN`; `apps/tracker/lib/notion/work.ts` gains `appendToDo`, `createComment`, `deleteBlock` and `listToDoTexts`, and stays a human-merge path.
- A comment written to Notion whose row write was lost is repeated on the retry: one extra notification, never a second to-do.
- `NOTION_CHARLIE_USER_ID` must be set by a human in the tracker's Vercel project for phone alerts.
- Revisit when Iris 8/9 sends replies: the to-do may then link to a sent state instead of carrying the copy block.
