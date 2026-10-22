# 0063: Iris drafts from one versioned policy file, checked by code, reviewed only through functions
Status: accepted
Date: 2026-10-22

## Context
Iris 4/9 (REQ-44) is rung 2: Iris writes a reply for each classified message, Charlie approves, edits or rejects it, and approvals are counted per reply type so that Iris 9/9 can later offer auto-send to types Charlie approved unedited 20 times in a row. Nothing is sent by Iris in this card; Charlie copies an approved reply into Gmail. The approval record created here is the control every later send relies on, so it must be atomic and owner-only, and a draft must never hold a promise the policy forbids.

## Decision
- **One policy file, versioned.** `lib/iris/policy.ts` stays the only place policy text lives. Version 3 adds `VOICE_RULES`, `SIGNATURE` ("Charlie" then "AP Academy") and what gets a draft: `DRAFTABLE_INTENTS` (cancellation, reschedule_request, pause_or_stop, general_question) and `DRAFTABLE_ESCALATIONS` (no_show). Every draft row records the `POLICY_VERSION` it was written under; the message page shows the current text with a note when the versions differ. No policy text is stored in Postgres.
- **What a draft prompt holds.** `lib/iris/draft-prompt.ts` (pure) sends the one reply type's `POLICY[type].text` verbatim and no other policy text, the voice rules, the holding line, the parent's and child's first names, at most 5 code-built history lines and the quote-stripped message as untrusted data. Addresses and surnames are scrubbed with the classifier's scrubber. One Anthropic call per message (`AI_MODEL`, effort `AI_EFFORT`, 30 second timeout), at most 6 per run, none after 70 seconds; three failures set `failed`, except a no-show, which stays in Needs you.
- **The code-side rule check.** `lib/iris/draft-rules.ts` rejects a body that names a dollar amount, says it is an AI, an assistant, automated or Iris, names a clock time, or says forfeit. Such a draft is never stored: the message is escalated with `draft_rule` and the rule codes go in the event. `needs_charlie` from the model stores the draft and escalates with `needs_charlie`.
- **The signature is code's.** `withSignature(body)` trims any sign-off the model added and appends `SIGNATURE` once. The stored body never has it; the copy text and the Notion code block (and from Iris 8/9 the send body) always do.
- **Owner review through functions only.** `iris.approve_draft`, `iris.save_draft_edit` and `iris.reject_draft` (migration 0025) are security definer, check the owner inside, lock the message row `for update`, and in one statement change the draft, the message, the streak and write one event with the owner's id as actor. Only the latest proposed version can be acted on; anything else is a conflict. The owner has no insert or update grant on `iris.drafts`. A draft of another org reads as not found.
- **The streak rules.** An unedited approval adds 1 to the type's `unedited_streak` and `approved_unedited_total`; approving an edited version adds 1 to `edited_total` and leaves the streak unchanged; saving an edit or rejecting resets the streak to 0. An approval of a draft written under a newer policy version than `streak_policy_version` restarts the streak at 1 under that version; one written under an older version counts in the totals only. `auto_send_eligible` is `unedited_streak >= 20` (`TUNING.irisAutoSendStreak`, mirrored as a constant in the migration and pinned by a test). No switch is shown until Iris 9/9.
- **Charlie's own replies.** Each run lists `in:sent newer_than:3d`; a message with Gmail's SENT label in a thread Iris knows is stored as `charlie_manual`, and every earlier message of that thread still waiting on Charlie is handled with `answered_by_charlie` and its proposed draft superseded. Mail from the mailbox address without the SENT label supersedes nothing.

## Alternatives considered
- **Direct insert and update grants plus a trigger for the streak** (the spec's first shape). Rejected: two writes from the browser can interleave, and a grant on `drafts` lets the owner's client set any column; one function per action is atomic and narrower.
- **Store a rule-breaking draft for Charlie to fix.** Rejected: a stored draft can be approved in one click. The regexes can over-escalate (a "5 pm" echoed back); that only costs Charlie a reply.
- **Let the model sign the email.** Rejected: an extra or missing sign-off is the most common drift, and code can guarantee it.
- **Store the model's reason or the policy text per draft.** Rejected: the reason is model text about a parent message; the policy text is already versioned in git.
- **A holding draft for every escalation.** Rejected: only the no-show has a policy line safe to draft from; Charlie writes the rest.

## Consequences
- Parent first names and message text go to Anthropic a second time per message; the privacy section of Iris 1/9 already names Anthropic.
- The run's `maxDuration` rises to 120 seconds (Run now waits 130) with start budgets of 35, 70 and 95 seconds for classify, draft and push.
- Changing `VOICE_RULES`, `SIGNATURE` or the draftable lists is a policy change: bump `POLICY_VERSION`, which restarts every streak on its next approval.
- Revisit the rule regexes once Iris 5/9 measures how often they hold back a good draft.
