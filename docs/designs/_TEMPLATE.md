# <CARD-ID>: <Title>

**Summary:** one sentence on what changes for the user.
**Risk:** Low / Medium / High (why; High only for auth, permissions or RLS changes, payments, personal data to a new destination, deleting or rewriting rows, or anything irreversible)

## Problem
What the requirement asks for and who it is for (tutor, student, parent).

## Acceptance criteria
- [ ] AC1: testable statement
- [ ] AC2: testable statement

## Approach
- Files to change, with real paths, and what changes in each.
- New files and why they are needed.
- UI: the screen(s) affected, the states (empty, loading, error, success), and a short text sketch of the layout.

## Migration
Write "None" if the design needs no table, column, policy or trigger. Otherwise:
- File: `supabase/migrations/NNNN_<slug>.sql` (the next free number)
- Creates: tables, columns, functions, RLS policies, grants, triggers
- Check: `supabase/tests/<name>.sql` and what it proves
- Ships as its own PR first (`req/<CARD-ID>-migration`, human-merged and applied). The feature PR below assumes it is live.

## Test plan
| Test | Type (unit / integration / e2e) | Covers |
|---|---|---|
| ... | ... | AC1 |

## Out of scope
What this deliberately does not do.

## Risks and edge cases
What could go wrong, and how the approach handles it.

## Decisions for approval
Every call a reviewer could otherwise raise mid-review, with the default the builder will use if the approver says nothing. A card approved without a comment approves the defaults.

| # | Decision | Options | Default if you say nothing |
|---|---|---|---|
| 1 | New dependencies (name, version, why) | ... or None | ... |
| 2 | Schema placement (schema, table, migration number, RLS in one line) | ... or None | ... |
| 3 | Anything a reviewer could call "not in the design" | ... | ... |
