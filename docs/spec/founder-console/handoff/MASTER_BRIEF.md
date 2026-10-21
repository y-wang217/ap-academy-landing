# Founder Console: Functional Requirements & Product Contract

## 1. Outcome and principle
Build a private, authenticated, web-based Founder Console within the existing AP Academy app/site for a single business operator. Increase **net new recurring student teaching-hours/week** with fewer manual searches, context switches and forgotten follow-ups. This must be a functioning backend-connected application; the offline preview in this pack is deliberately NOT the product. Visuals are defined separately in the design folder.

The founder needs ONE screen for deciding and doing the most consequential next thing, not a parallel CRM, Notion clone, calendar clone or speculative AI agent.

## 2. Three modes, one underlying data model
### Sales (on-call)
- A large **virtual Rolodex** is the primary focus, already showing the next eligible lead, their verified context, last interaction, recommended human action and due time.
- One obvious primary action: call / open contact / launch permitted existing dial flow; no undisclosed automatic calling.
- Queue priority: **new uncontacted leads → urgent callbacks → post-trial decision/close → due follow-ups → older leads**. Configurable timing and explicit explanations, not hidden AI scoring. Recency and overdue status matter. Preserve explicit human overrides when existing backend supports them.
- Queue filters: New, Due, Post-trial, Later; excluded resolved and opt-out leads. Repeatedly seeing the same resolved lead is a defect.
- Record outcomes: attempted, contacted, booked trial, trial completed, follow-up scheduled, declined/opt-out, verified paid enrolment when evidence exists. Actual write operations must respect canonical ownership and existing audit/idempotency rules.
- Show the teacher diagnosis / trial notes before a close call when available, with safe missing-data indicators.

### Creation (not-on-call focus)
- Creative/media and marketing workbench prioritized after urgent leads and planned sales blocks, ahead of speculative engineering/admin work.
- View the next script, recording, editing, review or publishing task and content pipeline from the EXISTING Notion Work/Content Library or other discovered authority.
- Provide working deep links and, only if supported, authorized task transitions. Avoid building an unnecessary in-app editor/CMS in v1.
- Weekly media-review view and capacity to capture a creative idea or follow-up via existing work tooling.
- Suggested start-of-day plan comes from actual tasks and signals, not fabricated goals.

### Operations (delivery and supporting work)
- Teacher availability, scheduled recurring teaching-hours, booked trials, lesson logging gaps, handoff exceptions and due follow-ups.
- Track discrepancies: scheduled lesson without verified delivered log; completed trial without close decision; paid student without confirmed teacher allocation; unpaid invoice vs verified payment.
- Make the next human action obvious, linked to canonical records. Do not infer attendance from elapsed time or conflate scheduling with delivery.
- Secondary read-only finance pulse when source evidence exists.

## 3. Priority + interruptions
- The operational order is: fresh lead requiring contact → sales activities with direct impact on booked recurring hours → advertising/media work → other building/admin → founder's protected teaching/personal time.
- Founder can select mode explicitly; app may suggest a mode based on time blocks but must not force time-watching or auto-discard work.
- Fresh lead alerts should be high-signal in any working mode, with "Call now" and "Snooze / next permissible opportunity" if interrupting a lesson is inappropriate. No autonomous phone call, texts or appointment bookings.
- Delivery time must remain protected. Owner must be able to pause disruptive alerts; show a persistent summary of deferred signals.
- Display actual event/freshness provenance: connected push if available; honest polling as fallback. Never claim continuous live observation when disconnected.

## 4. Screens and hierarchy
1. **Bridge / Overview:** hero KPI (verified net-new weekly recurring hours), latest arrival/action queue, urgent signals, compact conversion and capacity context.
2. **Sales Radar / Rolodex:** next caller, priority stack, concise lead profile, trial diagnosis, latest touch, history, actions, due date and verification.
3. **Creation Workbench:** next content deliverable, stage, due/review and deep links, weekly media review.
4. **Operations:** teacher hours/capacity, lesson gaps, trials booked/completed, upcoming classes, outstanding work, payment verification status.
5. **History / Insights:** optional phase 2 unless real tracking already exists; avoid inventing time-series.
Navigation: large three-mode selector and small secondary navigation. Desktop-first for the command-bridge composition, but usable on laptop/tablet/mobile.

## 5. Central measurement contract
**North star:** Net new recurring **confirmed** teaching-hours per week within a chosen 7-day window.
- Candidate formula: recurring committed teacher-delivered hours/week from newly verified paid student enrolments + verified expansions − canceled/paused/reduced confirmed recurring hours during window. Exclude trial lessons, tentative bookings, unverified payments, one-off catchups and duplicate class occurrences. Final event boundaries and data authority to be established from actual canonical records.
- Show starting baseline, positive and negative deltas, counted record links, week boundaries (`America/Toronto`) and last successful sync.
- If payment truth / lesson linkage is missing, mark metric **Incomplete / Unverified** with explanation, never substitute calendar count or zero.
- Related diagnostics: speed-to-first-contact, leads awaiting first contact, trial-to-verified-enrolment, booked recurring capacity, actual taught-hours vs planned, marketing assets shipped, overdue follow-ups.
- Percent changes require a real comparator; do not display +23% or other fake percentages from the concept render.

## 6. End-to-end workflows
**Incoming lead** → Record exists in canonical CRM → signal/queue position with verified timestamp → founder opens contact → action happens explicitly → write outcome/next action through approved source → queue advances without losing unresolved lead.

**Trial** → Booked appointment → teacher assignment and notes visible → trial completion *verified* → owner close with diagnosis → payment recorded *with proof* → verified recurring enrollment → teacher allocation → hour delta updates. Missing transitions raise exceptions, not silent success.

**Content** → Existing work item staged → founder drafts or records elsewhere → existing task updated by explicit user action → weekly review surfaces missing deliverables. Publishing is never automatic in this release.

**Delivery** → Scheduled class → actual lesson log reconciliation → discrepancy surfaced → record corrected or escalated in canonical system → check marked reconciled only with evidence.

## 7. Canonical-source safety
- Inspect repo + Notion, Supabase, Calendly and Google Calendar contracts first. Existing records may be incomplete; do not guess identity joins by name.
- Supabase holds already-adopted schedules and app operational state; Notion continues to own business tasks, strategy, some personnel/lead/lesson/pay records where current architecture says so. Verify the **current** ADR and implementation rather than treating this as a hard-coded schema.
- No duplicate source-of-truth DB or new notification mechanism without design review. If aggregate read models need caching, specify TTL, invalidation, data minimization, reconciliation and stale markers.
- The console must remain usable without external provider uptime, with each panel marked stale/unknown and actionable retry; no fake green light.

## 8. Privacy, approval, constraints
- Single domain with shared Supabase auth. Founder-only protection enforced on server/data access, not just hiding a link. Least privilege and audit logs; never expose privileged API keys in browser bundles.
- Student/parent/teacher data is private. No names/phone numbers exposed to unauthenticated clients, cached HTML or error telemetry.
- External messages, bookings/changes, spending, publishing and consequential edits require the operator's explicit intent and any existing approval gate. The console displays real results and failures.
- Do not mark payment verified without actual evidence; never count open invoices as cash collected.
- Accessibility: 200% zoom, keyboard navigation, visible focus, sensible semantic table/list alternatives to radar, reduced motion, readable live status, alert not based on color alone.
- Performance: data-first paint; decorative effects must not delay first useful action, video/background effects optional, pause animations in inactive tabs if feasible.

## 9. Non-goals for v1
- No 3D camera/fully rendered cockpit simulator, automatic outbound AI agent, CRM replacement, full content editor, payment processor, global-map fiction, arbitrary student-facing UI, new scheduling authority, automated parent communication, or analytics computed from fabricated data.

## 10. Definition of usable
- Founder signs in and reaches console on approved route.
- Within one screen, identifies true verified recurring-hours progress and next highest-impact eligible action (or why unknown).
- Completes a call outcome plus next follow-up through canonical integration with proof, or is redirected into the verified existing tool with clear state.
- Gets a truthful pending-trial / teacher-capacity / lesson-gap picture with per-panel staleness.
- Can switch Sales, Creation and Operations without losing context.
- UI resembles the visual brief but remains fast, usable and accessible. Tests cover authorization, real data, empty/error, dedupe and explicit-action safety.
