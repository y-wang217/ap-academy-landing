# 0066: The console shell renders a PanelView kit, keeps the mode in the URL and builds its preview only with a flag
Status: accepted
Date: 2026-10-22

## Context
Console 4/12 (REQ-55) turns the owner-only `/tracker/console` (ADR 0062) into the approved command bridge
(`docs/spec/founder-console/handoff/VISUAL_DIRECTION.md`, `PANEL_STATES.md`). Console 5/12 to 10/12 each
fill a panel later, so the shell needs a reusable instrument kit with truthful states now, before any
data is wired, and a way to show the kit with values without fictional data reaching production.

## Decision
- **Kit contract.** Every instrument (`InstrumentPanel`, `Metric`, `Gauge`, `Radar`, `QueueList` with
  `QueueRow`, plus `StatusBadge`, `FailureState`, `FreshnessLine`) takes a `PanelView<T>`
  (`lib/console/panel-view.ts`) whose field names copy REQ-54's `PanelResult`. Six statuses: ready,
  empty, loading, stale, error, unverifiable. Only ready and stale render a value. Components print
  `staleReason` and `errorMessage` verbatim; there is no reason-to-text mapping.
- **Not connected.** Until a card wires a slot, the production page passes `notConnected()`:
  `unverifiable` with the reason "Not connected yet". Loading would claim a read is happening and
  Empty would claim the source is complete; both are false before wiring.
- **Mode in the URL.** `?mode=sales|creation|operations`, written with `history.replaceState`. The
  server renders the right tab on reload; unknown values are Sales. Only the founder switches mode
  (tabs, or the keys 1, 2, 3; `?` opens the shortcuts list).
- **Slots and focus order.** `lib/console/panel-slots.ts` lists each mode's panels in the mobile order
  (NEXT first). The DOM follows that order and `console.css` places panels with `grid-template-areas`,
  so keyboard focus always starts at the primary action. Each panel section takes focus (`tabIndex 0`).
- **Styling.** Tokens are CSS custom properties on `[data-console]` in `app/console/console.css`,
  system fonts only, 12 px minimum, plus Tailwind utilities. No component library, no new dependency.
  The horizon is inline, text-free SVG; no raster image anywhere in console source.
- **Sync line.** A pure poller (`lib/console/sync-poller.ts`) reads `GET /api/console/health` on mount
  and every 60 s while the tab is visible, nothing while hidden. The line reports what the route said
  and never claims a healthy default.
- **Preview.** `app/console/preview/page.preview.tsx` renders the bridge with test values from
  `test/console/demo-panels.ts`. It is a route only when `CONSOLE_PREVIEW=1` adds `preview.tsx` to
  `pageExtensions` (`lib/console/preview-flag.ts`), calls `notFound()` at request time without the flag,
  and sits under the console layout's owner gate. The e2e run sets the flag; a deploy never does.
- **Screenshots** for review are committed under `docs/spec/founder-console/screenshots/req-55/`.

## Alternatives considered
- Waiting for REQ-54's `contracts.ts`: blocks two parallel cards on each other. The copied names are
  aligned by a type test once both are on main.
- `sessionStorage` for the mode: the server could not render the right tab, so a reload would flash.
- A preview route guarded only by a runtime env check: the page would still be in every build.
- Testing the poll in a hook with jsdom and Testing Library: two new dependencies for one timer.

## Consequences
- Later Console cards replace `notConnected()` per slot with a facade result; the kit does not change.
- `apps/tracker/next.config.ts` now reads `pageExtensions` from the flag, so this and any change to the
  flag file carry `needs-human-merge`.
- A source scan (`lib/console-scan.test.ts`) bans raster images, downloaded fonts, sub-12 px type, the
  reference render's fictional names and figures, and any import of `test/` outside the preview.
- Revisit if the 60 s poll proves heavy once REQ-54 makes each poll read Notion (one constant).
