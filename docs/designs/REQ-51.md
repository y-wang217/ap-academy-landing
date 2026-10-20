# Design: REQ-51: Reserve migration and ADR numbers against work in flight

Card: https://app.notion.com/p/3ffd6ae73dd7813a8c06db6de236329e
Approved by the design approver on 2026-10-20 (sha:bd8e8fbcc8b4) after one revise round. No open gaps.

**Summary:** designers and builders reserve a migration or ADR number against `main`, every open `req/` PR and every in-flight card before using it, reviewers treat stale numbers in prose as nits and duplicate file numbers as blockers, and migration PRs declare their dependencies.

**Risk:** Low (instruction and documentation files only; no code, no migration, no workflow, hook, settings or `pipeline.json` change; nothing in `human_merge_paths`).

## Problem

With `wip_limit: 3` (ad047a6) up to three designers and builders read `main` at once and each takes "the next free" number. The 2026-10-19 batch produced two `0021_*.sql` files (`0021_notion_outbox.sql`, `0021_setup_checks.sql`, both live) and three tracker ADRs that all claimed 0053/0054. The bot reviewer then spent whole rounds on stale numbers (PR #97, PR #93, cleanup PR #104). The failure is still live: open PR #101 (REQ-42) adds `apps/tracker/docs/decisions/0056-iris-tracker-module.md`, while `main` already has `0056-lesson-link-and-outcomes.md`.

Today's rule lives in one place: `.claude/agents/designer.md` step 4 ("the next free `supabase/migrations/NNNN_<slug>.sql`"), which only looks at `main`. `.claude/agents/builder.md` "Card with a migration" never re-checks, `.claude/agents/reviewer.md` says nothing about numbers, and `docs/adr/0004-notion-edits-people-supabase-reads-local.md` "Numbering" says "the file on `main` wins".

## Acceptance criteria

- [ ] AC1: `.claude/agents/designer.md`, `.claude/agents/builder.md`, `.claude/agents/reviewer.md` and `PIPELINE.md` each contain the canonical **Number reservation** paragraph below, byte for byte, exactly once.
- [ ] AC2: In `designer.md`, the step-4 line (starting `4. **Migration.**`) reads "`supabase/migrations/NNNN_<slug>.sql` with a number reserved under **Number reservation** below" in place of "the next free `supabase/migrations/NNNN_<slug>.sql`", and the file no longer contains the phrase "the next free". The **Number reservation** subsection adds the designer's step: query the board with `Status NOT IN ('Done','Backlog')` excluding this card, read each card's Migration section and ADR numbers, combine with `main` and open PR files in one pass, and take the first number none of them use.
- [ ] AC3: `builder.md` contains, verbatim: B1 "Re-check the number under **Number reservation** before committing a migration or ADR file." twice ("Card with a migration" step 1 and "New card (Approved)" step 4); B2 "Re-check it again immediately before `gh pr create`." once (step 7); and B3 "On a clash, take the next free number and, in one commit, `git mv` the file and update `docs/designs/<card-id>.md`, every doc that cites the number, the PR title and the PR body line `Renumbered: <old> to <new> (taken by #<pr>)`." once.
- [ ] AC4: `builder.md` contains, verbatim and once, B4 "After `gh pr create`, list open `req/` PRs once more; if a lower-numbered PR claims the same number, renumber as above and push." in "New card (Approved)" right after step 7.
- [ ] AC5: `builder.md` "Card with a migration" requires the migration PR body to carry a line `Depends on: none` or `Depends on: #<pr> (<NNNN_slug>), ...` listing the other open, unapplied migration PRs whose objects this file references.
- [ ] AC6: In `reviewer.md`, the checklist line starting `5. **Scope hygiene.**` ends with, verbatim, R1 "A stale migration or ADR number cited in a PR body, comment or doc is a non-blocking nit: list it under **Nits** and never make it the sole reason for changes requested." and R2 "A migration or ADR file whose number duplicates a different file on `main` or in another open PR is blocking." The Verdict section gains one bullet, verbatim, R3 "A review whose only findings are stale migration or ADR numbers is an approval, with those numbers listed under **Nits** in the approve body." No other review rule changes; "When unsure, request changes" stays.
- [ ] AC7: `docs/adr/0003-event-chained-pipeline.md` has a section `## Amendment 2026-10-20: numbers reserved against work in flight (REQ-51)` that states the rule, cites the 2026-10-19 batch as the motive, says the numbering race no longer needs a queue, and says the queue or lock for the `wip_limit` slot count remains an open follow-up.
- [ ] AC8: The REST commands in the canonical paragraph run in a cloud session and list this repo's open `req/` PRs and their added migration and ADR files.
- [ ] AC9: The diff touches only `.claude/agents/designer.md`, `.claude/agents/builder.md`, `.claude/agents/reviewer.md`, `PIPELINE.md`, `docs/adr/0003-event-chained-pipeline.md` and `docs/designs/REQ-51.md`.

## Approach

**The canonical paragraph.** Pasted verbatim into the four instruction files (AC1). Each file then adds its own role step around it; the paragraph itself never varies.

```markdown
**Number reservation (REQ-51).** A migration number (`supabase/migrations/NNNN_<slug>.sql`) or ADR number (`docs/adr/NNNN-*.md`, `apps/<app>/docs/decisions/NNNN-*.md`) is taken when `main`, any open `req/` PR, or the design of any board card whose Status is neither Done nor Backlog already uses it in the same folder. The same full path on two branches is one file, not a clash; the same number with a different slug is a clash. Use the first number nothing uses. Check with the REST API, because `gh pr list` (GraphQL) does not work in cloud sessions: `gh api 'repos/<repo>/contents/<folder>?ref=main' --jq '.[].name'` for `main`, `gh api 'repos/<repo>/pulls?state=open&per_page=100' --jq '.[] | select(.head.ref|startswith("req/")) | .number'` for open PRs, and `gh api 'repos/<repo>/pulls/<n>/files?per_page=100' --jq '.[].filename'` for each PR's files (the GitHub MCP `list_pull_requests` and `pull_request_read` return the same). When two open PRs claim one number, the PR with the lower PR number keeps it and the other renumbers. A stale number cited in prose is a nit; a duplicate file number is a blocker.
```

**`.claude/agents/designer.md`**
- Step 4 (Migration): replace "the next free `supabase/migrations/NNNN_<slug>.sql`" with "`supabase/migrations/NNNN_<slug>.sql` with a number reserved under **Number reservation** below" (exact text in AC2). Add the same reference to any tracker or workspace ADR number the design names.
- Add a short subsection **Number reservation** under "How to design" with the canonical paragraph, then the designer's step: query the board (SQL, `Status NOT IN ('Done','Backlog')`, excluding this card), fetch each card that has a design, and read its Migration section and any ADR numbers; combine with `main` and open PR files in one pass; write the chosen number into the design and list it in **Decisions for approval** row 2 as today. The designer uses `gh api` only (no `git fetch`), which keeps it within its read-only rule.

**`.claude/agents/builder.md`**
- Add the canonical paragraph once under a new **Number reservation** subsection, followed by sentence B3 (the renumber procedure). Add B1 to "Card with a migration" step 1 and to "New card (Approved)" step 4, B2 to "New card (Approved)" step 7, and B4 as a line right after step 7 (exact sentences in AC3 and AC4).
- Renumber procedure (AC3): `git mv` the file, update `docs/designs/<card-id>.md`, every doc that cites the number in the diff, the PR title for migration PRs (`<card-id>: migration <NNNN> <slug>`), and the PR body's "Renumbered: 0056 to 0059 (taken by #101)" line, all in one commit. For a feature PR based on `req/<card-id>-migration`, renumber on the migration branch and rebase the feature branch on it.
- Post-open check (AC4): after `gh pr create`, list open PRs once more; on a clash with a lower-numbered PR, renumber and push.
- "Card with a migration" step 1: add the `Depends on:` line (AC5). Dependency means an object reference (table, function, type, schema) to a migration that sits in another open PR and is not yet on `main`; a lower number alone is not a dependency, since the live history already tolerates out-of-order apply (0023, 0022, 0021 on 2026-10-20).

**`.claude/agents/reviewer.md`**
- Checklist item 5 (Scope hygiene) gains sentences R1 and R2 at the end of its line (AC6). The Verdict section gains bullet R3 after the Approve bullet. R3 applies to stale migration or ADR numbers only; other nits keep today's behaviour. The canonical paragraph sits under a short **Number reservation** heading so the reviewer has the same REST commands to confirm a duplicate.
- `.github/workflows/claude-review.yml` already says "Follow .claude/agents/reviewer.md exactly", so no workflow change is needed.

**`PIPELINE.md`**
- Under "Daily use", the migration bullet gains: "Each migration PR body lists `Depends on:`; apply a batch in that order." Add the canonical paragraph as a **Number reservation** bullet right after it.

**`docs/adr/0003-event-chained-pipeline.md`**
- Append the amendment (AC7) after the 2026-10-19 amendment: the rule, the motive (two 0021 files, three ADRs on 0053/0054 renumbered to 0054 to 0056, PRs #93, #97, #104, and #101), the tie-break, and the status line: "The numbering race is closed by reservation plus the builder re-check. The queue or lock for the `wip_limit` slot count stays an open follow-up." It also notes that it extends the "Numbering" note in ADR 0004.

No UI.

## Migration

None.

## Test plan

Documentation changes outside every gate path (`gate_ignore_paths` covers `docs/`, `.claude/`, `PIPELINE.md`), so the checks are shell commands the builder runs and pastes, with output, into the PR body.

| Test | Type | Covers |
|---|---|---|
| `grep -cF '**Number reservation (REQ-51).** A migration number'` prints `1` in each of the four files, and the extracted paragraph is identical across them | doc check | AC1 |
| The `4. **Migration.**` line contains "a number reserved under **Number reservation** below"; `grep -cF 'the next free' designer.md` prints 0; `grep -cF "Status NOT IN ('Done','Backlog')" designer.md` prints 1 | doc check | AC2 |
| `grep -cF` in `builder.md`: B1 prints 2, B2 1, B3 1, B4 1 | doc check | AC3, AC4 |
| `grep -n 'Depends on:' .claude/agents/builder.md PIPELINE.md` returns the migration PR step and the Daily use bullet | doc check | AC5 |
| The `5. **Scope hygiene.**` line contains R1 and R2; `grep -cF` R3 on `reviewer.md` prints 1 | doc check | AC6 |
| `grep -n '^## Amendment 2026-10-20' docs/adr/0003-event-chained-pipeline.md` matches, and the section mentions `2026-10-19`, `wip_limit` and "open follow-up" | doc check | AC7 |
| Run the three `gh api` commands from the paragraph against `y-wang217/ap-academy-landing`; output lists open `req/` PRs and their files | integration (live, read-only) | AC8 |
| None of B1 to B4, R1 to R3, "a number reserved under" or "Status NOT IN" occurs in the canonical paragraph | doc check | AC2, AC3, AC4, AC6 |
| `git diff --name-only origin/main...HEAD` lists exactly the six files in AC9 | scope check | AC9 |

## Out of scope

- Renumbering the two applied 0021 files or any shipped ADR.
- Fixing the live ADR 0056 clash in PR #101: that is REQ-42's builder's job.
- A queue or lock for `wip_limit` slots, or changing `wip_limit`.
- Hooks, settings, workflows, `pipeline.json`, `scripts/`, and `design-approver.md`.
- Editing ADR 0004's "Numbering" note or the root `CLAUDE.md` applied list.
- Any other review, approval or merge rule.

## Risks and edge cases

- **Two designers pick the same number in the same minute.** The builder re-check before commit and before PR open, plus the lower-PR-number tie-break after open, catches it; the reviewer blocks if both still slip through.
- **A feature PR carries its own migration file** (based on `req/<id>-migration`): the same full path is one file, not a clash.
- **A number reserved in a design but never built** (card stuck in Blocked) stays reserved until the card is Done or back in Backlog.
- **A numbering gap after a renumber** is harmless: `supabase/tests/run-rls.sh`, `scripts/restore.sh` and `scripts/restore-drill.sh` apply `supabase/migrations/*.sql` in glob order.
- **GraphQL is blocked in cloud sessions**; the paragraph gives REST commands and the MCP fallback.
- **Pagination.** `per_page=100` covers far more open PRs and files than the board ever holds.

## Decisions for approval

| # | Decision | Default |
|---|---|---|
| 1 | New dependencies | None |
| 2 | Schema placement | None |
| 3 | Numbering scheme | Keep four-digit sequential numbers plus reservation (timestamps would break `notify-human.yml`, the sweep's `NNNN_<slug>` match and the `CLAUDE.md` applied list) |
| 4 | Enforcement | Instruction text with REST commands, no `scripts/` helper |
| 5 | ADR folders covered | Every ADR folder: `docs/adr/` and `apps/<app>/docs/decisions/` |
| 6 | Tie-break between two open PRs | Lower PR number keeps it |
| 7 | Meaning of "Depends on" | Object references only |
| 8 | Statuses that reserve a number | All but Done and Backlog, Blocked included |
| 9 | Additions a reviewer could call "not in the design" | Post-open re-check and tie-break, the "Renumbered" PR body line, the **Nits** list for stale numbers only, the ADR 0003 note that it extends ADR 0004 |
| 10 | Nits-only reviews approve | Only for stale migration or ADR numbers (R3) |
