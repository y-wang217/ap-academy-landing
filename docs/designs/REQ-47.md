# Design: REQ-47: Iris 7/9: Make-up time offers from real availability (rung 5)

Copied from the approved card (Notion, approved after revise 1 of 2 on 2026-10-22). Card:
https://app.notion.com/p/3fbd6ae73dd781008023e44b11e82aa4

**Summary:** When a family asks to move a class, Iris's draft offers up to three real make-up times for the student's own teacher. Code computes the times from the scheduler's declared availability and collision check, and writes them into the draft itself. A teacher with no availability entered, or with no free time, gets the "Charlie will send options" reply. Iris books nothing. Charlie books in `/tracker/schedule` after the parent picks.

**Risk:** Medium. The poll run reads two more scheduler tables (`tracker.availability_windows`, `tracker.availability_exceptions`) with the service client it already uses. It only writes drafts. Nothing is sent and nothing is booked. The model never sees a time or a teacher name, and no data goes anywhere new (the Notion phone backup of drafts already exists). There is no auth, RLS or permission change and no migration.

## Problem

Charlie, the org owner and the only Iris user, approves every draft. Today a classified `reschedule_request` is drafted from policy text that ends "Until Iris can read it, say that Charlie will send some options" (`apps/tracker/lib/iris/policy.ts`). Charlie then works out times by hand from `/tracker/schedule/availability`. Rung 5 of the Iris spec (card 7/9) asks for the draft to carry real options instead: inside the teacher's declared availability, not colliding with the teacher's or the student's other classes, the same length as the class being moved, between that class and the next scheduled one, at most three, earliest first.

The building blocks already exist:

- `computeAvailability` (`apps/tracker/lib/domain/schedule/availability.ts`) and `checkBooking` (`apps/tracker/lib/domain/schedule/booking.ts`), which the scheduler uses for bookings.
- `expandOccurrences` (`lib/domain/schedule/recurrence.ts`).
- The REQ-46 schedule reader `createIrisScheduleReader` (`apps/tracker/lib/data/iris-schedule.ts`), wired into `runDraft` (`apps/tracker/lib/iris/draft-step.ts`) through `handleIrisRun` (`lib/iris/handlers.ts`) and `app/api/iris/run/route.ts`.
- The `reschedule_offer` reply type and its policy section are already declared in `policy.ts`, but nothing produces them yet.

Parents receive better replies (only after Charlie approves them). Teachers, students and parents see nothing new in the tracker.

## Acceptance criteria

- [ ] AC1: **Which class is being moved.** `resolveRescheduleTarget` (pure, new `lib/iris/makeup.ts`) expands the student's series and exceptions from the message's Toronto date to 42 days later, drops cancelled occurrences, and picks the first class that starts after the message's `received_at`. That class is the target. The next kept occurrence after it is `next` (null when there is none). A moved occurrence counts at its new date and time. When there is no target, the result is `schedule_unknown`.
- [ ] AC2: **Slot rules.** `findMakeupSlots` (pure, `makeup.ts`) takes the target, `next`, the teacher's windows and availability exceptions, the teacher's and the student's occurrences, and `now`. It returns only slots where every one of these holds:
  - (a) the slot lies wholly inside one interval of `computeAvailability` for the target's teacher (`staffId`) on that date;
  - (b) `checkBooking` with `checkAvailability: true` returns no problem for it, so there is no `teacher_busy`, `student_busy`, `outside_availability`, `time_off` or `availability_not_entered`;
  - (c) its duration equals the target's `durationMinutes`;
  - (d) it starts at or after the target's end and at or after `now` plus `MAKEUP_LEAD_HOURS` (24);
  - (e) it ends at or before `next`'s start, or, when `next` is null, falls on or before the target's date plus 7 days;
  - (f) it starts on a 30-minute boundary (:00 or :30) of Toronto wall-clock time.

  It returns at most `MAKEUP_MAX_SLOTS` (3), at most one per date, earliest first. The same input always gives the same output. The result is `{ kind: "slots", slots }`, `{ kind: "not_entered" }` (the teacher has no windows and no availability exceptions at all, ADR 0036) or `{ kind: "none_free" }`. `not_entered` has exactly one definition: `teacher.windows` and `teacher.availabilityExceptions` are both empty, where the reader returns every row for the teacher on any date (Approach 4). This is `computeAvailability`'s "no rows at all" rule. A teacher with any row, even one outside the range, is never `not_entered`.
- [ ] AC3: **Offer draft.** For a message at `classified` with intent `reschedule_request`, a matched `notion_student_id`, and at least one slot, the stored draft has `reply_type reschedule_offer`. Its body is the model's text with the one `[OPTIONS]` line replaced by one code-built line per slot, in the form "- Thursday 29 October, 4:00 pm to 5:00 pm". The `drafted` event detail carries `reply_type`, `class_date` (the target's date) and `offered_slots` (the slots' start instants, ISO). The message goes to `drafted`, or to `escalated` with reason `needs_charlie` when the model asks for it, as today.
- [ ] AC4: **Fallbacks never name a time.** Each of these drafts `reply_type reschedule_request` from its updated policy text ("Charlie will send options", the card's wording), stores no `offered_slots`, and adds one schedule flag to the message:
  - `availability_not_entered` when the teacher has nothing entered;
  - `no_free_slot` when availability is entered but no slot passes AC2;
  - `schedule_unknown` when there is no `notion_student_id`, no series, or no target.

  None of these flags escalates. Every fallback draft passes the existing `time` rule in `checkDraft`, so it holds no clock time.
- [ ] AC5: **The hard rule is a test.** A draft body may hold a time only when the slot list supplied it. In detail:
  - A model body that already contains a clock time (the existing `time` rule) is escalated with reason `draft_rule`, and no draft is stored.
  - So is a body for an offer that does not contain the `[OPTIONS]` line exactly once (new rule `options`).
  - After the placeholder is filled, `timesOutsideSlots(body, slots)` (new in `lib/iris/draft-rules.ts`) must return an empty list, or the message is escalated with `draft_rule` (rules `["time"]`) and nothing is stored.
  - In `draft-step.test.ts`, every stored draft across all fixtures has `timesOutsideSlots(body, slotsOfThatMessage)` empty, where the slots are an empty list for every non-offer draft.
- [ ] AC6: **What the model sees.** For `reschedule_offer`, the system prompt holds exactly the `reschedule_offer` policy text from `policy.ts` and no other policy text, which is the existing prompt test applied to the new type. The user part adds three lines:
  - "Class to move" (weekday, day and month only);
  - "Next scheduled class" (the same format, or "none on the schedule");
  - "Make-up times offered: N, written in for you where you put [OPTIONS]".

  The prompt contains no clock time, no slot date, and no teacher name or id.
- [ ] AC7: **Iris never books.** `lib/data/iris-schedule.ts` calls only `.select(` on tracker tables. A scan test fails on `insert`, `update`, `upsert`, `delete` or `rpc` there and in `lib/iris/makeup.ts`. In the e2e run, the existing `trackerSnapshot()` of every tracker table is identical before and after the Iris runs that produce an offer draft and a fallback draft. No Iris route or component books a class.
- [ ] AC8: **Read failure.** When the teacher's availability read throws, the message is left as it was: no state change, no retry spent, no draft and no `ai_calls` row. The run's error is "Could not read the schedule" and the next run tries again. Each teacher's calendar is read at most once per run, and so is each student's (the existing REQ-46 memo). The teacher read covers the whole calendar with no date range, so every later message for the same teacher reuses it, whatever its target date.
- [ ] AC9: **Policy and streak.** `POLICY_VERSION` is 5. The texts of `reschedule_request` and `reschedule_offer` change (Approach 1), and `OPTIONS_TOKEN`, `MAKEUP_MAX_SLOTS` and `MAKEUP_LEAD_HOURS` live in `policy.ts`. `reschedule_offer` drafts count toward their own streak row through `iris.count_review`, which keys by reply type, so approving one leaves the `reschedule_request` streak unchanged.
- [ ] AC10: **A parent picking a time.** A later inbound message on the same thread ("Thursday at 4 works") is stored and classified like any new message. No code links it to an offered slot, books it, or changes the earlier draft.
- [ ] AC11: **Charlie's view.** On `/tracker/iris/messages/[id]`, a `reschedule_offer` draft shows "Times come from the teacher's availability. Nothing is booked: book the time the family picks in Schedule." with a link to `/tracker/schedule`. The inbox and message pages show the two new flags as "teacher availability not entered" and "no free make-up time", next to the state as `schedule_unknown` is today.
- [ ] AC12: Tracker ADR `apps/tracker/docs/decisions/0075-iris-make-up-offers.md` exists with every section, is listed in the decisions `README.md`, and has no em dash.

## Approach

**1. Policy: `apps/tracker/lib/iris/policy.ts`**

- Set `POLICY_VERSION = 5`. The header comment gains "Version 5 (REQ-47) offers make-up times from teacher availability".
- Add `OPTIONS_TOKEN = "[OPTIONS]"`, `MAKEUP_MAX_SLOTS = 3` and `MAKEUP_LEAD_HOURS = 24`.
- Change `reschedule_request.text` to: "Make-up and reschedule times come only from the teacher's real availability. No times can be offered for this class yet, so say that Charlie will send options."
- Change `reschedule_offer.text` to: "Offer the make-up times listed for this family, which come from the teacher's real availability. Write the line [OPTIONS] on its own line where the times go; the times are written in for you. Never write a day or a clock time yourself. Never say a time is booked: Charlie confirms once the family picks one."
- Add `OFFER_REPLY_TYPES = ["reschedule_offer"] as const` and include it in `DraftableType`.
- `SCHEDULE_FLAGS` becomes `["schedule_unknown", "availability_not_entered", "no_free_slot"]`. It stays outside `FLAGS`, so the classifier is never asked for these flags and they never escalate.
- `CLASSIFIER_INTENTS` is unchanged: the classifier never answers `reschedule_offer`.

**2. Pure logic (new): `apps/tracker/lib/iris/makeup.ts`.** It imports only `lib/domain/schedule/*`, `lib/time` and `policy.ts`.

```ts
export type TeacherCalendar = { series: ClassSeries[]; exceptions: ClassException[]; windows: AvailabilityWindow[]; availabilityExceptions: AvailabilityException[] };
export type Slot = { date: string; startTime: string; endTime: string; startsAt: string; endsAt: string };
export function resolveRescheduleTarget(i: { receivedAt: string } & StudentSchedule): { target: Occurrence; next: Occurrence | null } | null;
export function makeupRange(target: Occurrence, next: Occurrence | null): { from: string; to: string };
export function findMakeupSlots(i: { target: Occurrence; next: Occurrence | null; student: StudentSchedule; teacher: TeacherCalendar; now: Date }):
  { kind: "slots"; slots: Slot[] } | { kind: "not_entered" } | { kind: "none_free" };
export function formatSlot(s: Slot): string;       // "Thursday 29 October, 4:00 pm to 5:00 pm"
export function fillOptions(body: string, slots: Slot[]): string | null;  // null unless exactly one [OPTIONS] line
```

How `findMakeupSlots` works:

1. Range: the target's date to `next`'s date, or to the target's date plus 7 days when there is no `next`.
2. If `teacher.windows` and `teacher.availabilityExceptions` are both empty, return `{ kind: "not_entered" }` at once (AC2). Otherwise call `computeAvailability(teacher.windows, teacher.availabilityExceptions, range)`. Because at least one row exists, every day comes back `available` or `unavailable`, never `not_entered`.
3. For each `available` day and interval, candidate starts run on the 30-minute grid from the first boundary at or after the interval start, while start plus duration is at or before the interval end. Each candidate is built as an `Occurrence` by running `expandOccurrences` over one synthetic `one_off` series (id `offer`, the target's `staffId`, `studentId`, `subject` and duration). That way `startsAt` and `endsAt` go through `localToUtc`, and DST is handled once.
4. Drop candidates that break AC2 (d) or (e).
5. `others`: the teacher's and the student's occurrences over the range, from `expandOccurrences` and deduplicated by `occurrenceKey`. Run `checkBooking({ candidates, others, availability: new Map([[staffId, { days, exceptions }]]), checkAvailability: true, today: localDateOf(now) })` and drop every candidate that has a problem.
6. Keep the earliest candidate per date, sort, and take the first 3. If none is left, return `none_free`.

**3. Rule check: `apps/tracker/lib/iris/draft-rules.ts`**

- `DraftRule` gains `"options"`.
- New `timesOutsideSlots(body: string, slots: Slot[]): string[]` returns every clock-time match of the existing `time` regex whose normalised value (for example "4:00 pm" or "16:00", read as minutes) is not a start or end time of some slot.
- `checkDraft` is unchanged, so it still forbids any time in model text.

**4. Reader: `apps/tracker/lib/data/iris-schedule.ts`.** `createIrisScheduleReader` gains `forTeacher(staffId)`, with no range argument. It runs four select-only queries, each with `.eq("org_id", orgId)`:

- every `class_series` with `notion_staff_id = staffId`, with no date filter, so a class moved into the range from an old series is still seen;
- their `class_exceptions`;
- `availability_windows` for the teacher;
- every `availability_exceptions` row for the teacher, with no date filter, so the `not_entered` rule (AC2) sees every row. `findMakeupSlots` passes them all to `computeAvailability`, which uses only the rows for the dates it computes.

Rows are parsed with the scheduler's own schemas. `WindowRow` and `AvailabilityExceptionRow` in `apps/tracker/lib/data/schedule.ts` become exported; nothing else changes there. Any query error throws `"schedule unavailable"`, so a failed read never looks like "nothing entered".

**5. Draft step: `apps/tracker/lib/iris/draft-step.ts`**

- `DraftStepDeps` gains `availability?: ((staffId: string) => Promise<TeacherCalendar>) | null`. Its memo, `Map<staffId, Promise<TeacherCalendar>>`, sits beside the REQ-46 `schedules` map. Every teacher read is the whole calendar, so one entry serves every message in the run: it is never re-read, replaced or merged. A rejected read stays memoised, so other messages for that teacher also wait (AC8), as the student memo does today.
- The new branch runs for `m.intent === "reschedule_request" && m.state === "classified" && deps.schedule && deps.availability`. It sits beside the cancellation branch and uses the same shape:
  1. No `notionStudentId`: flag `schedule_unknown`.
  2. Otherwise read the student's schedule (memoised; a throw means the message waits, AC8) and call `resolveRescheduleTarget`. Null: flag `schedule_unknown`.
  3. Read the teacher's calendar through the memo (a throw means the message waits), then call `findMakeupSlots`, which limits itself to `makeupRange(target, next)`.
  4. `slots` gives `replyType = "reschedule_offer"`, the prompt's `schedule = { missedDate: target.date, nextDate: next?.date ?? null }`, `optionCount`, `facts.class_date` and `facts.offered_slots`. `not_entered` and `none_free` add their flag and keep `reschedule_request`.
- After the model answers:
  1. `checkDraft` runs as today.
  2. For an offer, `fillOptions` runs; a null result escalates `draft_rule` with rules `["options"]`.
  3. Then `timesOutsideSlots` runs; any hit escalates `draft_rule` with rules `["time"]`.
  4. The filled body is what `insertDraft` stores.
- Flags are written with the final state update, as REQ-46 does.
- With `deps.availability` absent (old wiring, tests), `reschedule_request` drafts exactly as before.

**6. Prompt: `apps/tracker/lib/iris/draft-prompt.ts`.** `DraftInput` gains `optionCount?: number`. `scheduleLines` gains the `reschedule_offer` branch (AC6), using the existing `classDay`. The cancellation lines are unchanged.

**7. Wiring.**

- `lib/iris/handlers.ts`: `IrisRunDeps` gains `availability`, which is passed to `runDraft`.
- `app/api/iris/run/route.ts`: passes `availability: reader.forTeacher`, using the same `createIrisScheduleReader(client.schema("tracker"), orgId)` instance.
- `lib/iris/store.fake.ts` and `run-handlers.test.ts`: fakes for the new port.

**8. UI**

- `apps/tracker/lib/view/iris-text.ts`: add `FLAG_LABELS` entries `availability_not_entered: "teacher availability not entered"` and `no_free_slot: "no free make-up time"`, plus `offerNote` with the AC11 copy and `bookInSchedule: "Open Schedule"`.
- `apps/tracker/app/iris/messages/[id]/page.tsx`: when the latest draft's `reply_type` is `reschedule_offer`, show the note under "Policy used", with a `next/link` to `/schedule` (inside the tracker's basePath).
- `app/iris/page.tsx` needs no change: it already renders every `SCHEDULE_FLAGS` entry through `flagLabel`.

Layout of the message page Draft card (375 px):

```
Policy used: Reschedule offer   policy v5
Times come from the teacher's availability. Nothing is booked:
book the time the family picks in Schedule.   [Open Schedule]
Draft v1
"Hi Ann, we can move Nina's class. These times work:
- Thursday 29 October, 4:00 pm to 5:00 pm
- Friday 30 October, 5:30 pm to 6:30 pm
Let me know which suits you and I will confirm it."
Charlie / AP Academy
[Approve] [Edit] [Reject]
```

The page's states are the existing ones (the loading, error and not-found copy are unchanged). A fallback draft shows no note. Its flag appears beside the state on the inbox row.

**9. Docs.** Add tracker ADR `0075-iris-make-up-offers.md` and its README row. It records the target rule, the slot rules and constants, code-filled options, the fallbacks and flags, the select-only read, and "never books". Add a `docs/PLAN.md` progress line. The `docs/readiness.md` row is the builder's step on ship, if one exists.

## Migration

None. `iris.drafts.reply_type` and `iris.reply_types.type` are free text (migration 0025), so `reschedule_offer` needs no schema change. `service_role` already has grants on `tracker.availability_windows` and `tracker.availability_exceptions` (migration 0010).

## Test plan

| Test | Type | Covers |
| --- | --- | --- |
| `apps/tracker/lib/iris/makeup.test.ts` target fixtures: next class after the message; a class already started today is not the target; a cancelled next occurrence is skipped; a moved occurrence counts at its new date; no series or no class in 42 days gives null | unit (vitest) | AC1 |
| `makeup.test.ts` slot fixtures (spec hint: overlapping classes and time off): window 15:00 to 19:00 on three weekdays; the teacher's other student at 16:00 to 17:00 excludes overlapping starts while touching ends are allowed; the student's own other-subject class with another teacher excludes its time; full-day time off removes a date; partial time off cuts an interval; an `extra` exception adds a slot; a slot crossing `next`'s start is dropped; nothing within 24 hours of `now`; a 15:45 interval start gives a 16:00 first slot; a 90-minute class needs a 90-minute fit; at most one slot per date, 3 at most, earliest first; no `next` limits to target + 7 days; a DST-change week gives the right `startsAt`; windows-but-all-busy gives `none_free`; no rows gives `not_entered`; no windows and one time-off exception outside the range gives `none_free`, not `not_entered`; every returned slot re-checked against `computeAvailability` and `checkBooking` gives no problem | unit | AC2, AC4 |
| `makeup.test.ts` `formatSlot` and `fillOptions`: the exact line format; one placeholder filled; zero or two placeholders give null | unit | AC3, AC5 |
| `apps/tracker/lib/iris/draft-rules.test.ts` additions: `timesOutsideSlots` accepts "4:00 pm", "4 pm" and "16:00" for a 16:00 slot, flags "3:30 pm", and returns empty for a body with no times | unit | AC5 |
| `apps/tracker/lib/iris/draft-step.test.ts` additions: an offer draft stored with a filled body, `reply_type reschedule_offer` and event `offered_slots`; the three fallbacks with their flags and `reschedule_request`; a model body with a time escalated `draft_rule` with no draft; a missing placeholder escalated with `["options"]`; a teacher read throw leaves the message untouched with no `ai_calls` row and error "Could not read the schedule"; two messages for one teacher make one teacher read; two messages for one teacher with different target dates (one this week, one three weeks out) make one teacher read, and each gets slots only inside its own `makeupRange`; a teacher read that rejects leaves both of that teacher's messages untouched; no `availability` dep keeps the old behaviour; across every stored draft in the file, `timesOutsideSlots` is empty | unit | AC3, AC4, AC5, AC8 |
| `apps/tracker/lib/iris/draft-prompt.test.ts` additions: the offer system prompt holds exactly the `reschedule_offer` text; the user part has the three lines; the prompt matches no clock-time regex and contains no slot date and no staff id | unit | AC6 |
| `apps/tracker/lib/iris/policy.test.ts` updates: version 5; new constants; `SCHEDULE_FLAGS` disjoint from `FLAGS`; `reschedule_offer` not in `CLASSIFIER_INTENTS` | unit | AC9 |
| `apps/tracker/lib/iris/streak.test.ts` addition: `reschedule_offer` keeps its own streak row apart from `reschedule_request` (the REQ-46 pattern) | unit | AC9 |
| `apps/tracker/lib/data/iris-schedule.test.ts` additions: `forTeacher` filters by org and staff, puts no date filter on series or availability exceptions (an exception dated a year away is returned), uses `select` only, parses the rows, and throws on any query error | unit | AC7, AC8 |
| `apps/tracker/lib/iris/scan.test.ts` addition: no `insert`, `update`, `upsert`, `delete` or `rpc` in `lib/data/iris-schedule.ts` and `lib/iris/makeup.ts` | unit (scan) | AC7 |
| `apps/tracker/lib/iris/run-handlers.test.ts` addition: after an offer draft, a second inbound "Thursday at 4 works" on the thread goes through classify like any message, and no scheduler port is written | unit | AC10 |
| `apps/tracker/lib/view/iris-text.test.ts` additions: the two flag labels and the offer note, with no em dash | unit | AC11 |
| `apps/tracker/lib/iris-adr.test.ts` addition: ADR 0075 sections, README row, no em dash | unit (doc) | AC12 |
| `e2e/tracker/flows.mjs` REQ-47 inside the Iris block, before `trackerBefore`: insert availability windows for Nina's teacher (`aaaaaaaa-...0009`) on every weekday 15:00 to 19:00 from today, and a weekly series for a second seeded family whose teacher has no availability. `mock-anthropic.mjs` returns an offer body with the `[OPTIONS]` line for `reschedule_offer` prompts and a plain "Charlie will send options" body otherwise. Two new reschedule messages are added in `mock-gmail.mjs` (the next free ids). After a run: Nina's draft is `reschedule_offer` with 1 to 3 option lines, each inside 15:00 to 19:00, after her next class and before the one after it, at most one per date; the event `offered_slots` matches the lines; the second family's draft is `reschedule_request` with no clock time and flag `availability_not_entered`; the message page shows the offer note and the Schedule link; `trackerSnapshot()` is unchanged at the end of the block. The builder runs `pnpm test:tracker` before the PR (`apps/tracker/app/` and `e2e/` are `e2e_paths`) | e2e | AC3, AC4, AC7, AC11 |

## Out of scope

- Booking from Iris, holding a slot, or parent self-booking (the card's out of scope).
- Offering times in cancellation replies (`cancel_with_notice`, `late_cancel`). See Decision 4.
- Linking a parent's pick to a slot, or drafting a "booked" confirmation.
- Writing to Notion schedules, Students & Parents or Missed Sessions & Credits.
- Any change to the classifier, the scheduler UI, or `computeAvailability` and `checkBooking` themselves.
- Auto-send for `reschedule_offer` (Iris 9/9 and the eval gate decide that).

## Risks and edge cases

- **Stale offer.** A slot can be taken between the draft and Charlie's booking. Iris never holds a slot, and Charlie books through the scheduler, whose own `checkBooking` and locked writes (ADR 0050) refuse a clash. The offer note tells him to book the one the family picks. A future auto-send (9/9) would need a fresh check at send time. ADR 0075 records this.
- **Most teachers have no availability entered** (ADR 0036, spec open question 5). Those families get the fallback, the same reply as today, with the flag so Charlie can see why.
- **Wrong class.** A message about a class two weeks out is read as about the next one. The draft names the class to move by day, and Charlie sees it before approving. This is the same limit ADR 0072 accepted.
- **Model writes a time anyway.** `checkDraft` escalates it before the placeholder is filled, and `timesOutsideSlots` checks the final body again. Over-escalation only costs Charlie a reply.
- **Sibling families.** `reschedule_request` is in `CHILD_SCOPED`, so a message that names no child is already escalated `ambiguous_student` and never reaches this branch.
- **Repeated offers.** If a parent's pick is classified `reschedule_request` again, Iris drafts a fresh offer. Charlie sees it in the queue and nothing is sent without him until 9/9.
- **DST and midnight.** All slot maths is in Toronto wall-clock minutes per date, as the scheduler does, and instants come only from `localToUtc`. Slots never cross midnight because availability intervals do not.
- **Run time.** One extra four-query read per distinct teacher per run, memoised. Slot search covers at most about 8 days of 30-minute steps, which is negligible.

## Decisions for approval

| # | Decision | Options | Default if you say nothing |
| --- | --- | --- | --- |
| 1 | New dependencies | None | None. |
| 2 | Schema placement and numbers | Migration; tracker ADR number | No migration (`reply_type` is free text; grants exist since 0010). Tracker ADR `apps/tracker/docs/decisions/0075-iris-make-up-offers.md`. `main` has tracker ADRs up to 0073; open `req/` PRs hold 0069, 0070, 0071 and 0074. 0075 is the first number nothing uses. |
| 3 | How times reach the draft | Code writes the slot lines at an `[OPTIONS]` placeholder and the model never sees a time; the model writes the times from a list and code checks them | Code writes them. The hard rule then holds by construction, and the model cannot pair a real time with the wrong day. |
| 4 | Which reply types offer times | `reschedule_request` only; also `cancel_with_notice` and `late_cancel` | `reschedule_request` only, as the card says ("a reschedule draft"). A follow-up card can reuse `findMakeupSlots`. |
| 5 | The class being moved | The next class to start after the message; ADR 0072's "class started today, else next" | The next class to start. |
| 6 | Window when there is no next class | Target date + 7 days; no offer | Target date + 7 days. |
| 7 | Minimum lead time | 24 hours from the run; 12 (`NOTICE_HOURS`); none | 24 hours. |
| 8 | Slot grid and spread | 30-minute grid on :00 and :30, at most one per date; every fitting start, earliest first | 30 minutes, one per date. Still earliest first. |
| 9 | Flags for fallbacks | `availability_not_entered` and `no_free_slot` in `SCHEDULE_FLAGS` (shown, never escalate); no flags | Both flags. |
| 10 | Policy text change | Bump to `POLICY_VERSION` 5 and reword both texts; keep 4 | Bump to 5. |
| 11 | Constants home | `MAKEUP_MAX_SLOTS`, `MAKEUP_LEAD_HOURS` and `OPTIONS_TOKEN` in `policy.ts`; grid step and the 7-day window in `makeup.ts`; all in `TUNING` | As written. |
| 12 | Teacher read shape | Whole calendar with no date filter, read once per teacher per run; a date-filtered read re-read when a range is not covered | Whole calendar, no date filter. |
| 13 | Message page note and link | Add the note and a link to `/tracker/schedule` for offer drafts; no UI change | Add it (AC11). |
| 14 | Exporting `WindowRow` and `AvailabilityExceptionRow` from `lib/data/schedule.ts` | Export them; copy them | Export them, so there is one parser per table (ADR 0017). |
| 15 | Card size | One card; split the slot engine from the draft wiring | One card. |
| 16 | Fallback wording | "Charlie will send options"; "Charlie will send some options" | The card's wording. |

## Built differently from the design

- `makeup.ts` imports the `StudentSchedule` type from `notice.ts` (type only), the same type the draft step already uses.
- The `run-handlers.test.ts` world sets `availability: null`; no change to `store.fake.ts` was needed.
- `resolveRescheduleTarget` makes any next class of the student `next`, so a student's other-subject class always bounds the range. The "student's own other class" fixture therefore calls `findMakeupSlots` directly with Nina's own next class as `next`, testing the `student_busy` rule on its own.
