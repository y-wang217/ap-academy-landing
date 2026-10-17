# 0051: One-off classes say their purpose, and the parent calendar says past, not done
Status: accepted
Date: 2026-10-17

## Context
The 2026-10-16 readiness review (finding F09, REQ-31) showed that the parent Calendar tab (ADR 0047) states things parents read as facts about teaching that the data does not support. Every scheduled `one_off` occurrence was labelled "Makeup", including trials and extra lessons, and the summary line counted classes whose end time had passed as "done", which reads as "taught". Parents read both as claims about delivery and credits.

## Decision
- **Purpose.** `tracker.class_series` gains a nullable `purpose` (`makeup`, `trial`, `extra`), allowed only on one-offs (migration 0019). A scheduled one-off shows its purpose word; a one-off with no purpose shows "Class", never "Makeup". Moved and Cancelled still win over any purpose. Weekly classes stay Scheduled.
- **No backfill.** Existing one-offs keep a null purpose and read "Class" until the owner sets one from the class form. The booking form requires a purpose for a new one-off; the API still accepts null so scripts and older clients keep working.
- **Makeup link.** A makeup may name the cancelled occurrence it replaces (`makeup_for`, a reference to the `class_exceptions` row by id, `on delete set null`). The parent calendar shows "Makeup for Tue Oct 13" while that exception is still a cancellation. It is a label only: no credit, fee or billing claim, since the credit policy is still pending. The handler accepts a link only to a cancellation of one of the same student's series; any write whose resulting purpose is not `makeup` clears the link in the same write.
- **Counts.** "N classes this month · P past · U upcoming". Past only says the end time has passed. A completed or attended lesson is a separate concept this decision does not claim.
- **Where the words show.** The parent calendar, the teacher and owner week cards (a "◆" badge with the purpose word) and the class dialog (a Purpose row for one-offs). "Makeup for" shows on the parent calendar and in the owner's "Replaces" choice only; a teacher may not be able to read another teacher's cancelled class under RLS.
- **Writes.** Purpose and link travel through the locked class write (ADR 0050): in the `create` arguments and in `edit_one_off`'s fields, where a present key sets the value and an absent key keeps it.

## Alternatives considered
- **Keep ADR 0047's inference** (every one-off is a makeup). It is the finding being fixed.
- **Infer a makeup from a recent cancellation.** Still a guess about intent; a trial booked the week after a cancellation would read as a makeup.
- **Required purpose with a backfill.** No source says what each existing one-off was for; a guessed backfill would recreate the problem.
- **A unique makeup per cancellation.** Two half-length makeups for one missed class are real; the link is a label, not a credit.
- **Link by (series, original date).** A split re-keys exceptions by updating them; the id follows the row, the pair would not.

## Consequences
- Supersedes ADR 0047's States (makeup) and Counts decisions. Its other decisions stand.
- The Notion Weekly Schedule summary and the monthly review keep their one-off wording; that path writes to Notion and is changed only under its own card.
- Attendance, no-show and delivered states follow the lesson link work, held for the billing policy.
