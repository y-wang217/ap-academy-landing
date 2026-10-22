# Iris operations (Iris 2/9 and 3/9)

How to set up, run, pause and clean up Iris's read-only inbox (REQ-42,
classification REQ-43, tracker ADRs 0057 to 0059 and 0061, workspace ADR 0005). Iris starts paused and sends
nothing in this slice.

## One-time setup (Charlie, after migration 0024 is applied)

1. **Google Cloud project and Gmail API.** Create or reuse an AP Academy
   project and enable the Gmail API.
2. **Service account and key.** Create the service account `iris-mail` and one
   JSON key. Copy `client_email` and `private_key` into the tracker Vercel
   project as `IRIS_GMAIL_CLIENT_EMAIL` and `IRIS_GMAIL_PRIVATE_KEY` (pasting
   the key with literal `\n` is fine), then delete the local file.
3. **Domain-wide delegation.** Enable it on the service account. In the
   Workspace Admin console (Security, Access and data control, API controls,
   Domain-wide delegation), add its client id with exactly
   `https://www.googleapis.com/auth/gmail.readonly`. Nothing else: Iris has no
   write path until Iris 8/9.
4. **Tracker env vars** in the tracker Vercel project:
   - `IRIS_GMAIL_MAILBOX=charlie@apacademy.ca`
   - `IRIS_ORG_ID`: the same value as `DAILY_TASK_ORG_ID`
   - `IRIS_CRON_SECRET`: a long random string
   - `SUPABASE_SERVICE_ROLE_KEY` is already set for the daily task.
5. **Supabase.** Under API settings, Exposed schemas, add `iris`. Until then
   the run answers 503 `iris_unavailable` and the pages say "Could not load
   Iris".
6. **Repository secret and workflow.** Add the repository secret
   `IRIS_CRON_SECRET` with the same value, then add
   `.github/workflows/iris-poll.yml` (the YAML is in
   [`docs/designs/REQ-42.md`](../../../docs/designs/REQ-42.md)). It calls the
   run every 15 minutes.
7. **Check.** Open `/tracker/iris/settings`. "Not set up" should be absent.
   Press Run now: it answers "paused". Unpause once the privacy page is live
   and families write to the mailbox.

## What a run does

Every 15 minutes, while unpaused: it lists `in:inbox category:primary
newer_than:3d`, stores at most 50 new messages (oldest first, each once),
matches each sender to a family in Students & Parents, and purges expired
rows. Mail Gmail files under Updates or Promotions is not read. A Notion
outage leaves new mail at "Waiting for Notion" with no body; the next run
that reads Notion finishes it, and after three failed runs it shows "Failed".

## Classification

With `ANTHROPIC_API_KEY` set in the tracker's Vercel env (REQ-43, tracker
ADR 0061), each run then classifies up to 10 matched messages with Claude,
oldest first. Without the key, `/tracker/iris/settings` says "AI is not set
up" and matched mail waits at "Family found".

- **What goes to Anthropic.** The policy intents, flags and hard rules, the
  parent's and children's first names, the message without its quoted
  history, and up to 5 short lines of the same thread. Email addresses and
  the family's surnames are scrubbed. Nothing from the response is stored
  except intent, confidence, flags and the reason; `iris.ai_calls` keeps
  tokens and the outcome only.
- **Reason codes,** in the order they are checked: `flagged` (shown as
  "Sensitive: ..."), `multi_intent` ("Two requests"), `low_confidence`
  ("Unsure", under the threshold shown on the settings page),
  `escalate_only` (billing, refund, no-show, other: "..., for you"),
  `no_reply_needed` (handled at once, never in Needs you) and
  `ambiguous_student` ("Which child?"). Everything else shows "Ready for a
  draft" and waits for Iris 4/9.
- **Mark handled.** Open a message from the inbox and press Mark handled
  once you have dealt with it in Gmail. It leaves Needs you; the record
  keeps who and when.
- **Failures.** A refusal, a busy API or an outage leaves the message at
  "Family found" with a short error; after three failed runs it shows
  "Failed".

## Pause

Press Pause on `/tracker/iris/settings`. A paused run reads no mail and
writes nothing.

## Delete a family's mail now

Until Iris 4/9 adds a button: find the thread id in the inbox (or with
`select id, subject from iris.threads where ...` in the SQL editor), then, in
the SQL editor signed in as the org owner's role:

```sql
select iris.delete_thread('<thread id>');
```

`iris.delete_thread` deletes the thread and its messages, writes one
`thread_deleted` event, and refuses anyone but the org owner. Everything else
is purged on schedule: messages after 90 days, events after 365.

## Rotate the key

Create a new key for `iris-mail`, replace `IRIS_GMAIL_PRIVATE_KEY` in Vercel,
redeploy, press Run now, then delete the old key in Google Cloud.
