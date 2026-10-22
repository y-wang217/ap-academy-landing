# 0059: Gmail through a service account, read-only, with no SDK
Status: accepted, scope widened by 0074
Date: 2026-10-20

## Context
Iris reads charlie@apacademy.ca. A Workspace mailbox can be reached by an OAuth user consent (a refresh token that can lapse or be revoked by a password change) or by a service account with domain-wide delegation. The tracker adds no dependency without an ADR, and Iris must not change or send mail until Iris 8/9.

## Decision
- **A service account with domain-wide delegation**, `iris-mail`, acting as `IRIS_GMAIL_MAILBOX`, delegated exactly `https://www.googleapis.com/auth/gmail.readonly` in the Workspace Admin console.
- **No SDK.** `lib/iris/gmail.ts` signs an RS256 JWT with `node:crypto`, exchanges it for a token (held in memory for one run), and calls Gmail with plain `fetch`, a 10 second timeout and Zod on every response. The only calls are `GET users/me/messages` and `GET users/me/messages/{id}?format=full`.
- **Errors.** A Gmail or token failure is a `GmailError` holding the HTTP status and a message built from that status only ("Gmail returned 403"), at most 300 characters. Only a list or token failure fails the run (502); one message's failure is counted and retried next run.
- **The poll.** `in:inbox category:primary newer_than:3d`, at most 50 new messages per run, oldest first, each stored once by Gmail message id.
- **Test seam.** `IRIS_GMAIL_API_BASE` replaces both Google hosts, for the e2e mock only.

## Alternatives considered
- **`googleapis` or `google-auth-library`.** Rejected: large dependencies for one signed JWT and two GET calls.
- **OAuth user consent.** Rejected: a refresh token tied to Charlie's login breaks on a password change and needs a consent screen.
- **A wider scope now.** Rejected: `gmail.send` arrives with Iris 8/9 and its own review.

## Consequences
- The service account key is a long-lived secret in the tracker's Vercel env. Rotating it is a Google Cloud task in `docs/iris-operations.md`.
- Mail Gmail files under Updates or Promotions is not read (spec decision 4).
- `lib/iris/scan.test.ts` fails if any other scope or a Gmail write path appears under `lib/iris/`.
- Mail from the mailbox's own address is matched on the From header, which is not authenticated. A message that forges that address into a known thread is stored as `charlie_manual` outbound. This is an accepted risk while Iris only reads: the row grants no access and nothing is sent from it. Iris 8/9, which first acts on outbound rows, must require Gmail's `SENT` label before treating a message as Charlie's.
- Mail is untrusted input. A message that cannot be parsed (for example an HTML entity naming no valid character) is counted `failed` for that run and the loop continues; it never stops intake for the newer mail behind it.
