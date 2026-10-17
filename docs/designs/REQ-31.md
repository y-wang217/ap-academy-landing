# REQ-31: Truthful parent calendar states, Past instead of Done and Makeup only when declared

Card: https://app.notion.com/p/3fbd6ae73dd78196a7d3ddbc57534ace (approved by the design approver, sha:bb7a9f2f03a3)

**Summary:** The parent calendar says "past" instead of "done", and a one-off class is labelled by a purpose the owner declares (Makeup, Trial, Extra, or "Class" when none is set), with an optional "Makeup for Tue Oct 13" link to the cancellation it replaces.
**Risk:** Medium (two new nullable columns on `tracker.class_series` behind the existing owner-writes, teacher-and-parent-reads RLS; copy and label changes over data parents can already read. No permission, auth or data-destination change.)

## Build-time notes

The design was approved before REQ-30 (locked class writes, migration 0018, tracker ADR 0050) merged. Three numbers and one write path follow from that, as the design anticipated ("next free number at build time"; "whichever lands second renumbers"):

- The migration is **0019** (`supabase/migrations/0019_class_purpose.sql`), not 0018.
- The new tracker ADR is **0051** (`0051-class-purpose-and-past.md`), not 0050.
- REQ-30 removed `createSeries` and `updateSeriesFields` from the store: every class write goes through `tracker.schedule_write`. So "saves them through `updateSeriesFields` (stale-checked)" is built as: `purpose` and `makeup_for` travel in the `create` args and in `edit_one_off`'s `fields`, which `schedule_write` already stale-checks under its lock. The migration therefore also replaces `tracker.schedule_write` with the same body plus those two columns (a present key sets the value, null included; an absent key keeps it). The clearing rule of AC10 is unchanged: the handler puts `makeup_for: null` in the same `fields` object.

## Problem
Parents read the Calendar tab (REQ-24) as facts about teaching. Today `apps/tracker/lib/domain/schedule/month.ts` sets `done` when a class end time has passed and `summaryLine` in `apps/tracker/lib/view/calendar-text.ts` prints "N classes this month · D done · U upcoming", which implies the lesson was taught. `classState` labels every scheduled `one_off` occurrence "Makeup" (ADR 0047, decision States), so trials and extra lessons read as makeups. Readers: parents (Calendar tab), the owner and teachers (scheduler week view, `components/scheduler/class-card.tsx`). The owner books one-offs in `components/scheduler/class-form.tsx`.

## Acceptance criteria
- [ ] AC1: `buildMonth` returns `summary: { total, past, upcoming }` and each `CalendarClass` has `past: boolean`; no field named `done` remains on `CalendarClass` or `MonthSummary`.
- [ ] AC2: `summaryLine({ total: 8, past: 2, upcoming: 6 })` returns "8 classes this month · 2 past · 6 upcoming"; total 1 gives "1 class this month · …"; total 0 gives "No classes this month.".
- [ ] AC3: No string produced by `lib/view/calendar-text.ts` for any state or summary matches `/\bdone\b/i`.
- [ ] AC4: `classState` returns "class" for a scheduled one-off with no purpose, "makeup" for purpose `makeup`, "trial" for `trial`, "extra" for `extra`, and "scheduled" for a weekly occurrence.
- [ ] AC5: A cancelled occurrence is "cancelled" and a moved occurrence is "moved" regardless of kind or purpose (unchanged behaviour).
- [ ] AC6: `STATE_LABEL` maps class to "Class", makeup to "Makeup", trial to "Trial", extra to "Extra"; scheduled, moved and cancelled words are unchanged. Makeup, Trial, Extra and Class share the neutral tone.
- [ ] AC7: When a makeup one-off has `makeupFor` pointing at an exception in the input whose kind is `cancelled`, its `CalendarClass.makeupFor` is that exception's original date and `makeupNote` returns "Makeup for Tue Oct 13". When the reference is missing from the input, or the exception is no longer `cancelled`, `makeupFor` is null and no note is shown.
- [ ] AC8: Migration 0019 adds `purpose` and `makeup_for` to `tracker.class_series`; existing rows keep null in both; the database rejects a purpose on a weekly series and a `makeup_for` on a row whose purpose is not `makeup`; deleting a referenced exception leaves the makeup row in place with `makeup_for` null.
- [ ] AC9: `POST /api/scheduler/classes` accepts optional `purpose` (`makeup | trial | extra | null`) and `makeupFor` (exception id or null). A purpose on `kind: "weekly"` returns 400. A `makeupFor` without `purpose: "makeup"`, or naming an exception that is not a cancellation of a series of the same student, returns 422 `invalid_makeup_for`.
- [ ] AC10: `PATCH .../occurrences/[date]` with scope "this" on a one-off accepts `changes.purpose` and `changes.makeupFor` with the same rules and saves them through the stale-checked one-off write. Either field on a weekly series returns 400. When the resulting purpose is not `makeup` (set to null, `trial` or `extra`) on a series that has `makeup_for`, the same single write sets `makeup_for` to null and the response is 200, never 500; `makeupFor` sent with a non-makeup purpose is 422 `invalid_makeup_for`.
- [ ] AC11: A new admin-only `GET /api/scheduler/classes/cancellations?studentId=` returns that student's cancelled occurrences with original date from 56 days before today to 28 days after, each `{ exceptionId, date, startTime, subject }`, newest first. Teacher scope gets 403, as the other admin routes.
- [ ] AC12: The booking form, for a new one-off (Repeats weekly unticked), shows a required Purpose select (Makeup, Trial, Extra) and refuses to submit without one; when Makeup is chosen it shows an optional "Replaces" select listing the cancellations from AC11. Editing a one-off shows the same fields prefilled; a row with no purpose shows "Not set" until the owner picks one.
- [ ] AC13: The teacher and owner week view card for a scheduled one-off shows its purpose word (Makeup, Trial, Extra, or Class when unset) instead of nothing; the class dialog shows a Purpose row for one-offs, built by `purposeRow(card)`, and no Purpose row for a weekly class. `cardStatus` never returns "Makeup" for a one-off with no purpose.
- [ ] AC14: The occurrences and week API responses include `purpose` on every occurrence (null on weekly), and the strict response schemas accept it.
- [ ] AC15 (e2e): On the parent Calendar tab the seeded one-offs read "Makeup" with "Makeup for", "Trial" and "Class"; the summary line matches `N classes this month · P past · U upcoming`; the tab's visible text contains no word "done" in any case.
- [ ] AC16: A new tracker ADR records the change and ADR 0047's Status line says which parts it supersedes; `apps/tracker/docs/spec/parent-views.md` gets a dated amendment note at the end, its verbatim text untouched.

## Approach
**Domain (pure)**
- `lib/domain/schedule/recurrence.ts`: `ClassSeries` gains optional `purpose?: ClassPurpose | null` and `makeupFor?: string | null` (exception id). `ClassException` gains optional `id?: string`. `Occurrence` gains `purpose: ClassPurpose | null`, set in `build()` from the series (`?? null`). Export `type ClassPurpose = "makeup" | "trial" | "extra"`.
- `lib/domain/schedule/month.ts`: `ClassState` becomes `"scheduled" | "moved" | "cancelled" | "makeup" | "trial" | "extra" | "class"`. `classState(o)`: cancelled, then moved, then one-off maps purpose to its state or "class" when null; weekly is "scheduled". `CalendarClass.done` becomes `past`; new `makeupFor: string | null` (the replaced class's original date), resolved only while the referenced exception is `cancelled`. `MonthSummary` becomes `{ total, past, upcoming }`.

**View text**
- `lib/view/calendar-text.ts`: `STATE_LABEL` and `STATE_TONE` cover the seven states (the four one-off states are neutral). `summaryLine` prints "past". New `makeupNote(c)`, `PURPOSE_LABEL` and `oneOffLabel(purpose)` ("Class" when null).
- `lib/view/week-text.ts`: `CardLike` gains optional `kind` and `purpose`. In `cardStatus`, a scheduled one-off gets `{ icon: "◆", label: oneOffLabel(purpose) }` in place of "Scheduled". New `purposeRow(card)` returns `{ term: "Purpose", value }` for a one-off and `null` for weekly.

**Parent UI**
- `components/parent-calendar.tsx`: `DOT`, `BLOCK`, `PILL` gain trial, extra and class with the makeup (neutral) classes. `ClassRow` shows `makeupNote(c)` when present. Stays read-only.

**Store and API**
- `lib/data/schedule.ts`: series rows parse `purpose` and `makeup_for`; exception rows parse `id`. The locked write passes both on create and in `edit_one_off` fields.
- `lib/scheduler/schedule-handlers.ts`: `ClassBody` gains `purpose` and `makeupFor`, refined so weekly has no purpose. `EditBody.changes` gains both as optional. `checkMakeupFor` accepts only a cancelled exception on one of the student's series, else 422 `invalid_makeup_for`. Clearing rule as AC10. New `handleStudentCancellations`. `seriesBody` includes both.
- `lib/scheduler/schemas.ts`: `OccurrenceTeacher` gains `purpose`; `SeriesResponse.series` gains `purpose` and `makeupFor`; new `CancellationsResponse`.
- New `app/api/scheduler/classes/cancellations/route.ts`.

**Owner UI**
- `components/scheduler/class-card.tsx`: `CardData` gains `purpose`; the dialog renders `purposeRow(card)` with `data-testid="class-purpose"`.
- `components/scheduler/class-form.tsx`: Purpose select (required on create of a one-off; "Not set" option only when editing a row with none), and an optional "Replaces" select for Makeup loaded from the cancellations route. "Loading cancelled classes"; on failure "Cancelled classes could not load." and the booking still saves.
- The week grids pass `purpose` into `CardData`.

**Docs**
- New tracker ADR 0051 `class-purpose-and-past`. ADR 0047 Status line and README row updated. `docs/spec/parent-views.md` amendment appended. `docs/PLAN.md` progress line.

## Migration
`supabase/migrations/0019_class_purpose.sql`: `purpose text check (purpose in ('makeup','trial','extra'))`, `makeup_for uuid references tracker.class_exceptions (id) on delete set null`, `check (purpose is null or kind = 'one_off')`, `check (makeup_for is null or purpose = 'makeup')`, partial index on `makeup_for`, column grants for insert and update. Policies unchanged. No backfill. `tracker.schedule_write` replaced to carry both columns. Check: `supabase/tests/class_purpose.sql`. Ships first in `req/REQ-31-migration`.

## Test plan
| Test | Type | Covers |
|---|---|---|
| `month.test.ts`: summary has total, past, upcoming and no done key; a class whose end has passed is `past` | unit | AC1 |
| `calendar-text.test.ts`: `summaryLine` with past for 8, 1 and 0 classes | unit | AC2 |
| `calendar-text.test.ts` copy block: no `/\bdone\b/i` or em-dash | unit | AC3 |
| `month.test.ts`: `classState` for each purpose, null and weekly | unit | AC4 |
| `month.test.ts`: cancelled and moved one-offs with each purpose stay cancelled and moved | unit | AC5 |
| `calendar-text.test.ts`: `STATE_LABEL` and `STATE_TONE` maps | unit | AC6 |
| `month.test.ts`, `calendar-text.test.ts`: makeup link resolved, absent, or exception moved | unit | AC7 |
| `supabase/tests/class_purpose.sql` | RLS | AC8 |
| `booking-routes.test.ts`: create with purposes and links | unit | AC9 |
| `booking-routes.test.ts`: PATCH purpose and link, clearing rule | unit | AC10 |
| `booking-routes.test.ts`: cancellations window edges, order, 403, 400 | unit | AC11 |
| `e2e/tracker/flows.mjs`: form requires purpose, Trial saves; legacy one-off edited to Makeup with Replaces | e2e | AC12 |
| `week-text.test.ts`: `cardStatus` and `purposeRow` | unit | AC13 |
| `e2e/tracker/flows.mjs`: dialog purpose row present for one-offs, absent for weekly | e2e | AC13 |
| `week-routes.test.ts`, `schedule-routes.test.ts`: responses carry `purpose` | unit | AC14 |
| `e2e/tracker/flows.mjs` REQ-24 block: Makeup for, Trial, Class, past, no done | e2e | AC15 |
| Review | review | AC16 |

## Out of scope
Reading Lessons rows; attendance, no-show or delivered states; credits, fees or any billing effect of a makeup. The Notion Weekly Schedule summary and monthly review text keep their current one-off wording. The daily teacher texts. Backfilling purposes. "Makeup for" in the teacher week dialog. The student's own Done button on assessments.

## Risks and edge cases
- Legacy one-offs read "Class" until the owner sets a purpose.
- A cancellation later turned into a move: the link stays, but "Makeup for" shows only while the exception is cancelled.
- A split re-keys exceptions by updating them; the id FK follows the row.
- Cross-student link: rejected by the handler; RLS hides other children's exceptions from parents anyway.
- Deleting a referenced exception: no current path does; `on delete set null` keeps the makeup with plain "Makeup".
- Clearing a purpose on a linked makeup: the handler sends `makeup_for: null` in the same write.
- Two makeups for one cancellation: allowed; a label, not a credit.
- Response schema drift: `purpose` added to strict schemas in the same PR as the store change.

## Decisions (defaults stand)
1. No new dependencies. 2. Columns on `tracker.class_series`. 3. "past". 4. "Class" for no purpose. 5. Purpose required in the form; API accepts null. 6. FK to exception id. 7. Same-student rule in the handler. 8. Many makeups per cancellation allowed. 9. "Makeup for" on the parent calendar and the owner's Replaces select only. 10. New admin GET, 56 days back to 28 ahead. 11. New ADR superseding parts of 0047. 12. Dated amendment to parent-views. 13. Notion Weekly Schedule text untouched. 14. Neutral tone for Trial, Extra, Class. 15. REQ-31 first. 16. `on delete set null`.
