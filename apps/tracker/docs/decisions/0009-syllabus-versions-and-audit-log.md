# 0009: Syllabus versioning plus a trigger-written, append-only audit log
Status: accepted
Date: 2026-10-04

## Context
Changing a weight mid-term silently changes every past grade, with no trace of what the grade used to be. Logging in app code gets skipped by bugs, scripts and manual SQL.

## Decision
Categories belong to a `syllabus_version`; each course points at its active version. Changes to grades, syllabi and targets are written by Postgres triggers into `tracker.audit_log`, which has no insert, update or delete policies and rejects updates and deletes even from privileged roles.

## Alternatives considered
- App-level logging: skipped by any write outside the app.
- Storing grade snapshots now: a stale cache is a correctness bug (plan item 6).

## Consequences
v0 creates and confirms version 1 in the setup wizard. Editing a syllabus after publish (a new version, with assessments remapped) is deferred (0018).
