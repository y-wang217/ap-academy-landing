-- REQ-32 (Feedback 5): narrow who reads tracker.audit_log. Tracker ADR 0052.
-- Tested by supabase/tests/audit_reader_scope.sql.
--
-- 0005 let any org staff (owner or grade teacher) read the whole log. The log
-- holds full before and after rows, so a grade teacher read the history of
-- tables their own policies hide: parent and staff emails (parent_links,
-- staff_links), the Weekly Schedule text (schedule_summaries), every
-- teacher's classes and availability, and membership removals. Now the owner
-- reads every row of their org, and a grade teacher reads only the rows of
-- the grade tables they can already read. Grants, the audit trigger and the
-- append-only guards are unchanged. No rows change.

drop policy "staff read their org's audit log" on tracker.audit_log;

create policy "owner reads their org's audit log" on tracker.audit_log
  for select to authenticated using (tracker.is_org_owner(org_id));

create policy "grade staff read grade audit rows" on tracker.audit_log
  for select to authenticated using (
    tracker.is_org_staff(org_id)
    and table_name in ('students', 'goals', 'courses', 'syllabus_versions', 'categories', 'assessments', 'tasks', 'grade_flags')
  );
