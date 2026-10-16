# 0047: Parent Calendar states, makeups and the not-available rule
Status: accepted
Date: 2026-10-16

## Context
REQ-24 fills the parent Calendar tab with the child's scheduler classes. The card left open which scheduler shape is a makeup, how a child who is not on the scheduler is detected (parents cannot read `schedule_summaries`, REQ-22), the state tones (the palette has only ok, warn, error and neutral), the week start and what a month switch looks like while it loads.

## Decision
- **States.** A `cancelled` exception is Cancelled. A `moved` exception is Moved, with the original date and the series start time ("Moved from Tue 5:30 PM", or the full date when the original is in another week). Any other scheduled occurrence of a `one_off` series is a Makeup; a moved one-off stays Moved. Everything else is Scheduled. States are computed from `expandOccurrences` on every request, never stored.
- **Not available.** A child whose `students.notion_student_id` is null, or who has no `class_series` row, sees "Schedule not available yet". The legacy schedule text in Notion is never read for parents.
- **Tones.** Scheduled ok, Moved warn, Makeup neutral (surface with border), Cancelled an error pill with struck, muted text. Every state also carries its word, and dots and blocks carry `data-state`. Tone is by state, never by course.
- **Weeks start on Sunday** for the grid and "This week", as in the mock. The scheduler's Monday week is unchanged.
- **Counts.** "N classes this month · D done · U upcoming" excludes Cancelled. Done means the class end time has passed; Lessons rows are never read.
- **Teacher names.** First word (or honorific plus first word, as `greetingName`, ADR 0043) from the cached Staff list, only for the staff in the classes shown. A failed Staff list shows "Teacher" and one notice; the page still renders. Extends ADR 0037 to the parent of that teacher's own student.
- **Loading.** No `loading.tsx`. A month switch is a server navigation through `next/link` (`prefetch={false}`); the App Router keeps the current month on screen and `useLinkStatus` sets `aria-busy` on the pressed link and shows "Loading" in the month label until the new month arrives.
- **Reads only.** Server component plus `?month=YYYY-MM` links, no new API route. The loader takes `Pick<ScheduleStore, "listSeriesForStudent">`, and `apps/tracker/test/parent-guardrails.ts` holds the one forbidden-pattern list the Parent cards scan.

## Alternatives considered
- **Makeup only when a cancellation exists in the prior four weeks.** A guess about intent; one-offs are how makeups are booked today.
- **A security-definer function over `schedule_summaries`** to detect adoption. Needs a migration for the same result except in the rare adopted-with-no-series case.
- **A `loading.tsx` skeleton or a keyed Suspense.** The first does not re-show on a search-param navigation; the second blanks the grid even for a fast request.
- **Monday week start** to match the scheduler. The mock and parents' paper calendars start on Sunday.

## Consequences
- A trial or exam-prep one-off shows "Makeup". Revisit with a series flag if extras are often booked as one-offs.
- An adopted child with no series yet reads "not available", which is still true from the parent's side.
- Teacher first names now reach parents; nothing else about staff does.
