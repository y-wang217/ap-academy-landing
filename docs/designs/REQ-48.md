# Design: REQ-48: Iris 8/9: Send approved replies

Copied from the approved card (Notion, REQ-48) so the reviewer can read it next to the diff.

**Numbers (REQ-51):** the build briefly moved to `0027_iris_sends.sql` and ADR 0074 while REQ-45 held 0028 and 0069. REQ-45 then moved to 0027 (#121) and ADR 0074 (#123), both lower-numbered PRs, so this card is back on the numbers its approved design names: migration `0028_iris_sends.sql` and tracker ADR `0069-iris-send-at-most-once.md`.

**Summary:** when Charlie presses Approve on a draft, the tracker sends that reply from charlie@apacademy.ca into the parent's Gmail thread, exactly once, records it, and shows any send that fails, with a Retry button. Before this card he had to copy the text and send it by hand.

**Risk:** High. Approving now sends an email to a parent, which cannot be undone, and the Gmail credential gains a new scope (`gmail.send`). No auth, RLS-model or payment change; the parent's address goes only to Gmail, which already holds it.

## Problem

Charlie (the org owner, the only Iris user) approves drafts on `/tracker/iris/messages/[id]`. Before this card `iris.approve_draft` (migration 0025) only marked the draft approved, and `components/iris/copy-reply.tsx` showed the text to paste into Gmail. This card makes Approve send it. A reply must never go out twice: not on a double click, not when two tabs are open, not after a retry, and not after a crash between Gmail accepting the message and the database recording it.

## Acceptance criteria

- AC1: Approve on a proposed draft creates exactly one `iris.sends` row: state `sending`, mode `manual`, `attempts` 1, `lease_until` about 60 seconds ahead, `rfc_message_id` `<iris-<send id>@apacademy.ca>`. It makes exactly one Gmail `messages.send` call. A second Approve of the same draft, from the same or another tab, returns 200 with the existing send's state and makes no Gmail call. Approving an older version after an edit is still a 409 conflict.
- AC2: The raw message Gmail receives has: `To` the inbound sender; `From` the mailbox; `Subject` `Re: <thread subject>` with no second `Re:`; `In-Reply-To` and `References` set to the inbound `rfc_message_id` (both left out when null); `Message-ID` our own id; `X-Iris-Send-Id`; `MIME-Version: 1.0`; `Content-Type: text/plain; charset=UTF-8`. The body is the draft text with `withSignature`, with no automated line. The request carries the thread's `gmail_thread_id` as `threadId`. No header value contains CR or LF; non-ASCII subjects are RFC 2047 encoded.
- AC3: On success one database call records: the send `sent` with Gmail's id and `sent_at`; the draft `sent`; the inbound message `sent`; one outbound `iris.messages` row (source `iris`); the thread's `last_outbound_at`; one `sent` event with ids and counts only.
- AC4: The mock Gmail accepts and stores a message but answers 500. The next attempt, from the poll run or Retry, finds it by search and records it as sent. The mock's send counter stays at 1 and exactly one outbound row exists.
- AC5: Gmail answers 500 to every send. After Approve and two more attempts the send is `failed` with an error line built from the status only. Draft and message are `failed`, and the message shows in Failed with Retry. `/tracker/iris`, `/tracker/iris/settings` and `/tracker` still return 200.
- AC6: Retry on a failed send sets the send back to `sending` (attempts reset, error cleared) and the draft and message back to `approved`. It searches Gmail before sending. Retry on a send that is not failed is 409; on another org's send 404.
- AC7: With `settings.paused` true, Approve returns 409 `{"error":"paused"}` with no send row, approval, streak change or Gmail call. Retry returns 409 `paused`, and the poll run returns `paused` with zero Gmail calls.
- AC8: Every send path is owner only, checked before the id or body is read. A teacher, student or parent gets 403 with nothing read. A cross-site POST is 403 at the proxy. RLS hides sends in another org.
- AC9: The intake, supersede and send-verify tokens carry only `gmail.readonly`; the send token carries only `gmail.send`. If Google refuses the send token, that attempt fails with "Gmail send is not authorised (403)" and intake keeps working.
- AC10: `runSupersede` never records a message whose `Message-ID` is `<iris-<uuid>@apacademy.ca>` as `charlie_manual`. If such a row is written anyway, recording the send converts it to source `iris`.
- AC11: `pnpm test:rls` runs `supabase/tests/iris_sends.sql` as owner, teacher, student, parent, anon, another org's owner and `service_role`; every assertion passes: owner reads own org only; others read nothing; `authenticated` cannot write `iris.sends` directly; `approve_draft` is not executable by `authenticated`; double approve leaves one row, paused approve none; `claim_send` busy, claimed, exhausted, paused; `finish_send` idempotent and converts `charlie_manual`; `retry_send` only on failed, only owner; `service_role` claims, finishes and fails; purge removes sends.
- AC12: With the Gmail service account not configured, Approve returns 503 `iris_not_configured` before any write.
- AC13: Tracker ADR `0069-iris-send-at-most-once.md` exists with every section and a README row, no em dash, and records: one send row per draft, our own Message-ID plus `X-Iris-Send-Id`, verify before every attempt but the first, two tokens with one scope each, the 3-attempt limit. `docs/iris-operations.md` gains the `gmail.send` Workspace step, Failed and Retry, and the first-send check.

## Approach

1. Migration `supabase/migrations/0028_iris_sends.sql` (own PR first): table `iris.sends`, owner-read RLS, security definer functions `approve_draft_for_send`, `claim_send`, `finish_send`, `fail_send_attempt`, `retry_send`; revoke `approve_draft` from `authenticated`.
2. `lib/iris/gmail.ts`: `GMAIL_SEND_SCOPE`; `signJwt` and `getAccessToken` take a scope that defaults to read-only; `sendMessage`; `findSent` (`rfc822msgid:` search, then thread metadata `Message-ID` / `X-Iris-Send-Id`); `gmailSendPort` with `readToken`, `sendToken`, `send`, `findSent`.
3. `lib/iris/compose.ts` (pure): `rfcMessageIdFor`, `isIrisMessageId`, `replySubject`, `encodeWord`, `buildReply`, `ComposeError`.
4. `lib/iris/send.ts`: `SendStore`, `attemptSend` (verify unless Approve's first attempt; never throws), `runSends` (stuck sends, capped at 3, 30 s budget, claimed first).
5. Storage: `lib/data/iris.ts` implements the send store for the service store and the owner reader; reader adds `approveForSend` and `retrySend`; `getThreadView` gains `send`; Failed rows gain `sendId`. `store.fake.ts` mirrors it.
6. Handlers: `handleApproveDraft` (gate, body, 503 without Gmail, approve, one attempt), `handleRetrySend`, and `handleIrisRun` runs `runSends` after supersede, before classify, counting `sent`.
7. Routes: approve gets `maxDuration = 30`; new `app/api/iris/sends/[id]/retry/route.ts`; the run route passes `sender`.
8. Supersede skips Iris Message-IDs.
9. UI: send block after Approve (Sent, Not sent yet, Send failed plus Retry); `send-status.tsx` Retry; "Approve and send"; Retry on Failed rows; copy in `lib/view/iris-text.ts`.
10. Tuning: `irisSendMaxAttempts` 3, `irisSendLeaseSeconds` 60, `irisMaxSendsPerRun` 3, `irisSendBudgetMs` 30,000.
11. Scans: Gmail scopes in `lib/iris/` are exactly `gmail.readonly` and `gmail.send`, the send scope and the send call only in `gmail.ts`; `/drafts`, `/modify`, `batchModify` and `trash` still forbidden; no 0028 column named like prompt, answer, summary, completion or response.
12. Docs: ADR 0069 and README row; ADR 0059 status "accepted, scope widened by 0069"; ops guide; PLAN.md.

## Test plan

| Test | Covers |
| --- | --- |
| `lib/iris/compose.test.ts` | AC2 |
| `lib/iris/send.test.ts` | AC3, AC4, AC5, AC9 |
| `lib/iris/gmail.test.ts` additions | AC2, AC4, AC9 |
| `app/api/iris/iris-routes.test.ts` additions | AC1, AC6, AC7, AC8, AC12 |
| `lib/iris/run-handlers.test.ts` additions | AC4, AC5, AC7 |
| `lib/iris/supersede.test.ts` addition | AC10 |
| `lib/iris/scan.test.ts` updates | AC9 |
| `lib/iris-adr.test.ts` addition | AC13 |
| `supabase/tests/iris_sends.sql`, updated `iris_drafts.sql` | AC1, AC3, AC6, AC7, AC10, AC11 |
| `e2e/tracker/mock-gmail.mjs` send, search, thread metadata, `/__gmail/sent`, `/__gmail/fail-send`, `/__gmail/accept-then-fail`; `e2e/tracker/flows.mjs` REQ-48 | AC1, AC2, AC4, AC5, AC6, AC7, AC8 |

## Decisions (defaults approved)

New dependencies none; owner select only with writes through functions; revoke `approve_draft`; Approve tries once, then the run and Retry; verify by `rfc822msgid:` plus thread fallback; no confirm dialog, label "Approve and send"; Copy only for pre-card approvals; two tokens; plain mailbox as From; sends before classify; Retry resets attempts; ADR 0059 status line only; one feature PR.

## Out of scope

Auto-send, quiet hours, `sending_enabled`, per-type switches and the automated line (Iris 9/9); anything but an approved draft; any other Gmail scope; editing or unsending; new env vars.

## Built differently from the design, and why

- The design shows Retry on a `sending` send once its lease has passed. `retry_send` (AC6) refuses anything not `failed` with 409, so the page shows Retry only on a failed send; a stuck `sending` send is picked up by the next poll run.
- The `/send` scan rule is written as "`messages/send` only in `gmail.ts`", because the handler's own `import ... from "./send"` would otherwise match.
