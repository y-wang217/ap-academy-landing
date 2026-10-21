# 0058: Iris stores parent mail for 90 days, with no audit copy
Status: accepted
Date: 2026-10-20

## Context
To show Charlie what needs him, and later to classify and draft replies, Iris has to keep the messages it reads: the sender's address, the subject, a snippet and, for a known family, the body. That is personal data in a new place. Workspace ADR 0004 kept parent fields out of Supabase; workspace ADR 0005 narrows that line for email message data.

## Decision
- **What is stored.** For a sender who matches a family in Students & Parents: the From address, the From display name from the email header, the subject (on the thread), a snippet of at most 200 characters and the body as text, capped at 20,000 characters. For an unknown sender (leads, vendors, teachers) and for automated mail: the From address, the subject and the snippet only, never a body. While a match waits on Notion, no body is stored; it is fetched again from Gmail once the match is known.
- **What is never stored.** Notion's Parent Email and Parent Name, phone numbers, billing fields, attachments. Matching keeps only Notion page ids.
- **Retention.** Each message carries `purge_at` = received + `settings.retention_days` (90). Every run calls `iris.purge_expired`, which deletes expired messages, threads left empty, runs older than 90 days, and events and `ai_calls` older than 365 days. The owner can delete a family's thread now with `iris.delete_thread`.
- **No audit copy.** `tracker.write_audit` runs on `iris.settings` only, and only for the owner-facing columns. An audit copy of a message would outlive its retention.
- **Ids only in the record.** `iris.events` and `iris.ai_calls` are append-only (`iris.guard_append_only`) and keep ids, states and reason codes, never an address, a name or body text. Their `message_id` goes to null when a message is purged.
- **Short errors.** Errors stored on a message, a run or the settings row are at most 300 characters and built from a status, never from a response body.

## Alternatives considered
- **No addresses, only a keyed hash, reading From from Gmail on display.** Rejected: the unknown-sender list would need a Gmail read per row, and Iris 3/9 needs the text anyway.
- **Store bodies for every sender.** Rejected: unknown senders are not families and have not been told about Iris.
- **Audit every Iris table.** Rejected: the audit log is append-only forever, so it would keep parent mail past retention.

## Consequences
- The privacy page (REQ-41) must stay accurate about what Iris keeps and for how long.
- Changing `retention_days` changes only new messages' `purge_at`.
- A Notion outage leaves new mail at "Waiting for Notion" with no body, for at most three runs, then "Failed".
