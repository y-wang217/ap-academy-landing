# Readiness register

As of 2026-10-20 (the build date). Sources: GitHub PRs and deployments, the root [`CLAUDE.md`](../CLAUDE.md) applied list, the Notion board. Source review: readiness review 2026-10-16.

One record per review finding, from code merged to audience released. The design is [`designs/REQ-37.md`](designs/REQ-37.md).

## Rules

- When a card ships, the builder updates that row's Production status in the same PR or the next docs PR.
- Only Charlie changes a gate's State.
- A gate is Released only with a named date (YYYY-MM-DD) and an evidence link.
- A stage nobody has evidence for is `not recorded`, never `yes`.
- "Verified" means the named check passed on the named date. This register does not claim that the software has no bugs.
- Card status lives on the Notion board and is not copied here.

## Vocabulary

Values for each stage:

- `yes (YYYY-MM-DD, evidence)`: done on that date, with the PR, commit or file that shows it.
- `failed (YYYY-MM-DD, evidence)`: tried on that date and it did not work.
- `reported (who, YYYY-MM-DD)`: someone said it was done, with no evidence link yet.
- `no`: not done.
- `not recorded`: nobody has evidence either way.
- `n/a`: the work does not need this stage.

Evidence never holds `;` or `)`.

Stages, in the order of the Production status cell:

- Merged: the card's feature PR merged to `main`. The date is the UTC `merged_at` of the feature PR. A migration PR is cited in the same cell but does not count alone.
- Migration: applied live, per the root `CLAUDE.md` applied list. It is `n/a` when the card's design says Migration None, and `not recorded` when the card has no design yet.
- Deployed: a successful Vercel Production deployment of the merge commit or a later commit that contains it. It is `n/a` for docs-only work.
- Verified: the shipped behaviour was checked live (trigger, Notion sharing, cron, page).
- Data: real rows loaded. It is `n/a` when the work needs none.

Audience values: owner, teacher, student, parent, comma separated.

## Findings register

| ID | Finding | Resolution | Card and PR | Verification | Production status | Audience | Owner decision |
|---|---|---|---|---|---|---|---|
| F01 | Monthly billing counts sessions from Weekly Schedule free text | Structured billing input with reconciliation (tracker ADR 0060) | REQ-40, PR #106 | Unit tests, fixture month and e2e in PR #106 | Merged: no; Migration: n/a; Deployed: no; Verified: no; Data: n/a | parent | Review and merge PR #106 (needs-human-merge); then run both counts for one full month |
| F02 | The Notion Weekly Schedule does not say it is generated after adoption | Generated header and owner drift notice | REQ-34 | No design yet | Merged: no; Migration: not recorded; Deployed: no; Verified: no; Data: n/a | owner | Answer the open questions on the card |
| F03 | A calendar save shows "Saved." when the Weekly Schedule export failed | Each export result shown, with Retry | REQ-28, PR #77 | Unit tests in PR #77 | Merged: yes (2026-10-16, PR #77 baae0f9); Migration: n/a; Deployed: yes (2026-10-17, 2bc666a Production landing and tracker); Verified: not recorded; Data: n/a | owner | none |
| F04 | A class save and its Notion exports are not durable together | Notion outbox with retry | REQ-35, PRs #89, #94 | `supabase/tests/notion_outbox.sql` | Merged: yes (2026-10-20, PRs #89 4929951 and #94 edea79c); Migration: yes (2026-10-20, 0021_notion_outbox.sql per root CLAUDE.md); Deployed: yes (2026-10-20, d79aa3c Production landing and tracker); Verified: not recorded; Data: n/a | owner, teacher | none |
| F05-1 | Staff and student names are read live from Notion with no staleness record | ADR: Notion edits people, Supabase holds synced copies (option B) | REQ-36, PR #76 | ADR reviewed in PR #76 | Merged: yes (2026-10-16, PR #76 625dca5); Migration: n/a; Deployed: n/a; Verified: n/a; Data: n/a | teacher, parent | none (Charlie chose option B, 2026-10-16) |
| F05-2 | Same finding | People sync into local copies | REQ-38, PRs #91, #93 | `supabase/tests/people_sync.sql` | Merged: yes (2026-10-20, PRs #91 492911c and #93 62fc585); Migration: yes (2026-10-20, 0022_people_sync.sql per root CLAUDE.md); Deployed: yes (2026-10-20, 62fc585 Production landing and tracker); Verified: not recorded; Data: not recorded | teacher, parent | Run the first live sync and record it |
| F06 | A teacher could change a student's Notion record link | Closed: owner-only guard trigger (tracker ADR 0048) | REQ-26, PRs #72, #73, #75 | `supabase/tests/student_notion_link.sql` | Merged: yes (2026-10-16, PRs #72 87ffb43 and #73 94fa18c); Migration: yes (2026-10-16, 0017_student_notion_link_owner_only.sql per root CLAUDE.md); Deployed: yes (2026-10-16, 94fa18c Production landing and tracker); Verified: reported (Charlie, 2026-10-16); Data: n/a | teacher, parent | Add an evidence link for the live trigger check |
| F07 | Planned classes are never linked to delivered lessons | Lesson link with attendance states, no payout side effects | REQ-39, PRs #96, #97 | `supabase/tests/occurrence_outcomes.sql` | Merged: yes (2026-10-20, PR #97 7356042); Migration: yes (2026-10-20, 0023_occurrence_outcomes.sql per root CLAUDE.md); Deployed: yes (2026-10-20, Vercel production deployment 7208887234 of 7356042 for ap-academy-tracker); Verified: no; Data: n/a | teacher, parent | Verify on production (the live Lessons database has no Class occurrence property yet, so linking returns lessons_not_ready) |
| F08 | Booking checks run before the write and are not atomic | Locked, revalidated class writes | REQ-30, PRs #79, #80 | `supabase/tests/scheduler_locked_writes.sql` | Merged: yes (2026-10-17, PRs #79 7d466e6 and #80 2bc666a); Migration: yes (2026-10-17, 0018_scheduler_locked_writes.sql per root CLAUDE.md); Deployed: yes (2026-10-17, 2bc666a Production landing and tracker); Verified: not recorded; Data: n/a | owner, teacher | none |
| F09 | The parent calendar says Done for any past class and Makeup for every one-off | Past, and a declared purpose | REQ-31, PRs #81, #82 | `supabase/tests/class_purpose.sql` | Merged: yes (2026-10-17, PRs #81 1ba7cc3 and #82 c35fcdd); Migration: yes (2026-10-17, 0019_class_purpose.sql per root CLAUDE.md); Deployed: yes (2026-10-17, c35fcdd Production landing and tracker); Verified: not recorded; Data: n/a | parent | none |
| F10 | Parents had no billing view | Closed in code: read-only Billing tab (tracker ADR 0049) | REQ-25, PR #74 | Unit and e2e tests in PR #74 | Merged: yes (2026-10-16, PR #74 8eb6720); Migration: n/a; Deployed: yes (2026-10-16, 625dca5 Production landing and tracker); Verified: not recorded; Data: n/a | parent | Share the Notion integration with Invoices and Missed Sessions & Credits, then check one real family |
| F11 | No written, tested permission contract across the five roles | Permission matrix, ADR and RLS tests | REQ-32, PRs #84, #85 | `supabase/tests/permission_matrix.sql` | Merged: yes (2026-10-19, PRs #84 b851bb3 and #85 48555e6); Migration: yes (2026-10-19, 0020_audit_log_reader_scope.sql per root CLAUDE.md); Deployed: yes (2026-10-19, 48555e6 Production landing and tracker); Verified: not recorded; Data: n/a | teacher, student, parent | none (Charlie, 2026-10-16: scheduling-only teachers see assigned students only) |
| F12 | Nothing is loaded live and no screen says what is missing | Owner setup page | REQ-33, PRs #90, #92 | `supabase/tests/setup_checks.sql` | Merged: yes (2026-10-19, PRs #90 e67e3ad and #92 170adbd); Migration: yes (2026-10-19, 0021_setup_checks.sql per root CLAUDE.md); Deployed: yes (2026-10-19, 170adbd Production landing and tracker); Verified: not recorded; Data: not recorded | owner | Open the setup page and record what it shows |
| F13-1 | Landing lint is not gated and the docs name the wrong hosting region | Lint fixes, CI patch, region corrected | REQ-29, PR #78 | Landing region test in PR #78 | Merged: yes (2026-10-16, PR #78 453f2ee); Migration: n/a; Deployed: yes (2026-10-17, 2bc666a Production landing and tracker); Verified: not recorded; Data: n/a | parent | Apply the CI and pipeline.json patches from the PR (ci.yml line 28 still says landing lint is not gated) |
| F13-2 | Readiness state is spread across CLAUDE.md, PLAN.md, card statuses and the review | This register | REQ-37 | Commands pasted in this card's PR | Merged: no; Migration: n/a; Deployed: n/a; Verified: n/a; Data: n/a | owner | none |
| F14 | The auth callback's local `safeNext` accepts `/\host` and control characters (`apps/landing/app/auth/callback/route.ts` line 5) | Switch it to `safeNextPath` from `@ap-academy/db/paths` (`packages/db/src/paths.ts`) | Found in REQ-53 design (Decision 5), follow-up card not filed yet | No design yet | Merged: no; Migration: not recorded; Deployed: no; Verified: no; Data: n/a | owner, teacher, student, parent | File the follow-up card |

## Audience gates

Each gate also needs the gate before it to be Released. Items marked "(derived)" were drafted from the cards, the ADRs, PLAN and the tutorial, because the review text is not in the repo or in Notion. Charlie edits the wording.

| Gate | Acceptance items | Source | Signs off | State |
|---|---|---|---|---|
| Gate 0 owner rehearsal | The `main` head has a Production deployment for both projects. Every file in `supabase/migrations/` is in the root `CLAUDE.md` applied list. `tracker` is in Exposed schemas, the backup secrets are set, one backup has run, a restore drill is done and Supabase is on Pro (PLAN "Before real students" items 1 to 3). Charlie fills the Results table of `apps/tracker/docs/scheduler-tutorial.md`. F03 and F12 are Verified. | PLAN, tutorial, F03, F12 (derived) | Charlie | Closed |
| Gate 1 teachers | F02, F04, F05-2, F08 and F11 are deployed and Verified. Every teacher has a staff link and availability (the F12 setup page shows those rows Done). | F02, F04, F05, F08, F11, F12 (derived) | Charlie | Closed |
| Gate 2 students | F11 is deployed. F13-1's region text is live on the privacy page. Under-16 consent is decided (PLAN item 5). | F11, F13, PLAN (derived) | Charlie | Closed |
| Gate 3 parents | F06, F09 and F10 are deployed and checked with one real family. The Notion integration is shared with Invoices and Missed Sessions & Credits. Parent links exist. F01 and F07 are resolved, or Charlie records that parents launch without them. | F01, F06, F07, F09, F10, F12 (derived) | Charlie | Closed |
