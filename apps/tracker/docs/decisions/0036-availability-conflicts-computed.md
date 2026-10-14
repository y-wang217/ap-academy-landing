# 0036: Availability conflicts are computed on read, and a teacher with nothing entered is not flagged
Status: accepted
Date: 2026-10-14
## Context
Scheduler 4/8 (REQ-5) lets teachers edit their own availability, and Charlie needs to see any booked class that a change strands. The spec says to flag such classes and never move, cancel or block anything.
## Decision
- **Computed, not stored.** `findConflicts` runs over the occurrences and the availability the same request reads. There is no conflict table, no "dismiss" and no acknowledgement. Restoring availability, or moving the class in 6/8, clears the entry by itself.
- **Fits means inside one interval.** A class fits when some available interval satisfies `start <= class.start` and `class.end <= end`. Touching windows are already merged by `computeAvailability`, so back-to-back windows hold a class that spans them. Wall-clock on both sides, so DST never enters.
- **Reason.** `time_off` when a time-off exception overlaps the class, otherwise `outside_availability`.
- **Not entered is not a conflict.** During rollout most teachers have no rows. Flagging every class would bury real conflicts, so those teachers are listed once as "No availability entered".
- **Horizon: today plus 91 days.** It matches the 92-day range cap on occurrences. Later conflicts appear as the window rolls forward.
- **One function.** `loadConflicts` serves the route, the conflicts page and the owner's home badge. The badge call is wrapped so a failure shows no badge and never breaks the student list.
- **Copy is client-orchestrated.** `planCopy` is pure; the editor executes it as several API calls, each with a stable request ID, so retrying the whole plan is idempotent. A partial failure shows "Some days were not copied" and reloads real state. An RPC would need a migration.
## Alternatives considered
- Stored conflict rows: need a migration and a resolution workflow.
- Rejecting availability changes that strand a class: the spec says flag, never block.
- Flagging every class of a teacher with no availability: noise during rollout.
## Consequences
No migration, no new permission rule. Teachers see a one-line count of their own classes outside their hours; the full list is admin only. Student names are not shown until the Students read from 3/8 reaches the conflicts page.
