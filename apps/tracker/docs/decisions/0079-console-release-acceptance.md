# 0079: The founder console is accepted by one e2e pack, axe-core in e2e only, and a production-bundle check
Status: accepted
Date: 2026-10-23

## Context
Console 1/12 to 11/12 each tested their own panels. Nothing checked the whole bridge together: the
four widths, keyboard and zoom, reduced motion, the five non-owner roles, every provider outage, and
whether a production build carries the preview or its demo data. Nothing recorded what is deployed,
verified or founder-approved (REQ-63, `docs/designs/REQ-63.md`). The repo had no accessibility tool.

## Decision
- **One acceptance pack.** A REQ-63 block in `e2e/tracker/flows.mjs` captures the three modes and the
  five panel states at 1920x1080, 1440x900, 1280x720 and 390x844 into
  `docs/spec/founder-console/screenshots/req-63/`, walks the full Tab order, checks 200% zoom, reduced
  motion and text statuses, probes every console route by every role and exported method, fails each
  of the six health providers alone against a fixed provider-to-slot table (`PROVIDER_SLOTS`, checked
  against the health JSON and `lib/console/panel-slots.ts` before use), and runs one sanitised loop per
  mode with printed evidence.
- **axe-core 4.14.0**, exact, as a devDependency of the tracker. It is the version the lockfile already
  resolved for `eslint-plugin-jsx-a11y`, so it adds no package. `flows.mjs` loads `axe.min.js` into the
  page with `addScriptTag`; no app source imports it, so it never reaches a bundle. Zero `serious` or
  `critical` violations for `wcag2a`, `wcag2aa` and `wcag21aa` is the bar, and each run's JSON is kept.
- **A production-bundle check.** `e2e/tracker/run.sh` builds the tracker once without
  `CONSOLE_PREVIEW`, and `e2e/tracker/bundle-check.mjs` checks that build has no `/console/preview`
  route or output, that no `FICTION` entry (`test/console/fiction.ts`) or fixture sentinel
  (`e2e/tracker/console-sentinels.json`) is in `.next/static` or `.next/server`, and that no stack
  secret is in either app's `.next/static`. Then it rebuilds with the flag and the flows run as before.
- **Readiness.** `docs/readiness.md` gains a Founder Console section, one row per card in the register's
  vocabulary, and a "Founder console" gate that stays Closed until Charlie fills in
  `docs/spec/founder-console/03-release-receipt.md` and changes it. A merge releases nothing.

## Alternatives considered
- axe-core 4.10.3, as the design first named: pnpm then downgrades the copy `eslint-plugin-jsx-a11y`
  shares, a lockfile change outside this card.
- A global axe install next to Playwright: needs `ci.yml` and SessionStart hook patches.
- A hand-written accessibility subset: misses what axe checks for free.
- The bundle check as a CI step: needs a workflow patch; `run.sh` already owns the builds.
- Provider ownership as a field on each slot or a `data-provider` attribute: restates the same table in
  production code. The fixed table fails the run when a provider or slot is added, so it cannot drift.

## Consequences
- `pnpm test:tracker` builds the tracker twice and takes a few minutes longer.
- About 40 PNGs and five axe JSON files are committed and rewritten by every run, as earlier console
  screenshots are.
- A failed Touches read has no row in the seven-entry health rail (ADR 0077); the pack checks its
  provider-failure signal instead. Adding a rail entry would be a new card.
- Revisit if axe-core needs an upgrade the lockfile does not already carry, or if the console gains a
  provider or slot (the table check fails first).
