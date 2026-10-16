# Spec: route the routine kicks through GitHub Actions

Written 2026-10-16, after the first end-to-end run of
`docs/spec/pipeline-event-chaining.md`. Manual pipeline work, no board card.
Read `PIPELINE.md` (Event chaining) and `docs/adr/0003-event-chained-pipeline.md`
first. Branch `chore/pipeline-kick-via-actions`, human merge.

## Why

Today the design and build runs fire each other with `scripts/fire-routine.mjs`,
which reads `ROUTINE_<DESIGN|BUILD>_FIRE_URL` and `_TOKEN` from the
`ap-pipeline` cloud environment. Environment variables are readable by every
command in every session of that environment, and those runs read untrusted
input (Notion cards, PR text), so a prompt injection could exfiltrate the
tokens. A fire token only starts its one routine (no read access, 30 fires an
hour, revocable), but it should not sit where an agent can print it.

Network secrets cannot carry them: the agent proxy never attaches a secret to
`api.anthropic.com`. The `fire_trigger` connector tool is not offered to these
routines and refuses routines it did not create. What does work from a routine
run is the GitHub MCP `actions_run_trigger`: the design run dispatched the
approver workflow today (204, chain 1, 2 minutes after design start).

## Target

A routine run never holds a fire token. It dispatches a small workflow,
`kick.yml`, which holds the secrets and runs `scripts/fire-routine.mjs`. The
GitHub repository secrets become the only copy of the tokens.

| kick | today | after |
|---|---|---|
| K1 design-next → approver | `actions_run_trigger` on `design-approver.yml` | unchanged |
| K2, K3 approver → build or design | `fire-routine.mjs` inside the approver workflow | unchanged (already in Actions) |
| K4 reviewer → build | `fire-routine.mjs` inside `claude-review.yml` | unchanged |
| K5 merge → design | routine GitHub trigger | unchanged |
| K6, K7 design-next → build or design | `fire-routine.mjs` in the routine run, env vars | `actions_run_trigger` on `kick.yml` |
| K8 build-next → design | same | same |

## Work

### 1. New workflow `.github/workflows/kick.yml` (guarded: a human applies it)

```yaml
name: Kick routine

# Fires the ap-design or ap-build routine on behalf of a design or build run
# (K6, K7, K8 in docs/spec/pipeline-event-chaining.md). The routine runs
# dispatch this instead of holding the fire tokens themselves: the tokens
# live only in repository secrets. Best effort: scripts/fire-routine.mjs
# never fails the run; a failed fire is a warning and the 3-hour schedules
# pick the card up. See docs/spec/pipeline-kick-via-actions.md.
on:
  workflow_dispatch:
    inputs:
      routine:
        description: "Which routine to fire"
        type: choice
        options: [design, build]
        required: true
      chain:
        description: "Depth of the run that is kicking (the fire text carries depth + 1)"
        type: string
        default: "0"
      from:
        description: "Which stage is kicking (design-next, build-next, manual)"
        type: string
        default: "manual"
      card:
        description: "Card ID the kick is about, for the fire text"
        type: string
        default: ""

permissions:
  contents: read

jobs:
  kick:
    runs-on: ubuntu-24.04
    timeout-minutes: 5
    steps:
      - uses: actions/checkout@v7
      - uses: actions/setup-node@v7
        with:
          node-version: 22
      - name: Fire the routine
        env:
          ROUTINE_DESIGN_FIRE_URL: ${{ secrets.ROUTINE_DESIGN_FIRE_URL }}
          ROUTINE_DESIGN_FIRE_TOKEN: ${{ secrets.ROUTINE_DESIGN_FIRE_TOKEN }}
          ROUTINE_BUILD_FIRE_URL: ${{ secrets.ROUTINE_BUILD_FIRE_URL }}
          ROUTINE_BUILD_FIRE_TOKEN: ${{ secrets.ROUTINE_BUILD_FIRE_TOKEN }}
        run: node scripts/fire-routine.mjs "${{ inputs.routine }}" --chain "${{ inputs.chain }}" --from "${{ inputs.from }}" --card "${{ inputs.card }}"
```

`fire-routine.mjs` already appends its summary line to `GITHUB_STEP_SUMMARY`,
so each kick shows its chain depth in the run summary. Nothing in the script
needs to change.

### 2. Stage commands (unguarded, the session edits them)

- `.claude/commands/design-next.md`, step 5: K6 and K7 become
  `actions_run_trigger`, method `run_workflow`, `workflow_id` =
  `kick_workflow`, `ref` `main`, inputs
  `{"routine": "build" | "design", "chain": "<n+1>", "from": "design-next", "card": "<card-id>"}`.
  Remove the `fire_trigger` and `scripts/fire-routine.mjs` sentences. The
  "kicks not configured" fallback now keys on a missing `kick_workflow`.
- `.claude/commands/build-next.md`, step 6: K8 the same way with `routine:
  design`, `from: build-next`.
- Note the convention: the workflow input `chain` is the depth the receiving
  run should have, so the stage passes `n+1`, the same as the approver's
  `chain` input. The approver and reviewer workflows keep calling the script
  directly; its `--chain` is the sender's depth.

### 3. `.claude/pipeline.json` (guarded)

Add `"kick_workflow": "kick.yml"` next to `approver_workflow`.

### 4. Docs

- `PIPELINE.md`, Event chaining step 3: replace the environment-variable
  option with "nothing to set up in the routine environment; the kicks go
  through `kick.yml` and the GitHub secrets from step 1". Keep the sentence
  on the connector picker not offering Claude_Code_Remote and on
  `fire_trigger` refusing routines it did not create. Add a cleanup line:
  delete the four `ROUTINE_*` variables from the `ap-pipeline` environment,
  regenerate both tokens (they sat in plaintext) and update the four secrets.
- The kick table in `PIPELINE.md`: the three `fire_trigger` rows become
  "`workflow_dispatch` on `kick.yml`".
- `CLAUDE.md`, Agent pipeline, the kicks bullet: one clause saying routine
  runs kick through `kick.yml` and never hold a fire token.
- `docs/adr/0003-event-chained-pipeline.md`: a short "2026-10-16 amendment"
  under Decision: why the tokens left the routine environment, and the
  consequence row "a kick now takes one Actions run, about 20 seconds more".
- `docs/spec/pipeline-event-chaining-patches.md`: append the `kick.yml` block
  and the `pipeline.json` change, so one file still holds every guarded edit.

### 5. Tests and checks

- No script change, so `node --test scripts/*.test.mjs` stays at 45.
- Live check, after Charlie applies the workflow and the secrets are right:
  dispatch `kick.yml` by hand from the Actions tab with `routine: build`,
  `chain: 0`, `from: manual`. Pass: the run summary says
  `kicked ap-build (chain 1): <session url>` and an `ap-build` run appears.
- Then the end-to-end card: a throwaway Low P0 card in Ready, Run now on
  `ap-design`; every hand-off happens without a schedule wait and Charlie
  gets no notification.

### 6. Human steps, in order

1. Merge the PR for this spec's work.
2. Create `.github/workflows/kick.yml` and edit `.claude/pipeline.json` from
   the patch blocks.
3. Regenerate both routine API tokens and update the four GitHub secrets.
4. Delete the four `ROUTINE_*` variables from the `ap-pipeline` environment
   (the routines can stay on that environment or move back to Default).
5. Run the live check in section 5.

## Out of scope

Moving the approver or reviewer kicks (already in Actions). Any change to
chain depth, claims or notification rules.
