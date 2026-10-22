# 0065: The Founder Console reads Notion through one facade that returns a status for every panel
Status: accepted
Date: 2026-10-22

## Context
REQ-53 (ADR 0062) gated the console to the org owner. REQ-54 builds the read layer every later console panel uses: leads and follow-ups (Students & Parents), touch history (Touches), trial evidence (Lessons with Type = Trial), content work (Work) and invoices (Invoices), plus the local people copy (`tracker.student_people`, `tracker.staff`, migration 0022). The data contracts (`docs/spec/founder-console/02-data-contracts.md`) say a panel must never show unknown as zero, one failed provider must never blank another, and every value needs its source and its last successful fetch time. Notion stays the editor of record (workspace ADR 0004).

## Decision
- **One contract.** Every panel read returns a `PanelResult` (`lib/console/contracts.ts`): `status` from ready, empty, loading, stale, error, unverifiable; `data`; `count`; `lastCheckedAt`; `lastSuccessfulFetchAt`; `staleReason`; `errorMessage`; `sourceEvidence`. The facade never produces loading or unverifiable; those are for the UI cards and the north star.
- **Status rules.** Error over stale over empty over ready. A failed read is `error` with `data` and `count` null, never `[]` or `0`. A read that stops at `TUNING.consoleNotionMaxPages` with rows left is `stale` with "Stopped after N pages; showing M rows". A panel that resolves names from a people copy older than `TUNING.peopleStaleMinutes` is `stale` with `people_sync_stale` (`names_unavailable` when the copy cannot be read), and two reasons join with "; ", cap first. An empty complete read stays `empty`.
- **Failures are fixed strings.** "Timed out after 8 s" for a timeout or an abort, the `NotionError` message for a Notion failure, "Read failed" for anything else, "Notion is not configured" with no token. At most 300 characters, never a response body.
- **Isolation.** Six providers start together; each is raced against `TUNING.consoleProviderTimeoutMs` and its requests carry an abort signal, so a hung read is abandoned.
- **Field lists.** Each reader asks Notion for exactly its `*_PROPS` through `filter_properties` and drops the rest at the parse step. The lead read never requests Parent Phone, Parent Email, Lead ID or notes; the trial read never names a payout field. Free text is presence only (Major Gaps, Trial Summary, Topic Covered, Trial: Diagnosis); Parent Name and the Touch Note (cut to 280 characters) are the only text kept. Row schemas are plain `z.object`, so a stray key is dropped and the row kept.
- **Joins by page id.** Student and staff names come from the local copy by normalised Notion page id, never by name. A lead's own name is Notion's Student Name, because a new lead may not be synced yet.
- **Freshness in memory.** `lastSuccessfulFetchAt` lives in one module-level Map in `lib/console/providers.ts`, keyed by org and panel, times only. It resets on a cold start, so the value can be null after a failure; it is never made up.
- **No row caching, no writes.** Nothing is cached, logged or stored. The readers make only schema GETs and data source queries; the console files hold no write call.
- **Health shape.** `GET /api/console/health` returns `{ status: "ok" | "degraded", checkedAt, providers }` with, per provider, only `status`, `lastCheckedAt`, `lastSuccessfulFetchAt`, `staleReason` and `errorMessage`. It replaces REQ-53's `{ status, checkedAt }`.
- **Placement.** The readers live in `lib/notion/` (new `leads.ts`, `touches.ts` and the shared pager `paged.ts`; new read functions in `lessons.ts`, `work.ts` and `billing.ts`). Only `lib/console/providers.ts` imports them; every other console file stays free of Notion.

## Alternatives considered
- `.strict()` row schemas: a stray key would skip a real row and hide it; the reader already asks only for listed properties, so a stray key is a code mistake, not bad data.
- A table for the last successful fetch: durable across cold starts, but a new table and writes for a value the owner can re-check by reloading.
- Caching schema lookups with `unstable_cache` as `cached.ts` does: not worth it for one owner's occasional loads; it can come with the panels.
- Showing `unverifiable` when Notion has no token: that status is reserved for the north-star metric.

## Consequences
- Touches reports `error` ("Notion returned 404") until the Notion integration is shared with the Touches data source; the other panels are unaffected.
- A 429 is an `error` for that panel with Retry-After kept on the error; nothing retries yet.
- Revisit the in-memory freshness if cold starts make `lastSuccessfulFetchAt` null often enough to matter on the panels, and the page cap if any panel routinely reads `stale` at 1,000 rows.
