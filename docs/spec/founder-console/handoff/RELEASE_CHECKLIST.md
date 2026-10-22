# Acceptance + release gate

## Before creating cards
- [ ] Latest repository, open PRs, Notion Dev Requirements and pipeline paused/WIP state inspected.
- [ ] Existing/overlapping REQ cards reconciled; local `FC-*` → real `REQ-*` mapping recorded.
- [ ] Correct founder route and permission model chosen; don't bypass root/per-app CLAUDE.md.
- [ ] Data-source contracts and missing inputs recorded, no invented source-of-truth fields.
- [ ] High-risk changes clearly flagged for human approvals.

## Per card
- [ ] Designer uses `docs/designs/_TEMPLATE.md`, current app paths and AC→test rows.
- [ ] All ACs have failing-then-passing tests; no giant generic "looks right" AC.
- [ ] Builder copies approved card design into `docs/designs/REQ-N.md`; test-first commit.
- [ ] One `req/REQ-...` branch and PR; appropriate `needs-human-merge` label.
- [ ] Appropriate `gate_commands`, package tests, browser/E2E and RLS tests pass; reviewer accepts exact scope.
- [ ] Any migration in its own human-merge PR, founder signs off live application; verify live outcome.

## Cross-card functional browser acceptance
- [ ] Unauthenticated founder console path redirects to central login preserving safe relative next path.
- [ ] Teacher/student/parent roles cannot fetch private founder data by calling endpoints directly.
- [ ] Founder can view one accurate KPI with full evidence or a truthful "unverifiable" state.
- [ ] Queue picks new uncontacted before older due, then explicit override if documented; filters and resolved/opt-out exclusion work.
- [ ] Action completion cannot silently lose a lead; a new next eligible contact is selected.
- [ ] Trial status and teacher notes are not fabricated; absent diagnosis is explicit.
- [ ] Teacher calendar capacity uses actual available hours and scheduled commitments; errors/unknown propagated.
- [ ] Creation workbench points to real work items and does not publish automatically.
- [ ] Lead signal is deduplicated and carries last-checked time; can defer during protected teaching.
- [ ] Finance never counts draft/sent invoices as collected money; empty and partial states differ.
- [ ] Provider failure leaves other panels usable and offers retry.
- [ ] On 1440×900 and 1920×1080 screenshots, cockpit ambiance, hierarchy and panel details match reference; visuals are built from HTML/SVG not baked-number raster.
- [ ] At 1280×720 and 390×844, primary action is visible and usable without sideways scrolling.
- [ ] 200% zoom, focus, screen reader alternatives for radar, WCAG-ish contrast of actual labels, reduced-motion preference and offline/slow-network handling checked.
- [ ] No demo records or fictional date/numbers visible in production environment.

## Manual acceptance scripts
**Founder Sales:** login → select Sales → inspect Next lead context and latest note → click authorized contact link → record a non-send outcome in a safe test fixture → reload → verify history + next lead.

**Founder exception:** create sanitized overdue follow-up fixture → panel displays source link + time → resolve via approved workflow → refresh verifies gone. No parent contact.

**Founder capacity:** verified two teachers, recurring lessons, one cancelled occurrence; confirm loaded hours count and unknown if availability missing.

**Provider outage:** stub one dependency failing → only that panel stale/error; no blank dashboard, no fake zero.

**Visual check:** compare `06_VISUAL_ASSETS/founder-command-bridge-reference.png` with browser capture: cinematic horizon, dark plummy instrumentation, amber priority, radar/queue hero, restrained neon, legible figures; confirm no horizontal crop or misleading text.

## Readiness ≠ merged
Do not announce ready for users merely because PRs merged. Founder must approve any live schema/auth change and the console's launch. Record integration checks and founder sign-off in existing readiness process. Avoid modifying teacher/student/parent exposure. Use sanitized fixtures; never send real parent messages as tests.

## Metrics for successful rollout
- First actionable lead visible without app switching.
- Zero unresolved due leads absent from queue when source synchronization is complete.
- No duplicate calls caused by queue state.
- Founder sees verified weekly new recurring hours or honest inability to compute them.
- Number of manual systems/pages visited per sales workflow falls; gather real before/after observation rather than promise percentage gains.
