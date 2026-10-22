# AP Academy Founder Console: Claude Code handoff
**Pack date:** 2026-10-21 (America/Toronto)  
**Destination:** `https://github.com/y-wang217/ap-academy-landing`  
**Primary outcome:** increase **net new verified recurring student teaching-hours per week** while reducing founder context-switching.  
**Deliverable type:** research-grounded implementation handoff, not working application code.

## Open first
1. `00_START_HERE/PASTE_INTO_CLAUDE_CODE.md` — one prompt that tells Claude Code how to ingest this pack using the existing Notion Dev Requirements board.
2. `01_PRODUCT/MASTER_BRIEF.md` — product, states, outcomes and operating rules.
3. `02_DESIGN/VISUAL_DIRECTION.md` and `06_VISUAL_ASSETS/founder-command-bridge-reference.png` — approved **directional** aesthetic.
4. `07_PREVIEW/index.html` — offline, interactive **fictional-data** visual demonstration. No backend connection. Open locally in a browser.
5. `04_CARDS/cards.json` and `04_CARDS/FC-*.md` — independently scoped engineering requirements ready to be mapped to real REQ IDs in Notion.
6. `03_ENGINEERING/ARCHITECTURE_AND_DATA.md`, `05_QA/RELEASE_CHECKLIST.md` — system boundaries and test gates.

## Critical distinction
The existing Claude Code pipeline draws work from the **Notion Dev Requirements** board, NOT from arbitrary Markdown files. The `FC-*` IDs here are only **local seed IDs** to avoid collisions with existing REQ IDs. Claude Code must create/confirm real Notion cards, obtain actual `REQ-<n>` IDs, establish the `Blocked by` relations, set only unblocked cards Ready and the rest Backlog, then let `/design-next` and `/build-next` do their normal jobs. Do NOT paste these files directly into `docs/designs/REQ-*.md` as approved designs.

## Real vs illustrative
- Reference render and offline preview are **art direction**, not evidence of actual application state.
- The image has fictional names, numbers, timelines and even a wrong illustrative date: **never copy these as production business facts.**
- The original Founder Console functional brief was discussed in prior chat, not furnished as a source file here. This pack consolidates the known requirements; validate its fit with any canonical brief available in the user's environment before approval.
- We have inspected public repository instructions, but have NOT cloned, built, modified or tested the actual live application or Supabase data from this environment.
- No credential, customer record, real analytics dump or login token is packaged.

## Outcome for the founder
A signed-in, founder-only, production web console at a same-origin path (proposed `/console`, subject to codebase review) where the next useful action is obvious. Real lead queue, teacher capacity and operational truth first; cinematic framing adds delight without blocking function.

## Suggested delivery order
Architecture/auth → live read models → visual shell → sales Rolodex → explicit call/follow-up actions → operations/teachers → content workbench → signals and financial readouts → accessibility/polish/release. Respect card dependencies, avoid duplicate work already underway.

## Verified harness references (observed 2026-10-21)
- Root `CLAUDE.md`: https://github.com/y-wang217/ap-academy-landing/blob/main/CLAUDE.md
- `.claude/pipeline.json`: https://github.com/y-wang217/ap-academy-landing/blob/main/.claude/pipeline.json
- `.claude/agents/designer.md`: https://github.com/y-wang217/ap-academy-landing/blob/main/.claude/agents/designer.md
- `.claude/agents/builder.md`: https://github.com/y-wang217/ap-academy-landing/blob/main/.claude/agents/builder.md
- Design template: https://github.com/y-wang217/ap-academy-landing/blob/main/docs/designs/_TEMPLATE.md
- Pipeline guide: https://github.com/y-wang217/ap-academy-landing/blob/main/PIPELINE.md
- Dev Requirements board URL is held in `.claude/pipeline.json` (use current value). 

## No silent assumptions
- Reuse existing Next.js workspace, Supabase Auth, Notion and calendar/scheduler contracts. Root `CLAUDE.md` says new products live in `apps/`, use same origin + path routing, one auth pool, and root migrations; actual placement must be designed based on today's code.
- Do not change user-facing parent/student routes.
- Do not assume trial, completed lesson, verbal yes, or invoice implies payment.
- Any production schema migration requires explicit founder approval, separate migration PR and live verification.
- No outbound messaging, contact calls, publishing, appointment changes or spend without an explicit user action/approval.
- Keep the **next weekly recurring hours** KPI as the central instrument; do not use fabricated global territory maps or fictional growth numbers as product data.
