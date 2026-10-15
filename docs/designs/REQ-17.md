# REQ-17: Human merge for pipeline PRs that touch Notion write paths

Notion card: https://app.notion.com/p/3f9d6ae73dd781328e25d24659c63c9b

**Summary:** PRs that change the tracker's Notion HTTP layer or the daily-task route get `needs-human-merge` and stop auto-merging, because both directories are added to `human_merge_paths`. The `.claude/pipeline.json` change itself is committed by a human onto this branch, because the guard hook stops any agent from editing that file.

**Risk:** Low. Pipeline config and docs only; no app code, auth, RLS or data change. The PR carries `needs-human-merge` because a human must add the `pipeline.json` commit.

## Acceptance criteria
- AC1: `human_merge_paths` in `.claude/pipeline.json` has 18 entries: the 16 existing entries, unchanged and in order, then `apps/tracker/lib/notion/` and `apps/tracker/app/api/scheduler/daily-task/`. Still valid JSON.
- AC2: The Agent pipeline section of the root `CLAUDE.md` has exactly one new sentence naming both paths and saying PRs touching them carry `needs-human-merge`.
- AC3: `.claude/agents/builder.md` is not in the diff (step 7 is already a prefix rule).
- AC4: The PR body shows the full 18-entry list; the PR carries `pipeline` and `needs-human-merge`.
- AC5: The diff touches only `.claude/pipeline.json`, `CLAUDE.md` and `docs/designs/REQ-17.md`.

## Approach
- Builder: this design copy, plus one bullet after the guard hook bullet in "## Agent pipeline" of `CLAUDE.md`.
- Human: append the two entries to the end of `human_merge_paths` in `.claude/pipeline.json` (guard hook denies agents).

## Migration
None.

## Decisions (defaults taken)
1. Human adds the JSON commit to this branch. 2. Only the two paths named. 3. CI-derived label is a follow-up card. 6. Label this PR `needs-human-merge`. 7. Own bullet after the guard hook bullet.
