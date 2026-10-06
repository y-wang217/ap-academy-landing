# 0030: A changed syllabus after publish is a new confirmed version, written in one transaction
Status: accepted
Date: 2026-10-06

## Context
ADR 0018 deferred syllabus edits after publish "until a real student's school changes a syllabus mid-term". The owner asked for it on 2026-10-06 ([`../spec/syllabus-revision.md`](../spec/syllabus-revision.md)): with AI intake (ADRs 0028, 0029) a transcript or notes that mention a new weighting landed in "Not placed. Enter these by hand", and nothing could enter it by hand either. Supersedes 0018.

## Decision
- A confirmed version stays as history. Changing it writes version n+1 through one database function, `tracker.revise_syllabus(course, categories, notes)` (migration 0008). In one transaction it inserts the new version and its categories, moves every assessment of the course onto them, points the course at the new version and confirms it as the caller. The existing guards still apply: weights must sum to 100 to confirm, and a confirmed version's categories are read-only.
- The new syllabus is given whole. Each category names, in `from`, the current categories whose work moves into it: one to carry a category over, several to merge, none for a new one. A current category that holds assessments must be named exactly once, or nothing is saved. Scores, due dates and `graded_at` do not change.
- The function is `security invoker`. RLS decides who may call it, as for any staff write. Students and other orgs get "course not found".
- In the change set (ADR 0029) this is one `revise_syllabus` item per course. Later items in the same set name its categories as `$k.j`. A current category id in a later item is moved to its carried-over copy when the set is saved.
- The model keeps using add, update and remove category ops. On a confirmed course the tracker gathers them into one `revise_syllabus` item, which the tutor ticks or leaves as a unit. A removed category whose work counts elsewhere names the receiving one in `category`. A version that fails its checks (weights, stranded marks) goes to notes, with every item that needed it.
- There is no manual form for this yet. The course page says to describe the change in the request box, which is the main way to change data (step 9 prompt).

## Alternatives considered
- Edit version 1 in place: rewrites what past grades were computed with, with no trace beyond the audit log (0018).
- Write the new version item by item through PostgREST, like the rest of a change set (0027): a failure halfway leaves a course on an unconfirmed version, or marks split across two versions.
- One change item per category op on confirmed courses: the tutor could tick half a syllabus, and weights only add up to 100 once all of it is in.
- Snapshot grades before the change: a stale cache is a correctness bug (0009). The old version's categories and the audit log already record what the syllabus was.

## Consequences
- Grades are recomputed under the new weights straight away. The student sees the new syllabus; earlier versions are kept but not shown.
- A version history screen, and a manual "new version" form as a backup to the request box, are not built.
- Migration 0008 adds a function only, with no table changes. It needs sign-off before it is applied live. Until then, saving a revision fails with a plain error and saves nothing.
