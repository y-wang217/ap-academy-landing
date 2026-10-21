# Founder Console: intake receipt (2026-10-21)

Twelve Dev Requirements cards now exist on the Notion board
(`Track = Console`, a new Track option added for this sequence). Seed ids from
the handoff pack map to real cards as follows. Two seeds were split so that
each card is one bounded, independently testable deliverable.

## (a) FC to REQ mapping

| Seed | Card | Title | Priority | Risk | Status | Notion |
|---|---|---|---|---|---|---|
| FC-01 | REQ-52 | Console 1/12: source-of-truth audit, placement ADR and data contract spec | P0 | Low | Ready | https://app.notion.com/p/400d6ae73dd7815e9737d4fe4c40cadc |
| FC-02 | REQ-53 | Console 2/12: founder-only `/tracker/console` route, owner gate and secure API boundary | P0 | High | Backlog | https://app.notion.com/p/400d6ae73dd781aeacadf88fe9efc5e1 |
| FC-03 (read models) | REQ-54 | Console 3/12: read facade, PanelResult contract and Notion-backed read models | P0 | Medium | Backlog | https://app.notion.com/p/400d6ae73dd781239249cb46c3813562 |
| FC-04 | REQ-55 | Console 4/12: cinematic command-bridge shell and instrument kit | P1 | Low | Backlog | https://app.notion.com/p/400d6ae73dd781fd822fc7ef9da4e7b3 |
| FC-03 (metric) | REQ-56 | Console 5/12: verified net-new recurring teaching hours per week | P0 | Medium | Backlog | https://app.notion.com/p/400d6ae73dd781c39542fb946d32d73f |
| FC-05 | REQ-57 | Console 6/12: sales radar and prioritised next-lead Rolodex (read-only) | P0 | Medium | Backlog | https://app.notion.com/p/400d6ae73dd78130bf4bcd5713d10129 |
| FC-07 (scheduler half) | REQ-58 | Console 8/12: operations mode, teacher load and lesson-log gaps | P1 | Medium | Backlog | https://app.notion.com/p/400d6ae73dd78115b4f7c29056c6009e |
| FC-07 (Notion half) | REQ-59 | Console 9/12: trial funnel and verified finance readouts | P1 | Medium | Backlog | https://app.notion.com/p/400d6ae73dd781c6a0ecfa71c7c33563 |
| FC-08 | REQ-60 | Console 10/12: creation mode backed by the Notion Work database | P1 | Medium | Backlog | https://app.notion.com/p/400d6ae73dd781868c0bfacd9034f91a |
| FC-06 | REQ-61 | Console 7/12: explicit call outcomes and follow-ups written to Notion, safe queue progression | P0 | High | Backlog | https://app.notion.com/p/400d6ae73dd781d1a66bc894421327a0 |
| FC-09 | REQ-62 | Console 11/12: polled actionable signals, protected-time snooze and integration health | P1 | Medium | Backlog | https://app.notion.com/p/400d6ae73dd781c69c9de742487b1b7b |
| FC-10 | REQ-63 | Console 12/12: visual fidelity, accessible operation and founder release acceptance | P1 | Medium | Backlog | https://app.notion.com/p/400d6ae73dd7815aa5dfe14fa8fa63ec |

No existing card was a duplicate of a seed; none was skipped. The "n/12"
in each title is build order, the REQ number is the board's own id.

## (b) Dependency order (Blocked by relations on the board)

```
REQ-52 (audit, docs only)
  └─ REQ-53 (route and owner gate, High)
       ├─ REQ-54 (read facade)            ← also blocked by REQ-52
       └─ REQ-55 (shell and kit)
            REQ-54 + REQ-55 unblock, in parallel:
              REQ-56 (north star)   REQ-57 (Rolodex)   REQ-58 (ops)   REQ-59 (trials, finance)   REQ-60 (creation)
              REQ-57 ─ REQ-61 (call outcomes, High)
              REQ-57 + REQ-58 + REQ-59 ─ REQ-62 (signals)
              REQ-56, 57, 58, 59, 60, 61, 62 ─ REQ-63 (release acceptance)
```

The sweep moves a Backlog card to Ready when every blocker is Done. With
`wip_limit` 3, up to three of the five parallel cards build at once.

## (c) Source-of-truth mapping (observed, see 01-discovery.md section 2)

| Domain | Authority | Repo adapter today |
|---|---|---|
| Leads, funnel stage, follow-ups | Notion Students & Parents (`fe3d651a-70c6-4d1e-8a38-656163d6bc63`): Stage, Owner, Next Action, Next Action Due, Attempts, Last Contact, Source, Lost Reason, milestone dates; rules on the Notion page "OPS SYSTEM (agents.md)" | `apps/tracker/lib/notion/students.ts` reads name, stage, Weekly Schedule only; `tracker.student_people` holds the synced stage |
| Touch history | Notion Touches (`772939bd-bd88-4272-9f1f-20ce75ef2204`) | none |
| Trials | Students & Parents trial fields and milestones; Lessons `Type = Trial` with `Trial: Diagnosis` (`6300f58a-8b8c-4789-88c1-e44272079b0f`); `tracker.class_series.purpose = 'trial'` | `apps/tracker/lib/notion/lessons.ts` (four properties), `tracker.occurrence_outcomes` |
| Teacher capacity | `tracker.class_series`, `class_exceptions`, `availability_windows`, `availability_exceptions`; `weekTotals` returns null when availability is not entered | `apps/tracker/lib/data/schedule.ts`, `lib/domain/schedule/*` |
| Delivered lessons and gaps | `tracker.occurrence_outcomes` (0023), `reconcile()`, `GET /api/scheduler/lessons/unlinked` | `apps/tracker/lib/scheduler/lesson-handlers.ts` |
| Payment evidence | Notion Invoices (`be0f91e4-f054-4055-9ca6-c4e1a22c4f27`) `Status = Paid`, `Paid On`, `Amount (CAD)`; Stripe Payment Links have no webhook | `apps/tracker/lib/notion/billing.ts`, per child only |
| Recurring hours | `tracker.class_series` weekly rows | no function yet |
| Content work | Notion Work (`3031b455-9be0-4f8d-b200-70fcfcf1a0b8`), Area = Marketing | `apps/tracker/lib/notion/work.ts` (writer, query by title only) |
| Signals | nothing sends; hourly bearer cron, outbox, sync_runs | `apps/tracker/lib/scheduler/outbox*.ts`, `people-sync*.ts` |
| Founder auth | `tracker.memberships` owner, `tracker.is_org_owner`, `getViewer()` + `notFound()` | `apps/tracker/app/scheduler/setup/page.tsx`, `apps/tracker/lib/pages.ts` |

The legacy "Leads CRM (Sales Pipeline)" database (`31e061e3-...`) is dormant
(4 rows, none after 2026-06-12) and is not a source.

## (d) Decisions and High-risk gates for Charlie

Only he can settle these; the cards carry the defaults in bold.

1. Console path: **`/tracker/console`**, not an apex `/console` (REQ-52 ADR).
2. Lead source: **Students & Parents**, legacy Leads CRM ignored (REQ-52 spec).
3. REQ-53 is High: a new owner-only permission surface that may touch
   `apps/tracker/proxy.ts` and login paths (human-merge paths). The approver
   leaves High cards to Charlie ("Needs Charlie").
4. REQ-61 is High: the first console write into Notion Touches and Students &
   Parents, an ADR amending workspace ADR 0004, a transition-log migration
   (its own PR, applied only with Charlie's sign-off), and `apps/tracker/lib/notion/`
   changes (needs-human-merge). It may also need `Txn ID` and `Last Txn`
   properties added in Notion by hand (OPS SYSTEM Layer 2 note).
5. Payment evidence rule for the north star: **Invoices `Status = Paid` only**;
   `Last Payment Date` is shown as reported, not verified (REQ-56).
6. Fresh-lead signal is **polling** with a visible last-checked time; no
   webhook or Zapier exists (REQ-62).
7. Production release: `docs/readiness.md` gate, set only by Charlie (REQ-63).
   Nothing in these cards deploys or releases on merge.

Independent, reversible work is not blocked by these: REQ-52 is Ready now and
REQ-55 (shell, Low) and REQ-54 (facade, Medium) follow REQ-53 without needing
decision 3 or 4 beyond the ADR default.

## (e) First unblocked card and why

**REQ-52** is the only Ready card. It is docs-only (Low risk, no migration),
turns the discovery notes into the ADR and the data contract spec every later
card cites, and carries the handoff pack into `main` so the designer of
REQ-55 can read the visual direction from the repository. Everything else is
Backlog behind it by design: REQ-53 needs the placement ADR, and the rest
need the route.

## Pipeline state at intake

- Pipeline Control: not paused.
- Open PRs: #101 (REQ-42 Iris 2/9, awaiting migration 0024, needs-human-merge),
  #104 (docs). Neither touches console paths.
- Board before intake: REQ-40 Needs Approval (High), REQ-42 In Review,
  REQ-43 to 49 Backlog (Iris), REQ-19 Backlog, REQ-34 Blocked.
- Local gate baseline: landing `tsc --noEmit` and tracker `typecheck` green
  on `main` 0cda4fa.
