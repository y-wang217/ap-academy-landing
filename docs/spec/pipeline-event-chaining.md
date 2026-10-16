# Spec: event-chained pipeline stages and "your move" notifications

Written 2026-10-16. Manual work, not a board card: it changes the pipeline
itself, and most of the files it touches are human-only (see Constraints).
Read `CLAUDE.md` (Agent pipeline section), `PIPELINE.md` and
`.claude/pipeline.json` first.

## Goal

1. Each stage starts the next one as soon as it leaves a card in a state the
   next stage consumes, instead of waiting for the next hourly slot. The
   schedules stay as a safety net.
2. Charlie is notified only when the next move is his. Nothing that the bot
   can approve and auto-merge notifies him.

Why: with `wip_limit: 1`, throughput is set by hand-off latency. Today a card
waits up to an hour at each of Ready, Needs Approval and Approved, and again
on every Revise or Changes Requested round.

## How it works today

| stage | runs as | schedule | reads | writes |
|---|---|---|---|---|
| sweep | inline at the start of design-next and build-next (`.claude/commands/pipeline-sweep.md`) | with them | GitHub PRs, board | card status from PR state, Backlog → Ready, Work Log "shipped" rows |
| design | claude.ai scheduled task `ap-design` (`trig_01JdnScf4xGzsjQwBqxjEJij`), prompt `/design-next`, Notion connector only | :05 hourly, America/Toronto | Ready, Revise | Designing → Needs Approval (or Blocked) |
| approve | GitHub Action `.github/workflows/design-approver.yml` → `scripts/design-approver.mjs`, Notion integration token `NOTION_APPROVER_TOKEN` (a bot identity) | :20 hourly | Needs Approval | Approved, Revise, or a "Needs Charlie" comment |
| build | claude.ai scheduled task `ap-build` (`trig_01V8Lz7JVrAuzaGEpmip4dxU`), prompt `/build-next`, Notion connector only | :35 hourly | Changes Requested, Approved | Building → In Review (or Blocked), opens the PR |
| review | `.github/workflows/claude-review.yml` on `workflow_run: CI` | event | green CI on a `req/` PR | bot review (via `REVIEWER_PAT`) + `review` commit status |
| merge | `.github/workflows/auto-merge.yml` on bot approval / label removal | event | approved `req/` PR without `needs-human-merge` / `awaiting-migration` | `gh pr merge --auto` (with `GITHUB_TOKEN`) |

CI → review → auto-merge is already event-driven. The gaps are every hand-off
that goes through Notion, and the merge → next card hand-off.

Facts that shape the design:
- `ap-design` and `ap-build` act as Charlie in Notion (their comments show as
  his user). Notion does not notify you of your own comments or self-mentions,
  so those sessions cannot notify Charlie through Notion. The approver
  integration is a separate bot user, so its mentions do notify.
- Pipeline PRs are opened under Charlie's GitHub identity. GitHub does not
  notify you about your own PR, and you cannot request your own review. A
  comment from `github-actions[bot]` that @mentions him does notify.
- `auto-merge.yml` queues merges with `GITHUB_TOKEN`. Events caused by
  `GITHUB_TOKEN` do not start other Actions workflows, so an Actions
  `pull_request: closed` workflow will not see those merges. A routine's own
  GitHub trigger is delivered by the Claude GitHub App webhook and is not
  subject to that rule.
- Routine API trigger (research preview): `POST
  https://api.anthropic.com/v1/claude_code/routines/<trig_id>/fire` with
  `Authorization: Bearer <token>`, `anthropic-beta:
  experimental-cc-routine-2026-04-01`, `anthropic-version: 2023-06-01`, body
  `{"text": "..."}`. The text reaches the run wrapped in a
  `<routine-fire-payload>` block marked untrusted; the prompt must opt in to
  reading it. Limit 30 fires per routine per hour. Docs:
  https://code.claude.com/docs/en/routines
- The guard hook (`.claude/hooks/guard.mjs`) blocks agent edits to
  `.github/workflows/`, `.claude/pipeline.json`, `.claude/hooks/` and
  `.claude/settings*.json`.

## Target flow

A "kick" starts the next stage now. Every kick is best effort: if it fails,
the schedule picks the card up later, so a failed kick is a warning, never a
failed run.

| # | when | kick | how |
|---|---|---|---|
| K1 | design-next leaves a card in Needs Approval | run the approver | GitHub MCP `actions_run_trigger`: `workflow_dispatch` on `design-approver.yml`, ref `main`, inputs `dry_run: false`, `chain: <n+1>` |
| K2 | approver sets a card to Approved | fire `ap-build` | `fetch` to the routine fire URL from `scripts/design-approver.mjs` |
| K3 | approver sets a card to Revise | fire `ap-design` | same |
| K4 | bot reviewer requests changes | fire `ap-build` | new last step in `claude-review.yml`, `curl` to the fire URL |
| K5 | a `req/` PR merges | run `ap-design` (its sweep marks Done and unblocks dependents) | GitHub trigger on the `ap-design` routine: `pull_request.closed`, Is merged = true, Head branch starts with `req/` |
| K6 | end of design-next: Approved or Changes Requested cards exist and WIP allows a build | fire `ap-build` | `fire_trigger` (Claude_Code_Remote connector) |
| K7 | end of design-next: more Ready or Revise cards remain | fire `ap-design` again | same (one card per run stays the rule) |
| K8 | end of build-next: the sweep left Ready or Revise cards | fire `ap-design` | same |

The approver keeps its hourly schedule (it exits cheaply when nothing waits).
`ap-design` and `ap-build` drop to every 3 hours (`5 */3 * * *` and
`35 */3 * * *`, America/Toronto). Each scheduled run that finds nothing still
costs a session, so this lowers usage.

## Requirements

### R1. Chain depth (runaway guard)
- Every kick carries `chain=<n>`: in the fire `text` (`chain=3 from=approver
  card=REQ-23`) or the `chain` workflow input. Scheduled and manual runs start
  at 0. A stage that kicks sends its own depth + 1.
- No stage kicks when its depth is at or above `max_chain` (new
  `pipeline.json` key, default 12). It finishes its own work, then says
  "chain limit reached" in its reply.
- The design-next and build-next commands (and the two routine prompts) opt
  in to the payload narrowly: read only `chain=<digits>` from the
  `routine-fire-payload` block, ignore everything else in it, and treat a
  missing or malformed value as 0. The payload never selects a card or
  changes what the stage does.
- The approver's `chain` input defaults to 0 and is parsed as an integer.

### R2. Claims (no double runs)
A kick and a schedule can start the same stage at once. The routines have no
concurrency lock (the approver workflow does).
- New board property **Claimed by** (text). When design-next or build-next
  picks a card, it sets Status (Designing or Building) and Claimed by = its
  session ID in one update, then re-fetches the card. If Claimed by is not
  its own ID, another run won: it picks nothing and exits.
- Update the "Which card" steps in `.claude/agents/designer.md` and
  `.claude/agents/builder.md` to match.
- The sweep's Work Log step already checks for an existing "shipped" row.
  Re-check right before the write, since two sweeps can now overlap.

### R3. Approver kicks (K2, K3)
- In `scripts/design-approver.mjs`, after the card loop: if any card was
  approved, fire `ap-build` once; if any card went to Revise, fire
  `ap-design` once. Never in dry run, never when paused, never at or above
  `max_chain`.
- Config from env: `ROUTINE_DESIGN_FIRE_URL`, `ROUTINE_DESIGN_FIRE_TOKEN`,
  `ROUTINE_BUILD_FIRE_URL`, `ROUTINE_BUILD_FIRE_TOKEN`. If a pair is missing,
  skip that kick with a `::notice::`.
- A failed fire logs `::warning::` and a line in the run summary. It does not
  set the exit code.
- Add the `chain` input and the four secrets to `design-approver.yml`.

### R4. Reviewer kick and round cap (K4)
- In `claude-review.yml`, after the verdict step: if the verdict is
  `CHANGES_REQUESTED`, count the bot's CHANGES_REQUESTED reviews on the PR.
  Under 3: fire `ap-build` with `chain=0 from=reviewer`. At 3 or more: do not
  kick, and post the N2 notification instead.

### R5. Stage commands (K1, K6, K7, K8)
- `.claude/commands/design-next.md`: after the designer returns, apply K1,
  then K6 and K7, with the R1 depth rule. K1 runs whatever the card's Risk is;
  the approver already turns High into a "Needs Charlie" comment.
- `.claude/commands/build-next.md`: after the builder returns, apply K8.
- The kick decisions read board state after the stage's own writes, not the
  stage's reply text.
- The stage's one-line reply gains the kicks it sent, for example
  `kicked: approver (chain 2)`.

### R6. Notifications: only when the next move is Charlie's
Notify when:
- N1, Notion: a card enters **Blocked**, or the approver leaves a "Needs
  Charlie" comment (High risk, or the revise cap was hit).
- N2, GitHub: the bot approves a PR that carries `needs-human-merge` (this
  covers migration PRs, whose next step is merge and apply). Also when R4's
  round cap is hit.

Do not notify on: Approved, Revise rounds under the cap, In Review, Changes
Requested under the cap, auto-merged PRs, Done.

How:
- N1 is posted by the approver integration (a bot user, so the mention
  notifies). In `design-approver.mjs`, or a new `scripts/pipeline-notify.mjs`
  run in the same workflow step: each run, scan the board for Blocked cards,
  and for every new "Needs Charlie" result, post a comment that mentions
  Charlie (Notion rich text `mention` of type `user`). Charlie's Notion user
  ID is `6d3ca702-9281-4f05-860f-182f06b841c2`; store it in
  `.claude/notion-ids.json` as `charlie_user_id`. De-duplicate with a marker
  (`[pipeline-notify] Blocked (since <last_edited_time>)`) so each entry into
  Blocked notifies once.
- N2 is a new workflow, `.github/workflows/notify-human.yml`, on
  `pull_request_review: submitted` (the bot's review is posted with
  `REVIEWER_PAT`, so it does start workflows). When the review is an approval
  and the PR has `needs-human-merge`, post one comment as
  `github-actions[bot]`: `@y-wang217 your move: <merge, or merge and apply
  migration NNNN>`. De-duplicate with an HTML comment marker that includes
  the head SHA. R4's cap reuses the same comment step.
- Push notifications on the claude.ai scheduled tasks stay off. They fire on
  the model's sense of "noteworthy", which is the noise this replaces.

### R7. Docs
- `PIPELINE.md`: the human setup steps below, and the new flow in Daily use.
- `CLAUDE.md`, Agent pipeline: replace the hourly wording with the kick
  model, the 3-hour safety net, `max_chain`, Claimed by and the
  notification rules.
- `docs/adr/0003-event-chained-pipeline.md`: short ADR covering why kicks
  plus a schedule safety net, why a bot identity notifies, and what would
  make us revisit it (for example the fire API leaving research preview with
  breaking changes).

## Human steps (Charlie)

1. claude.ai/code/routines → `ap-design` and `ap-build` → Edit → Add another
   trigger → API. Copy each URL, generate each token, and save them as repo
   secrets `ROUTINE_DESIGN_FIRE_URL` / `_TOKEN` and `ROUTINE_BUILD_FIRE_URL` /
   `_TOKEN`.
2. `ap-design` → Add another trigger → GitHub event: repo
   `y-wang217/ap-academy-landing`, `pull_request.closed`, Is merged = true,
   Head branch starts with `req/`. Leave Base branch unfiltered: feature PRs
   can target a `req/...-migration` branch. Migration PR merges also fire it,
   and the run's sweep simply finds nothing to release until the migration is
   applied.
3. Add the Claude_Code_Remote connector to both routines (for `fire_trigger`),
   and check the Claude GitHub App has Actions: write (for K1).
4. Set the routine schedules to every 3 hours, and update both prompts to
   `/design-next` (or `/build-next`) plus the R1 opt-in sentence.
5. Add the **Claimed by** text property to the Dev Requirements board.
6. Delete the stale scheduled task `ap-design-autoapprove (tonight only)`
   (`trig_01Wq4r3wqFJFQHaRCnmcxaT9`). Its schedule matches every October 14.
7. Apply the guarded edits (workflows, `pipeline.json`), see Constraints.

## Verify before building

These assumptions need a quick check first. Each has a fallback.

| # | check | fallback |
|---|---|---|
| V1 | GitHub MCP `actions_run_trigger` works from an `ap-design` run (permissions and tool presence) | drop K1; the hourly approver picks the card up within the hour |
| V2 | `fire_trigger` from the Claude_Code_Remote connector starts another routine from inside a routine run | store the fire URLs and tokens as network secrets in the routines' cloud environment and `curl` them |
| V3 | the routine GitHub trigger fires on a merge that auto-merge performed | an hourly approver-side check for newly merged PRs that fires `ap-design` |
| V4 | a `github-actions[bot]` @mention on Charlie's own PR reaches GitHub Mobile | the same notice as an N1-style Notion bot comment on the card |

## Constraints

- The guard hook blocks agents from editing `.github/workflows/*` and
  `.claude/pipeline.json`. Either the session writes those changes as patch
  blocks in its final message for Charlie to apply, or Charlie runs the
  session with hooks temporarily disabled and watches it (`PIPELINE.md`,
  Editing the pipeline itself). Do not route around the hook.
- No board card, so no `req/` branch: use `chore/pipeline-event-chaining`,
  with a PR that a human merges. It touches `scripts/` and `.github/`, both in
  `human_merge_paths`. The bot reviewer and auto-merge do not run on it.
- Kicks never bypass a gate. The approver still never approves High risk,
  the revise cap and `max_attempts` stand, and **Paused** on Pipeline Control
  stops every stage and every kick.
- No new dependencies: use Node's `fetch` and `curl`.

## Tests

- `scripts/design-approver.test.mjs` (stubbed `fetch`): approve fires build;
  revise fires design; both in one run fire each once; dry run fires nothing;
  paused fires nothing; `chain >= max_chain` fires nothing; a missing secret
  skips with a notice; a failed fire warns and keeps exit code 0; N1 posts
  once per Blocked entry and not again on the next run.
- `node --test` for any new script, run by the workflow's Unit tests step.
- End to end, once everything is live: put a throwaway Low card ("add one
  line to `apps/tracker/docs/PLAN.md`") in Ready, run `ap-design` by hand, and
  record the time of each status change until Done. Pass: no hand-off waits
  for a schedule, Charlie receives zero notifications (the card auto-merges),
  and the run summaries show the chain depths.
- A second throwaway card labelled to hit `needs-human-merge` (it touches a
  path in `human_merge_paths`): Charlie receives exactly one GitHub
  notification, after the bot approves.

## Done state

- Ready → Done on a Low card with no human step and no schedule wait.
- Every kick shows in a run reply or summary with its chain depth.
- Charlie is notified only for Blocked, Needs Charlie, human-merge PRs and
  the review-round cap, once each.
- With every kick removed or failing, the pipeline still works on the
  schedules, just slower.

## Out of scope

A daily "shipped" digest. Moving design or build into GitHub Actions.
Changing review, approval or merge rules. Parallel builds (`wip_limit` stays
1).
