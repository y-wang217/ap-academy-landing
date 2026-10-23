# Design: REQ-46: Iris 6/9: Schedule-aware cancellations (rung 4)

Copied from the approved card (Notion, approved after revise 2 of 2 on 2026-10-22). Card:
https://app.notion.com/p/3fbd6ae73dd7816295fcf3d901fb2d43

**Summary:** when a parent cancels a class, Iris checks the scheduler and drafts one of three replies. With 12 or more hours of notice it is a *Cancellation with notice*. With less it is a *Late cancellation*. A message that arrives after the class started, with no earlier message, goes to Charlie as a no-show with a draft that confirms nothing. Each draft names the missed class and the next class by date only. A student with no schedule, or a message with no matched student, falls back to the plain cancellation reply, flagged "schedule unknown". Iris writes nothing to the scheduler or to Notion people or billing.

**Risk:** Medium. The owner-only poll run gains a read of `tracker.class_series` and `tracker.class_exceptions` through the service client it already has. Two class dates per draft go to Claude, which already receives the parent's message (Iris 3/9), so this is no new destination. There is no write outside the `iris` schema, no migration, and no change to auth, RLS or permissions.

## Problem

Charlie (org owner) gets cancellation emails. Today Iris 4/9 drafts every cancellation from the one generic `cancellation` policy section (`apps/tracker/lib/iris/policy.ts`). The founder policy (spec section 1, Policy values) treats three cases differently:

- **12 or more hours of notice:** always accommodated.
- **Under 12 hours:** no fee, but that day's class is not guaranteed.
- **No message before class start:** a forfeit only Charlie may decide.

Telling these apart needs the family's planned classes. They are in the tracker scheduler (`tracker.class_series` and `tracker.class_exceptions`, keyed by the Notion Students & Parents page id in `notion_student_id`, migration 0010, tracker ADR 0034). Nothing in Iris reads them yet.

## Acceptance criteria

All times are America/Toronto unless an instant is given. The fixture is a weekly series starting Tue 2026-10-06 at 17:00 for 60 minutes, for the matched student.

- [ ] AC1: `resolveCancellation` (pure) returns `cancel_with_notice` for a cancellation received Mon 2026-10-19 20:00 (21 h before), with `missedDate` 2026-10-20 and `nextDate` 2026-10-27.
- [ ] AC2: It returns `late_cancel` for Tue 2026-10-20 06:00 (11 h). Exactly 12 h (Tue 05:00) is `cancel_with_notice`, and 11 h 59 min (Tue 05:01) is `late_cancel`.
- [ ] AC3: It returns `no_show` for Tue 2026-10-20 17:20 with no earlier inbound message in the thread. It also returns `no_show` for 18:30 that day, after the class ended. With an earlier inbound message in the thread at Mon 20:00 it returns `cancel_with_notice`, and with one at Tue 16:00 it returns `late_cancel`. Notice is counted from the earliest inbound message in the 7 days before the class start.
- [ ] AC4: Across DST, a message at Mon 2026-11-02 20:00 is `cancel_with_notice` for the class at Tue 2026-11-03 17:00 local (instant `2026-11-03T22:00:00.000Z`). Notice is real elapsed time, not wall-clock difference:
  - Class Sun 2026-11-01 12:30, message 01:00 EDT (`05:00Z`): 12.5 h, so `cancel_with_notice`.
  - Class Sun 2026-03-08 13:30, message 01:00 EST (`06:00Z`): 11.5 h, so `late_cancel`.
- [ ] AC5: `resolveCancellation` follows scheduler exceptions on the fixture series:
  - Cancelled: with the Tue 2026-10-20 occurrence cancelled, a message at Tue 2026-10-20 06:00 targets Tue 2026-10-27 17:00 and returns `cancel_with_notice` with `missedDate` 2026-10-27 and `nextDate` 2026-11-03.
  - Moved, late: with the Tue 2026-10-20 occurrence moved to Thu 2026-10-22 16:00, a message at Thu 2026-10-22 06:00 (10 h before) returns `late_cancel` with `missedDate` 2026-10-22 and `nextDate` 2026-10-27.
  - Moved, not a no-show: with the same move, a message at Tue 2026-10-20 18:00 returns `cancel_with_notice` with `missedDate` 2026-10-22, because no class started on Tue.
- [ ] AC6: The result is `schedule_unknown` in three cases, each handled as AC9 says:
  - The message has no `notion_student_id`. The draft step decides this itself and never calls the schedule port.
  - The student has no series. `resolveCancellation` returns it.
  - The student has no unfinished occurrence in the 43 days from the receipt date. `resolveCancellation` returns it.
- [ ] AC7: In the poll run, a classified `cancellation` message gets a draft whose `reply_type` matches the AC1 to AC5 result. Because `iris.count_review` keys streaks by `reply_type`, `cancel_with_notice` and `late_cancel` each have their own streak. The draft prompt holds only that type's policy text, verbatim. Its user part has the lines `Missed class: Tuesday 20 October` and `Next scheduled class: Tuesday 27 October` (or `Next scheduled class: none on the schedule`). It never contains a clock time (`\d{1,2}:\d{2}`).
- [ ] AC8: For a `no_show` result, the message becomes `state escalated`, `intent no_show`, `escalation_reason schedule_no_show` and `handled_at` null, with one `escalated` event (detail: `classified_intent: "cancellation"`, `class_date`, `notion_student_id`). It then gets a `no_show` draft that passes `checkDraft`. If that draft call fails, the next run drafts it, because `listDraftable` includes reason `schedule_no_show`. The message stays in Needs you whatever happens.
- [ ] AC9: For `schedule_unknown`, the draft uses `reply_type cancellation` with the existing text, and the message's `flags` gains `schedule_unknown`. The flag does not escalate. The inbox and message page show it as "schedule unknown".
- [ ] AC10: A failed schedule read leaves the message at `classified` with no retry spent and no draft. The run records "Could not read the schedule" as its error (at most 300 characters). Every other message in the run is still processed.
- [ ] AC11: Iris writes nothing to the scheduler or to Notion people or billing:
  - The new reader (`apps/tracker/lib/data/iris-schedule.ts`) contains no `insert`, `update`, `upsert`, `delete` or `rpc` (source scan).
  - In the e2e run, the md5 snapshot of every `tracker` table except `audit_log` and `notion_outbox` is the same before and after an Iris run that drafts a schedule-aware cancellation.
  - The mock Notion receives no request to the Students & Parents or Missed Sessions & Credits data sources other than the existing directory query.
- [ ] AC12: `POLICY_VERSION` is 4. Tracker ADR `apps/tracker/docs/decisions/0072-iris-schedule-aware-cancellations.md` exists with every section, is listed in the decisions `README.md`, and has no em dash.

## Approach

1. **Pure resolver (new): `apps/tracker/lib/iris/notice.ts`.** `resolveCancellation({ receivedAt, earlierInbound, series, exceptions })` returns `cancel_with_notice | late_cancel` (with `missedDate`, `missedStartsAt`, `nextDate`, `noticeMinutes`), `no_show` (with `missedDate`, `missedStartsAt`) or `schedule_unknown`. Rules, in order: D is the local date of `receivedAt`; expand occurrences over [D - 1, D + 42] and drop cancelled ones. The latest occurrence dated D whose `startsAt <= receivedAt` is the target and has started; otherwise the first occurrence with `startsAt > receivedAt`; none is `schedule_unknown`. The notice window is [start - 7 days, start). `firstNotice` is the earliest `earlierInbound` time inside the window, plus `receivedAt` when it is before the start. A started target with no `firstNotice` is `no_show`. Otherwise `noticeMinutes = (start - firstNotice) / 60000`; at or above `NOTICE_HOURS * 60` it is `cancel_with_notice`, else `late_cancel`. `nextDate` is the date of the first kept occurrence after the target, or null.
2. **Schedule reader (new): `apps/tracker/lib/data/iris-schedule.ts`.** `createIrisScheduleReader(tracker, orgId).forStudent(studentId)`: select-only, Zod-parsed, throws on any error. Queries `class_series` by org and student, then `class_exceptions` by org and series ids (skipped with no series). `SeriesRow` and `ExceptionRow` in `lib/data/schedule.ts` become exported.
3. **Wiring.** `IrisRunDeps` gains `schedule`; the route passes the reader over `client.schema("tracker")`; `handleIrisRun` passes it to `runDraft`, memoised per student per run.
4. **Draft step.** For a classified `cancellation` with `deps.schedule` set: no `notionStudentId` gives `schedule_unknown` with no read; a throwing read skips the message with no write and the step error "Could not read the schedule"; otherwise resolve with the thread's earlier inbound messages. With notice or late: that reply type and the prompt's schedule dates. No-show: escalate per AC8, then draft `no_show`, staying escalated, with the drafted event's reason `schedule_no_show`. Unknown: `cancellation` plus the flag. The drafted event gains `notice_minutes` and `class_date` when known. `DraftableMessage` gains `flags`; `listDraftable` accepts `escalation_reason.in.(escalate_only,schedule_no_show)`.
5. **Prompt.** `DraftInput.schedule?: { missedDate, nextDate }` adds two code-built date lines (weekday, day, month) to the user part. The system part is unchanged.
6. **Policy.** `POLICY_VERSION = 4`; `SCHEDULE_REPLY_TYPES` added to `DraftableType`; `SCHEDULE_FLAGS = ["schedule_unknown"]` kept out of `FLAGS`. No section text changes.
7. **Copy.** `FLAG_LABELS.schedule_unknown = "schedule unknown"`; `reasonLabel("schedule_no_show")` is "Wrote after class started".
8. **Docs.** Tracker ADR 0072, README row, PLAN.md progress line. It notes that the spec named this ADR 0058, now taken.
9. **e2e.** A new mock family `bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbb0005` ("Nina Notice", `notice.parent@example.com`); an inline `psql` insert of a weekly MPM2D series for that student, Toronto today + 2 at 17:00 for 60 minutes, before `trackerBefore`; m9 sent from the new family; the REQ-42, REQ-43 and REQ-44 checks that pin policy version 3, the `cancellation` streak and the cancellation policy text updated.

## Migration

None.

## Test plan

| Test | Type | Covers |
| --- | --- | --- |
| `lib/iris/notice.test.ts`: table-driven resolver fixtures | unit | AC1 to AC6 |
| `lib/iris/draft-step.test.ts` additions | unit | AC6 to AC10 |
| `lib/iris/streak.test.ts` addition | unit | AC7 |
| `lib/iris/draft-prompt.test.ts` additions | unit | AC7 |
| `lib/iris/policy.test.ts` additions | unit | AC9, AC12 |
| `lib/iris/route.test.ts` addition | unit | AC9 |
| `lib/data/iris-schedule.test.ts` | unit | AC10, AC11 |
| `lib/data/iris.test.ts` addition (`listDraftable`) | unit | AC8 |
| `lib/view/iris-text.test.ts` additions | unit | AC9 |
| `lib/iris-adr.test.ts` addition | unit (doc) | AC12 |
| `e2e/tracker/flows.mjs` REQ-46 | e2e | AC7, AC11, AC12 |

## Decisions for approval (defaults taken)

1. No new dependencies. 2. No migration; tracker ADR 0072. 3. The split happens in the draft step. 4. The target class is chosen by a code rule. 5. "No earlier message" is the same thread within 7 days. 6. Notice is measured from the earliest inbound message in the window. 7. A schedule no-show is stored as `intent no_show` with reason `schedule_no_show`. 8. `schedule_unknown` is a non-escalating flag kept out of `FLAGS`. 9. Dates (no times) go in the draft prompt. 10. `POLICY_VERSION` bumps to 4. 11. The no-show draft carries no schedule facts. 12. A schedule read failure skips the message and retries next run. 13. `SeriesRow` and `ExceptionRow` are exported and reused. 14. One card. 15. A message with no `notion_student_id` is `schedule_unknown` with no read. 16. e2e uses an inline insert and a new family, with m9 moved to it.

## Build notes

- `lib/data/iris.test.ts` does not exist on `main` (REQ-45's open PR adds it). The `listDraftable` check lives in `lib/data/iris-draftable.test.ts` so the two PRs do not collide on a new file.
- `iris.count_review` is SQL only and has no fake, so the streak-per-type check in `streak.test.ts` reads migration 0025 and asserts the streak row is keyed by `(org_id, type)` from `d.reply_type`; the e2e run asserts the live `cancel_with_notice` streak row.
- `DraftableMessage` also carries `escalationReason`, so a schedule no-show whose first draft failed keeps reason `schedule_no_show` on its retried `drafted` event.
