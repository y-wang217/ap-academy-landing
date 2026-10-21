# Engineering contract: connect the bridge to the real ship

## Repository reality observed 2026-10-21
Repo: `https://github.com/y-wang217/ap-academy-landing` (public). Root `CLAUDE.md` says pnpm workspace, apps/landing hosts single origin `https://www.apacademy.ca`, apps/tracker lives at `/tracker`, shared package `packages/db`, Supabase Auth, root `supabase/migrations/`, Notion business records, and protected agent work via Notion Dev Requirements cards. New products usually belong under `apps/` with their own basePath and landing rewrite; do not assume this is the final placement for the console until current code/ADR inspected.

Read CURRENT: root `CLAUDE.md`, per-app `CLAUDE.md`, `docs/adr/0002-single-domain-path-routing.md`, `docs/adr/0004-notion-edits-people-supabase-reads-local.md`, current tracker scheduling/Notion adapters, `docs/spec/single-domain-done-state.md`, `docs/readiness.md`, Notion board, open `req/` PRs. Several previously observed migration numbers/IDs may be stale. Avoid duplicate implementation or auth patterns.

## Constraints inherited from workspace
- Same origin, app paths, central login `/login?next=...`, shared Supabase Auth and cookie behavior; no independent login or auth pool.
- One Supabase project, root migrations; new product schema with RLS where storage is justified. Prefer no new state until read-through facade assessed.
- Apps do not import each other; shared logic belongs to appropriate package. No exposed service credentials, no browser-side Notion token.
- New access / auth / permissions are High risk and need founder review. Do not copy sensitive data to a new external service without High-risk approval.
- Root policy prohibits remote migration without founder sign-off, uses migration-only PR and verification; no direct main pushes, one card per branch, tests first.

## Integration discovery table (do not fill by guess)
| Instrument / function | Candidate authority | Evidence to discover | Safe adapter behavior |
|---|---|---|---|
| Founder permission | Supabase Auth + current owner/staff linking | current auth middleware and owner checks | refuse unverified; server-side enforce + audit |
| Lead/contact | existing Notion leads CRM and any synchronized app lead cache | stable IDs, stage, last contact, opt-out, assigned owner | read only permitted fields; avoid name joins |
| Trial booking | Calendly + canonical app/Notion trial data | webhooks, booking/status, teacher assignment, timezone | do not interpret scheduled as attended |
| Callback/follow-up | existing Notion Work/CRM fields | due, owner, resolution, sync limits | idempotent writes via existing adapter; no shadow task DB |
| Teacher capacity | Supabase adopted schedules + actual availability; roster Notion | class series, exceptions, teacher IDs, availability | count deduped weekly hours, unknown for missing availability |
| Lesson completion | canonical delivered log (likely Notion) | stable occurrence/link, actual delivered time | not equal to past calendar slot |
| Verified enrollment/payment | existing payment and enrollment records | receipt/transaction evidence, refund/chargeback statuses | only confirmed events count north star |
| Creative pipeline | existing Notion Work / Content Library | owner, due, stage, link, review | deep link if write integration isn't justified |
| Activity and exceptions | existing events/logs + derived read checks | stable event IDs, timestamps, source | fresh/failed provenance; no pretend realtime |

## Proposed readonly view models: illustrative TypeScript shapes, NOT current database schema
```ts
type Evidence = {
  source: 'notion' | 'supabase' | 'calendly' | 'google_calendar' | 'derived';
  sourceId: string;
  sourceUrl?: string; // authorized targets only
  observedAt: string; // ISO timestamp
};
type PanelStatus = 'ready' | 'empty' | 'loading' | 'stale' | 'error' | 'unverifiable';
type PanelResult<T> = {
  status: PanelStatus;
  data?: T;
  lastSuccessfulSyncAt?: string;
  lastCheckedAt?: string;
  staleReason?: string;
  sourceEvidence: Evidence[];
};
type NextAction = {
  caseId: string; leadId: string; displayName: string;
  priorityReason: 'new' | 'callback' | 'post_trial' | 'due' | 'older';
  dueAt?: string; ownerId?: string;
  lastContactAt?: string; optOut: boolean;
  expectedAction: string; evidence: Evidence[];
};
type WeeklyHoursDelta = {
  weekStartToronto: string;
  openingVerifiedHours?: number;
  additionsVerifiedHours?: number;
  reductionsVerifiedHours?: number;
  netNewVerifiedHours?: number;
  status: 'verified' | 'incomplete' | 'unverifiable';
  countedSourceIds: string[];
};
```
Implement real types by adapter from discovered schemas. Never create a fake `enrolled` flag to force the demo to show data.

## Read path
Authenticated browser → founder route/server-side permission gate → server-side console facade/read adapters → authoritative Supabase/Notion/Calendly/Google Calendar where actually connected → typed, timestamped panel result. Client receives only fields required to render. Every response includes source freshness and appropriate cache-control. A failure fetching one provider should not blank unrelated read panels.

## Write path
Explicit founder action → server-side permission and input/state verification → canonical write API with stable identifiers/idempotency/retry or safe deep-link to source tool → confirm read-back → audit and update view. Do not promote an opportunity to paid on unsourced user interest. External messages must be prepared only; sending requires separate affirmative action and appropriate permissions. Never replay uncertain non-idempotent writes blindly.

## Metric boundary and provenance
Resolve `01_PRODUCT/MASTER_BRIEF.md` section 5 against the actual revenue and lesson schemas. Keep a traceable list of included/excluded records. When the hour estimate cannot be verified, report **unverifiable**, not zero. Teacher utilization denominator requires real availability, not a guessed 40-hour week. Money is CAD; paid means independently verified transaction/receipt, not a draft invoice. Use `America/Toronto` week boundaries; preserve DST correctness.

## Recommended technical techniques (choose after repo inspection)
- React/Next components for composition, CSS custom properties for theme, semantic DOM cards/lists, SVG radial gauges and modest animation (CSS or already-declared animation package).
- Data table and radar share one read model; no pie/radar-only accessibility.
- SSR/server facade and RLS-compatible Supabase reads; no direct Notion API calls from client.
- Use existing queue/event path for new-lead signals if reliable, otherwise light polling with last-checked freshness and backoff. No new realtime infrastructure unless justified.
- Avoid new libraries if native CSS/SVG/React achieve visual fidelity; any dependency goes through design Decisions for approval with pinned version.
- Visual background is an independent SVG/CSS layer; UI is NOT cut-up bitmap hotspots.

## Main failure scenarios to test
1. Notion lead list fetch fails while scheduler data is available.
2. Same lead imported twice and a callback is due; one stable queue item.
3. Lead opts out while a queue panel was open; server rejects stale action and refreshes.
4. Two new leads arrive during a protected class; no automatic call, both remain recoverable.
5. Teacher not assigned or availability absent; capacity becomes unknown, not 0 or 100%.
6. Trial passes by clock time without delivered record; must not be marked attended.
7. Invoice sent and bank payment not recorded; must not count as collected or paid weekly hours.
8. Backend outage after an action request; retry/verify without duplicate follow-up creation.
9. Founder loses session; no protected data remains in HTML/cache.
10. Time boundary crosses DST in Toronto; week grouping remains stable.

## Security verification
Test unauthenticated, other staff teacher, student, parent, revoked founder and legitimate founder roles at both UI and API/data-path level. Test source URL handling for safe link destinations, CSRF-equivalent mutation protection consistent with app patterns, no secrets in web bundle, no sensitive PII in client logs, and no open redirects.
