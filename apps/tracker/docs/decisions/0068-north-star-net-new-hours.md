# 0068: North star: verified net-new weekly teaching hours from adopted series and Paid invoices
Status: accepted
Date: 2026-10-22

## Context
The founder console's hero instrument (REQ-56) shows net new recurring, paid, teacher-delivered
hours per week. The rule is fixed in `docs/spec/founder-console/02-data-contracts.md` section 5:
weekly `tracker.class_series` rows only; an addition when a series starts in the Toronto week, a
reduction when the day after its `effective_until` is in the week; a series is verified when its
student has a `tracker.student_people` row, a Paid Notion invoice, and a stage of Onboarding or
Active (or the series has ended). The spec leaves open how adoption, students the scheduler does
not hold, the opening figure, the panel status and the week-on-week change behave. Taken alone,
every student brought into the scheduler would read as new hours in their adoption week.

## Decision
- **Pure function.** `netNewHours` in `lib/domain/schedule/net-new.ts` works in minutes over
  wall-clock date strings, so DST weeks keep every event on its day. The panel shows hours to one
  decimal.
- **Adoption rule.** A weekly series is adopted when `created_at` equals `adopted_at`
  (its student's `schedule_summaries` row) as an instant (`adopt_student_schedule`, migration 0011, inserts
  both in one transaction). Its addition is excluded with reason `adopted`: it is an existing class
  brought in, not new hours. Its later reduction counts like any other. A series written after an
  empty-text adoption has a later `created_at` and counts as an addition.
- **Not in scheduler.** A series, weekly or one-off, whose student has no `schedule_summaries` row
  is excluded with reason `not_in_scheduler` and never counts as verified, unverified or opening.
  The student's legacy Weekly Schedule text may still describe classes billing reads, so scheduler
  rows alone would misstate that student's hours. Onboarding or Active students with no adoption
  row are listed as "not in scheduler" too.
- **Opening baseline.** Verified minutes of weekly series running on the week's Monday that began
  before it, plus adopted series whose start date is in the week, so an adoption week does not
  lose hours.
- **Status mapping and precedence.** The function returns verified, incomplete or unverifiable;
  the panel maps them to ready (empty when nothing moved), stale and unverifiable. A failed series
  read is error. Precedence is error, then unverifiable, then stale, then ready or empty. A failed
  Invoices read, an Invoices read stopped at the page cap, or a failed people read makes the
  metric unverifiable: the gross moves are shown unclassified with their series ids, and no
  verified or unverified figure is shown. An Invoices panel that is stale only because names could
  not be joined (`readComplete` in `lib/console/facade.ts`) stays usable. A people copy older than
  `TUNING.peopleStaleMinutes` is incomplete.
- **Percentage rule.** The prior week is computed by the same function. A "vs last week" line
  appears only when both weeks are verified; it carries a percentage only when the prior week's
  verified net is not 0, and hours alone when it is 0.
- **Reads.** The series read is new (`lib/console/series-read.ts`), on the owner's client, and
  throws on any error. The people copy is read once per page load (`sharePeopleRead`), shared by
  the facade and the north star. The north star adds no facade provider, so the health route keeps
  its six providers. `schedule_writes` is not read: `effective_until` already carries both
  `end_series` and `split`.

## Alternatives considered
- Counting adopted series as additions, as the spec text alone reads: every import would spike.
- Classifying unadopted students' series like adopted ones: contradicts the card ("not counted").
- A seventh facade provider for series: changes the health route e2e pins.
- Treating a failed people read as "no students": would mark every series `not_synced` and
  fabricate an unverified figure.

## Consequences
- Figures are computed from current rows at read time: an invoice marked Paid later moves a past
  week's additions to verified, and a direct `duration_minutes` edit would change history silently.
- `Last Payment Date` is not read; a "reported" readout would need a new Notion reader.
- Revisit if stage history is stored, or if adoption ever stops sharing one transaction timestamp.
