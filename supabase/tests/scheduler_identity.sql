-- RLS and function checks for tracker.staff_links (0009). Run by run-rls.sh on
-- a fresh copy of the migrated database. Each check raises on failure.

\set ON_ERROR_STOP on

-- Cast ------------------------------------------------------------------------
--   OWN  owner of Org One (Charlie)     TCH  scheduler teacher (t@), no membership
--   TC2  second teacher (t2@)           OUT  outsider, no link
--   REV  teacher whose link is revoked  OWN2 owner of Org Two
--   GT   grade-tracker teacher (membership 'teacher'), for contrast
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'owner@example.com'),
  ('00000000-0000-0000-0000-0000000000a2', 'owner2@example.com'),
  ('00000000-0000-0000-0000-0000000000d1', 't@example.com'),
  ('00000000-0000-0000-0000-0000000000d2', 't2@example.com'),
  ('00000000-0000-0000-0000-0000000000d3', 'rev@example.com'),
  ('00000000-0000-0000-0000-0000000000c1', 'out@example.com');

insert into tracker.orgs (id, name) values
  ('10000000-0000-0000-0000-000000000001', 'Org One'),
  ('10000000-0000-0000-0000-000000000002', 'Org Two');
insert into tracker.memberships (user_id, org_id, role) values
  ('00000000-0000-0000-0000-0000000000a1', '10000000-0000-0000-0000-000000000001', 'owner'),
  ('00000000-0000-0000-0000-0000000000a2', '10000000-0000-0000-0000-000000000002', 'owner');

-- A student and audit rows exist, so AC9 has something it must not show.
insert into tracker.students (id, org_id, teacher_id, email, first_name, last_initial, grade_level) values
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001',
   '00000000-0000-0000-0000-0000000000a1', 's1@example.com', 'Sam', 'L', 11);

-- As the owner: approve three teachers ---------------------------------------------
set role authenticated;
set request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a1", "email": "owner@example.com"}';

insert into tracker.staff_links (id, org_id, notion_staff_id, email, approved_by) values
  ('90000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001',
   'e0000000-0000-4000-8000-000000000001', 't@example.com', '00000000-0000-0000-0000-0000000000a1'),
  ('90000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001',
   'e0000000-0000-4000-8000-000000000002', 't2@example.com', '00000000-0000-0000-0000-0000000000a1'),
  ('90000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000001',
   'e0000000-0000-4000-8000-000000000003', 'rev@example.com', '00000000-0000-0000-0000-0000000000a1');
update tracker.staff_links set revoked_at = now() where id = '90000000-0000-0000-0000-000000000003';

do $$ begin
  assert tracker.is_org_owner('10000000-0000-0000-0000-000000000001'), 'owner is owner of Org One';
  assert not tracker.is_org_owner('10000000-0000-0000-0000-000000000002'), 'owner is not owner of Org Two';
  assert (select count(*) from tracker.staff_links) = 3, 'owner reads all links in their org';
  -- approved_by must be the caller
  begin
    insert into tracker.staff_links (org_id, notion_staff_id, email, approved_by)
      values ('10000000-0000-0000-0000-000000000001', 'e0000000-0000-4000-8000-000000000009', 'x@example.com', '00000000-0000-0000-0000-0000000000a2');
    raise exception 'staff_links: owner recorded someone else as approver';
  exception when insufficient_privilege then null;
  end;
  -- cannot approve in another org
  begin
    insert into tracker.staff_links (org_id, notion_staff_id, email, approved_by)
      values ('10000000-0000-0000-0000-000000000002', 'e0000000-0000-4000-8000-000000000009', 'x@example.com', '00000000-0000-0000-0000-0000000000a1');
    raise exception 'staff_links: owner approved a link in Org Two';
  exception when insufficient_privilege then null;
  end;
  -- no duplicate live link for a Staff record or an email
  begin
    insert into tracker.staff_links (org_id, notion_staff_id, email, approved_by)
      values ('10000000-0000-0000-0000-000000000001', 'e0000000-0000-4000-8000-000000000001', 'other@example.com', '00000000-0000-0000-0000-0000000000a1');
    raise exception 'staff_links: two live links for one Staff record';
  exception when unique_violation then null;
  end;
  begin
    insert into tracker.staff_links (org_id, notion_staff_id, email, approved_by)
      values ('10000000-0000-0000-0000-000000000001', 'e0000000-0000-4000-8000-000000000008', 't@example.com', '00000000-0000-0000-0000-0000000000a1');
    raise exception 'staff_links: two live links for one email';
  exception when unique_violation then null;
  end;
  -- the owner cannot link a login by hand
  begin
    update tracker.staff_links set user_id = '00000000-0000-0000-0000-0000000000c1' where id = '90000000-0000-0000-0000-000000000001';
    raise exception 'staff_links: owner set user_id directly';
  exception when insufficient_privilege then null;
  end;
end $$;

-- Outsider: claims nothing (AC2) -----------------------------------------------------
set request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000c1", "email": "out@example.com"}';
do $$ begin
  assert tracker.claim_staff_link() = 0, 'outsider claimed a link';
  assert (select count(*) from tracker.staff_links) = 0, 'outsider reads links';
  assert tracker.my_staff_id('10000000-0000-0000-0000-000000000001') is null, 'outsider has a staff id';
  assert not tracker.is_org_owner('10000000-0000-0000-0000-000000000001'), 'outsider is owner';
end $$;

-- Revoked teacher: nothing to claim (AC3) -----------------------------------------------
set request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000d3", "email": "rev@example.com"}';
do $$ begin
  assert tracker.claim_staff_link() = 0, 'revoked link was claimed';
  assert tracker.my_staff_id('10000000-0000-0000-0000-000000000001') is null, 'revoked teacher has a staff id';
end $$;

-- Teacher: claims once, idempotent (AC1) -------------------------------------------------
set request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000d1", "email": "T@Example.com "}';
do $$ begin
  assert tracker.claim_staff_link() = 1, 'teacher did not claim their link (email is matched lower and trimmed)';
  assert tracker.claim_staff_link() = 0, 'claim is not idempotent';
  assert tracker.my_staff_id('10000000-0000-0000-0000-000000000001') = 'e0000000-0000-4000-8000-000000000001', 'my_staff_id wrong';
  assert tracker.my_staff_id('10000000-0000-0000-0000-000000000002') is null, 'my_staff_id leaks across orgs';
  assert not tracker.is_org_owner('10000000-0000-0000-0000-000000000001'), 'teacher is owner';
  -- AC8: reads only their own row
  assert (select count(*) from tracker.staff_links) = 1, 'teacher reads more than their own link';
  assert (select email from tracker.staff_links) = 't@example.com', 'teacher read someone else''s link';
end $$;

do $$ begin
  begin
    insert into tracker.staff_links (org_id, notion_staff_id, email, approved_by)
      values ('10000000-0000-0000-0000-000000000001', 'e0000000-0000-4000-8000-000000000007', 'me@example.com', '00000000-0000-0000-0000-0000000000d1');
    raise exception 'staff_links: teacher inserted a link';
  exception when insufficient_privilege then null;
  end;
  begin
    update tracker.staff_links set user_id = '00000000-0000-0000-0000-0000000000c1';
    raise exception 'staff_links: teacher set user_id';
  exception when insufficient_privilege then null;
  end;
end $$;
-- Teacher has the column grants of any signed-in user but no update or delete
-- policy, so edits touch zero rows.
do $$
declare n integer;
begin
  update tracker.staff_links set email = 'evil@example.com'; get diagnostics n = row_count;
  assert n = 0, 'teacher changed an email';
  update tracker.staff_links set revoked_at = null; get diagnostics n = row_count;
  assert n = 0, 'teacher edited revoked_at';
  delete from tracker.staff_links; get diagnostics n = row_count;
  assert n = 0, 'teacher deleted a link';
exception when insufficient_privilege then null;
end $$;

-- AC9: no grade-tracker data without a membership ---------------------------------------
do $$ begin
  assert (select count(*) from tracker.students) = 0, 'scheduler teacher reads students';
  assert (select count(*) from tracker.audit_log) = 0, 'scheduler teacher reads the audit log';
  assert (select count(*) from tracker.memberships) = 0, 'scheduler teacher has a membership';
end $$;

-- A second teacher cannot take over the first teacher's email or link ---------------------
set request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000d2", "email": "t2@example.com"}';
do $$ begin
  assert tracker.claim_staff_link() = 1, 'second teacher did not claim';
  assert tracker.my_staff_id('10000000-0000-0000-0000-000000000001') = 'e0000000-0000-4000-8000-000000000002', 'second teacher got wrong id';
end $$;

-- A login cannot hold two live Staff links ------------------------------------------------
reset role;
do $$ begin
  begin
    update tracker.staff_links set user_id = '00000000-0000-0000-0000-0000000000d1'
      where id = '90000000-0000-0000-0000-000000000002';
    raise exception 'staff_links: one login holds two live links';
  exception when unique_violation then null;
  end;
end $$;

-- Revoking cuts access immediately; the claimed row stays for history ------------------
set role authenticated;
set request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a1", "email": "owner@example.com"}';
update tracker.staff_links set revoked_at = now() where id = '90000000-0000-0000-0000-000000000001';
set request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000d1", "email": "t@example.com"}';
do $$ begin
  assert tracker.my_staff_id('10000000-0000-0000-0000-000000000001') is null, 'revoked teacher still has a staff id';
end $$;

-- The audit log recorded link changes (owner can read it) ---------------------------------
set request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a1", "email": "owner@example.com"}';
do $$ begin
  assert exists (select 1 from tracker.audit_log where table_name = 'staff_links' and action = 'INSERT'), 'staff_links inserts are not audited';
  assert exists (select 1 from tracker.audit_log where table_name = 'staff_links' and action = 'UPDATE'), 'staff_links updates are not audited';
end $$;

reset role;
\echo scheduler_identity.sql ok
