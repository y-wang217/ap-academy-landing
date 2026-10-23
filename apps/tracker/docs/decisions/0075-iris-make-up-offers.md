# 0075: Iris offers make-up times from teacher availability, written in by code
Status: accepted
Date: 2026-10-23

## Context
Iris 7/9 (REQ-47) is rung 5. Until now a classified reschedule request was drafted from policy text that told the family Charlie would send options, and Charlie worked the times out by hand from `/tracker/schedule/availability`. The founder hard rule is that Iris never promises a specific make-up time unless it comes from real teacher availability. The scheduler already has what is needed: declared availability (`computeAvailability`, ADR 0036), the booking collision check (`checkBooking`) and occurrence expansion (`expandOccurrences`). REQ-46 (ADR 0072) already reads one student's classes during the poll.

## Decision
- **Where it happens.** In the draft step (`lib/iris/draft-step.ts`), for a message at `classified` with intent `reschedule_request`, when both the student and the teacher reads are wired. The classifier is unchanged and never answers `reschedule_offer`.
- **Which class is moved.** `resolveRescheduleTarget` in `lib/iris/makeup.ts` (pure) expands the student's series from the message's Toronto date to 42 days later, drops cancelled occurrences and takes the next class to start after the message. A moved occurrence counts at its new date and time. The next kept occurrence after it is `next`. A class already under way is not the target: a missed class is the cancellation path.
- **Slot rules.** `findMakeupSlots` (pure) returns slots for the target's teacher that lie wholly inside one available interval, pass `checkBooking` with `checkAvailability: true` against the teacher's and the student's other occurrences, last as long as the target, start at or after the target's end and at least `MAKEUP_LEAD_HOURS` (24) after the run, end at or before `next`'s start (or fall within the target's date plus 7 days when there is no next), and start on a 30-minute grid of Toronto wall-clock time. It keeps the earliest slot per date and at most `MAKEUP_MAX_SLOTS` (3), earliest first. Instants come only from `localToUtc`, so a DST week is handled once.
- **Not entered.** A teacher with no availability windows and no availability exceptions at all, on any date, is `not_entered` (ADR 0036). A teacher with any row, even far outside the range, is never `not_entered`; with no free time that is `none_free`.
- **Code writes the times.** The model never sees a time, a slot date or a teacher. For `reschedule_offer` the prompt holds only that type's policy text and three lines: the class to move and the next class (weekday, day and month) and how many times are offered. The model writes the line `[OPTIONS]` (`OPTIONS_TOKEN`) on its own line, and code replaces it with one line per slot, "Thursday 29 October, 4:00 pm to 5:00 pm". The existing time rule still checks the model's text first; a body without exactly one placeholder line is held back as `draft_rule` with rule `options`; after the fill, `timesOutsideSlots` holds back any clock time that is not a slot's start or end. The drafted event carries `class_date` and `offered_slots` (the start instants).
- **Fallbacks.** No matched student, no series or no target gives `schedule_unknown`; nothing entered gives `availability_not_entered`; no slot that passes gives `no_free_slot`. Each drafts the plain `reschedule_request` text ("Charlie will send options") and adds its flag. The flags live in `SCHEDULE_FLAGS`, outside `FLAGS`, so they are shown and never escalate.
- **The read.** `forTeacher` in `lib/data/iris-schedule.ts` reads the teacher's series, their exceptions, availability windows and every availability exception, select only, filtered by org and staff, with no date filter, and parsed with the scheduler's own row schemas. Any query error throws, and the message waits for the next run with no retry spent and no model call; the run's error is "Could not read the schedule". Each teacher is read at most once per run.
- **Iris never books.** Nothing in the reader or `makeup.ts` writes, and a scan test enforces it. A parent's pick is a new inbound message, classified like any other. Charlie books in Schedule, whose own check and locked writes (ADR 0050) refuse a clash. The message page says so for every offer draft and links to Schedule.
- **Version and streak.** `POLICY_VERSION` is 5: the `reschedule_request` and `reschedule_offer` texts changed. `reschedule_offer` keeps its own streak row through `iris.count_review`, which keys by reply type.

## Alternatives considered
- **The model writes times from a supplied list, and code checks them.** It could pair a real time with the wrong day, and the check would have to parse free text. Rejected: with a placeholder the hard rule holds by construction.
- **Offer times in cancellation replies too.** It would change the two streaks REQ-46 just split; a later card can reuse `findMakeupSlots`.
- **ADR 0072's "class started today, else next" target.** A class under way cannot be moved.
- **Every fitting start, or a 15-minute grid.** Three options at 4:00, 4:30 and 5:00 on one day are not three real choices.
- **A date-filtered teacher read.** It could miss a class moved into the range from an old series, could misjudge `not_entered`, and would need re-reads per message.
- **Hold a slot until the family answers.** That is booking; the card rules it out.

## Consequences
- Charlie sees offer drafts with real times for teachers who entered availability, and the reason when there are none. Nothing is sent by this card, and nothing is booked.
- An offer can go stale between the draft and Charlie's booking. The scheduler refuses the clash, and an auto-send (Iris 9/9) would need a fresh check at send time.
- Most teachers have no availability entered yet, so most families still get "Charlie will send options", now flagged so Charlie sees why.
- A message about a class two weeks out is read as about the next one; the draft names the class by day and Charlie sees it before approving.
- The version bump resets live streak progress. Nothing is enabled yet and Iris starts paused.
- Revisit when Iris 9/9 decides auto-send for offers, or if teachers enter availability in a way the 30-minute grid serves badly.
