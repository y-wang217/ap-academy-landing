# Design: REQ-52 Founder Console placement ADR and data contract spec

Copied from the Notion card (Console 1/12) as approved on 2026-10-21
(`[design-approver] Approved at cap`, sha 9977642f4d4a). The **Open gaps**
section at the end lists the approver's required changes and how this build
closes each one.

**Summary:** Every later Console card gets one placement decision (workspace
ADR 0006: the console is `/tracker/console`, gated in the page the way the
owner setup page is) and one data contract spec
(`docs/spec/founder-console/02-data-contracts.md`). For each of the ten data
domains the spec gives the authority, the exact source, the adapter, the
freshness and the failure state. It also pins the north-star rule and the lead
write contract. The change is docs only.

**Risk:** Low. Every changed file is under `docs/`. No code, schema,
permission, dependency or live data changes. The permission surface itself
ships in REQ-53, which is High.

## Problem

REQ-53 to REQ-63 need cited, current contracts to design against: where the
console lives, how non-owners are rejected, and which Notion property or
`tracker` column backs each panel. Today that material sits on an unmerged
branch as discovery notes (`docs/spec/founder-console/01-discovery.md`, commit
`958e4c4` on `claude/compassionate-tesla-k5yxje`). Discovery notes are not a
decision. This card turns them into an ADR and a spec on `main`. It serves
Charlie (owner) and the pipeline's designers. No tutor, student or parent sees
any change.

## Acceptance criteria

- [ ] AC1: `02-data-contracts.md` has one section for each of the ten domains
  (leads and funnel stage, touches, trials, teacher capacity, delivered
  lessons and gaps, payment evidence, recurring hours, content work, signals,
  integration health). Each section has the same fields: **Authority**,
  **Source**, **Fields**, **Adapter today**, **Console read path**,
  **Freshness**, **Failure state**, **Owner card**.
  - **Source** is a Notion data source id, or a `tracker.<table>` with the
    migration file that creates it.
  - **Fields** are property names and types (with select options) from the
    live schema fetched on build day, or columns from the migration.
  - **Adapter today** is a file and its exported function. A domain with no
    adapter is marked `undiscovered` together with the command that shows the
    gap.
- [ ] AC2: A reviewer reading `docs/adr/0006-founder-console-placement.md`
  finds the route `/tracker/console`, the owner check (`getViewer()` in
  `apps/tracker/lib/data/queries.ts`, then `notFound()` as at
  `apps/tracker/app/scheduler/setup/page.tsx:20`), and a rejection table that
  gives, for each of a signed-out, teacher, student, parent, role-less and
  not-configured visitor requesting a console page and a console JSON route,
  the HTTP status code (307, 404, 403 or 503) and the file that returns it.
  RLS through `tracker.is_org_owner`
  (`supabase/migrations/0009_scheduler_staff_links.sql`) is the boundary under
  both.
- [ ] AC3: An overlap table lists REQ-33, 38, 39, 40 and 42 to 49. Each row
  says what the console reuses or must not duplicate. The Layer 2 setter plan
  (`/ops/setter`, `/ops/trials`) is recorded as out of scope, with the reuse
  boundary stated.
- [ ] AC4: Section `## 6. Risk register` of the spec is a table with the
  columns Risk, Domain and Owner, at least 17 rows. Each row's Owner cell
  names exactly one card among REQ-53 to REQ-63. A risk shared by two cards is
  split into one row per card. Script S1 prints nothing.
- [ ] AC5: (rewritten, Open gap 1 and 2) A reviewer reading section 5 of
  `02-data-contracts.md` takes the rule text and the ten or more fixture
  cases, recomputes each fixture's class (verified, unverified, excluded or
  unverifiable) and its verified and unverified minutes from the rule alone,
  and finds that every recomputed value matches the value the fixture states.
  The section gives:
  - the week boundary;
  - the inclusion and exclusion rules;
  - the table and column for each input;
  - the per-series verification rule, including how an ended series is
    classified after the student's stage leaves Onboarding or Active;
  - the verified, unverified and unverifiable outcomes;
  - at least ten worked fixture cases, each stating the student's stage, the
    invoice state, the class and the expected minutes.
- [ ] AC6: `git diff --name-only origin/main...HEAD` lists only paths under
  `docs/`.
- [ ] AC7: `git diff --quiet 958e4c4 HEAD -- docs/spec/founder-console/handoff
  docs/spec/founder-console/01-discovery.md
  docs/spec/founder-console/02-intake-receipt.md` exits 0.
- [ ] AC8: Every repo path cited in the ADR and the spec exists at the PR
  head, and every function cited has an `export` in the named file.
- [ ] AC9: `docs/readiness.md` row F07 records PR #97 as merged (2026-10-20,
  `7356042`), and its next step no longer asks for a review and merge of PR
  #97.
- [ ] AC10: The new docs contain no Notion row values: no person names, notes,
  phone numbers or amounts from Notion rows. Schema, non-person ids and counts
  only.

## Approach

- Branch `req/REQ-52-console-contracts` from `origin/main` (`b3f45e5`).
  Cherry-pick `958e4c4` (37 files under `docs/spec/founder-console/`). Do not
  edit `handoff/`, `01-discovery.md` or `02-intake-receipt.md`.
- `docs/spec/founder-console/README.md`: link `02-data-contracts.md` and ADR
  0006. The only edit to carried files.
- New `docs/adr/0006-founder-console-placement.md`, header shape of ADR 0004
  (Status Accepted; Decided by REQ-52 design approval, default C1, Charlie may
  supersede; Implemented by REQ-53; Card REQ-52). Sections: Context (observed,
  with paths), Decision, Rejection table, Options rejected, Consequences,
  Revisit when.
- New `docs/spec/founder-console/02-data-contracts.md`, sections: 1 Header and
  method, 2 Panel status vocabulary, 3 Ten domain sections, 4 Lead source rule
  and write contract, 5 North-star rule, 6 Risk register, 7 Board
  reconciliation, 8 Decisions for Charlie (C1 to C5), 9 Stale statements in
  the pack.
- North-star rule: week = `weekOf`, Monday to Sunday America/Toronto. Universe
  = `tracker.class_series` with `kind = 'weekly'`; every `one_off` excluded;
  `class_exceptions` never change recurring hours. Addition = `start_date` in
  W, `+duration_minutes`. Reduction = `effective_until + 1 day` in W,
  `-duration_minutes`. Verification is per series: verified when (a) its
  `notion_student_id` has a `student_people` row, (b) an Invoices row for that
  page id has `Status = Paid`, and (c) the stage is Onboarding or Active or
  the series has ended (`effective_until` set and before today). Otherwise
  unverified. A failed Invoices read makes the whole metric `unverifiable`.
- `docs/readiness.md` row F07 only: Merged yes (2026-10-20, PR #97
  `7356042`), Deployed from the Vercel production deployment if one exists,
  next step "Verify on production".

## Migration

None.

## Test plan

| Test | Type | Covers |
| --- | --- | --- |
| Each of the ten sections read against the AC1 field list; each `undiscovered` command runs and prints nothing | review | AC1 |
| Reviewer follows `apps/tracker/lib/notion/billing.ts` `P` map to the live Invoices schema and re-runs the lead-source query (card T1) | review | AC1 |
| ADR rejection table matched to `queries.ts` `Viewer` kinds, `setup/page.tsx:20`, `guard.ts`, `proxy.ts`, `packages/db/src/middleware.ts` `redirectKeepingCookies` | review | AC2 |
| Overlap table has a row for each of REQ-33, 38, 39, 40, 42 to 49 and the Layer 2 plan | review | AC3 |
| Script S1 prints nothing | script | AC4 |
| Reviewer recomputes all north-star fixtures from the rule text | review | AC5 |
| Card T3: every downstream assumption is in section 8 or cites a source | review | AC4, AC5 |
| `git diff --name-only origin/main...HEAD \| grep -v '^docs/'` prints nothing (card T2) | script | AC6 |
| `git diff --quiet 958e4c4 HEAD -- <carried files>; echo $?` prints 0 | script | AC7 |
| Path and export check prints nothing | script | AC8 |
| `grep -n "^\| F07" docs/readiness.md` shows "Merged: yes (2026-10-20, PR #97" | script | AC9 |
| Names in new files compared with Staff and Students & Parents titles; none match | review | AC10 |

Script S1 (AC4):

```bash
f=docs/spec/founder-console/02-data-contracts.md
rows=$(awk '/^## 6\. Risk register/{s=1;next} /^## /{s=0} s && /^\|/ && !/^\| *(Risk|:?-)/' "$f")
[ "$(printf '%s\n' "$rows" | grep -c .)" -ge 17 ] || echo "fewer than 17 risk rows"
printf '%s\n' "$rows" | awk -F'|' '{print $(NF-1)}' | while IFS= read -r o; do
  [ "$(printf '%s' "$o" | grep -oE 'REQ-[0-9]+' | wc -l)" -eq 1 ] && printf '%s' "$o" | grep -qE 'REQ-(5[3-9]|6[0-3])' || echo "owner not exactly one REQ-53..63 card: $o"
done
```

## Decisions for approval (defaults taken)

1. No new dependencies. 2. No migration; workspace ADR 0006. 3. Cherry-pick
`958e4c4` verbatim, images included. 4. Workspace ADR, not tracker ADR.
5. ADR Accepted with default C1. 6. Console writes are server actions by
default; a JSON write route needs a proxy-checked prefix (REQ-53 decides).
7. Any Paid invoice, at read time. 8. Splits net. 9. Keep the file name
`02-data-contracts.md`. 10. Readiness F07 only. 11. Docs-scope proof is a
script in the PR body. 12. One card. 13. Per-series verification, rules (a)
to (c).

## Open gaps

From `[design-approver] Approved at cap` (2026-10-21T20:55Z). Each is closed in
this build:

1. **AC5 too short to test.** Closed: AC5 above now names the actor (a
   reviewer reading section 5), the input (the rule text and the fixtures) and
   the observable result (recomputed class and minutes match the stated ones).
2. **Rewrite AC5's lead sentence the way AC2 was.** Closed by the same
   rewrite; the sub-bullets stay as the content list.
3. **Fixture 10 has no invoice state or stage.** Closed: fixture 10 in the
   spec states "stage: none (`not_synced`, no `student_people` row); invoice
   state: a Paid invoice exists" and its class follows from rule (a) alone.
   Fixture 11 adds the same student with no invoice, so the result is shown
   not to depend on the invoice.
4. **C3 restatement of 1 to 3.** Closed by 1 to 3.
