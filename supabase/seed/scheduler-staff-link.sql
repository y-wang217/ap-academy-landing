-- One-off, after 0009 is applied: approve one teacher for the Scheduler as the
-- AP Academy owner. Edit the two values below, then run in the SQL editor.
-- Safe to rerun: it does nothing if a live link already exists. Revoke with
--   update tracker.staff_links set revoked_at = now() where email = '<email>' and revoked_at is null;

do $$
declare
  teacher_email text := lower(btrim('teacher@example.com'));            -- the address they sign in with
  staff_page_id uuid := '00000000-0000-0000-0000-000000000000';          -- Notion Staff page ID (dashed)
  owner uuid := (select id from auth.users where email = 'y.wang217@gmail.com');
  org uuid := (select id from tracker.orgs where name = 'AP Academy');
begin
  if owner is null or org is null then
    raise exception 'Run supabase/seed/tracker-bootstrap.sql first.';
  end if;
  if staff_page_id = '00000000-0000-0000-0000-000000000000' then
    raise exception 'Set staff_page_id to the teacher''s Notion Staff page ID.';
  end if;
  insert into tracker.staff_links (org_id, notion_staff_id, email, approved_by)
  select org, staff_page_id, teacher_email, owner
  where not exists (
    select 1 from tracker.staff_links
    where org_id = org and revoked_at is null
      and (notion_staff_id = staff_page_id or email = teacher_email)
  );
end;
$$;
