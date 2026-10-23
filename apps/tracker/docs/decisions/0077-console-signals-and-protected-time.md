# 0077: Console signals are polled, held in the browser, and a failed check becomes a provider failure
Status: accepted
Date: 2026-10-23

## Context
The founder console (REQ-62, spec `docs/spec/founder-console/02-data-contracts.md` sections 3.9 and
3.10) has to surface fresh Stage = New leads and real operational exceptions in every mode, respect
teaching time, and never read "all clear" over a failed check. Nothing in the repo pushes a
notification, and the card rules out webhooks, push, SMS, email, sound and server pollers. The
card left open where the fresh-lead watermark lives, how the console backs off on errors, and what
a kind whose source failed shows.

## Decision
- **Polling, not push.** One owner-only `GET /api/console/signals` (`handleConsoleSignals`, the
  same owner gate as every console route) builds the view from one facade load, Operations, the
  failed `tracker.notion_outbox` rows (ids, kinds and times only, never `last_error`) and the
  owner's teaching time. `buildSignals` (`lib/console/signals.ts`) is pure; `SignalsViewSchema`
  strips every key it does not list before the body leaves. The browser refreshes it in step with
  the existing health poll. The header says "Polling, not live" and every signal and health entry
  carries its own check time.
- **Backoff on the shared poller.** `startSyncPoller` waits `TUNING.consoleSignalsPollMs` (60 s)
  between polls; after a network error or a non-200 the wait doubles up to
  `TUNING.consolePollMaxBackoffMs` (10 minutes) and goes back on the next 200. A 200 that says
  degraded is not an error, so a failing provider is still checked every minute. Sales and the
  signals both follow this one clock.
- **Signals keyed by source record.** `signalKey` is `<kind>:<normalId(source id)>`, so duplicate
  rows, dashed and undashed ids and edits that keep `created_time` raise one signal.
- **A failed source is a provider failure, never "no exceptions".** A kind whose source has no
  data is not computed: its check reads `skipped`, and a `provider_failure` signal carries the
  source's error verbatim. A source stale for a reason other than joining names is computed and its
  check reads `failed`. The signals panel says "No exceptions found" only when every check is ok,
  else "Some checks failed" with the kinds named. The health rail lists seven providers in a fixed
  order and a provider with no read is "Not checked", never ok.
- **The browser holds the memory.** The fresh-lead watermark (first visit: now minus
  `TUNING.consoleFreshLeadLookbackHours`), acknowledgements, announcements and snoozes live in
  `localStorage` under `console.signals.v1:<orgId>`, ids and times only; quiet mode and dismissals
  live in `sessionStorage`. The watermark only moves forward, over an unbroken run of acknowledged
  leads. Storage that throws leaves the memory in the tab and the panel says so.
- **Protected time.** Quiet mode, or the owner's own class in progress now (their live
  `tracker.staff_links` row and today's expanded occurrences), holds new arrivals in the deferred
  strip, marked announced: no pulse and no assertive announcement, then or when protected time
  ends. With no staff link the header says teaching time is unknown, never free. The console never
  calls, sends, books or writes; Dismiss and Snooze change only its display.

## Alternatives considered
- A `tracker.console_signal_state` table for the watermark and snoozes: a migration and a write
  path for state the card allows in the browser; a new browser shows the last 72 h of New leads
  again, which still need contact.
- A separate signals poller: two clocks and two backoffs for one console.
- Treating a failed source's kinds as empty: the exact "all clear over a failed check" the card
  forbids.
- One signal per failed outbox row: the schedule page's exports strip already lists rows.

## Consequences
- Each minute brings three facade loads (health, sales, signals), about 15 Notion requests a minute.
  A shared per-request facade is left to REQ-63 if it is needed.
- Teaching time covers only the owner's own scheduler classes; no calendar integration.
- Revisit if the console needs signals across devices (then a table) or a real push channel.
