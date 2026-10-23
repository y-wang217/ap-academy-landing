# 0072: Iris splits cancellations by the notice the scheduler shows
Status: accepted
Date: 2026-10-22

## Context
Iris 6/9 (REQ-46) is rung 4. Until now every classified cancellation was drafted from the one generic `cancellation` policy section. The founder policy treats three cases differently: 12 or more hours of notice is always accommodated, under 12 hours has no fee but that day's class is not guaranteed, and no message before the class started is a forfeit only Charlie may decide. Telling them apart needs the family's planned classes, which live in the tracker scheduler (`tracker.class_series` and `tracker.class_exceptions`, keyed by the Notion Students & Parents page id, migration 0010, ADR 0034). The Iris spec named this decision 0058; that number is taken by `0058-iris-message-retention.md`, so it is recorded here.

## Decision
- **Where the split happens.** In the draft step (`lib/iris/draft-step.ts`), just before the prompt, for a message at `classified` with intent `cancellation`. The classifier is unchanged and never answers `cancel_with_notice` or `late_cancel`.
- **Which class a message is about.** A code rule in `lib/iris/notice.ts` (pure): occurrences are expanded with `expandOccurrences` over the day before the message's Toronto date to 42 days after it, cancelled ones dropped. The latest class that started today (its start at or before the message) is the target; otherwise the next class to start. No class in that range, no series, or no matched student gives `schedule_unknown`. The model is never asked for a date.
- **Notice.** The notice window is the 7 days before the target's start. Notice is counted from the earliest inbound message of the same thread inside that window, or this message when it is before the start, and is real elapsed time between instants, so a DST change never shifts it (`localToUtc` in `wallclock.ts` handles the zone once). At or above `NOTICE_HOURS` (12) it is `cancel_with_notice`, otherwise `late_cancel`. Only the same thread is checked; another thread of the family is not seen.
- **No-show.** A target that has started, with no message in the window before it, is a schedule no-show: the message is stored `state escalated`, `intent no_show`, reason `schedule_no_show`, `handled_at` null, with one `escalated` event carrying the classifier's `cancellation`, the class date and the student id. It then gets a `no_show` draft with no schedule facts, which confirms nothing; `listDraftable` accepts `schedule_no_show` beside `escalate_only`, so a failed draft call is retried by the next run and the message stays in Needs you.
- **Fallback.** `schedule_unknown` drafts the plain `cancellation` text and adds the flag `schedule_unknown` to the message, shown as "schedule unknown". It lives in `SCHEDULE_FLAGS`, kept out of `FLAGS`, so the classifier is never asked for it and it never escalates. A message with no `notion_student_id` is `schedule_unknown` without reading any schedule: Iris does not guess whose class it is.
- **What the model sees.** For the two schedule-aware types the prompt's user part adds "Missed class" and "Next scheduled class" lines with weekday, day and month only, never a year or a clock time, so the draft rule check still holds. The system part holds only that type's policy text.
- **The read.** `lib/data/iris-schedule.ts` reads one student's series and exceptions with the poll's service client, filtered by org, select only, parsed with the scheduler's `SeriesRow` and `ExceptionRow`. A query error throws; the draft step then skips that message with no write and no retry spent, and the run's error is "Could not read the schedule". Each student is read at most once per run. Iris writes nothing to the scheduler, Students & Parents or Missed Sessions & Credits.
- **Version.** `POLICY_VERSION` is 4. No section text changed, but `cancellation` now covers only the fallback, so its old streak no longer means the same thing. `cancel_with_notice` and `late_cancel` each get their own streak through `iris.count_review`, which keys rows by reply type.

## Alternatives considered
- **Split in the classifier.** It does not know the schedule, and a model-picked date could later reach an auto-sent reply. Rejected.
- **Notice from the current message only.** A follow-up written after the class started would turn a timely cancellation into a no-show. Rejected for the earliest message in the window.
- **Any thread of the family.** More complete, but the card scopes it to the thread; a miss escalates or reaches a human approval, the safe direction.
- **Keep `intent cancellation` for a schedule no-show.** It would need a second draftable branch; reusing `intent no_show` keeps the existing no-show draft and retry path.
- **Fall back to `schedule_unknown` on a failed read.** A failed read must not look like "no schedule" (the tracker's own rule), so the message waits instead.
- **Guess the student from a thread with one child.** A thread can hold siblings; the flag tells Charlie the reply is the plain one.

## Consequences
- Charlie sees sharper drafts, a separate streak per cancellation type and schedule no-shows in Needs you. Nothing is sent by this card.
- The version bump resets live streak progress. Nothing is enabled yet and Iris starts paused.
- A parent who writes on Tuesday evening after class about next Tuesday reads as a no-show for today and reaches Charlie. A class Charlie already cancelled in the scheduler is skipped, so the draft names the next one, and Charlie sees the date before approving.
- Revisit when Iris 7/9 offers make-up times, or if the same-thread limit causes misses in practice.
