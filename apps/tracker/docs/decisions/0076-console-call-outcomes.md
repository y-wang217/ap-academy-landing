# 0076: Console call outcomes follow the OPS transition table, are logged by request and confirmed by read-back
Status: accepted
Date: 2026-10-23

## Context
After a call the founder records the outcome and the next action in Notion by hand (REQ-61, Console
7/12; OPS SYSTEM rules in `docs/spec/founder-console/02-data-contracts.md` section 4). Workspace ADR
0007 lets the console write that outcome into Touches and eleven Students & Parents properties. Notion
has no transactions, a database query can miss a page created seconds ago, `last_edited_time` is
minute-granular, and a double click or a timeout must never count an attempt twice or create a second
Touch. The card left open the outcome set, the cadence, how a retry finds out what landed, where the
log lives and whether the note is stored.

## Decision
- **Outcomes and the transition table** (`lib/console/outcomes.ts`, pure). Eight outcomes, each allowed
  only from the Stages listed, with exactly these writes ("today" is America/Toronto; a milestone is set
  only when empty and never cleared):

  | Outcome | From | Stage | Other writes | Touch Outcome | Requires |
  |---|---|---|---|---|---|
  | No answer | New, Working, Awaiting Close | New to Working, else unchanged | Attempts + 1 (absolute); Next Action Due = next call slot; Next Action = Call if empty; at 4 attempts Next Action = Text, due in 7 days | No answer | nothing |
  | Contacted, call back later | New, Working | Working | Attempts 0; Next Action Call; due = the time given; Last Contact; Contacted At | Follow-up | a future time |
  | Follow-up scheduled | Working, Trial Booked, Trial Claimed, Awaiting Close, Onboarding | unchanged | Next Action (Call, Text, Book trial, Close call, Rebook trial, Schedule first lesson); due; Last Contact; Contacted At | Follow-up | action and a future time |
  | Trial booked | New, Working | Trial Booked | Trial Booked At; Contacted At; Owner cleared; Next Action Deliver trial, due = Trial Time; Last Contact | Trial booked | contract A |
  | Not interested | New, Working, Awaiting Close | Lost | Lost Reason; Next Action None; due cleared; Last Contact; Contacted At | Not interested | nothing |
  | Wrong number | New, Working | Lost | Lost Reason; Next Action None; due cleared | Wrong number | nothing |
  | Do not contact | New, Working, Awaiting Close | Lost | as Not interested | Do not contact | nothing |
  | Won | Awaiting Close | Onboarding | Closed At; Next Action Assign teacher, due in 24 hours; Last Contact | Won | contract C |

  Contract A: Parent Name, Student Name, Parent Phone, Subjects, Grade, Target Program, Trial Time,
  Sales Notes. Contract C: Lesson Cadence, Hourly Rate (CAD), Last Payment Date, Subjects. A lead whose
  Lost Reason is Do not contact or Duplicate takes no outcome. Trial cancel or no-show, Trial Claimed and
  Awaiting Close moves, Onboarding to Active, reactivation, pause and churn stay in Notion.
- **Cadence.** Business days are Monday to Friday. Before 15:00 on a business day the next slot is 15:00
  today, else 12:00 on the next business day, written as a datetime with the Toronto offset
  (`nextCallSlot`, `zonedIso` in `lib/time.ts`). `TUNING.consoleNoAnswerCadenceAttempts` (4) ends the
  cadence; the automatic Lost after the cold week is not built.
- **Touch type.** Close call when the lead starts in Awaiting Close, else Call. Staff is the owner's
  `tracker.my_staff_id`, left empty when the owner has no staff link (the status line says so).
- **Transition log.** `tracker.console_transitions` (migration 0029, schema `tracker` like
  `notion_outbox`; a separate `console` schema would need the exposed-schemas setting, the e2e PostgREST
  schemas and a `packages/db` change). Unique `request_id`, one open (running or uncertain) row per
  lead, owner-only RLS, written through the owner's own client, never deleted. States: running, done,
  failed, uncertain; only running moves to a finished state, and uncertain goes back to running only
  through `claim_console_transition`. Each move to done, failed or uncertain writes one
  `tracker.audit_log` row keyed by the Notion page id.
- **Markers and retries.** The PATCH carries `Last Txn = request_id`; the Touch carries
  `Txn ID = request_id`. Every retry reads both before writing: a lead whose `Last Txn` already matches
  gets no second PATCH; a Touch found by `Txn ID` is not created again; a create sent less than
  `TUNING.consoleTouchSettleSeconds` (60) ago and not yet found stays uncertain with `retryAfterSeconds`.
  Attempts is stored as an absolute value, so a retry never double counts. A page edited in Notion
  between the first try and the retry stops uncertain instead of overwriting. Two Touches with one
  `Txn ID` stay uncertain; the console never deletes one.
- **Read-back.** A transition is done only when a GET of the lead shows every patched property equal to
  the intended value (datetimes as instants) with `Last Txn` matching, and the Touch is found with that
  `Txn ID` and the lead in Student. Anything else is uncertain.
- **Errors.** A 4xx other than 409 and 429 before anything landed is failed; a timeout, network error,
  409, 429 or 5xx, or any error after a write landed, is uncertain (202 with a Retry).
- **Stale check.** The form sends the Stage, Attempts and `last_edited_time` it showed; any difference
  is 409 `stale` with no write and no row. Refusals (stale, disallowed, contract_missing, bad_form) are
  not mutations and leave no row.
- **The note** is sent to Notion only. Supabase keeps its length and SHA-256; the form keeps the text
  and resends it on a retry, checked against the hash. A request id reused with a different page,
  outcome, form value or note is 409 `request_id_reused`.
- **Readiness.** While Touches has no `Txn ID` text property or Students & Parents has no `Last Txn`
  text property, the route answers 503 `notion_not_ready` and writes nothing.
- **Timings** are in `TUNING`: settle 60 s, lease 30 s, per-call timeout `consoleProviderTimeoutMs`,
  note at most `consoleNoteMaxChars` (2000).

## Alternatives considered
- **A server action instead of a JSON route.** The route sits behind the existing origin check and is
  tested like the other console routes.
- **Store the note in the log.** A shadow copy of private text, against ADR 0004.
- **Read-back without markers.** Cannot tell a landed write from a coincidence, so a retry could double
  count; refused until Charlie adds the two properties.
- **Log refusals too.** They change nothing; the response carries the reason.
- **A `tel:` link on the form.** Tracker ADR 0071 keeps the phone out of the page; "Open in Notion" stays
  the deep link.

## Consequences
- The form under the Rolodex is the console's first write. After a done answer the queue re-reads and
  the next lead is selected; any other answer keeps the lead, the note and a Retry, Refresh or
  "Fill in Notion".
- An unconfirmed transition blocks new outcomes for that lead until it is retried with the same body.
  The form keeps unconfirmed saves in memory across lead changes, but a reload loses the note, so an
  uncertain row left behind needs operator SQL (or a later card) to close. Revisit if that happens.
- Revisit when a setter or teacher card logs outcomes (it passes its own staff id), or when the
  OPS rules change.
