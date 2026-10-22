-- Iris evaluation results (REQ-45, Iris 5/9), under tracker ADR 0069.
--
-- Additive only. One row per labelled message per eval request: what Iris
-- predicted and, when it drafted, the draft text, so the owner can rate the
-- exact draft and the recorded run counts only ratings of that request's
-- drafts. Rows go with their message (on delete cascade), so they never
-- outlive retention; they hold draft text and are not audited, for the same
-- reason as drafts (ADR 0058). Only the run (service_role) writes them; the
-- owner reads them. eval_labels gains rated_result_id, which ties a rating to
-- the result it rated.
-- Tested by supabase/tests/iris_eval.sql.

create table iris.eval_results (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references tracker.orgs on delete restrict,
  -- The eval_run_requested event this result answers. No foreign key: a key
  -- onto iris.events would change how its append-only truncate guard refuses
  -- (iris_core.sql), and only the run, which read the event, writes this.
  request_event_id bigint not null,
  message_id uuid not null references iris.messages on delete cascade,
  policy_version integer not null,
  model text check (char_length(model) <= 64),
  predicted_intent text check (char_length(predicted_intent) <= 64),
  predicted_reply_type text check (char_length(predicted_reply_type) <= 64),
  predicted_escalate boolean not null,
  escalation_reason text check (char_length(escalation_reason) <= 64),
  flags text[] not null default '{}',
  -- The draft body without the signature, which code appends.
  draft_body text check (char_length(draft_body) between 1 and 5000),
  outcome text not null check (outcome in ('ok', 'error')),
  error text check (char_length(error) <= 300),
  created_at timestamptz not null default now(),
  unique (request_event_id, message_id)
);
create index eval_results_org_request_idx on iris.eval_results (org_id, request_event_id);
create index eval_results_message_idx on iris.eval_results (message_id);

alter table iris.eval_labels
  add column rated_result_id uuid references iris.eval_results on delete set null;

-- RLS: the org owner reads; service_role writes. ------------------------------------
alter table iris.eval_results enable row level security;

create policy "owner reads iris eval results" on iris.eval_results for select to authenticated
  using (tracker.is_org_owner(org_id));

revoke all on iris.eval_results from anon, authenticated;
grant all on iris.eval_results to service_role;
grant select on iris.eval_results to authenticated;

grant insert (rated_result_id) on iris.eval_labels to authenticated;
grant update (rated_result_id) on iris.eval_labels to authenticated;
