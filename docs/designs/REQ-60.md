# Design: REQ-60: Console 10/12: Creation mode backed by the Notion Work database

Copied from the Notion card as approved (design-approver: Approved at cap, sha 9a145102eff5, after 2 revise rounds).

## Changes from last version

- Approver, revise 2 of 2 ("AC1 appears twice in Acceptance criteria"): the duplicate came from cross-references inside the criteria. AC1 now says "in the queue order that AC2 defines", and AC2 says "labelled the way AC1 lists them" and "the weekly review row that AC3 pins". No criterion changed in meaning, and AC1 to AC10 each appear once.
- Revise 1 of 2 (the same comment): the page had held two complete design sections from overlapping runs. The second was removed.
- Number reservation re-checked on 2026-10-22 at about 18:15Z (Decision 2). Tracker ADR `0070-creation-mode-work-queue.md` is still free.

**Summary:** the three Creation slots on `/tracker/console?mode=creation` stop saying "Not connected yet". They show the next real marketing deliverable with its State, Due / Review, Owner, Task Type, parent project, expected result and Notion link; the ordered Marketing work queue with projects grouping their children; and the pinned weekly media review task, or "No weekly media review task found". Everything is read live from the Notion Work database. The console writes nothing, and a row marked Done in Notion leaves the queue on the next load.

**Risk:** Medium. Owner-only UI over Notion rows that the REQ-54 reader already reads, plus two read properties, an Area filter and one read-only Task Type name query. No auth, RLS or permission change, no write, no migration, no data to a new destination. The PR carries `needs-human-merge` because it edits `apps/tracker/lib/notion/work.ts` and `config.ts` (`human_merge_paths`).

## Problem

Charlie (org owner, the only console viewer) needs a not-on-call workbench that answers "what creative thing do I do next?" without opening Notion, and shows the weekly media review. MASTER_BRIEF section 3 and spec `docs/spec/founder-console/02-data-contracts.md` section 3.8 name the Notion Work database (`3031b455-9be0-4f8d-b200-70fcfcf1a0b8`) as the authority.

Existing: the Creation slots (`nextAsset`, `work`, `pipeline`, `signals`) in `apps/tracker/lib/console/panel-slots.ts`; REQ-54's `fetchWorkItems` and the facade's `PanelResult<WorkRow[]>`; mode persistence through `?mode=` (REQ-55). Missing: an Area filter, `Parent Project`, `Expected result`, Task Type names, an ordering and grouping rule, the weekly-review pin and the panels.

On 2026-10-22 the live Work database had 9 open Marketing rows: the project "Fall 2026 acquisition engine" (Doing, no children); the project "Parent education videos, six-video pilot" (Doing) with six Task children (01 Next, 02 to 06 Defined, none dated); and "Weekly marketing performance review" (Recurring, Next, due 2026-10-21). No Marketing row has a Task Type set.

## Acceptance criteria

- [ ] AC1: **Next asset.** The `nextAsset` panel shows exactly one task: the first open Marketing row, in the queue order that AC2 defines, whose Type is not Project or Recurring and whose State is Doing, Next, Defined or Inbox. It shows Name, State, Type, Due / Review (a date, "Due not set" when empty, plus "Overdue" when before today in America/Toronto), Owner ("Owner not set"), Task Type names ("Task type not set" when empty, "Name unavailable" when the name read failed, each linked), parent project (linked, or "No parent project"), Expected result (or "No expected result"), and an "Open in Notion" link. Nothing is computed or invented. A Done row never appears. With the live 2026-10-22 shape as a fixture, the next asset is "Parent education 01".
- [ ] AC2: **Queue order and grouping.** The `work` panel lists every open Marketing row: State rank Doing, Next, Defined, Inbox, then no or unknown State ("State not set"), then Waiting / Blocked last; within a rank Due / Review ascending with missing dates last, then Name, then id. A row whose first `Parent Project` is a Type = Project row in the open set is listed only under that project. Any other row with a parent is top-level and shows a "Parent project" link. Missing values are labelled the way AC1 lists them. The weekly review row that AC3 pins is labelled "Weekly review".
- [ ] AC3: **Weekly media review.** The `pipeline` slot, retitled "Weekly media review", shows the Work row with page id `3ead6ae7-3dd7-811e-b525-e3626520b805` with the AC1 details, only when it is in the open read with Area Marketing and Type Recurring. Otherwise: "No weekly media review task found", then "If it is marked Done or was moved, it is not shown", with links to the pinned page and to the Work database ("Create one in Notion"). No console file contains `pages.create`, `"/pages"`, or an import of `createTaskPage`, `createLogEntry`, `appendToDo` or `appendTeacher`.
- [ ] AC4: **Completion is Notion's.** A Done row is absent from all three panels on the next load. No button or form in the Creation panels, no `NOTION_WORK_WRITE_ENABLED`, no server action or route that writes Work. No `"PATCH"` and no `/v1/pages` in console files.
- [ ] AC5: **Fresh-lead slot.** The next-asset panel takes an optional `interrupt` node. With none it renders no banner. With a stub it renders the banner above the task; the task, its `data-task-id`, `?mode=` and `?task=` are unchanged.
- [ ] AC6: **Selection persists.** Each queue row has a "Select" link to the current URL with `task=<row id>` (other parameters kept). The selected row fills the next-asset panel, marked "Selected", and carries `aria-current="true"` in the queue. Switching modes and reloading keeps it. An unknown `task` shows the computed next asset with "The selected task is no longer open in Notion".
- [ ] AC7: **Status and failure.** From the facade's `work` result: `error` makes each panel `error` with the message and an "Open Work in Notion" link; `stale` (page cap) makes each `stale` with the reason, rows still shown; complete with no open Marketing rows makes `work` empty ("No tasks scheduled"), `nextAsset` empty ("Queue clear") and `pipeline` empty with the AC3 text; rows with none eligible make `nextAsset` empty. Every status shows the Work database link. A Work failure changes no Sales or Operations panel.
- [ ] AC8: **No publishing or external call.** No file under `app/console`, `lib/console` or `components/console` names a recording or publishing host (`youtube`, `youtu.be`, `tiktok`, `instagram`, `facebook`, `linkedin`, `vimeo`, `buffer.com`, `hootsuite`, `x.com`, `twitter`). No file this card adds or changes there calls `fetch(`, except `lib/console/providers.ts`, which hosts the abort-bound fetcher the Notion reader ports run on (see Open gaps, item 3). The `work.test.ts` read tests prove that `fetchWorkItems` and `fetchTaskTypeNames` make only data source schema GETs and queries (`onlyReads`).
- [ ] AC9: **Reader.** `WORK_PROPS` equals `["Name", "Area", "State", "Type", "Due / Review", "Owner", "Task Type", "Parent Project", "Expected result"]`. The query body is `{ filter: { and: [{ property: "State", select: { does_not_equal: "Done" } }, { property: "Area", select: { equals: "Marketing" } }] }, sorts: [Due / Review ascending] }`. `Alignment`, `Build hours`, `Bet`, `Agent permission` and `Work Log` are never read. `expectedResult` is cut to 500 characters. `fetchTaskTypeNames` returns a title per Task Type page id; when it throws, rows come back with `name: null` and the provider does not fail.
- [ ] AC10: Tracker ADR `apps/tracker/docs/decisions/0070-creation-mode-work-queue.md` exists with every section, is in the decisions `README.md`, has no em dash, and records the Area filter, the order and grouping, the next-asset rule, the weekly-review pin by page id, the Task Type name read, the extra read properties (amending REQ-54), and that the one-step Done action was not built.

## Approach

1. **Reader, `apps/tracker/lib/notion/work.ts`** (human-merge path): `WORK_PROPS` gains `Parent Project` and `Expected result`; `toWork` returns `parentProjectIds`, `expectedResult` (500 chars) and `taskTypes: { id, name: null }[]` in place of `taskTypeIds`; `fetchWorkItems` adds the Area filter; new `fetchTaskTypeNames(config, opts): Promise<Map<string, string>>` (schema GET for `Task type`, one `pagedQuery` with `maxPages: 1`, keyed by `normalId`). The daily-task writers are not touched.
2. **Config, `config.ts`** (human-merge path): `DEFAULT_TASK_TYPES_DATA_SOURCE_ID = "80e411f2-eb5b-4055-b560-55061669d9f7"` and `taskTypesId` (env `NOTION_TASK_TYPES_DATA_SOURCE_ID`) in `consoleDataSourceIds()`. `FacadeDeps.sources` is unchanged.
3. **Contracts:** `WorkSource` and `WorkRow` carry `taskTypes`, `parentProjectIds` and `expectedResult` (`z.string().max(500).nullable()`).
4. **Provider:** the `work` port runs `fetchWorkItems`, then, only when a row has a Task Type, `fetchTaskTypeNames` under the same abort signal. A throw leaves names null. Still one provider; the health route keeps six.
5. **Pure builder, `apps/tracker/lib/console/creation.ts`:** `WEEKLY_MEDIA_REVIEW_PAGE_ID`, `STATE_RANK`, `CreationTask`, `CreationEntry`, `CreationView`, `compareTasks`, `buildCreation`, `creationPanels`. Rules: keep Marketing rows not Done, deduplicated by `normalId`; sort by rank, due (null last), name, id; nest a row under its first parent when that parent is an open Project (one level); next is the first non-Project, non-Recurring row with rank 0 to 3; selected by `normalId`; weekly review is the pinned id with Area Marketing and Type Recurring; overdue is `due < today`; `selectHref` is `?` plus the search params with `task` set. `creationPanels` maps statuses per AC7 and copies evidence and times; a throw inside the build gives `error` "Read failed".
6. **Slots:** the `pipeline` slot's title becomes "Weekly media review" and its empty text "No weekly media review task found". No grid change.
7. **Components, `apps/tracker/components/console/creation/`:** `task-facts.tsx`, `next-asset.tsx` (optional `interrupt`, "Next" or "Selected" tag, `data-task-id`), `work-queue.tsx` (nested `<ol>`, Select with `aria-current`, Open), `weekly-review.tsx` (the task, or the AC3 text and links). `bridge.tsx` renders them for the Creation slot ids; `signals` is untouched. Styles: `.console-creation-*` in `console.css`, existing tokens, 12 px minimum, no motion, no em dashes.
   - **Focus:** every Select, Open and Notion link takes the console's existing `[data-console] :focus-visible` rule, a 2 px `var(--amber)` outline (REQ-55); no Creation rule overrides it.
   - **Layout:** at 640 px and below one column in slot order (next asset, work queue, weekly review, signals). At 641 to 1279 px and 1280 to 1439 px, the next asset sits beside the work queue (`"nextAsset work" "pipeline signals"`; 641 to 900 px puts the next asset across the top). At 1440 px and up, including 1920 px, the next asset spans the left column beside the work queue and signals, with the weekly review under them (`"nextAsset work signals" "nextAsset pipeline pipeline"`).
8. **Page wiring, `apps/tracker/app/console/page.tsx`:** reuses the single `loadConsolePanels` result; reads `task` (first value, at most 64 characters, else null); sets `panels.creation.nextAsset`, `.work` and `.pipeline` from `creationPanels(facade.work, { today: todayIso(now), selectedId, search, workSourceId: deps.sources.work })`. `page.tsx` keeps no `lib/notion` import.
9. **Preview, scan and docs:** `test/console/demo-panels.ts` Creation results become `CreationView` panels (test data only); `lib/console-scan.test.ts` adds the AC3, AC4 and AC8 rules; tracker ADR 0070 and its README row.

The canonical Work link uses REQ-58's `canonical` frame prop, which landed first (Decision 12 allowed the switch), so it shows in the header in every status with no kit change.

## Migration

None.

## Test plan

| Test | Covers |
| --- | --- |
| `apps/tracker/lib/console/creation.test.ts`: F1 to F13 and `creationPanels` per status | AC1, AC2, AC3, AC4, AC6, AC7 |
| `apps/tracker/lib/notion/work.test.ts`: `WORK_PROPS`, the `and` filter, new fields, 500-char cut, never-read properties, `fetchTaskTypeNames` reads only, a 500 throws | AC8, AC9 |
| `apps/tracker/lib/console/providers.test.ts`: names filled, no name request without Task Types, a failing name read leaves names null | AC9 |
| `facade.test.ts`, `contracts.test.ts`: new `WorkRow` fields | AC9 |
| `apps/tracker/components/console/creation/creation.test.ts`: every status keeps the Work link, tags, notes, interrupt slot, nesting, `aria-current`, weekly review texts, no button or form | AC1 to AC7 |
| `bridge.test.ts`: the three Creation slots render the new panels | AC7 |
| `lib/console-scan.test.ts` additions | AC3, AC4, AC8 |
| `lib/creation-adr.test.ts` | AC10 |
| `e2e/tracker/flows.mjs` REQ-60 with seeded rows in `mock-notion.mjs`: next asset, Done and Delivery absent, nesting and Waiting last, weekly review, Select across the mode tabs and a reload, keyboard Select, no write, Work failure isolated from Sales, six health providers, no sideways scroll and the expected layout at 390, 1280, 1440 and 1920, screenshots in `docs/spec/founder-console/screenshots/req-60/` | AC1 to AC7 |

## Out of scope

The one-step "set State to Done" action (Decision 3); creating Work rows, an editor, a scheduler, publishing or recording, the Content Library, new Work properties; the Creation `signals` slot and the fresh-lead banner content (REQ-62); inferring sub-stages from names; any change to the health route or a new facade provider.

## Decisions for approval (as approved)

1 no new dependency; 2 no migration, tracker ADR 0070; 3 Done action not built; 4 weekly review pinned by page id; 5 Area filter in the query; 6 add `Parent Project` and `Expected result`; 7 Task Type names inside the `work` provider; 8 next-asset eligibility as written; 9 Work `State` is the stage; 10 slot mapping as written; 11 `?task=` selection; 12 canonical link in every status; 13 build after REQ-56; 14 the `interrupt` prop; 15 Overdue is a label only; 16 replace the Creation demo results; 17 one card.

## Open gaps

The approver's "Approved at cap" comment left these for the builder. Each is closed in this build.

1. **1440 and 1920 px widths.** The e2e REQ-60 block checks no sideways scroll and the expected Creation layout at 390x844, 1280x720, 1440x900 and 1920x1080, live and in the preview, and writes preview screenshots at all four sizes to `docs/spec/founder-console/screenshots/req-60/`. Approach 7 states the layout at each width.
2. **Keyboard operation.** The e2e block focuses the work queue panel, presses Tab until the standalone task's Select link has focus, checks its focus outline is drawn, presses Enter, and checks the next-asset `data-task-id` changed and the row has `aria-current="true"`. Approach 7 states the focus style (the existing amber `:focus-visible` rule).
3. **AC8 versus the scan exemption.** AC8 is reworded above: `providers.ts` is exempt from the `fetch(` rule because it hosts the abort-bound fetcher the Notion reader ports run on (it was already the only console file allowed to reach `lib/notion/`). The host rule applies to every console file. The scan test matches: hosts over every console file, `fetch(` over the files this card adds or changes except `providers.ts`, and `providers.ts` may import only `fetchTaskTypeNames` and `fetchWorkItems` from `../notion/work`.
4. **C1, guardrail widths and keyboard.** Closed by items 1 and 2.
5. **C10, AC8 contradiction.** Closed by item 3.
