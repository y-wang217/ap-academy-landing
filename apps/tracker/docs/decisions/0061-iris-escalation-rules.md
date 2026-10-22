# 0061: Iris classifies once and escalates first
Status: accepted
Date: 2026-10-21

## Context
Iris 2/9 (REQ-42) stores each parent message and matches the sender to a family, then stops at `matched`. Iris 3/9 (REQ-43) works out what each message asks for, with Claude, and decides whether Iris may go on (a draft, in Iris 4/9) or Charlie must act. A wrong escalation costs Charlie a minute; a wrong pass-through could put a refund, a legal threat or a crisis in an automated path. The spec (decisions 8 to 12) asks Iris to escalate when unsure, on two or more requests, and on money disputes, legal threats, crisis language and hardship, and never to promise a time it cannot back.

## Decision
- **One call per message.** `lib/iris/classify.ts` makes one Anthropic call with `AI_MODEL` at effort low, a Zod output format (intents, primary, confidence, flags, child name, a one-line summary), the server-side refusal fallback, a 20 second timeout and 2 SDK retries. A refusal, a 429, a 500 or a network error is a fixed short error; three failed runs set `failed`. Nothing the API returns is stored or logged except the HTTP status.
- **What leaves.** The intents, flag definitions and hard rules from `policy.ts`, the parent's and children's first names, the message with quoted history removed, and up to 5 earlier thread lines built by code (date, sender, intent, a 200-character snippet). Email addresses and the family's surnames are scrubbed. No Notion field other than first names is read for it.
- **Routing order, first match wins** (`lib/iris/route.ts`, pure):
  1. any flag, from the model or the keyword backstop: `escalated`, `flagged`
  2. two or more distinct intents: `escalated`, `multi_intent`
  3. confidence under `iris.settings.confidence_threshold` (0.85): `escalated`, `low_confidence`
  4. a billing question, refund request, no-show or other: `escalated`, `escalate_only`
  5. no reply needed: `escalated` with `handled_at` set, `no_reply_needed`
  6. a cancellation or reschedule from a family with more than one child (or none known) that names none of them: `escalated`, `ambiguous_student`
  7. otherwise `classified`, waiting for Iris 4/9 to draft
- **The keyword backstop.** `SENSITIVE_TRIGGERS` in `policy.ts` lists lower-case phrases per flag ("charged twice", "chargeback", "lawyer", "passed away", "can't afford", "refund"). A phrase in the stripped body adds its flag whatever the model says. It can only escalate.
- **What is stored.** On the message: intent, confidence (two decimals, rounded before routing), flags, the reason and `policy_version` (now 2). One `iris.ai_calls` row per call with model, tokens and outcome only. One event per transition with ids and codes; the chosen child is its Notion page id. The model's summary, the prompt and the child name string are never stored.
- **Mark handled.** The owner marks an escalated message handled on `/iris/messages/[id]`: `handled_at`, `handled_by` and one `handled` event, through the owner's own client under the existing 0024 policies. A second call is 409.
- **What a holding line may promise.** No time promise. When Iris 4/9 writes a holding draft for an escalated message it may say only `HOLDING_LINE` ("Charlie will follow up with you personally."), never "within 4 hours" or any other time, because nothing guarantees when Charlie reads it.

## Alternatives considered
- **Model flags only, no keyword backstop.** Rejected: a missed crisis or chargeback is the costly error, and the phrases cost nothing; false positives only escalate.
- **Store the model's summary or the full prompt for review.** Rejected: it would copy parent words into a second place with its own retention; ADR 0058 keeps parent mail in `iris.messages` only.
- **New columns for all intents and the chosen child.** Rejected for now: the event detail holds them as codes and ids, so no migration is needed. Iris 4/9 can add columns if drafting needs them across runs.
- **A smaller model or medium effort.** Rejected: `AI_MODEL` is the spec's choice (decision 9) and effort low keeps 10 calls inside the run's budget.
- **A time promise in the holding line ("within 4 hours").** Rejected (spec decision 12): it is a promise Iris cannot keep for Charlie.

## Consequences
- Parent first names and message text now go to Anthropic. The Iris privacy section (Iris 1/9) already names Anthropic; Iris stays paused until Charlie unpauses it, and without `ANTHROPIC_API_KEY` messages wait at `matched`.
- A run classifies at most 10 messages, oldest first, and starts no call after 35 seconds; the rest wait 15 minutes.
- Changing a trigger phrase, an intent or a flag is a policy change: bump `POLICY_VERSION`.
- Revisit the threshold once Iris 5/9's evaluation harness has real numbers; the column grant already lets a later card make it editable.
