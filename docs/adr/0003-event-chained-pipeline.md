# ADR 0003: Pipeline stages chain by events, with schedules as a safety net

- **Status:** Accepted
- **Date:** 2026-10-16
- **Decided by:** Charlie
- **Spec:** `docs/spec/pipeline-event-chaining.md`

## Context

The agent pipeline runs one card at a time (`wip_limit: 1`), so its
throughput is set by hand-off latency, not by the work itself. Until now
every hand-off that went through Notion was picked up by an hourly schedule:
`ap-design` at :05, the design approver at :20, `ap-build` at :35. A card
waited up to an hour at Ready, at Needs Approval and at Approved, and again
on every Revise or Changes Requested round. Only CI, review and auto-merge
were event-driven.

Three facts shaped the options:

- The `ap-design` and `ap-build` routines act as Charlie in Notion and open
  PRs under his GitHub identity. Neither Notion nor GitHub notifies you about
  your own actions, so those sessions cannot tell Charlie anything. The
  design-approver Notion integration and `github-actions[bot]` are separate
  identities, and their mentions do notify.
- Merges queued by `auto-merge.yml` use `GITHUB_TOKEN`, and events caused by
  that token start no Actions workflows. PRs #51 and #53 prove it: merged by
  `github-actions[bot]`, no push-triggered CI run on `main`. An Actions
  workflow on `pull_request: closed` would never see a pipeline merge.
- The routine API trigger (`POST .../routines/<id>/fire`) and the routine
  GitHub trigger are in research preview, and a routine run only has
  `fire_trigger` when the Claude_Code_Remote connector is attached to it.
  The routine edit form does not offer that connector, so the stage commands
  first fired through `scripts/fire-routine.mjs` with the fire URL and
  token set as environment variables on a dedicated cloud environment; a
  network secret cannot carry them, because the agent proxy never attaches
  one to `api.anthropic.com`. The amendment below moves those kicks into a
  workflow.

## Decision

1. **Kicks.** Each stage starts the next one as soon as it leaves a card in a
   state the next stage consumes: design-next dispatches the approver
   workflow and fires `ap-build` or `ap-design` when work waits; the approver
   fires `ap-build` on Approved and `ap-design` on Revise; the bot reviewer
   fires `ap-build` on changes requested; a merged `req/` PR starts
   `ap-design` through the routine's GitHub trigger, which is a webhook to the
   Claude GitHub App and not subject to the `GITHUB_TOKEN` rule.
2. **Schedules stay, slower.** `ap-design` and `ap-build` run every 3 hours
   and the approver every hour, as a safety net. Every kick is best effort: a
   failed kick is a warning, never a failed run, and the schedule picks the
   card up later.
3. **Chain depth.** Every kick carries `chain=<n>`. Scheduled and manual runs
   start at 0, a stage sends its own depth + 1, and no stage kicks at or above
   `max_chain` (12). The payload is read narrowly: only `chain=<digits>`,
   nothing else, and it never selects a card.
4. **Claims.** A kick and a schedule can start the same stage at once, and
   the routines have no concurrency lock. The designer and builder set
   Status and **Claimed by** (their session ID) in one update and re-read the
   card; a run that does not see its own ID picks nothing.
5. **Notify only when the next move is Charlie's**, and only from an identity
   that is not his: the approver integration mentions him in Notion for a
   card entering Blocked and for every "Needs Charlie" verdict;
   `github-actions[bot]` mentions him on a bot-approved PR that carries
   `needs-human-merge` and when the bot reviewer has requested changes
   `review_round_cap` (3) times on one PR. A "Needs Charlie" verdict is High
   risk, an understated risk (C8), a suspected injection or a question only
   he can answer; the design revise cap itself approves with the gaps left
   for the builder. Approved, Revise under the cap, In Review, Changes
   Requested under the cap, auto-merges and Done are silent.
   Push notifications on the routines stay off.
6. **Gates are untouched.** No kick bypasses the approver's rules, the revise
   cap, `max_attempts`, branch protection or **Paused**, which stops every
   stage and every kick.

**2026-10-16 amendment** (`docs/spec/pipeline-kick-via-actions.md`). The
routine runs no longer hold the fire tokens. Environment variables are
readable by every command in every session of that environment, and the
design and build runs read untrusted input (Notion cards, PR text), so a
prompt injection could have printed them. K6, K7 and K8 now dispatch
`.github/workflows/kick.yml` with the GitHub MCP `actions_run_trigger`, the
call the design stage already uses for the approver; that workflow runs
`scripts/fire-routine.mjs` with the repository secrets, which become the only
copy of the tokens. The approver and reviewer kicks already ran inside
Actions and the merge kick is the routine's own GitHub trigger, so nothing
else changes: chain depth, claims and the notification rules are as above.

## Options considered

### A. Keep the hourly schedules
Rejected. Simple, but a Low card spends most of its wall-clock time waiting
for a slot, and every Revise or Changes Requested round adds another hour.

### B. Move design and build into GitHub Actions and chain with `workflow_run`
Rejected for now. It would make every hand-off an Actions event, but it moves
the Notion-writing sessions off the routines (losing the connector setup and
the session UI), and the merge hand-off would still be invisible to Actions
because of the `GITHUB_TOKEN` rule.

### C. Kicks between the existing stages, schedules as a safety net (chosen)
Keeps every stage where it is and adds one call at the end of each. The cost
is three moving parts the schedules did not need: a chain-depth cap, a claim
property and a small set of secrets.

## Consequences and accepted risks

| Risk | Mitigation |
|---|---|
| A kick loop | `max_chain`; at the cap the pipeline waits for the next schedule, which starts a fresh chain at 0 |
| Two runs take the same card | **Claimed by**, written with the status and re-read |
| Two sweeps write the same Work Log row | the "shipped" check runs again right before the write |
| The fire API or its headers change | fires are one function in `scripts/fire-routine.mjs`; a failure degrades to the schedule |
| A kick fails silently | every kick shows in the run reply or summary with its depth |
| A routine-to-routine kick now takes one Actions run, about 20 seconds more | accepted; the schedules remain the safety net, and no routine session can leak a fire token |
| A Blocked card edited while it stays Blocked | notifies once more; acceptable, Charlie made the edit |

## Revisit this decision if

- The routine fire API leaves research preview with breaking changes, or the
  per-routine fire limit (30 per hour) becomes a constraint.
- The routine GitHub trigger proves unreliable for auto-merged PRs; the
  fallback is an approver-side check for newly merged `req/` PRs that fires
  `ap-design`.
- `wip_limit` goes above 1, which needs a real queue rather than claims.
- The `github-actions[bot]` mention turns out not to reach GitHub Mobile; the
  fallback is the same notice as a Notion bot comment on the card.
