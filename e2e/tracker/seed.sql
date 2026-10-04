-- End-to-end fixture: one org with one owner. Mirrors what
-- supabase/seed/tracker-bootstrap.sql does on the live project.
insert into auth.users (id, email) values ('00000000-0000-0000-0000-00000000aaaa', 'teacher@example.com');
insert into tracker.orgs (id, name) values ('10000000-0000-0000-0000-00000000aaaa', 'AP Academy');
insert into tracker.memberships (user_id, org_id, role) values
  ('00000000-0000-0000-0000-00000000aaaa', '10000000-0000-0000-0000-00000000aaaa', 'owner');
