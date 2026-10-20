# REQ-37: Readiness register, one record per finding from code merged to audience released

Copied from the Notion card (approved by the design approver on 2026-10-20, sha 344d6721bea0).

**Summary:** A new `docs/readiness.md` records, for every review finding and Feedback card, what is merged, applied, deployed, verified and loaded, in a fixed vocabulary with evidence, plus four audience gates that all start Closed. It is linked from the root `CLAUDE.md` and `apps/tracker/docs/PLAN.md`, and every stale "not applied" note in PLAN is corrected.

**Risk:** Low (Markdown only, three files. No code, schema, permission, data flow or deploy change.)

## Acceptance criteria

- AC1: `docs/readiness.md` exists and has these parts in order: H1 "Readiness register", an "As of YYYY-MM-DD" line, `## Rules`, `## Vocabulary`, `## Findings register`, `## Audience gates`.
- AC2: The Rules section states each of these: (a) when a card ships, the builder updates that row's Production status in the same PR or the next docs PR; (b) only Charlie changes a gate's State; (c) a gate is Released only with a named date (YYYY-MM-DD) and an evidence link; (d) a stage nobody has evidence for is `not recorded`, never `yes`; (e) "verified" means the named check passed on the named date, and the register makes no claim that software has no bugs; (f) card status lives on the Notion board and is not copied here.
- AC3: The Findings register table header is exactly `| ID | Finding | Resolution | Card and PR | Verification | Production status | Audience | Owner decision |`. It has exactly 15 data rows, with IDs F01, F02, F03, F04, F05-1, F05-2, F06, F07, F08, F09, F10, F11, F12, F13-1 and F13-2, in that order.
- AC4: Each Feedback card on the board, REQ-28 to REQ-40, appears on exactly one line of the Findings register. REQ-25 (F10) and REQ-26 (F06) also appear.
- AC5: Every Production status cell matches exactly `Merged: V; Migration: V; Deployed: V; Verified: V; Data: V`. Each V is one of: `yes (YYYY-MM-DD, evidence)`, `failed (YYYY-MM-DD, evidence)`, `reported (who, YYYY-MM-DD)`, `no`, `not recorded`, `n/a`. Evidence holds no `;` or `)`.
- AC6: Every `Merged: yes` names the feature PR number(s), each with `merged_at` set on GitHub. Every `Migration: yes` names a file in `supabase/migrations/` that is in the root `CLAUDE.md` applied list. Every `Deployed: yes` names a commit sha that has a successful Production deployment for the project(s) it names, and that commit is the feature merge commit or contains it (`git merge-base --is-ancestor <merge> <sha>`).
- AC7: The seed is the table under Approach, as of 2026-10-20. At build time the builder re-checks every cell. A cell may differ from the seed only when the new value passes AC6, or is `failed` with evidence. The PR body lists every changed cell with its evidence. The As of line is the build date.
- AC8: The Audience gates table header is exactly `| Gate | Acceptance items | Source | Signs off | State |`. It has four rows, Gate 0 owner rehearsal, Gate 1 teachers, Gate 2 students and Gate 3 parents. Signs off is "Charlie" and State is "Closed" on every row.
- AC9: The root `CLAUDE.md` Layout table has a row for `docs/readiness.md` whose link resolves. `apps/tracker/docs/PLAN.md` has one line under its opening paragraph that links `../../../docs/readiness.md`. Every PLAN note that calls a migration in the root `CLAUDE.md` applied list "not applied" or "not yet applied" now says "applied" with that list's date, so `grep -nE 'not (yet )?applied' apps/tracker/docs/PLAN.md` prints nothing.
- AC10: `docs/readiness.md` contains no em-dash (U+2014) and none of "bug-free", "bug free", "guarantee".
- AC11: The PR diff against `main` touches only `docs/readiness.md`, `CLAUDE.md`, `apps/tracker/docs/PLAN.md` and `docs/designs/REQ-37.md`.

## Approach

New `docs/readiness.md` next to `docs/RESTORE.md` and `docs/PERF.md`, plain Markdown in short sentences.

- Header: "# Readiness register", then "As of YYYY-MM-DD (the build date). Sources: GitHub PRs and deployments, the root `CLAUDE.md` applied list, the Notion board. Source review: readiness review 2026-10-16."
- Rules: the six AC2 rules, one bullet each.
- Vocabulary: one line per AC5 value, then one line per stage:
  - Merged: the card's feature PR merged to `main`, dated by the feature PR's UTC `merged_at`. A migration PR is cited in the same cell but does not count alone.
  - Migration: applied live, per the root `CLAUDE.md` applied list. `n/a` when the design says Migration None, `not recorded` when the card has no design yet.
  - Deployed: a successful Vercel Production deployment of the merge commit or a later commit that contains it. `n/a` for docs-only work.
  - Verified: the shipped behaviour was checked live (trigger, Notion sharing, cron, page).
  - Data: real rows loaded. `n/a` when the work needs none.
  - Audience values: owner, teacher, student, parent, comma separated.

### Findings register seed (2026-10-20)

| ID | Finding | Resolution | Card and PR | Production status | Audience | Owner decision |
|---|---|---|---|---|---|---|
| F01 | Monthly billing counts sessions from Weekly Schedule free text | Held: structured billing input with reconciliation | REQ-40 | `Merged: no; Migration: not recorded; Deployed: no; Verified: no; Data: n/a` | parent | held: billing policy |
| F02 | Notion Weekly Schedule does not say it is generated after adoption | Generated header and owner drift notice | REQ-34 | `Merged: no; Migration: not recorded; Deployed: no; Verified: no; Data: n/a` | owner | Answer the open questions on the card |
| F03 | A calendar save shows "Saved." when the Weekly Schedule export failed | Each export result shown, with Retry | REQ-28, PR #77 | `Merged: yes (2026-10-16, PR #77 baae0f9); Migration: n/a; Deployed: yes (2026-10-17, 2bc666a Production landing and tracker); Verified: not recorded; Data: n/a` | owner | none |
| F04 | A class save and its Notion exports are not durable together | Notion outbox with retry | REQ-35, PRs #89, #94 | `Merged: yes (2026-10-20, PRs #89 4929951 and #94 edea79c); Migration: yes (2026-10-20, 0021_notion_outbox.sql per root CLAUDE.md); Deployed: yes (2026-10-20, d79aa3c Production landing and tracker); Verified: not recorded; Data: n/a` | owner, teacher | none |
| F05-1 | Staff and student names are read live from Notion with no staleness record | ADR: Notion edits people, Supabase holds synced copies (option B) | REQ-36, PR #76 | `Merged: yes (2026-10-16, PR #76 625dca5); Migration: n/a; Deployed: n/a; Verified: n/a; Data: n/a` | teacher, parent | none (Charlie chose option B, 2026-10-16) |
| F05-2 | Same finding | People sync into local copies | REQ-38, PRs #91, #93 | `Merged: yes (2026-10-20, PRs #91 492911c and #93 62fc585); Migration: yes (2026-10-20, 0022_people_sync.sql per root CLAUDE.md); Deployed: yes (2026-10-20, 62fc585 Production landing and tracker); Verified: not recorded; Data: not recorded` | teacher, parent | Run the first live sync and record it |
| F06 | A teacher could change a student's Notion record link | Closed: owner-only guard trigger (tracker ADR 0048) | REQ-26, PRs #72, #73, #75 | `Merged: yes (2026-10-16, PRs #72 87ffb43 and #73 94fa18c); Migration: yes (2026-10-16, 0017_student_notion_link_owner_only.sql per root CLAUDE.md); Deployed: yes (2026-10-16, 94fa18c Production landing and tracker); Verified: reported (Charlie, 2026-10-16); Data: n/a` | teacher, parent | Add an evidence link for the live trigger check |
| F07 | Planned classes are never linked to delivered lessons | Lesson link with attendance states, no payout side effects | REQ-39, PRs #96, #97 | `Merged: no; Migration: yes (2026-10-20, 0023_occurrence_outcomes.sql per root CLAUDE.md); Deployed: no; Verified: no; Data: n/a` | teacher, parent | Review and merge PR #97 (needs-human-merge) |
| F08 | Booking checks run before the write and are not atomic | Locked, revalidated class writes | REQ-30, PRs #79, #80 | `Merged: yes (2026-10-17, PRs #79 7d466e6 and #80 2bc666a); Migration: yes (2026-10-17, 0018_scheduler_locked_writes.sql per root CLAUDE.md); Deployed: yes (2026-10-17, 2bc666a Production landing and tracker); Verified: not recorded; Data: n/a` | owner, teacher | none |
| F09 | Parent calendar says Done for any past class and Makeup for every one-off | Past, and a declared purpose | REQ-31, PRs #81, #82 | `Merged: yes (2026-10-17, PRs #81 1ba7cc3 and #82 c35fcdd); Migration: yes (2026-10-17, 0019_class_purpose.sql per root CLAUDE.md); Deployed: yes (2026-10-17, c35fcdd Production landing and tracker); Verified: not recorded; Data: n/a` | parent | none |
| F10 | Parents had no billing view | Closed in code: read-only Billing tab (tracker ADR 0049) | REQ-25, PR #74 | `Merged: yes (2026-10-16, PR #74 8eb6720); Migration: n/a; Deployed: yes (2026-10-16, 625dca5 Production landing and tracker); Verified: not recorded; Data: n/a` | parent | Share the Notion integration with Invoices and Missed Sessions & Credits, then check one real family |
| F11 | No written, tested permission contract across the five roles | Permission matrix, ADR and RLS tests | REQ-32, PRs #84, #85 | `Merged: yes (2026-10-19, PRs #84 b851bb3 and #85 48555e6); Migration: yes (2026-10-19, 0020_audit_log_reader_scope.sql per root CLAUDE.md); Deployed: yes (2026-10-19, 48555e6 Production landing and tracker); Verified: not recorded; Data: n/a` | teacher, student, parent | none (Charlie, 2026-10-16: scheduling-only teachers see assigned students only) |
| F12 | Nothing is loaded live and no screen says what is missing | Owner setup page | REQ-33, PRs #90, #92 | `Merged: yes (2026-10-19, PRs #90 e67e3ad and #92 170adbd); Migration: yes (2026-10-19, 0021_setup_checks.sql per root CLAUDE.md); Deployed: yes (2026-10-19, 170adbd Production landing and tracker); Verified: not recorded; Data: not recorded` | owner | Open the setup page and record what it shows |
| F13-1 | Landing lint is not gated and the docs name the wrong hosting region | Lint fixes, CI patch, region corrected | REQ-29, PR #78 | `Merged: yes (2026-10-16, PR #78 453f2ee); Migration: n/a; Deployed: yes (2026-10-17, 2bc666a Production landing and tracker); Verified: not recorded; Data: n/a` | parent | Apply the CI and pipeline.json patches from the PR (ci.yml line 28 still says landing lint is not gated) |
| F13-2 | Readiness state is spread across CLAUDE.md, PLAN.md, card statuses and the review | This register | REQ-37 | `Merged: no; Migration: n/a; Deployed: n/a; Verified: n/a; Data: n/a` | owner | none |

Verification column seeds: F03 "unit tests in PR #77"; F04 `supabase/tests/notion_outbox.sql`; F05-1 "ADR reviewed in PR #76"; F05-2 `supabase/tests/people_sync.sql`; F06 `supabase/tests/student_notion_link.sql`; F07 `supabase/tests/occurrence_outcomes.sql`; F08 `supabase/tests/scheduler_locked_writes.sql`; F09 `supabase/tests/class_purpose.sql`; F10 "unit and e2e tests in PR #74"; F11 `supabase/tests/permission_matrix.sql`; F12 `supabase/tests/setup_checks.sql`; F13-1 "landing region test in PR #78"; F13-2 "commands pasted in this card's PR"; F01 and F02 "No design yet". Card IDs appear only in the Card and PR column.

### Audience gates

Each gate also requires the gate before it to be Released. Items not taken from the review text say "(derived)" in Source.

- Gate 0, owner rehearsal: the `main` head has a Production deployment for both projects; every file in `supabase/migrations/` is in the root `CLAUDE.md` applied list; `tracker` is in Exposed schemas, backup secrets are set, one backup has run, a restore drill is done and Supabase is on Pro (PLAN "Before real students" items 1 to 3); Charlie fills the Results table of `apps/tracker/docs/scheduler-tutorial.md`; F03 and F12 are Verified. Source: PLAN, tutorial, F03, F12 (derived).
- Gate 1, teachers: F02, F04, F05-2, F08 and F11 are deployed and Verified; every teacher has a staff link and availability (the F12 setup page shows those rows Done). Source: F02, F04, F05, F08, F11, F12 (derived).
- Gate 2, students: F11 is deployed; F13-1's region text is live on the privacy page; under-16 consent is decided (PLAN item 5). Source: F11, F13, PLAN (derived).
- Gate 3, parents: F06, F09 and F10 are deployed and checked with one real family; the Notion integration is shared with Invoices and Missed Sessions & Credits; parent links exist; F01 and F07 are resolved, or Charlie records that parents launch without them. Source: F01, F06, F07, F09, F10, F12 (derived).
- Every row: Signs off "Charlie", State "Closed".

### Root `CLAUDE.md`

One new Layout table row after `docs/spec/`: `| docs/readiness.md | findings register and audience gates, from merged to released | [docs/readiness.md](docs/readiness.md). Builder updates Production status when a card ships. Only Charlie releases a gate. |`. No rule text changes.

### `apps/tracker/docs/PLAN.md`

- After the opening paragraph: "Deployment and readiness, finding by finding: [`../../../docs/readiness.md`](../../../docs/readiness.md)."
- Every "not applied" note for a migration in the root `CLAUDE.md` applied list is rewritten to that list's date (11 notes: Step 2 row 0004 applied 2026-10-04; REQ-3 0010 applied 2026-10-14; REQ-15 0014 applied 2026-10-15; REQ-22 0015 and 0016 applied 2026-10-16; REQ-26 0017 applied 2026-10-16; REQ-30 0018 applied 2026-10-17; REQ-31 0019 applied 2026-10-17; REQ-32 0020 applied 2026-10-19; REQ-33 0021_setup_checks applied 2026-10-19; REQ-35 0021_notion_outbox applied 2026-10-20; REQ-38 0022 applied 2026-10-20).

## Migration

None.

## Test plan

No test file (the card puts code out of scope, Decision 4). The builder runs each command and pastes the output into the PR body.

| Test | Covers |
|---|---|
| `grep -nE '^(# \|## \|As of )' docs/readiness.md` lists the parts in order | AC1 |
| Reviewer reads Rules against AC2 (a) to (f) | AC2 |
| `grep -cF` on the AC3 header prints 1; the ID grep prints the 15 IDs in order | AC3 |
| Per-card count loop over REQ-25..REQ-40 (skip 27) prints 1 each | AC4 |
| Production status cells checked against the AC5 pattern print nothing | AC5 |
| `merged_at`, migration file, applied list, deployment and ancestry checks | AC6 |
| Reviewer compares cells with the seed; differences listed in the PR body | AC7 |
| Gates header count 1; four Gate rows with Charlie and Closed | AC8 |
| Links resolve; `grep -nE 'not (yet )?applied' apps/tracker/docs/PLAN.md` prints nothing | AC9 |
| No em-dash, no "bug-free", "bug free", "guarantee" | AC10 |
| `git diff --name-only origin/main` lists only the four files | AC11 |

## Out of scope

Any code, including a test file, a CI check or a sweep step that fills or checks the register. Changes to `.claude/agents/*.md`, `PIPELINE.md` or the sweep. Retrying failed Vercel builds. Committing the review text. Opening any gate. Copying card status from the board. Any `PLAN.md` edit other than the link line and the "not applied" notes for applied migrations.

## Decisions (defaults stand)

1. No new dependencies. 2. No schema. 3. Production status is one cell with five labelled stages. 4. No code; commands and reviewer checks. 5. One row per finding and card (15 rows). 6. Rewrite every PLAN note for an applied migration. 7. `owner` is an allowed audience value. 8. F06 Verified is `reported`. 9. Deployed `yes` via the first later deploy that contains the merge. 10. The builder may change any stage whose new value passes AC6. 11. Merged follows the feature PR. 12. F07 records the approved REQ-39 design. 13. CLAUDE.md link is a Layout table row. 14. Gate items derived and marked. 15. Gates are sequential. 16. Maintenance rule lives in the register only.
