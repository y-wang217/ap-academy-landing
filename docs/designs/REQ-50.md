# Design: REQ-50: Pipeline: count only Building cards toward wip_limit

Card: https://app.notion.com/p/3fed6ae73dd781889706eea9fc7cc037
Approved by the design approver on 2026-10-19 (sha:61e7fd44ed42). No open gaps.

**Summary:** The builder and design-next count only **Building cards whose PR property is empty** against `wip_limit`, so neither a PR waiting on review or merge nor a builder fixing an existing PR holds a slot. ADR 0003 gets a dated amendment saying the same.

**Risk:** Low (Markdown instructions for the agents and one ADR. No app code, schema, permission, hook, workflow or `pipeline.json` change.)

## Problem

`.claude/agents/builder.md` line 15 counts "Building + In Review + Changes Requested" against `wip_limit`, and `.claude/commands/design-next.md` K6 uses the same count to decide whether to kick `ap-build`. A PR waiting on the bot reviewer, on CI or on a human merge holds a slot, so a second builder stays idle even when the limit is raised. A builder fixing an existing PR (a Changes Requested card) is not a new card in flight and must not hold a slot either.

Facts checked on `main` for this design:

- `wip_limit` in `.claude/pipeline.json` is already **3** (ad047a6, 2026-10-18), not 1 as the card says.
- The count rule is stated in `builder.md` line 15 and `design-next.md` K6 only. `PIPELINE.md` line 59 says "WIP allows" without a rule. Root `CLAUDE.md` does not mention WIP. Specs under `docs/spec/` are verbatim records and are not edited.
- A builder's claim sets Status **Building** for both Approved and Changes Requested cards, so Status alone cannot tell a new build from a review fix.
- The **PR** property tells them apart: a new card has none until `builder.md` step 8; a Changes Requested card always has one (written by the builder, or filled by the sweep, `pipeline-sweep.md` step 2).

## Acceptance criteria

- [ ] AC1: `builder.md`'s "Respect `wip_limit`" rule says the count is cards in **Building** whose **PR** property is empty, and that In Review and Changes Requested cards do not occupy a slot. "Building + In Review + Changes Requested" no longer appears in the file.
- [ ] AC2: The same rule says a Changes Requested card does not count before or after a builder claims it: once claimed it is in Building but already has a PR. "Which card" steps 1 and 2 are unchanged.
- [ ] AC3: `design-next.md` K6 kicks `ap-build` when a card is in **Changes Requested**, or a card is in **Approved** while the number of Building cards with an empty PR property is below `wip_limit`. The old string no longer appears.
- [ ] AC4: The `PIPELINE.md` kicks-table row says what "WIP allows" means: fewer Building cards with an empty PR property than `wip_limit`. No other `PIPELINE.md` line changes.
- [ ] AC5: `grep -rn "In Review + Changes Requested" .claude PIPELINE.md CLAUDE.md docs/adr` prints nothing.
- [ ] AC6: ADR 0003 has a new last section `## Amendment 2026-10-19: wip_limit counts Building only (REQ-50)` stating (a) the Building-with-no-PR count; (b) the read-then-act race and that Claimed by still keeps builders off the same card; (c) a real queue or lock is still the fix at 3 or more; (d) `wip_limit` is already 3 (ad047a6), so the queue is an open follow-up.
- [ ] AC7: The ADR 0003 "Revisit this decision if" `wip_limit` bullet points to the amendment. Context, Decision and Status are not rewritten.
- [ ] AC8: The diff touches only `builder.md`, `design-next.md`, `PIPELINE.md`, ADR 0003 and this file.
- [ ] AC9: "empty PR property" or "PR property is empty" appears in `builder.md`'s WIP rule, `design-next.md` K6 and the `PIPELINE.md` kicks row.

## Approach

- `builder.md` line 15: replace the rule with the Building-with-empty-PR count, including the claimed Changes Requested sentence.
- `design-next.md` K6: "while fewer cards are in **Building** with an empty PR property than `wip_limit` (In Review, Changes Requested and review fixes already holding a PR do not count)".
- `PIPELINE.md` line 59: append "(fewer Building cards with an empty PR property than `wip_limit`)" after "WIP allows".
- ADR 0003: append the pointer to the Revisit bullet, and the amendment section at the end.

## Test plan

Instruction text only; every path is in `gate_ignore_paths`. The builder runs the grep and diff commands for AC1 to AC9 and pastes the output into the PR body.

## Risks and edge cases

- **Read-then-act race.** Two runs starting together can both see a free slot and run one over the limit. Claims stop them taking the same card. Recorded in the ADR.
- **Slot frees once the PR opens, during the CI loop.** Accepted (Decision 7).
- **Card with a migration.** The PR property is the feature PR, so the build counts until the feature PR opens.
- **Stale PR property** on a card moved back to Approved by hand can undercount by one. Rare; noted, not handled (Decision 9).

## Decisions (approved defaults)

1. No new dependencies. 2. No schema. 3. ADR 0003: both a pointer on the Revisit bullet and a dated amendment. 4. Record the real `wip_limit` (3) and mark the queue an open follow-up. 5. Edit `builder.md`, `design-next.md`, the `PIPELINE.md` kicks row and ADR 0003 only. 6. A claimed Changes Requested card never counts. 7. A new build stops counting once its PR opens. 8. Commands pasted in the PR, no test file. 9. Detect "already has a PR" from the card's PR property.
