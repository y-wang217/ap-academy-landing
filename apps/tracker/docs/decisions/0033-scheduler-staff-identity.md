# 0033: Scheduler teachers are linked to Notion Staff by approval, not given a membership
Status: accepted
Date: 2026-10-14
## Context
The Scheduler (REQ-2 to REQ-9) needs to know on every request whether the caller is Charlie (admin) or a specific teacher, and which Notion Staff record they are. `tracker.is_org_staff()` treats `owner` and `teacher` memberships alike and every grade-tracker policy uses it, so a scheduler teacher with a `teacher` membership would read every student's grades. Staff.Email in Notion is mostly empty, so matching logins to Staff by Notion email would map nobody.
## Decision
- A separate table, `tracker.staff_links` (migration 0009), holds the Notion Staff page ID and the email that teacher signs in with. Charlie, the org owner, approves each teacher by inserting a row (`supabase/seed/scheduler-staff-link.sql`). There is no admin UI in this card.
- The first sign-in with that verified magic-link email claims the row through `tracker.claim_staff_link()`, the same pattern as student invites (ADR 0016). `user_id` is not a granted column. Revoking sets `revoked_at` and cuts access at once; the row stays for history.
- Scheduler teachers get no membership. `tracker.is_org_owner()` and `tracker.my_staff_id()` are the helpers later cards' policies call.
- Admin is the tracker org owner. Teacher scope also needs an active teaching Staff record in Notion (Status Active or Onboarding, Function Teacher or Trial Teacher; Role is never read). It is rechecked against a five-minute cache, so setting Status to Inactive cuts access within five minutes.
- Notion is read server-side with plain `fetch` and Zod (no SDK), only from `lib/notion/`. The one dependency is `server-only`, approved by Charlie on 2026-10-14, so the module cannot be imported from a client component. `NOTION_TOKEN` unset means every `/api/scheduler/*` route returns `503 scheduler_not_configured` and the rest of the tracker is unchanged. A failed read fails closed: `503 scheduler_unavailable` for a teacher; the owner keeps admin scope with `staff: null`.
- Responses are parsed through strict Zod schemas. Teacher shape: `id`, `name`, `subjects`. Admin adds `email`. Nothing financial is ever read past the Notion parse step.
## Alternatives considered
- A `teacher` membership: exposes all grade data.
- Auto-matching by Notion email: maps nobody today.
- A separate `scheduler` schema: the scheduler is a tracker module and reuses `tracker.orgs`, `is_org_owner` and the audit log. The workspace rule asks new products for their own schema; this is not a new product.
## Consequences
The audit log records link changes and so holds staff emails; it is readable by org staff only. Operator setup: create a Notion internal integration with read access to the Staff database only, set `NOTION_TOKEN` in the tracker Vercel project, apply 0009 after Charlie's sign-off, then run the seed script once per teacher.
