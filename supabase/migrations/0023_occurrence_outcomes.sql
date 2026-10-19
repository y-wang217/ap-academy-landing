-- Occurrence outcomes (REQ-39, Feedback 11). One row per class occurrence
-- that was taught (delivered, linked to a Notion Lessons row through its
-- `Class occurrence` property) or missed (no_show, kept only here). Keyed by
-- the occurrence ref's parts: (series_id, original_date), the same key ADR 0040
-- made final for past occurrences. No payout, rate, credit or invoice data.
-- A correction is an owner delete; write_audit keeps the old row.
-- An occurrence with an outcome is frozen: no cancel, move or series change
-- that would make its ref point somewhere else (tracker ADR 0054).
-- Tested by supabase/tests/occurrence_outcomes.sql.

create table tracker.occurrence_outcomes (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references tracker.orgs on delete restrict,
  series_id uuid not null references tracker.class_series on delete restrict,
  original_date date not null,
  outcome text not null check (outcome in ('delivered', 'no_show')),
  link_source text check (link_source in ('logged', 'reconciled')),
  -- The Notion Lessons page ID. Null while a log is in flight (the claim).
  notion_lesson_id uuid,
  lesson_date date,
  claimed_at timestamptz,
  created_by uuid not null references auth.users on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- One outcome per class: the idempotency key for log and no-show.
  unique (series_id, original_date),
  check ((outcome = 'no_show' and link_source is null and notion_lesson_id is null and lesson_date is null and claimed_at is null)
      or (outcome = 'delivered' and link_source is not null))
);
-- One lesson links one class.
create unique index occurrence_outcomes_lesson_idx on tracker.occurrence_outcomes (org_id, notion_lesson_id)
  where notion_lesson_id is not null;
create index occurrence_outcomes_series_idx on tracker.occurrence_outcomes (org_id, series_id);

create trigger occurrence_outcomes_updated_at before update on tracker.occurrence_outcomes
  for each row execute function tracker.set_updated_at();
create trigger audit_occurrence_outcomes after insert or update or delete on tracker.occurrence_outcomes
  for each row execute function tracker.write_audit();

-- Linkable, as isLinkable() in apps/tracker/lib/domain/schedule/lesson-link.ts:
-- a pattern date of the series, not cancelled, and its actual date (the new
-- date when moved) is today or earlier in Toronto. Security invoker: a caller
-- learns nothing about a series they cannot read.
create or replace function tracker.occurrence_is_linkable(p_series uuid, p_original date)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select exists (
    select 1 from tracker.class_series s
    where s.id = p_series
      and case when s.kind = 'one_off' then p_original = s.start_date
          else p_original >= s.start_date
           and (s.effective_until is null or p_original <= s.effective_until)
           and (p_original - s.start_date) % 7 = 0 end
      and not exists (
        select 1 from tracker.class_exceptions e
        where e.series_id = s.id and e.original_date = p_original and e.kind = 'cancelled')
      and coalesce(
        (select e.new_date from tracker.class_exceptions e
          where e.series_id = s.id and e.original_date = p_original and e.kind = 'moved'),
        p_original) <= (now() at time zone 'America/Toronto')::date
  );
$$;
revoke all on function tracker.occurrence_is_linkable(uuid, date) from public;
grant execute on function tracker.occurrence_is_linkable(uuid, date) to authenticated, service_role;

-- The freeze. Definer: it must see outcomes the writer's RLS might hide.
-- Covers split_class_series and schedule_write, which write through these tables.
create or replace function tracker.freeze_outcome_occurrences()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_table_name = 'class_exceptions' then
    if (tg_op <> 'INSERT' and exists (
          select 1 from tracker.occurrence_outcomes o
          where o.series_id = old.series_id and o.original_date = old.original_date))
       or (tg_op <> 'DELETE' and exists (
          select 1 from tracker.occurrence_outcomes o
          where o.series_id = new.series_id and o.original_date = new.original_date)) then
      raise exception 'has_outcome' using errcode = 'P0001';
    end if;
  elsif tg_table_name = 'class_series' then
    if exists (select 1 from tracker.occurrence_outcomes o where o.series_id = old.id) and (
         new.notion_staff_id is distinct from old.notion_staff_id
      or new.notion_student_id is distinct from old.notion_student_id
      or new.start_date is distinct from old.start_date
      or new.start_time is distinct from old.start_time
      or new.duration_minutes is distinct from old.duration_minutes
      or (new.effective_until is distinct from old.effective_until
          and new.effective_until is not null
          and exists (
            select 1 from tracker.occurrence_outcomes o
            where o.series_id = old.id and o.original_date > new.effective_until))) then
      raise exception 'has_outcome' using errcode = 'P0001';
    end if;
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
revoke all on function tracker.freeze_outcome_occurrences() from public;

create trigger freeze_outcome_class_exceptions before insert or update or delete on tracker.class_exceptions
  for each row execute function tracker.freeze_outcome_occurrences();
create trigger freeze_outcome_class_series before update on tracker.class_series
  for each row execute function tracker.freeze_outcome_occurrences();

-- RLS -------------------------------------------------------------------------
-- Read: the owner, or the teacher of the series. Insert: the owner, or that
-- teacher for a pending logged row or a no-show, never with a lesson ID.
-- Update: the owner, or that teacher completing their own pending row.
-- Delete: the owner only. Parents and students: nothing.

alter table tracker.occurrence_outcomes enable row level security;

create policy "owner or that teacher reads occurrence outcomes"
  on tracker.occurrence_outcomes for select to authenticated
  using (tracker.is_org_owner(org_id) or exists (
    select 1 from tracker.class_series s
    where s.id = occurrence_outcomes.series_id and s.notion_staff_id = tracker.my_staff_id(s.org_id)));

create policy "owner or that teacher records occurrence outcomes"
  on tracker.occurrence_outcomes for insert to authenticated
  with check (
    created_by = (select auth.uid())
    and exists (select 1 from tracker.class_series s where s.id = occurrence_outcomes.series_id and s.org_id = occurrence_outcomes.org_id)
    and tracker.occurrence_is_linkable(series_id, original_date)
    and (tracker.is_org_owner(org_id) or (
      exists (
        select 1 from tracker.class_series s
        where s.id = occurrence_outcomes.series_id and s.notion_staff_id = tracker.my_staff_id(s.org_id))
      and notion_lesson_id is null
      and link_source is distinct from 'reconciled')));

create policy "owner or that teacher completes occurrence outcomes"
  on tracker.occurrence_outcomes for update to authenticated
  using (tracker.is_org_owner(org_id) or (
    created_by = (select auth.uid()) and outcome = 'delivered' and notion_lesson_id is null
    and exists (
      select 1 from tracker.class_series s
      where s.id = occurrence_outcomes.series_id and s.notion_staff_id = tracker.my_staff_id(s.org_id))))
  with check (tracker.is_org_owner(org_id) or (
    created_by = (select auth.uid()) and outcome = 'delivered'
    and exists (
      select 1 from tracker.class_series s
      where s.id = occurrence_outcomes.series_id and s.notion_staff_id = tracker.my_staff_id(s.org_id))));

create policy "owner clears occurrence outcomes"
  on tracker.occurrence_outcomes for delete to authenticated
  using (tracker.is_org_owner(org_id));

revoke all on tracker.occurrence_outcomes from anon, authenticated;
grant select, delete on tracker.occurrence_outcomes to authenticated;
grant insert (org_id, series_id, original_date, outcome, link_source, notion_lesson_id, lesson_date, claimed_at, created_by)
  on tracker.occurrence_outcomes to authenticated;
grant update (notion_lesson_id, lesson_date, claimed_at) on tracker.occurrence_outcomes to authenticated;
grant all on tracker.occurrence_outcomes to service_role;
