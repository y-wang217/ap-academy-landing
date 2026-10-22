Notion card: https://app.notion.com/p/400d6ae73dd781fd822fc7ef9da4e7b3

# Design: REQ-55: Console 4/12: Cinematic command-bridge shell and reusable instrument kit

## Changes from last version

Answers the design-approver's revise 2 of 2:

- Item 1 (Creation and Operations grids): Layout now gives `grid-template-areas` for all three modes at >=1440, 1280 to 1439, 901 to 1279, 641 to 900 and <=640. Area names are the slot ids. The AC5 e2e one-column check at 640x900 and 390x844 now runs for `?mode=sales`, `?mode=creation` and `?mode=operations`. A new console-scan row checks that every slot id of each mode is a grid area in each of that mode's five breakpoint blocks.
- Items 2 and 6 (60 s poll, paused while hidden): the poll moves into a pure `lib/console/sync-poller.ts`, and `sync-provider.tsx` is a thin wrapper around it. The tracker's vitest runs in node with no DOM library, so this lets the timers be tested without adding jsdom (Decision 19). New `sync-poller.test.ts` uses fake timers, a stubbed fetch and a fake visibility source. It asserts one fetch on start, a second after 60 s, none while hidden, one right away when the tab is visible again, and the `data-hidden` callback. AC9 now spells out the poll rules.
- Items 3 and 6 (rail text): AC9 gives the exact indicator values. bridge.test asserts "Owner verified", both Motion labels ("Motion on" and "Reduced motion" in their CSS-toggled spans, Decision 20) and the Mode value ("Sales", "Creation", "Operations"). The e2e reduced-motion row asserts that the visible Motion text is "Reduced motion".
- Items 4 and 6 (10 s sweep, hidden pause): a new console-scan AC6 block covers `@keyframes console-sweep`, the `.console-sweep` animation at `10s`, `animation: none` under reduced motion and `animation-play-state: paused` under `[data-hidden]`. The AC6 e2e row now also asserts computed `animation-duration` "10s", and `animation-play-state` "paused" after the root gets `data-hidden`.
- Item 5 (runtime preview guard): new `app/console/preview/preview-page.test.ts` mocks `next/navigation`. With `CONSOLE_PREVIEW` unset (and with "0") the page calls `notFound()`; with "1" it renders `data-console`.
- Also: the page keeps REQ-53's `SessionExpired` branch, which the last version did not say. Numbers rechecked: tracker decisions on `main` end at 0062, REQ-44 holds 0063 and 0064, REQ-54 holds 0065, open `req/` PR #110 adds only migration 0025, and REQ-34 names none. 0066 is still free.

Earlier, for revise 1 of 2:

- Items 1 and 6 (keyboard traversal and focus): new AC12 (Tab reaches each panel section and each queue-row and Retry link in DOM order, hidden tabpanels take no focus) and AC13 (2 px amber focus outline, hover changes only the 1 px border colour). Approach names how panels become focusable (`tabIndex 0`, `data-panel`, heading-labelled section; DOM order equals the slot order). New e2e rows for each, plus a CSS scan row for AC13.
- Items 2 and 7 (placeholder text): one rule. `notConnected` sets `staleReason` to "Not connected yet" and every component prints `staleReason` verbatim, with no mapping. Summary, AC3, AC8, the Approach and the kit.test fixture all use that string.
- Items 3 and 7 (N of M): M is the number of slots in the selected mode (Sales 9, Creation 4, Operations 5). The Panels indicator updates when the mode changes. bridge.test asserts "0 of 9 connected", "0 of 4 connected" and "0 of 5 connected".
- Items 4 and 6 (AC5 tests): AC5 now states visual order (the NEXT panel's top is above the radar's) rather than DOM order. The e2e row asserts one column (equal left offsets) at 640x900 and 390x844, and NEXT above radar at 900x900, 640x900 and 390x844.
- Items 5 and 6 (AC11 tests): new console-scan row covering the twelve token values on `[data-console]`, the font stacks, no `@font-face` or font-file extension, and `tabular-nums` on readouts. kit.test also checks the readout class.
- Numbers rechecked: tracker ADR 0066 is still free. REQ-54 is now Building.

**Summary:** the owner's `/tracker/console` becomes the dark sunset command bridge (inline SVG horizon, header rail with Sales / Creation / Operations tabs, Toronto clock and a real sync line, a responsive panel grid and a bottom rail of real indicators), built from a named instrument kit whose every component renders ready, empty, loading, stale, error and unverifiable from a `PanelView` prop; until later cards wire data, every production panel shows "Not connected yet" and no value.
**Risk:** Low (UI behind the existing REQ-53 owner gate; reads no business data, adds no route, table or permission. The PR touches `apps/tracker/next.config.ts` for the preview gate, which is a human-merge path, so it carries `needs-human-merge` anyway.)

## Problem

Console 2/12 (REQ-53) left `/tracker/console` as a light-theme placeholder (`apps/tracker/app/console/page.tsx`: TopBar plus "The console is ready. Panels arrive in the next updates."). Charlie (org owner) approved a visual direction (`docs/spec/founder-console/handoff/VISUAL_DIRECTION.md`, `PANEL_STATES.md`, `visual-assets/founder-command-bridge-reference.png`). Console 5/12 to 10/12 each need a panel to put real data into. This card builds the shell and the reusable instruments those cards fill, with truthful states and no fictional values in production source. All handoff files are on `main` (merged with REQ-52), so the card's branch link is no longer needed.

## Acceptance criteria

- [ ] AC1: `/tracker/console` renders `data-console`, the horizon, the header rail (`AP ACADEMY // FOUNDER CONSOLE`, the mode tablist, the Toronto clock, the sync line), the panel grid and the bottom rail, all from DOM, CSS and inline SVG. No console source contains `<img`, `next/image`, `background-image: url(` or a `.png`, `.jpg`, `.jpeg`, `.webp` or `.gif` reference, and the horizon SVG has no `<text>` element.
- [ ] AC2: The mode switch is a `role="tablist"` with three `role="tab"` buttons (Sales, Creation, Operations), each with `aria-selected` and `aria-controls` pointing at its `role="tabpanel"`. ArrowRight and ArrowLeft move and select with wrap, Home and End select the first and last, Enter and Space select the focused tab; only the selected tab has `tabIndex 0`. Selecting writes `?mode=<sales|creation|operations>` with `history.replaceState`; a reload keeps the mode; a missing or unknown `mode` renders Sales. Nothing switches mode on its own (no timer, no data-driven switch).
- [ ] AC3: `InstrumentPanel`, `Metric`, `Gauge`, `Radar` and `QueueList` (which renders `QueueRow`s) each render the six statuses from a `PanelView` prop: `ready` shows the value; `empty` shows only the caller's empty text; `loading` sets `aria-busy="true"` and shows a skeleton and "Loading", no digits; `stale` shows the value plus the stale reason and the last successful fetch time; `error` shows `FailureState` (title, message, last success or "never", Retry link) and no value; `unverifiable` prints `staleReason` verbatim (for the placeholder `notConnected` sets it to "Not connected yet") and shows no value; no component maps or rewrites a reason string. `StatusBadge` shows a text label and a shape for each status; `FreshnessLine` shows "Checked HH:MM" and "Last success HH:MM" or "No successful read yet". No kit component renders a number that is not in its `data`.
- [ ] AC4: 1440x900 and 1920x1080 screenshots of `/tracker/console/preview?mode=sales` (demo data) and of `/tracker/console` (production placeholders) are committed and embedded in the PR body; the reviewer judges hierarchy, colour and density against `VISUAL_DIRECTION.md` composition A to F.
- [ ] AC5: At 390x844 and 1280x720, `document.documentElement.scrollWidth <= clientWidth`; the tablist and the NEXT contact panel heading can be scrolled into view and sit fully inside the viewport width. At 900 px and below the horizon is a strip of at most 48 px and the NEXT panel's top edge is above the radar panel's top edge; at 640 px and below the horizon is hidden and the grid is one column (every panel of the selected mode has the same left offset).
- [ ] AC6: `Radar` renders an `<svg role="img">` with an `aria-label` naming each stage and count ("Lead stages: New 3, Contacted 2, ...") and a visible `<table>` with the same stages and counts. The sweep exists only in `ready` and `stale`, runs one pass in 10 s, and has `animation: none` under `prefers-reduced-motion: reduce`. While `document.hidden` is true, the console root carries `data-hidden` and the sweep's `animation-play-state` is `paused`.
- [ ] AC7: A unit scan of every non-test file under `app/console/`, `components/console/` and `lib/console/` finds none of the strings in the scan list below (case-insensitive), and only `app/console/preview/page.preview.tsx` imports from `test/`.
- [ ] AC8: The production page builds every panel from `notConnected(panelId, now)` (`status: "unverifiable"`, `staleReason: "Not connected yet"`, `errorMessage: null`, `data: null`); its HTML for each mode contains "Not connected yet" once per panel and no element with `data-panel-value`.
- [ ] AC9: The sync line never says "online". Before the first answer it says "Checking sources"; a 200 with `status: "ok"` says "Sources checked HH:MM"; a 200 with any other status (REQ-54's `degraded`) says "Some sources failing, checked HH:MM"; a non-200, a network error or a body that does not parse says "Sync unavailable" plus "last good HH:MM" when there was one. It polls `GET /tracker/api/console/health` once on mount, then every 60 s while the tab is visible. While `document.hidden` is true it sends no request. When the tab becomes visible again it polls once right away and restarts the 60 s interval. The bottom rail holds exactly five indicators, each from real state: Sources (the same sync state), Access ("Owner verified", known because the page rendered past the gate), Panels ("N of M connected": M is the number of slots in the selected mode, Sales 9, Creation 4, Operations 5; N counts those slots whose status is not `unverifiable`; it follows the selected mode, so the production page reads "0 of 9 connected" on Sales, "0 of 4 connected" on Creation and "0 of 5 connected" on Operations), Motion ("Reduced motion" or "Motion on": both labels are rendered and the `prefers-reduced-motion` media query in `console.css` shows exactly one, so the first paint is already true), Mode (the selected mode's name: "Sales", "Creation" or "Operations"); plus a "Keyboard shortcuts" disclosure. Every button in the shell has a handler; there are no decorative buttons.
- [ ] AC10: The preview route exists only when `CONSOLE_PREVIEW=1`: `pageExtensionsFor({})` is `["tsx", "ts", "jsx", "js"]` and `pageExtensionsFor({ CONSOLE_PREVIEW: "1" })` adds `"preview.tsx"`; the preview page also calls `notFound()` at request time unless the variable is `1`; it sits under `app/console/layout.tsx`, so it is owner-gated like the console.
- [ ] AC11: Tokens are CSS custom properties on `[data-console]` in `app/console/console.css` with the card's values (`--canvas` to `--shadow-glow`) plus `--font-display: system-ui, ...` and `--font-readout: ui-monospace, ...`; no `@font-face` and no font file; readouts use `tabular-nums`; no console source uses a Tailwind size below 12 px (`text-[8px]` to `text-[11px]`) or a `font-size` below 12px.
- [ ] AC12: Keyboard traversal. Each `InstrumentPanel` is a `section` with `tabIndex 0`, `data-panel` set to its slot id, and an accessible name from its `h2`. From the selected tab, Tab goes through the header rail's home link and sign-out button, then the visible tabpanel's panels in DOM order. Within a panel it stops on that panel's links before the next panel (each `QueueRow` deep link and each Retry link is an `a` element with `href`). It ends at the rail's "Keyboard shortcuts" disclosure. No element inside a hidden tabpanel takes focus. DOM order is the slot order in `panel-slots.ts`. For Sales that is next, northStar, signals, followUps, radar, conversion, capacity, cashflow, dispatch (the VISUAL_DIRECTION mobile order), so focus always starts at the primary action.
- [ ] AC13: Focus is visibly stronger than hover. `[data-console] :focus-visible` sets `outline: 2px solid var(--amber)` and `outline-offset: 2px`. Hover on a panel, tab or row changes only the 1 px `border-color` (to `var(--muted)`) and never sets `outline`, `box-shadow` or a border wider than 1 px. In the browser, a keyboard-focused panel has computed `outline-width` 2px and `outline-color` rgb(255, 192, 120); a hovered, unfocused panel has `outline-style` none and `border-top-width` 1px.

## Approach

### Contract for the kit: `apps/tracker/lib/console/panel-view.ts` (new, pure)

- `PANEL_STATUSES = ["ready", "empty", "loading", "stale", "error", "unverifiable"] as const`, `PanelStatus`.
- `PanelView<T> = { panel: string; status: PanelStatus; data: T | null; count: number | null; lastCheckedAt: string | null; lastSuccessfulFetchAt: string | null; staleReason: string | null; errorMessage: string | null; sourceEvidence: { source: string; sourceId: string; sourceUrl: string | null; observedAt: string }[] }`. Field names copy REQ-54's `PanelResult` design one for one, so a facade result can be passed straight in (Decision 4).
- `notConnected(panel, now): PanelView<never>` returns `status "unverifiable"`, `data null`, `count null`, `lastCheckedAt now`, `lastSuccessfulFetchAt null`, `staleReason "Not connected yet"`, `errorMessage null` and `sourceEvidence []` (AC8). Components print `staleReason` and `errorMessage` verbatim; there is no reason-to-text mapping anywhere in the kit.

### Shell helpers: `apps/tracker/lib/console/` (new, pure, no React)

- `modes.ts`: `CONSOLE_MODES`, `parseMode(value)` (unknown gives `sales`), `tabKeyTarget(key, index, count)` (Arrow wrap, Home, End; null for other keys).
- `panel-slots.ts`: the slot list per mode, `{ id, mode, area, title, kind: "metric" | "gauge" | "radar" | "queue" | "list", emptyText }`. Sales (described here by role; the file lists them in the AC12 order, next first): `northStar` (metric), `radar` (radar, "Lead radar"), `next` (queue, "Next contact", the amber-edged primary panel), `conversion` (metric, "Trials to enrolments"), `capacity` (gauge, "Teacher load"), `cashflow` (metric, "Cashflow pulse", CAD), `followUps` (queue), `dispatch` (list, "Daily dispatch"), `signals` (list). Creation: `nextAsset` (queue), `work` (queue, "Work queue"), `pipeline` (list, "Content pipeline"), `signals`. Operations: `teacherLoad` (gauge), `lessonGaps` (queue, "Lesson log gaps"), `finance` (metric), `trials` (metric), `integrations` (list, "Integration health"). Empty texts come from `PANEL_STATES.md` ("Queue clear", "No active leads", "Nothing due", "No exceptions found", "No tasks scheduled").
- `format.ts`: `bridgeClock(date)` ("Wed 22 Oct, 14:05" in `SCHEDULE_TIME_ZONE` from `apps/tracker/lib/time.ts`), `hhmm(iso)` reusing `localHhmm`, `formatReadout(value, { unit, currency })` (`Intl.NumberFormat("en-CA")`, CAD).
- `sync.ts`: `SyncState` (`checking`, `ok`, `degraded`, `unavailable` with `checkedAt` and `lastGoodAt`), `syncFromResponse(status, body, prev)` (Zod `{ status: string, checkedAt: string }`, extra keys allowed so REQ-54's `providers` passes), `syncLabel(state)` (AC9 strings).
- `preview-flag.ts`: `PREVIEW_ENV = "CONSOLE_PREVIEW"`, `previewEnabled(env)`, `pageExtensionsFor(env)` (AC10).

### Instrument kit: `apps/tracker/components/console/kit/` (new)

Server-safe components unless marked; Tailwind classes with `var(--token)` arbitrary values; no component library (tracker [CLAUDE.md](http://CLAUDE.md)).

- `instrument-panel.tsx`: `InstrumentPanel<T>({ title, result, emptyText, primary?, children: (data: T) => ReactNode })`: a `<section aria-labelledby>` with a 1 px `--border` edge, `--surface` fill, corner trim, header (title, `StatusBadge`), body switched on `result.status` (AC3), `FreshnessLine` footer. `primary` adds the amber edge and `--shadow-glow` (the NEXT panel only). The section takes an `id` prop (the slot id) and renders `data-panel={id}`, `tabIndex={0}` and `aria-labelledby` pointing at its `h2`, so Tab stops on every panel, including panels with no links such as metrics and the placeholders (AC12).
- `metric.tsx`: `Metric({ label, result: PanelView<{ value: number; unit?: string; currency?: "CAD"; delta?: number }> })`; the value sits in `data-panel-value`, `tabular-nums`, `--font-readout`.
- `gauge.tsx`: `Gauge({ label, result: PanelView<{ value: number; max: number; unit: string }> })`: SVG arc plus text "18 of 47 h"; outside `ready` and `stale` the arc is an unfilled track and no percent is shown (PANEL_STATES: never 0 percent when unknown); `aria-label` carries the text.
- `radar.tsx`: `Radar({ label, result: PanelView<{ key: string; label: string; count: number }[]> })`: concentric rings, one sector per stage with radius proportional to its count over the largest count, a sweep `<g class="console-sweep" aria-hidden>` only when there is data, the `aria-label` and the stage table of AC6. Loading, empty, error and unverifiable show a subdued static ring.
- `queue-row.tsx`: `QueueRow({ item: { id, title, reason, due?, href? }, selected? })` (one row: name, reason, due time, plain `<a>` deep link when `href` is set, "NEXT" text label when selected) and `QueueList({ result: PanelView<QueueItem[]>, emptyText })` (the panel-state switch around a `<ol>` of rows; the first row selected).
- `status-badge.tsx`: `StatusBadge({ status, reason? })`: text plus shape (filled circle Current, hollow circle Empty, dotted circle Loading, triangle Stale, cross Error, dash ring Unverified); colour is secondary (`--green` only for `ready`).
- `failure-state.tsx`: `FailureState({ title, result })`: "Cannot load" plus the panel title, the message or reason, last success time, and a Retry `<a href>` to the current URL with the same `mode` (a real reload of the server read; plain link, no fake button).
- `freshness-line.tsx`: `FreshnessLine({ result })` (AC3 strings).

### Shell: `apps/tracker/components/console/shell/` (new)

- `horizon.tsx`: inline, text-free SVG adapted from `docs/spec/founder-console/handoff/preview/assets/bridge-skyline.svg` (sky gradient, sun, skyline rects, water), `aria-hidden`, `preserveAspectRatio="xMidYMid slice"`; height `clamp(120px, 18vh, 210px)` above 900 px (14 to 23 percent of a 900 to 1080 px screen), 48 px strip at 900 px and below, hidden at 640 px and below.
- `header-rail.tsx`: brand text, `ModeTabs`, `BridgeClock`, `SyncLine`, a link back to the tracker home and the existing `SignOutButton` (`apps/tracker/app/sign-out-button.tsx`).
- `mode-tabs.tsx` (client): the AC2 tablist; renders the three tab buttons and toggles `hidden` on the three server-rendered `role="tabpanel"` sections it receives as children.
- `bridge-clock.tsx` (client): server-rendered first value, then updates every 15 s; `suppressHydrationWarning` on the `<time>`.
- `apps/tracker/lib/console/sync-poller.ts` (new, pure, no React): `SYNC_INTERVAL_MS = 60_000` and `startSyncPoller({ fetchHealth, visibility, onState, onHidden, setInterval, clearInterval })`, which returns `stop()`. `visibility` is `{ hidden: boolean; subscribe(cb): () => void }`. On start it fetches once if the tab is visible and starts the interval. On hide it clears the interval and calls `onHidden(true)`. On show it calls `onHidden(false)`, fetches once and restarts the interval. Each answer goes through `syncFromResponse`, and a thrown fetch counts as unavailable. Only one request runs at a time: a tick that comes while one is in flight is skipped.
- `sync-provider.tsx` (client): a thin wrapper. In an effect it calls `startSyncPoller` with `fetch("/tracker/api/console/health", { cache: "no-store" })` (basePath spelled out, as `apps/tracker/components/iris/settings-actions.tsx` does) and a `document.visibilityState` adapter. `onHidden` toggles `data-hidden` on the console root so CSS pauses animations. It shares the state with `SyncLine` and the rail's Sources indicator through context.
- `mode-context.tsx` (client): holds the selected mode, written by `ModeTabs` and read by the rail. `physical-rail.tsx` (client; the server passes `connectedByMode`, a record of `{ connected, total }` per mode computed from the slot list and each panel's status): the five AC9 indicators, with Panels and Mode following the selected mode (dot plus text). Motion renders `<span class="console-motion-on">Motion on</span>` and `<span class="console-motion-reduced">Reduced motion</span>`, and CSS shows one of them (Decision 20) and decorative trim (CSS grooves only, no shapes that look like buttons).
- `shortcut-help.tsx` (client): a `<details>`-style disclosure listing: Arrow keys, Home, End on tabs; `1`, `2`, `3` select Sales, Creation, Operations; `?` opens this list. The global keys are ignored with Ctrl, Meta or Alt held and when focus is in an input, textarea, select or contenteditable.
- `bridge.tsx`: `ConsoleBridge({ mode, panels, email, now })`: root `<div data-console>`, horizon, header rail, the three tabpanels, rail. Each tabpanel is a grid using `grid-template-areas` from `console.css`.

### Layout: `apps/tracker/app/console/console.css` (new, imported by `app/console/layout.tsx`)

Tokens on `[data-console]` (AC11), root `min-height: 100dvh; background: var(--canvas); color: var(--text)` so the light tracker body never shows. Each tabpanel renders its panels in DOM in slot order (AC12). `grid-template-areas` places them at wider sizes, so the visual layout below never changes the focus order. Each panel's `grid-area` is its slot id. Every mode has a block at each of the five ranges below. A range with one column lists the areas top to bottom, which is the DOM (slot) order.

```javascript
SALES
>= 1440       cols 1.1fr 1.4fr 1fr
  "radar     next      conversion"
  "radar     next      capacity"
  "northStar followUps signals"
  "dispatch  dispatch  cashflow"
1280 to 1439  cols 1.4fr 1fr
  "next      radar" "followUps conversion" "northStar capacity" "signals cashflow" "dispatch dispatch"
901 to 1279   cols 1fr 1fr, same areas as 1280 to 1439
641 to 900    cols 1fr 1fr
  "next next" "radar northStar" "followUps signals" "conversion capacity" "cashflow dispatch"
<= 640        cols 1fr
  next, northStar, signals, followUps, radar, conversion, capacity, cashflow, dispatch

CREATION
>= 1440       cols 1.4fr 1fr 1fr
  "nextAsset work     signals"
  "nextAsset pipeline pipeline"
1280 to 1439  cols 1.4fr 1fr
  "nextAsset work" "pipeline signals"
901 to 1279   cols 1fr 1fr, same areas as 1280 to 1439
641 to 900    cols 1fr 1fr
  "nextAsset nextAsset" "work signals" "pipeline pipeline"
<= 640        cols 1fr
  nextAsset, work, pipeline, signals

OPERATIONS
>= 1440       cols 1fr 1.4fr 1fr
  "teacherLoad  lessonGaps   finance"
  "teacherLoad  lessonGaps   trials"
  "integrations integrations integrations"
1280 to 1439  cols 1fr 1fr
  "teacherLoad lessonGaps" "finance trials" "integrations integrations"
901 to 1279   cols 1fr 1fr, same areas as 1280 to 1439
641 to 900    cols 1fr 1fr
  "lessonGaps lessonGaps" "teacherLoad finance" "trials integrations"
<= 640        cols 1fr
  teacherLoad, lessonGaps, finance, trials, integrations
```

`@keyframes console-sweep` (rotate, 10 s linear infinite), `@media (prefers-reduced-motion: reduce) { .console-sweep { animation: none } }`, `[data-hidden] .console-sweep { animation-play-state: paused }`, `[data-console] :focus-visible { outline: 2px solid var(--amber); outline-offset: 2px }`, and hover rules that set only `border-color: var(--muted)` on the 1 px edge, with no outline, box-shadow or border-width change (AC13). `.console-motion-reduced { display: none }` by default. Under `prefers-reduced-motion: reduce`, `.console-motion-on { display: none }` and `.console-motion-reduced { display: inline }` (AC9).

### Routes

- `apps/tracker/app/console/page.tsx`: keeps `dynamic = "force-dynamic"`, `await ownerViewer()` and its `SessionExpired` branch for `gate.kind === "expired"`; reads `searchParams.mode` through `parseMode`; builds `notConnected` for every slot; renders `ConsoleBridge`. TopBar and the old Notice go.
- `apps/tracker/app/console/loading.tsx`: a static dark frame with "Loading console" (still no `lib/data` import, scan unchanged).
- `apps/tracker/app/console/layout.tsx`: adds `import "./console.css"`; gate unchanged.
- `apps/tracker/app/console/preview/page.preview.tsx` (new): `notFound()` unless `previewEnabled(process.env)`; renders `ConsoleBridge` with `demoPanels(mode)` from `apps/tracker/test/console/demo-panels.ts` (new: neutral values such as "Lead A", "Lead B", counts 3, 2, 1; one panel per non-ready status so the preview shows every variant; none of the scan list).
- `apps/tracker/next.config.ts`: `pageExtensions: pageExtensionsFor(process.env)` (one line plus the import).

### Tests and docs

- `apps/tracker/lib/console-scan.test.ts`: "covers" list adds the new files; keeps every existing ban; adds the AC1 raster ban, the AC7 fictional scan, the AC11 size ban, and "only `page.preview.tsx` imports `test/`". The walker also collects `.preview.tsx` and `.css`.
- Tracker ADR `apps/tracker/docs/decisions/0066-console-shell-and-instrument-kit.md` (kit contract and `PanelView`, mode in the URL, preview gating by `pageExtensions`, unverifiable as "Not connected", global shortcuts, screenshot storage) plus its `README.md` row.
- e2e `e2e/tracker/run.sh` builds and starts the tracker with `CONSOLE_PREVIEW=1`; `e2e/tracker/flows.mjs` REQ-53 owner check changes `>Console<` to `data-console` plus "FOUNDER CONSOLE"; a REQ-55 block adds the AC2, AC4, AC5, AC6 checks and writes the screenshots to `docs/spec/founder-console/screenshots/req-55/`. The diff touches `apps/tracker/app/`, `apps/tracker/components/`, `apps/tracker/next.config.ts` and `e2e/`, so the builder runs `pnpm test:tracker` locally before the PR.

### AC7 scan list (fictional strings from the reference render and the offline preview)

`Priya Sharma`, `James Chen`, `Aisha Khan`, `Michael Tan`, `Sarah Wilson`, `Daniel Park`, `Emma Liu`, `Oliver Grant`, `48,320`, `62,000`, `18,400`, `2,400`, `28 May 2024`, `May 2024`, `+6.0`, `Systems Online`, `Comms Nominal`, `Payments Online`, `Integrations Synced`, `Growth On Track`, `all systems operational`, `Territory: Global`, `High intent lead surge`, `95% capacity`, `Simulated`, `Demo data`, `Illustrative`, and the word `online` on its own (`\bonline\b`).

## Migration

None. No table, column, policy or trigger.

## Test plan

| Test | Type | Covers |
| --- | --- | --- |
| `components/console/kit/kit.test.ts`: `it.each` over the five data components and the six statuses with `renderToStaticMarkup`: ready shows the fixture value in `data-panel-value`; empty shows only the empty text; loading has `aria-busy` and no digit from the fixture; stale shows value, reason and "Last success"; error shows "Cannot load", the message, a Retry link and no value; unverifiable built with `notConnected` shows exactly "Not connected yet" and no value; the ready `data-panel-value` element of Metric and Gauge has class `tabular-nums`; every panel section has `tabIndex="0"`, `data-panel` and `aria-labelledby`. Gauge never prints a percent outside ready and stale. StatusBadge label and shape per status | unit | AC3, AC8, AC11, AC12 |
| `components/console/kit/radar.test.ts`: `aria-label` lists every stage and count; table rows equal the data; sweep `<g>` present only in ready and stale | unit | AC6 |
| `components/console/shell/bridge.test.ts`: `ConsoleBridge` for each mode: `data-console`, brand text, tablist with three tabs, the chosen tab `aria-selected="true"` and `tabIndex 0`, others -1, only the chosen tabpanel without `hidden`, horizon SVG with no `<text>`; production slots give "Not connected yet" per panel and no `data-panel-value`; rail has five indicators and the exact strings "0 of 9 connected" (Sales), "0 of 4 connected" (Creation) and "0 of 5 connected" (Operations); the Access indicator's text is exactly "Owner verified"; the Motion indicator holds `span.console-motion-on` with text "Motion on" and `span.console-motion-reduced` with text "Reduced motion"; the Mode indicator's text is exactly "Sales", "Creation" or "Operations" for the mode rendered; the Sales tabpanel's `data-panel` ids appear in the AC12 order | unit | AC1, AC2, AC8, AC9 |
| `lib/console/modes.test.ts`: `parseMode` (each mode, missing, unknown, array); `tabKeyTarget` for ArrowRight, ArrowLeft with wrap, Home, End, other keys null | unit | AC2 |
| `lib/console/sync.test.ts`: checking, ok, degraded (REQ-54 body with `providers`), non-200, network error, bad body, `lastGoodAt` kept; no label contains "online" | unit | AC9 |
| `lib/console/format.test.ts`: `bridgeClock` on 2026-03-08 and 2026-11-01 boundary instants in Toronto; CAD formatting | unit | AC1, AC9 |
| `lib/console/preview-flag.test.ts`: `pageExtensionsFor` with and without the flag; `previewEnabled` only for `"1"` | unit | AC10 |
| `lib/console-scan.test.ts` additions: raster ban, fictional scan list, size ban, `test/` import rule, new files covered, existing bans kept | unit | AC1, AC7, AC11 |
| `e2e/tracker/flows.mjs` REQ-55: owner on `/console`: Tab to the tablist, ArrowRight selects Creation and the URL has `mode=creation`, reload keeps Creation, End gives Operations, Home gives Sales, Enter and Space on a focused tab; `1`, `2`, `3` switch modes; `/console?mode=bogus` shows Sales | e2e (builder runs `pnpm test:tracker` locally before the PR) | AC2 |
| e2e REQ-55: screenshots at 1440x900 and 1920x1080 of `/console/preview?mode=sales` and `/console` written to `docs/spec/founder-console/screenshots/req-55/` | e2e plus reviewer judgement | AC4 |
| e2e REQ-55: at 390x844 and 1280x720, `scrollWidth <= clientWidth` on `/console` and the preview; tablist and NEXT heading inside the viewport width after `scrollIntoViewIfNeeded`; at 390 the horizon is not visible; at 900x900 its height is at most 48. At 640x900 and 390x844, for each of `/console?mode=sales`, `?mode=creation` and `?mode=operations`, every `[data-panel]` in the selected tabpanel has the same `boundingBox().x` (within 1 px), which means one column, and `scrollWidth <= clientWidth`. At 900x900, 640x900 and 390x844, the `next` panel's `boundingBox().y` is less than the `radar` panel's | e2e | AC5 |
| e2e REQ-55: on the preview with `emulateMedia({ reducedMotion: "reduce" })` the sweep's computed `animation-name` is `none` and the visible Motion indicator text is "Reduced motion". Without it, `animation-name` is `console-sweep`, `animation-duration` is "10s", the visible Motion text is "Motion on", and after `page.evaluate` sets `data-hidden` on `[data-console]` the sweep's computed `animation-play-state` is "paused". Radar `aria-label` and table present | e2e | AC6 |
| e2e REQ-55: the sync line never shows "online" and shows "Sources checked" or "Some sources failing" after the first poll; the REQ-53 checks still pass (non-owners 404 byte-identical, guest 307) and a non-owner gets 404 from `/console/preview` | e2e | AC9, AC10 |
| `lib/console-scan.test.ts` AC11 block: `console.css` has a `[data-console]` rule declaring each of the twelve card tokens with the card's value (hex compared case-insensitively; `--shadow-glow` present), `--font-display` starting with `system-ui` and `--font-readout` starting with `ui-monospace`. No console source (`.ts`, `.tsx`, `.css`) contains `@font-face`, `.woff`, `.woff2`, `.ttf` or `.otf`. `metric.tsx` and `gauge.tsx` contain `tabular-nums`. | unit | AC11 |
| `lib/console-scan.test.ts` AC13 block: `console.css` has a `[data-console] :focus-visible` rule with `outline: 2px solid var(--amber)` and an `outline-offset`. No rule whose selector contains `:hover` sets `outline`, `box-shadow` or a `border-width` other than 1px. | unit | AC13 |
| e2e REQ-55 keyboard traversal: on `/console/preview?mode=sales` at 1440x900, focus the selected tab, then press Tab repeatedly until the rail's "Keyboard shortcuts" disclosure. Record each focused element's closest `[data-panel]` id. The panel sequence equals the AC12 slot order. Every queue-row link in `next` is reached after the `next` section and before `northStar`. No focused element is inside a hidden tabpanel. After pressing `2`, the first panel reached is `nextAsset`. | e2e | AC12 |
| e2e REQ-55 focus versus hover: on the preview, Tab to the `next` panel. Its computed `outline-width` is 2px and `outline-color` is rgb(255, 192, 120). Then blur, and with the mouse hover the `radar` panel: `outline-style` is none and `border-top-width` is 1px. | e2e | AC13 |
| `lib/console/sync-poller.test.ts`: `vi.useFakeTimers()`, a `vi.fn` fetch that resolves a 200 `{ status: "ok", checkedAt }`, and a fake visibility source. Visible start makes exactly 1 fetch; advancing 59,999 ms makes no more, and at 60,000 ms there are 2. Hidden start makes 0 fetches, and advancing 180 s is still 0. Going hidden mid-run calls `onHidden(true)` and advancing 180 s adds none. Going visible calls `onHidden(false)`, makes 1 fetch right away and another 60 s later. A rejected fetch gives an `unavailable` state. A tick while a fetch is pending adds no second call. `stop()` clears the interval and unsubscribes | unit | AC6, AC9 |
| `app/console/preview/preview-page.test.ts`: `vi.mock("next/navigation")` with `notFound` throwing a sentinel. With `CONSOLE_PREVIEW` deleted from `process.env`, calling the default export rejects with the sentinel and `notFound` was called once. Same with `"0"`. With `"1"`, `renderToStaticMarkup` of the result contains `data-console` and `notFound` was not called. The env is restored after each case | unit | AC10 |
| `lib/console-scan.test.ts` AC6 and motion block: `console.css` has `@keyframes console-sweep`; the `.console-sweep` rule's `animation` names `console-sweep` with `10s` and `infinite`; a `prefers-reduced-motion: reduce` block sets `.console-sweep` to `animation: none` and `.console-motion-on` to `display: none`; `[data-hidden] .console-sweep` sets `animation-play-state: paused`; `.console-motion-reduced` is `display: none` outside that block | unit | AC6, AC9 |
| `lib/console-scan.test.ts` grid block: for each mode, every slot id from `panel-slots.ts` appears as a quoted area name in that mode's `grid-template-areas` at each of the five ranges, and no area name is outside the mode's slot list | unit | AC5 |

## Out of scope

Data wiring for any panel (REQ-54, REQ-56 to REQ-60), the health route's shape (REQ-54 changes it; the sync line reads both shapes), incoming-lead pulse and screen-reader announce (needs live data; REQ-62), protected-time snooze (REQ-62), any write, any new dependency, 3D or game engine, downloaded fonts, the release acceptance pass (REQ-63).

## Risks and edge cases

- **Parallel REQ-54 contract.** REQ-54 (Building) defines `PanelResult` in `lib/console/contracts.ts` with the same fields. `PanelView` copies those names, so neither card waits for the other. Whichever PR merges second adds a type test that `PanelResult<T>` is assignable to `PanelView<T>` (and, if REQ-54 is already on main when this builds, `PanelView` is declared as that type's alias instead of a copy).
- **Preview leaking to production.** Three guards: `pageExtensions` leaves the file out of any build without the flag, the page calls `notFound()` at request time without it, and it is owner-gated by the console layout. Demo values live in `test/`, and the scan bans the reference's fiction everywhere in console source.
- **Hydration mismatch on the clock.** The server value is replaced on mount; `suppressHydrationWarning` on that one element only.
- **Health polling cost.** One GET a minute while visible, paused when hidden; REQ-54 makes each poll read Notion, so REQ-54's timeouts bound it. If that proves heavy, the interval is one constant.
- **Global key shortcuts.** Ignored with modifiers and inside form fields; there are no form fields on the console today.
- **Reflow at 200 percent zoom.** A 1440 px window at 200 percent behaves as 720 px, which is the two-column layout; the e2e 390 px check covers the narrowest case.
- **The REQ-53 e2e text check.** It matched `>Console<` from the old page title; it is updated to `data-console` plus "FOUNDER CONSOLE", and the non-owner sentinels stay as they are.

## Decisions for approval

| # | Decision | Options | Default if you say nothing |
| --- | --- | --- | --- |
| 1 | New dependencies | None | None. Tailwind 4, React and SVG only. Playwright is the e2e harness's existing global install. |
| 2 | Schema placement and numbers | Migration; ADR number | No migration. Tracker ADR `0066-console-shell-and-instrument-kit.md`: main ends at 0062, REQ-44 (Building) holds 0063 and 0064, REQ-54 (Building) holds 0065, the open `req/` PR #110 adds only migration 0025. |
| 3 | Mode persistence | `?mode=` in the URL with `replaceState`; `sessionStorage` | URL: the server renders the right tab on reload (no flash), and a link can open a mode. |
| 4 | Kit prop type | Own `PanelView` in `lib/console/panel-view.ts` with REQ-54's field names; wait for REQ-54's `contracts.ts` | Own `PanelView`, aligned by a type test once both are on main (Risks). |
| 5 | How `unverifiable` and the placeholders look | Neutral "Not connected yet" frame with an "Unverified" badge, no value and no Retry; the card's "loading or empty variant" | Neutral frame that prints `staleReason` ("Not connected yet") verbatim. Loading would claim a read is happening and Empty would claim the source is complete; both are false before wiring (PANEL_STATES). |
| 6 | Preview gating | `pageExtensions` plus `CONSOLE_PREVIEW=1`, with a runtime `notFound()`; a route with only a runtime env check | `pageExtensions`: the file is not in a production build at all. This touches `apps/tracker/next.config.ts` (human-merge path), so the PR carries `needs-human-merge`. |
| 7 | Where demo data lives | `apps/tracker/test/console/demo-panels.ts`; inside `components/console/` | `test/`: shared by unit tests and the preview, outside every scanned folder. |
| 8 | Kit component set | The card's list, with `QueueList` added as the status-bearing wrapper and `QueueRow` as one row | As listed. `StatusBadge`, `FailureState` and `FreshnessLine` take the status or the `PanelView` rather than data. |
| 9 | Retry | Plain link reloading the same URL; a client refetch button | Link. A server read is the only read until panels have client refetch. |
| 10 | Rail indicators | The five in AC9; fewer | Five, each from real state. No integration rows until REQ-62 reports them. |
| 11 | Global shortcuts | `1`, `2`, `3` and `?`; tabs only | `1`, `2`, `3`, `?`, ignored with modifiers and in fields. |
| 12 | Screenshot storage | Commit PNGs under `docs/spec/founder-console/screenshots/req-55/` and embed them in the PR body; CI artifact | Commit them. `gh` cannot upload images to a PR body, and the files are not served by any app. |
| 13 | Sync wording | "Sources checked HH:MM", "Some sources failing, checked HH:MM", "Sync unavailable"; a coloured dot alone | Text plus dot, never "online" (VISUAL_DIRECTION B). |
| 14 | TopBar | Replaced by the header rail, which keeps the sign-out button and a link home; keep both | Replaced. |
| 15 | Panel slots per mode | As listed under Approach; fewer | As listed. Later cards fill slots and may rename titles; adding a slot is a later card's change. |
| 16 | Size | One PR; split kit from shell | One PR. The shell has nothing to show without the kit, and the kit's screenshots need the shell. |
| 17 | What M counts in "N of M connected" | Slots in the selected mode; all slots across the three modes | Selected mode (Sales 9, Creation 4, Operations 5). The rail then describes the screen in front of the founder. |
| 18 | How panels take keyboard focus | `tabIndex 0` on every panel section; only links and controls are focusable | `tabIndex 0` on each section. The card asks for traversal of panels, and most placeholder and metric panels have no link. |
| 19 | How the 60 s poll is tested | Pure `lib/console/sync-poller.ts` wrapped by the provider and tested with fake timers in node; add `jsdom` and `@testing-library/react` to test the hook | Pure poller, no new dependency. The tracker's vitest runs in plain node (`apps/tracker/vitest.config.ts`). |
| 20 | Where the Motion indicator's value comes from | Both labels rendered, CSS media query shows one; a client `matchMedia` read after mount | CSS. It is true at first paint and needs no hydration. Screen readers skip the hidden label because it is `display: none`. |
| 21 | Grid areas for Creation and Operations | As in Layout (NEXT-style primary first: `nextAsset`, `lessonGaps` widest); later cards adjust | As in Layout. Later cards may retune the column widths, but not the one-column rule at 640 px and below. |
| 22 | Focus order versus visual order at wide sizes | DOM in the mobile slot order, placed by `grid-template-areas`; DOM in the wide left-to-right order | Mobile order. Focus starts at NEXT, the primary action, at every width. At 1440 and above, focus therefore visits the middle column before the left radar. |
