# Design: REQ-63: Console 12/12: Visual fidelity, accessible operation and founder release acceptance

Card: https://app.notion.com/p/400d6ae73dd7815aa5dfe14fa8fa63ec (Risk Medium, P1, Track Console). Approved at cap by the design approver (sha 8158a7437868, after 2 revise rounds); its open gaps are copied under **Open gaps** below and closed in the build.

**Changes from last version**

- Approver revise 2 of 2, item 1 (403 body): AC12 keeps the existing REQ-53 denial body `{"error":"forbidden"}` (`lib/console/guard.ts` line 6, pinned by `guard.test.ts` and `console-routes.test.ts`). New Decision 12 reads the card's "no body" as "no data beyond that fixed denial JSON", with that as the default. The route code does not change.
- Item 2, 5 and 6 (AC13 oracle): AC13 now uses a fixed table, `PROVIDER_SLOTS`, at the top of the REQ-63 block. The full table is in Approach, Degradation. For each of the six health providers it lists the lever, the slots that must degrade, the slots that are partial (checked by AC11 only), and treats every other slot as independent (status must not change). The flow fails if the table's provider keys differ from the health JSON's `providers` keys, or if any provider's lists do not cover all 20 `mode.slot` ids in `lib/console/panel-slots.ts`. New Decision 13.
- Item 3 and 5 (AC1 selectors): AC1 names every selector. The header rail is `header.console-header` with `.console-brand`, the mode tabs are `[role="tablist"][aria-label="Console mode"]`, the sync line is `[data-sync-line]`, and each hero is a `[data-panel]` id inside `[data-mode-panel="<mode>"]`. AC1 also no longer asks Creation for a metric trim: Creation has no `metric` or `gauge` slot in `panel-slots.ts`, so the old AC1 could never pass there (see Risks).
- Item 4 (FICTION location): the list moves to `apps/tracker/test/console/fiction.ts`, next to `demo-panels.ts` and `sales-fixtures.ts`. Demo strings stay out of production source, and the scan needs no by-name skip. A scan case checks that no file under `app/`, `lib/` or `components/` imports it outside tests. Decision 11 is updated.
- Problem: the `FICTION` list is at line 175 of `lib/console-scan.test.ts`, not line 150.
- Number check re-run on `main` `76c881d`. Tracker ADRs end at 0077, and REQ-49 (Building) holds 0078. Migrations end at 0030, and open PR #132 holds 0031. No open `req/` PR adds a tracker ADR. Tracker ADR 0079 stays.
- Revise 1 of 2 (kept): AC3 names the actor, the inputs and the 38 named files.

**Summary:** No new console features. One acceptance pack proves the finished console at `/tracker/console` looks like the approved bridge, can be used by keyboard, at 200% zoom and with reduced motion, never shows a number it cannot back, refuses every non-owner, and degrades one panel at a time. It adds captures at four sizes, a production-bundle check, a Console section in `docs/readiness.md` and a founder dry-run receipt that only Charlie fills in. Merging releases nothing.

**Risk:** Medium. The work is tests, docs and small accessibility fixes in existing console markup and CSS. Auth, RLS, permissions, the Notion write paths and data destinations do not change. The new `axe-core` devDependency touches `apps/tracker/package.json` and `pnpm-lock.yaml`, so the PR carries `needs-human-merge` through `human_merge_paths`, not through risk.

## Problem

Console 1/12 to 11/12 are merged (PRs #108, #109, #111, #113, #117, #118, #119, #120, #125, #128, #130). Each card tested its own panels. No card has checked the whole bridge together across the four widths, the five non-owner roles, every provider outage and the three modes. Nothing in `docs/readiness.md` says what is deployed, verified or founder-approved for the console. This card is for Charlie, the only console user. It gives him evidence and a dry-run checklist, so he can decide whether to release the "Founder console" gate.

What exists on `main` (`76c881d`):

- **Routes.** Pages: `apps/tracker/app/console/page.tsx`, `layout.tsx`, `loading.tsx` and `console.css`. The kit preview is `app/console/preview/page.preview.tsx`, and it is a route only when `CONSOLE_PREVIEW=1` (`lib/console/preview-flag.ts`, `next.config.ts` `pageExtensions`). API routes: `app/api/console/{health,sales,signals,outcomes}/route.ts`. The console has no server actions: no `"use server"` under `app/console`, `components/console` or `lib/console`.
- **Panels.** `lib/console/panel-slots.ts` declares 20 slots across sales, creation and operations. `components/console/kit/instrument-panel.tsx` renders the caller's value only for `ready` and `stale`. Every value element carries `data-panel-value` (`kit/metric.tsx`, `gauge.tsx`, `queue-row.tsx`, `radar.tsx`), and every panel carries `data-panel` and `data-status`.
- **Fiction scan.** It is the `FICTION` list in `apps/tracker/lib/console-scan.test.ts` (line 175). It covers `app/console`, `lib/console` and `components/console`, but not `app/api/console` or the console readers in `lib/notion/`.
- **e2e.** The console blocks for REQ-53 to REQ-62 are in `e2e/tracker/flows.mjs`. They already include role probes per route, the cross-site POST, the reduced-motion sweep, a Tab order, per-card screenshots in `docs/spec/founder-console/screenshots/req-55|57|59|60|62/`, and mock failure levers in `e2e/tracker/mock-notion.mjs` (`/__console/leads-fail`, `/__work/fail-console`, `/__billing/fail`, `/__people/fail`, `/__students/fail`). `e2e/tracker/run.sh` builds the tracker only with `CONSOLE_PREVIEW=1`, so no e2e run ever inspects a production-shaped tracker build.
- **Accessibility tooling.** None. Playwright is a global install (`ci.yml` installs `playwright@1.56.1`, and `flows.mjs` resolves it from `npm root -g`). No workspace package has axe.
- **Readiness.** `docs/readiness.md` has the findings register and Gates 0 to 3, all `Closed`. It has no console rows.

## Acceptance criteria

- [ ] AC1: At 1920x1080 and 1440x900, for each mode on the live `/console`, the flow finds each of these selectors and each has a non-zero bounding box that intersects the viewport:
  - Horizon: `[data-horizon]`.
  - Header rail: `header.console-header`, whose `.console-brand` text contains `AP ACADEMY // FOUNDER CONSOLE`.
  - Mode tabs: `[role="tablist"][aria-label="Console mode"]` with three `[role="tab"]`.
  - Sync line: `[data-sync-line]`.
  - Hero, inside `[data-mode-panel="<mode>"]`: for Sales, `[data-panel="radar"]` and `[data-panel="next"] [data-rolodex]`; for Creation, `[data-panel="nextAsset"]`; for Operations, `[data-panel="teacherLoad"]`.
  - Metric trim, Sales and Operations only: for Sales, `[data-panel="northStar"]`, `[data-panel="conversion"]`, `[data-panel="capacity"]` and `[data-panel="cashflow"]`; for Operations, `[data-panel="finance"]` and `[data-panel="trials"]`. Creation has no `metric` or `gauge` slot.
  - Bottom rail: `[data-rail]` with 3 to 6 `[data-indicator]` items (VISUAL_DIRECTION F).
- [ ] AC2: At 1280x720 and 390x844, each mode has no sideways scroll (`scrollWidth <= clientWidth`). The mode tabs and the mode's primary panel are in the first viewport width.
- [ ] AC3: When the REQ-63 block of `e2e/tracker/flows.mjs` finishes, signed in as the owner against the local stack, the folder `docs/spec/founder-console/screenshots/req-63/` holds exactly 38 non-empty PNG files, and the flow fails the run if any is missing or has zero bytes. The 38 are 12 mode captures named `mode-<sales|creation|operations>-<w>x<h>.png` (three modes on the live `/console` at 1920x1080, 1440x900, 1280x720 and 390x844), 20 state captures named `state-<loading|empty|stale|error|unverifiable>-<w>x<h>.png` (five states on `/console/preview` at the same four sizes), and 6 comparison captures named `compare-<mode>-<1920x1080|1440x900>.png`. Each comparison image shows `numbered-panel-guide.jpg`, `founder-command-bridge-reference.png` and that mode's capture side by side. The PR body links all 38 files.
- [ ] AC4: For each mode, and for the preview at 1440x900, Tab from the page start reaches every focusable element inside `[data-console]` in DOM order. No element in a hidden tabpanel takes focus. Each stop shows a visible focus indicator: a computed `outline-width` of at least 2px, or a non-`none` `box-shadow`, that differs from the unfocused style.
- [ ] AC5: axe-core, run with tags `wcag2a`, `wcag2aa`, `wcag21aa` on each mode at 1440x900 and on the preview, reports zero violations of impact `serious` or `critical`. Each run's results are saved as `req-63/axe-<page>.json`.
- [ ] AC6: At a 720x450 viewport (200% zoom of 1440x900), each mode has no sideways scroll, and the primary actions are fully inside the viewport width. Those are the mode tabs and the hero's first control: the selected Rolodex option and the outcome form's submit for Sales, the next asset's Notion link for Creation, and the first teacher-load row for Operations.
- [ ] AC7: With `reducedMotion: "reduce"`, `document.getAnimations().filter(a => a.playState === "running").length` is 0 on each mode after load and after one poll. Every computed `transition-duration` under `[data-console]` is `0s`.
- [ ] AC8: Every `[data-panel]` has a status badge whose text names its status. Every health-rail item has a text status. Neither depends on colour alone: the flow reads text, not colour.
- [ ] AC9: The fiction scan covers every console source file. That is `app/console`, `app/api/console`, `lib/console` and `components/console`, plus every non-test, non-fake `lib/notion/` file that `lib/console/providers.ts` or `app/api/console/outcomes/route.ts` imports. None of them contains a `FICTION` entry. `FICTION` lives in `apps/tracker/test/console/fiction.ts`, and no non-test file under `app/`, `lib/` or `components/` imports it.
- [ ] AC10: A tracker build without `CONSOLE_PREVIEW` has no `/console/preview` entry in `.next/app-path-routes-manifest.json` and no `server/app/console/preview` output. No `FICTION` entry and no fixture sentinel (`e2e/tracker/console-sentinels.json`) appears anywhere under its `.next/static` or `.next/server`. No secret value from the stack env (`NOTION_TOKEN`, `SUPABASE_SERVICE_ROLE_KEY`, `SCHEDULER_CRON_SECRET`, `IRIS_CRON_SECRET`, the mock Anthropic and Gmail secrets) appears under tracker or landing `.next/static`.
- [ ] AC11: In every captured state, on the live modes with each provider failed in turn and on the preview, no `[data-panel]` whose `data-status` is `empty`, `loading`, `error` or `unverifiable` contains a `[data-panel-value]` element.
- [ ] AC12: The probe set is every `app/api/console/*/route.ts` the flow finds on disk, times every HTTP method it exports. Each request is made by guest, Ryan (scheduling teacher), teacher2 (grade teacher), student, parent, the role-less user and a revoked owner (an owner membership deleted with psql after sign-in). The results:
  - A guest gets 307 to `/login?next=/tracker/api/console/<route>`.
  - Every other role gets 403 with body exactly `{"error":"forbidden"}` (the fixed REQ-53 denial, `CONSOLE_DENIALS.forbidden`; Decision 12), or 404, with no other bytes and no data.
  - `/console`, `?mode=creation` and `?mode=operations` are 404 for every non-guest non-owner, byte-identical to the role-less body.
  - A cross-site request with each unsafe method a route exports is 403 before the session is read.

  The route list must contain at least `health`, `sales`, `signals` and `outcomes`, so a missed route fails the run.
- [ ] AC13: The oracle is the fixed `PROVIDER_SLOTS` table at the top of the REQ-63 block (Approach, Degradation). Before any outage, the flow fails the run unless the table's keys equal the keys of `providers` in the `/api/console/health` JSON, and unless each provider's `degrades`, `partial` and implied `independent` lists together are exactly the 20 `mode.slot` ids parsed from `lib/console/panel-slots.ts`. The flow records every slot's `data-status` on each mode as the baseline. Then, for each provider, it fails that provider alone, reloads each mode, and checks:
  - `/api/console/health` gives that provider status `error` with a non-empty `errorMessage`, and the Operations `[data-panel="integrations"]` panel shows a text reason for it.
  - Every slot in its `degrades` list has `data-status` `error`, `stale` or `unverifiable`. It has no `[data-panel-value]` unless it is `stale`, and keeps its `[data-canonical]` link if the baseline had one.
  - Every slot in its `independent` list has the same `data-status` as the baseline.
  - Every slot in its `partial` list meets the AC11 rule.
  - Every mode still renders all its `[data-panel]` sections.
  - After the lever is healed, the retry action (Open gap 3) returns every slot to its baseline status.

  The flow fails Notion providers with mock levers and Supabase-backed ones with a `revoke select` (the REQ-31 pattern, `flows.mjs` line 1166), restored at once. A provider with no lever is listed in the PR as not exercised, and the run fails unless that list is empty.
- [ ] AC14: One sanitised loop per mode passes on fixtures, and the flow prints the evidence lines that the PR body lists:
  - **Sales**: next lead, open record, log a non-send outcome, reload, then history and the next lead. Evidence: the `tracker.console_transitions` row in `done`, its `tracker.audit_log` row, the mock Notion Touch create and the read-back.
  - **Creation**: the next task, with the weekly review present, then with no weekly review row (`No weekly media review task found`). Evidence: zero Work PATCHes in the mock journal.
  - **Operations**: teacher load with one teacher missing availability (shows unknown, never 0 hours), one cancelled occurrence (excluded from load), and one lesson gap. Also the trial funnel with one unknown-outcome trial, and the cash pulse with Sent, Paid, Draft and Void rows: only Paid counts as collected, and Draft and Void show as counts. Evidence: the panel values and the mock journal reads.
- [ ] AC15: `docs/readiness.md` has a `## Founder Console` section with one row per card, REQ-52 to REQ-63. Each row gives Merged, Migration, Deployed, Verified and Data in the register's vocabulary, with evidence, in the Production status cell format of Open gap 4. The Audience gates table has a "Founder console" row with State `Closed`. `docs/spec/founder-console/03-release-receipt.md` holds the five manual scripts from `RELEASE_CHECKLIST.md` with empty result and sign-off fields. The PR body says that merging releases nothing.
- [ ] AC16: Tracker ADR 0079 records the axe-core devDependency, the production-bundle check and the acceptance pack, and it is indexed in `apps/tracker/docs/decisions/README.md`. `pnpm test:rls`, `pnpm test:sso` and `pnpm test:tracker` are green in CI.

## Approach

### e2e (`e2e/tracker/`)

- `e2e/tracker/flows.mjs`: a new `REQ-63` block after the REQ-61 block. It reuses `bridgeAt`, `noSideScroll`, `signedIn`, `psql` and the mock levers, and adds these sections:
  1. **Captures** (AC1 to AC3): the four sizes times three modes on live `/console`, and the five states from `/console/preview` at the four sizes. Mode captures are `fullPage`. State captures are viewport only, to keep the PR small. For the compare files, `page.setContent` lays out three `<img>` (data URLs read from `docs/spec/founder-console/handoff/visual-assets/` and the capture) in a CSS grid and screenshots the result.
  2. **Keyboard and focus** (AC4): a Tab walk over all of `[data-console]`, built on the REQ-55 walk (which today stops at panels).
  3. **axe** (AC5): `page.addScriptTag({ path })` with `axe-core/axe.min.js`, resolved with `createRequire(new URL("../../apps/tracker/package.json", import.meta.url))`. Then `page.evaluate(() => axe.run(document.querySelector("[data-console]"), { runOnly: [...] }))`. The JSON is written next to the captures.
  4. **Zoom** (AC6) and **reduced motion** (AC7) and **text status** (AC8).
  5. **No value without ready or stale** (AC11): one helper, `noValueUnlessReady(page)`, called after every capture and every outage.
  6. **Role matrix** (AC12): `readdirSync("apps/tracker/app/api/console")`, then exported methods read from each `route.ts` (`export async function (GET|POST|...)`). The revoked owner is `revoked-owner@example.com`. It gets an owner membership by psql, the flow checks it gets 200 once, deletes the membership by psql, then probes. The row is removed at the end of the block, so later flows see the same org.
  7. **Degradation** (AC13): a fixed `PROVIDER_SLOTS` table at the top of the block, checked against the health JSON and `panel-slots.ts` before use. The defaults below come from reading the builders on `main`: `buildSalesView` (`lib/console/sales-view.ts` line 96), `buildTrialFunnelPanel` and `buildCashPulsePanel` (`lib/console/finance-panels.ts`), `creationPanels` (`lib/console/creation.ts` line 130), `buildNorthStar` (`lib/console/north-star.ts`), `loadOperationsPanels` (`lib/console/operations.ts` line 113) and `buildSignals` (`lib/console/signals.ts` lines 177 to 222). "The three signals" means `sales.signals`, `creation.signals` and `operations.signals`.

| Provider | Lever (on, then off in `finally`) | degrades | partial (AC11 only) |
| --- | --- | --- | --- |
| `leads` | `POST /__console/leads-fail` (exists) | `sales.next`, `sales.radar`, `sales.conversion`, `operations.trials` | `sales.northStar`, the three signals, `operations.integrations` |
| `touches` | `POST /__console/touches-fail` (new) | none (the queue ranks without touches) | `sales.next`, `sales.radar`, the three signals, `operations.integrations` |
| `trialLessons` | `POST /__console/trials-fail` (new; fails the Type = Trial query only) | `sales.conversion`, `operations.trials` | `sales.next`, `sales.radar`, `operations.lessonGaps`, `operations.upcoming`, the three signals, `operations.integrations` |
| `work` | `POST /__work/fail-console`, healed by `/__work/heal-console` (exist) | `creation.nextAsset`, `creation.work`, `creation.pipeline` | the three signals, `operations.integrations` |
| `invoices` | `POST /__billing/fail` (exists) | `sales.cashflow`, `operations.finance`, `sales.conversion`, `operations.trials` | `sales.northStar`, the three signals, `operations.integrations` |
| `people` | `revoke select on tracker.student_people from authenticated` by psql, then `grant` back (the REQ-31 pattern) | none | `sales.northStar`, `sales.capacity`, `operations.teacherLoad`, `operations.lessonGaps`, `operations.upcoming`, the three signals, `operations.integrations` |

Every slot not in a provider's two lists is `independent` for that provider. That always includes the two "Not connected yet" slots, `sales.followUps` and `sales.dispatch`. If a run shows a slot breaking the table, the builder compares it with the code. If the table misread the code, the builder fixes the row and cites the code line in the PR body. If the code breaks the guardrail (one provider blanks a panel it does not feed, or shows a value while degraded), the builder stops and sets the card Blocked with the evidence. A row moves to `partial` only in the first case.

  8. **Loops** (AC14): the Operations seed (a missing availability and a cancelled occurrence) goes in by psql in the block, as the REQ-58 block does.

- `e2e/tracker/mock-notion.mjs`: adds levers only where AC13 or AC14 needs one that is missing. Expected: `POST /__console/touches-fail`, `POST /__console/trials-fail` and `POST /__work/no-weekly` (hide the pinned weekly review row). The builder adds only the levers whose provider has none. No seeded row changes, so earlier blocks keep their counts.
- `e2e/tracker/console-sentinels.json` (new): distinctive fixture names and values from `apps/tracker/test/console/sales-fixtures.ts` and `demo-panels.ts`. The bundle check reads it.
- `e2e/tracker/bundle-check.mjs` (new): `node bundle-check.mjs <tracker .next> <landing .next>`. It checks AC10, prints PASS or FAIL lines in the `check()` format and exits non-zero on any failure. It reads `FICTION` from `apps/tracker/test/console/fiction.ts` (below) by regex over the string literals, so the list has one source.
- `e2e/tracker/run.sh`: builds the tracker once without `CONSOLE_PREVIEW` and builds landing. It runs `bundle-check.mjs`, then rebuilds the tracker with `CONSOLE_PREVIEW=1` and continues as today. The existing `cleanup` trap still deletes both `.next` folders.

### Tracker source

- `apps/tracker/test/console/fiction.ts` (new): `export const FICTION = [...]`, moved verbatim from `lib/console-scan.test.ts` line 175, which now imports it. `test/console/` is outside the scanned folders, so no file is skipped. A new scan case greps every non-test file under `app/`, `lib/` and `components/` and fails if one imports `test/console/fiction`. Only tests and `bundle-check.mjs` read it.
- `apps/tracker/lib/console-scan.test.ts`:
  - The AC9 file list (`UI`) gains `walk("app/api/console")` and the `lib/notion` console files. The `lib/notion` list comes from the imports of both `lib/console/providers.ts` and `app/api/console/outcomes/route.ts` (Open gap 2), with `*.fake.ts` and tests excluded.
  - A new case checks that every `FICTION` entry and every `console-sentinels.json` entry is a string of at least 4 characters, and that each sentinel appears in `test/console/`. A stale sentinel would make the bundle check pass for nothing, so this case catches it.
- **Accessibility fixes**, only if the AC4 to AC8 checks find them. They are limited to ARIA attributes, labels, focus styles, contrast tokens and `prefers-reduced-motion` rules in `apps/tracker/components/console/**` and `apps/tracker/app/console/console.css`. Each fix gets its own unit or scan assertion next to the existing ones (`kit/kit.test.ts`, `shell/bridge.test.ts`, `console-scan.test.ts`). A fix that needs a behaviour change, a new panel or a data change is out of scope, per Decision 5.
- `apps/tracker/package.json`: `axe-core` (exact) in `devDependencies`, plus `pnpm-lock.yaml`. See Builder notes for the version.

### Docs

- `docs/readiness.md`:
  - A new `## Founder Console` section after the findings register. It has a table with the columns Card | Title | PRs | Production status | Evidence, and one row per card from REQ-52 to REQ-63, in the register's vocabulary. The Production status cell uses the register's existing format (Open gap 4).
  - Merged comes from each PR's `merged_at` (`gh api repos/.../pulls/<n>`).
  - Migration is `yes (date, 0029_console_transitions.sql per root CLAUDE.md)` for REQ-61 and `n/a` for the others.
  - Deployed comes from `gh api repos/.../deployments?environment=Production` where a deployment contains the merge commit, and is `not recorded` otherwise.
  - Verified is `not recorded`, unless a check has a dated evidence link.
  - Data is `n/a` for the shell, kit and ADR cards, and `not recorded` for the panels that read Notion.
  - REQ-63's own row says `Merged: no`.
  - The Audience gates table gets "Founder console". Its acceptance items are: every console row is Deployed; Charlie filled in `03-release-receipt.md`; and the Production health route shows every provider as ready, or a recorded reason. It is signed off by Charlie, with State `Closed`.
- `docs/spec/founder-console/03-release-receipt.md` (new): the five manual scripts from `RELEASE_CHECKLIST.md` (Founder Sales, Founder exception, Founder capacity, Provider outage, Visual check). Each step has an empty Result and Date, and there is one empty "Charlie sign-off" line. A header says the builder never fills it in.
- `apps/tracker/docs/decisions/0079-console-release-acceptance.md` (new), plus its row in `README.md`.
- `docs/designs/REQ-63.md`: this file.

### UI

No new screen. The flow captures the live states. The loading, empty, stale, error and unverifiable states come from the preview route (`test/console/demo-panels.ts`; see Builder notes for the two states it lacked). The fixes in Approach do not change any layout.

## Migration

None.

## Test plan

| Test | Type | Covers |
| --- | --- | --- |
| `flows.mjs` REQ-63 captures: signature elements visible at 1920 and 1440 per mode, 38 files written | e2e | AC1, AC3 |
| `flows.mjs` REQ-63: no sideways scroll and primary panel in reach at 1280 and 390 per mode | e2e | AC2 |
| `flows.mjs` REQ-63: full Tab walk with focus-style assertion per mode and the preview | e2e | AC4 |
| `flows.mjs` REQ-63: axe run per mode and the preview, zero serious or critical, JSON saved | e2e | AC5 |
| `flows.mjs` REQ-63: 720x450 per mode, no sideways scroll, primary actions in width | e2e | AC6 |
| `flows.mjs` REQ-63: reduced motion, no running animation and 0s transitions after load and after a poll | e2e | AC7 |
| `flows.mjs` REQ-63: every panel badge and health item has text status | e2e | AC8 |
| `lib/console-scan.test.ts`: the extended `UI` list includes `app/api/console/*` and the `lib/notion` console files and carries no `FICTION`; no non-test file imports `test/console/fiction` | unit | AC9 |
| `lib/console-scan.test.ts`: every sentinel appears in `test/console/` | unit | AC10 |
| `e2e/tracker/bundle-check.mjs` in `run.sh` over a build without `CONSOLE_PREVIEW` | e2e | AC10 |
| `flows.mjs` REQ-63: `noValueUnlessReady` after every capture and outage | e2e | AC11 |
| `flows.mjs` REQ-63: route-by-method-by-role matrix, the revoked owner, page 404s, cross-site per unsafe method, at least the four known routes | e2e | AC12 |
| `flows.mjs` REQ-63: `PROVIDER_SLOTS` keys equal the health providers and each row covers the 20 slots; each provider failed alone, with degrades, independent and partial checked, then healed and retried back to baseline | e2e | AC13 |
| `flows.mjs` REQ-63: Sales, Creation and Operations loops with the evidence lines printed | e2e | AC14 |
| `lib/console/release-docs.test.ts` (new): `docs/readiness.md` has the Founder Console section with rows REQ-52 to REQ-63, five stages each, values only from the vocabulary, and the "Founder console" gate with State `Closed`. `03-release-receipt.md` has the five scripts and an empty sign-off line | unit | AC15 |
| `lib/console/release-docs.test.ts`: ADR 0079 exists, is indexed, and names the axe-core version and the bundle check | unit | AC16 |
| Unit or scan assertions for each accessibility fix made (in `kit/kit.test.ts`, `shell/bridge.test.ts` or `console-scan.test.ts`) | unit | AC4 to AC8 |
| CI `pnpm test:rls`, `pnpm test:sso`, `pnpm test:tracker` (the builder runs the e2e suites locally before the PR) | integration / e2e | AC12, AC16 |
| Manual founder dry-run in `03-release-receipt.md`, filled in by Charlie after merge, not by the builder | manual | T3 (not a merge condition) |

## Out of scope

- New features or panels. The `followUps` and `dispatch` Sales slots stay "Not connected yet", which is the honest state that `notConnected` already gives them.
- Anything added from the reference render.
- Any release, deploy, gate State change or filled-in receipt.
- Contacting a real family, and any real Notion write.
- Changing `ci.yml`, the SessionStart hook or `proxy.ts`.
- Visual regression baselines (pixel diffs). The comparison is by eye, in the PR.

## Risks and edge cases

- **axe finds more than markup can fix.** The builder fixes ARIA, CSS and tokens in the console files only. Anything larger means the builder stops, comments the violations on the card and sets Blocked. It does not lower AC5 (Decision 5).
- **Contrast against the gradient horizon.** axe cannot compute contrast over the SVG sky, and reports those nodes as "incomplete", not as violations. The flow saves the incomplete nodes in the JSON, and Charlie's Visual check covers them.
- **Run time.** The extra tracker build and about 40 captures add a few minutes to `test:tracker`. Captures are viewport-only where full page adds nothing.
- **PR size.** About 38 PNGs. The REQ-55 to REQ-62 screenshots set the precedent of committing them under `docs/spec/founder-console/screenshots/`.
- **Revoked owner.** A second owner membership could change earlier owner-only counts. The flow creates it inside the REQ-63 block after all earlier blocks, and removes it before the block ends.
- **Provider levers.** A new lever changes nothing unless it is toggled, so earlier blocks are unaffected. Every lever toggled on is toggled off in a `finally`.
- **The card says "ready or verified".** `PanelStatus` has no `verified`. This design reads it as `showsValue` (`ready`, plus `stale` with its stale label, per `PANEL_STATES.md` and `instrument-panel.tsx`). The north star's unverifiable "Gross ... (unclassified)" line is a note, not a `data-panel-value`, so it is allowed (REQ-56, ADR 0068). See Decision 4.
- **Creation has no metric trim.** `panel-slots.ts` gives Creation two queues and two lists, and the reference render is a Sales screen. AC1 checks the trim in Sales and Operations only, and Charlie's Visual check covers Creation by eye. Adding a Creation metric would be a new feature (out of scope).
- **The provider table drifts.** If a later card adds a provider or a slot, the coverage check in AC13 fails the run before any outage, so the table cannot go stale in silence.
- **Partial slots.** Signals and integrations read every provider and may stay `ready` while they report the failure, which is their job. The touches and people rows have no `degrades` slot for the same reason. AC11 still bars a value on any non-ready partial slot.
- **Deployment evidence.** If the Deployments API shows no Production deployment for a merge commit, the cell is `not recorded`, never `yes`.
- **This checkout is behind `main`.** The design cites `main` at `76c881d` (REQ-61 merged as #130, and 0030 by #131), and the builder branches from `main`.

## Decisions for approval

| # | Decision | Options | Default if you say nothing |
| --- | --- | --- | --- |
| 1 | New dependencies | (a) `axe-core`, exact, a devDependency of `apps/tracker`, loaded in `flows.mjs` through `addScriptTag`. It only runs in e2e and never reaches a bundle. (b) A global npm install next to Playwright, which needs `ci.yml` and SessionStart hook patches from Charlie. (c) No dependency: a hand-written subset (names, roles, focus) instead of axe. | (a). It adds `apps/tracker/package.json` and `pnpm-lock.yaml` to the diff, so the PR carries `needs-human-merge`. |
| 2 | Schema placement and numbers | None: no migration. Tracker ADR number: `main` ends at 0077, and REQ-49 (Building) reserves 0078. Migrations end at 0030 on `main`, with 0031 in PR #132. No workspace ADR is needed (`docs/adr/` ends at 0007). | Tracker ADR **0079** `0079-console-release-acceptance.md`. No migration number is taken. |
| 3 | Where the production-bundle check runs | (a) `run.sh` builds the tracker once without `CONSOLE_PREVIEW`, checks it, then rebuilds with the flag. (b) A step in the `ci.yml` build job, which needs a workflow patch from Charlie. | (a). It costs one extra tracker build in `test:tracker`. |
| 4 | Meaning of "ready or verified" in the truthfulness pass | (a) `ready`, or `stale` with its label (`showsValue`). (b) `ready` only, which would contradict the approved stale behaviour from REQ-55 and REQ-57. | (a). |
| 5 | Accessibility defects found by the pass | (a) Fix them in this PR when they are markup, ARIA, CSS or token changes in the console files, each with a test. Anything larger blocks the card with the list. (b) File every defect as a follow-up card and ship with exceptions. | (a). AC5 stays at zero serious or critical. |
| 6 | Split the card | (a) One card and one PR. The readiness rows and the receipt cite evidence from the same run. (b) 12a, the automated pack (AC1 to AC14, AC16), and 12b, readiness and receipt (AC15). | (a). The diff is mostly e2e and docs, with no new feature. |
| 7 | Capture size and where captures live | Full page for everything; viewport for the states and full page for the modes. In the repo under `screenshots/req-63/`, or as CI artifacts only. | Viewport for the states, full page for the modes, committed under `docs/spec/founder-console/screenshots/req-63/` (the precedent). |
| 8 | "Revoked" user | An owner whose membership is deleted mid-session; a revoked staff link; both | An owner whose membership is deleted mid-session. Revoked staff links were covered by REQ-32 and REQ-53. |
| 9 | Founder gate vocabulary | `Closed` (the register's existing word); a new "not released" | `Closed`. The PR body says in words that the console is not released. |
| 10 | New mock levers | Add only what AC13 and AC14 need (expected: touches, trials, no-weekly) | As listed, toggled off in `finally`. No seeded row changes. |
| 11 | Where the shared `FICTION` list lives | (a) `apps/tracker/test/console/fiction.ts`, next to the other fixtures; (b) `lib/console/fiction.ts` with a by-name scan skip; (c) two copies | (a). Demo strings stay out of production source, no skip is needed, and a scan case fails on any non-test importer. |
| 12 | Meaning of "no body" for a 403 | (a) No data beyond the fixed denial JSON `{"error":"forbidden"}`, which REQ-53 shipped and its tests pin; (b) an empty body, which changes `lib/console/guard.ts`, `handlers.ts`, tracker ADR 0062's contract and the sync poller's 403 handling (`lib/console/sync.test.ts` line 31) | (a). AC12 asserts the exact bytes, so nothing else can leak. |
| 13 | AC13 provider-to-panel oracle | (a) A fixed `PROVIDER_SLOTS` table in the REQ-63 block, checked against the health JSON and `panel-slots.ts`; (b) a `providers` field on each `PanelSlot` in `lib/console/panel-slots.ts`; (c) a `data-provider` attribute on `[data-panel]` | (a), with the rows in Approach, Degradation. It changes no console source, and (b) or (c) would only restate the same table in production code. |

## Open gaps

From the design approver's "Approved at cap" comment (2026-10-23). Each is closed in this build:

1. **AC11 appears twice in Acceptance criteria.** Closed: AC13's line now reads "meets the AC11 rule", so each AC id starts exactly one criterion (gap 5 too).
2. **The lib/notion list.** Closed: `console-scan.test.ts` builds `NOTION_CONSOLE` from the imports of both `lib/console/providers.ts` and `app/api/console/outcomes/route.ts`, as AC9 says, and a case pins the seven files it must contain.
3. **What "retry" means in AC13.** Pinned: after the lever is healed, on each mode the flow clicks the Retry link (`[data-panel] .console-failure a`, text `Retry`, from `kit/failure-state.tsx`) of the first slot in that provider's `degrades` list that is in `error`; when none is in `error` (an unverifiable or stale slot has no Retry link), it calls `page.reload()`. After that action every slot must be back at its baseline status. The flow prints which action it took per provider.
4. **Where the five stages go in the readiness table.** Pinned: the Production status cell uses the register's existing format, exactly `Merged: <value>; Migration: <value>; Deployed: <value>; Verified: <value>; Data: <value>`, and `release-docs.test.ts` parses that format (split on `; `, then on the first `: `) and checks the stage names, their order and each value against the Vocabulary.
5. **Duplicate AC11 (structural pre-check).** Closed with gap 1.
6. **The REQ-61 Migration cell.** Confirmed: PR #129 (`req/REQ-61-migration`) added `supabase/migrations/0029_console_transitions.sql`, and the root `CLAUDE.md` records 0029 as applied on 2026-10-23. 0030 is REQ-48's `approve_draft` revoke (#131), not a console file. The cell is `yes (2026-10-23, 0029_console_transitions.sql per root CLAUDE.md)`.
7. **C5, retry not pinned.** Closed with gap 3.
8. **C10, AC9 versus Approach and the single status column.** Closed with gaps 2 and 4.

## Builder notes

- **axe-core version.** The design named 4.10.3. The lockfile already resolves `axe-core@4.14.0` (through `eslint-plugin-jsx-a11y`), and pinning 4.10.3 made pnpm downgrade that shared copy, a lockfile change outside this card. The tracker pins `axe-core` `4.14.0` exactly instead, so the lockfile diff is three lines in the tracker importer and no package changes. ADR 0079 and `release-docs.test.ts` read the version from `package.json`.
- **Preview states.** The preview had ready, stale, empty and unverifiable panels but no loading or error panel, so AC3's `state-loading` and `state-error` captures had nothing to show. `test/console/demo-panels.ts` now gives Operations `signals` a loading result and Creation `signals` an error result. Test data only; no production file changes.
- **Touches and the health rail.** The REQ-62 health rail has seven entries and none is for touches (`lib/console/signals.ts` `HEALTH_KEYS`). A failed touches read is reported as the `provider_failure:touches` signal ("Notion touches check failed") in the signals panels instead. AC13's "the integrations panel shows a text reason" is checked through the rail entry for the five providers that have one (leads, trialLessons, invoices, work, people), and for touches through that signal row with its reason. Adding a touches entry to the rail would change REQ-62's approved seven-entry rail, so it is out of scope here.
