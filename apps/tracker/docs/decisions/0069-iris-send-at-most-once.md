# 0069: Iris sends an approved reply at most once
Status: accepted
Date: 2026-10-22

## Context
Until Iris 8/9 (REQ-48) Charlie approved a draft and pasted it into Gmail himself. Approve now sends it from the mailbox into the parent's Gmail thread. An email cannot be taken back, so a reply must never go out twice: not on a double click, not from two tabs, not after a retry, and not after a crash between Gmail accepting the message and the database recording it. Gmail's `messages.send` has no idempotency key. The read-only Gmail scope of ADR 0059 cannot send.

## Decision
- **One send row per draft.** Migration 0028 adds `iris.sends` with `draft_id` unique. `iris.approve_draft_for_send` approves the draft and inserts its send in one statement, with the message row locked; a second call returns the existing send and makes no Gmail call. The tracker no longer calls `iris.approve_draft`, so approving always creates a send. It stays granted in 0028, so the app deployed before this card keeps working while the migration is live and the card is not; a follow-up migration revokes it from `authenticated` once this card is live. The owner reads sends; every change goes through security definer functions (`claim_send`, `finish_send`, `fail_send_attempt`, `retry_send`) that check the caller is the org owner or the run.
- **Our own Message-ID plus `X-Iris-Send-Id`.** Each send has `Message-ID: <iris-<send id>@apacademy.ca>` and a custom `X-Iris-Send-Id` header, so Iris can find its own message in Gmail later even if Gmail rewrote the Message-ID.
- **Verify before every attempt but the first.** Approve's first attempt sends at once (nothing can have gone out yet). Every later attempt, from the run or from Retry, first searches `rfc822msgid:` and then the thread's headers; found means sent and is recorded, not sent again. A search error is a failed attempt, never "not sent". An attempt holds a 60-second lease; a crash frees it and the next attempt verifies.
- **Two tokens with one scope each.** The intake, sent-mail and verify calls use a `gmail.readonly` token; only `messages.send` uses a `gmail.send` token, fetched just before a send. If Workspace has not granted `gmail.send`, only sending fails ("Gmail send is not authorised"); intake keeps working.
- **The 3-attempt limit.** A send gets 3 attempts (Approve's, then the 15-minute poll run's), then it is failed with a status-only error line and listed under Failed with Retry. Retry resets the count, so it allows 3 more, each verified first. Paused stops Approve, Retry and the run's send step.
- The run records Iris's outbound copy itself (`finish_send`, source `iris`). The sent-mail read skips our Message-ID, and if a copy was stored as `charlie_manual` anyway it becomes `iris`, so there is never a second outbound row. Iris replies only to the inbound sender, as plain text, with the signature from `withSignature`.

## Alternatives considered
- **Owner insert and update policies on `iris.sends`** (the spec's table). Rejected: a direct insert could create a send with no approval, or two sends.
- **One token with both scopes.** Rejected: intake would stop until Charlie grants `gmail.send`.
- **Retry three times inside Approve.** Rejected: with verification it could exceed the route's 30-second limit; the run retries every 15 minutes instead.
- **Search by `rfc822msgid:` only.** Rejected: if Gmail rewrote the Message-ID the search would miss and a retry could double-send. The thread fallback costs one read-only call, only on a retry.
- **A confirm dialog on Approve.** Rejected: the editor shows the whole text and the button says "Approve and send".

## Consequences
- ADR 0059's scope is widened by this ADR; its decision text stands for reading.
- Charlie must add `https://www.googleapis.com/auth/gmail.send` to the service account's domain-wide delegation (`docs/iris-operations.md`). Until then sends fail with a clear line and nothing else changes.
- After the first live send, Charlie checks in Gmail (Show original) that the Message-ID is `<iris-...@apacademy.ca>`. If Gmail rewrites it, the `X-Iris-Send-Id` fallback still prevents a double send.
- Copy after Approve stays only for drafts approved before sending existed; copying and sending by hand, then pressing Retry, could double-send.
- Auto-send, quiet hours and the automated line are Iris 9/9. Revisit if Gmail ever offers an idempotency key for `messages.send`.
