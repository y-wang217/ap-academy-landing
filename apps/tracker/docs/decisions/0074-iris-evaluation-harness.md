# 0074: Iris is measured on Charlie's own past replies before any reply type can auto-send
Status: accepted
Date: 2026-10-22

## Context

Spec decision 21 says no Iris reply type may be switched to auto-send (Iris 9/9)
on the live unedited streak alone. Charlie first needs a measurement on his own
past mail: real family messages paired with what he answered, his gold labels,
and Iris's classification and drafts over that set at the current policy
version and model. REQ-45 (Iris 5/9) builds that harness. Migration 0025 already
holds `iris.eval_labels` and `iris.eval_runs`; nothing filled them.

## Decision

- **History import.** The owner asks for an import (an `eval_import_requested`
  event, which the owner may already insert). The bearer poll run does it, after
  the live steps: mail newer than `TUNING.irisHistoryDays` (365) and older than
  the live poll window (3 days), from the family directory's Parent Emails, 15
  addresses per query, plus Charlie's sent replies in threads that hold a stored
  inbound message. At most `irisMaxImportPerRun` (50) `messages.get` calls per
  run, oldest first. Unknown senders and automated mail are never stored: their
  ids go in the batch event so later runs skip them. A request finishes with one
  `eval_import_finished` event (counts only, and `capped` when a list hit 500).
  Still `gmail.readonly`, still only `messages.list` and `messages.get`.
- **History never reaches the live path.** An imported inbound message is
  stored as `state escalated`, `escalation_reason history_import`, `handled_at`
  set, `policy_version` null. Every live step and inbox section already skips
  handled escalations, and Recent excludes `history_import` explicitly. The
  import makes no Notion request and writes no draft.
- **Retention starts at import.** An imported message's `purge_at` is import
  time plus `retention_days`. Counting from when it arrived would purge most of
  the history on the next run. The history is not exempt from retention (spec
  decision 15): labels and results go with their message; `eval_runs` rows and
  events stay.
- **Eval run.** The owner asks for a run (`eval_run_requested`, stamped with
  `POLICY_VERSION` and the model). Later poll runs classify and draft up to
  `irisMaxEvalPerRun` (4) fully labelled messages per run, with the same prompt
  builders (`prepareClassifyPrompt`, `prepareDraftPrompt`), router and draft
  rules as the live steps, and store one `iris.eval_results` row each. A draft
  that breaks a rule is predicted escalated with no body. Every model call is an
  `ai_calls` row with purpose `eval`. A request whose policy version or model no
  longer matches the deploy finishes as `stale` with no model call.
- **Ratings are tied to one result.** `eval_labels.rated_result_id` (migration
  0027) says which draft a rating is about. Only ratings of the recorded
  request's results count, so a rating given at policy 3 never counts for a
  policy 4 run.
- **Scoring** (`scoreEval`, pure). Precision for type T is messages predicted
  sendable as T (not escalated, reply type T) whose gold is T and not escalate,
  over all predicted sendable as T; null when there are none. Recall for T is,
  of gold T and not escalate, the share predicted sendable as T. Count is the
  number of gold T, not escalate. Sensitive recall is, of gold escalations, the
  share predicted escalated; null when there are none. Mean rating is grouped by
  predicted reply type. Recording is refused while the request is unfinished or
  any result has outcome `error`, because counting errors as escalations would
  inflate sensitive recall.
- **The gate** (`evaluateGate`, pure). A type passes only with at least 20
  labelled examples, precision at least 0.95, sensitive recall 1.0, mean rating
  at least 4, an unedited streak of at least 20 at the current policy version,
  and a recorded run at the current policy version and model. It names every
  failing condition. Types in `NEVER_AUTO_SEND` never pass and never get a
  switch. The settings page shows the conditions; no switch exists until 9/9.

## Alternatives considered

- **An owner route with the service client** to import and evaluate: a third
  service-role importer, against decision 17. Rejected.
- **An owner route on the owner's client:** cannot write `ai_calls` or threads
  under the current RLS. Rejected.
- **A new `messages.origin` column** to mark history: a schema change for what
  a reason code already says. Rejected.
- **Showing drafts once without storing them:** a rating could not be tied to
  the draft it rated. Rejected; hence `eval_results`.
- **A foreign key from `eval_results.request_event_id` to `iris.events`:** it
  changes how the events append-only guard refuses a truncate (iris_core.sql).
  The run writes the column after reading the event, so the key is left out.

## Consequences

- Up to two model calls per labelled message: about 200 calls for 100
  messages, each logged with tokens. At 4 per 15-minute run, 100 labelled
  messages take about 6 hours; Run now speeds it up, and live mail always goes
  first in the run.
- A year of mail from 15 addresses can exceed the 500-id list cap. The finished
  event says `capped` and the page says some older mail was not imported.
- The owner could insert a hand-made `eval_runs` row through PostgREST (the
  grant is in 0025). Only the org owner can, and only the owner can later
  enable a type, so the gate guards against mistakes, not against the owner.
- Parent words are stored the same way and for the same time as live mail
  (ADR 0058). No body enters events, `ai_calls` or Notion.
- Revisit when Iris 9/9 enforces the gate server-side on enable, or when the
  thresholds change (a change needs a comment on the spec).
