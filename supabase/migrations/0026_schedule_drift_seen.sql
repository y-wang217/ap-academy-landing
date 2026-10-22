-- Drift seen markers (REQ-34, Feedback 8): when a sync last replaced a hand
-- edit to a student's Weekly Schedule, and when the owner last marked that
-- replacement as seen on the Weekly schedules page. Tracker ADR 0067.
--
-- Additive only. The owner-only select and update policies from 0011 already
-- cover the new columns; only the column update grant is new. No backfill:
-- a row with old drift text and a null last_drift_at counts as unseen until
-- it is marked once. Mark as seen updates only where last_drift_at is not
-- distinct from the value the page showed, so a newer drift stays unseen.
-- Tested by supabase/tests/scheduler_import.sql.

alter table tracker.schedule_summaries add column last_drift_at timestamptz;
alter table tracker.schedule_summaries add column drift_seen_at timestamptz;

grant update (last_drift_at, drift_seen_at) on tracker.schedule_summaries to authenticated;
