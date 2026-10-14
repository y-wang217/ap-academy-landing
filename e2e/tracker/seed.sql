-- End-to-end fixture: one org with one owner. Mirrors what
-- supabase/seed/tracker-bootstrap.sql does on the live project.
insert into auth.users (id, email) values ('00000000-0000-0000-0000-00000000aaaa', 'teacher@example.com');
insert into tracker.orgs (id, name) values ('10000000-0000-0000-0000-00000000aaaa', 'AP Academy');
insert into tracker.memberships (user_id, org_id, role) values
  ('00000000-0000-0000-0000-00000000aaaa', '10000000-0000-0000-0000-00000000aaaa', 'owner');

-- Scheduler: one approved, unclaimed staff link for the mock teacher Ryan
-- (claimed on first sign-in), and one weekly Monday 10:00 class for him,
-- starting 7 to 13 days from now.
insert into tracker.staff_links (org_id, notion_staff_id, email, approved_by) values
  ('10000000-0000-0000-0000-00000000aaaa', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa0001', 'ryan@example.com', '00000000-0000-0000-0000-00000000aaaa');
insert into tracker.class_series (org_id, request_id, notion_staff_id, notion_student_id, subject, kind, start_date, start_time, duration_minutes, created_by) values
  ('10000000-0000-0000-0000-00000000aaaa', gen_random_uuid(), 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa0001', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbb0001', 'MHF4U', 'weekly',
   current_date + 7 + ((8 - extract(isodow from current_date)::int) % 7), '10:00', 60, '00000000-0000-0000-0000-00000000aaaa');
