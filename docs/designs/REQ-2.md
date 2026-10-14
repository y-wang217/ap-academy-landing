# REQ-2: Scheduler 1/8: Teacher logins mapped to Staff, with server-side permissions

Approved design, copied from the Notion card:
https://app.notion.com/p/3f9d6ae73dd781cfbda2f0a3a2da746c

**Summary:** An approved teacher who signs in through the existing magic link is linked, by verified email, to their Notion Staff record and gets a teacher scope that sees only their own data, while Charlie (tracker org owner) gets an admin scope; both are enforced by new Postgres helpers plus one TypeScript guard module and exposed through a minimal `GET /tracker/api/scheduler/me` endpoint.
**Risk:** High (new migration with a table, RLS policies and security-definer functions; changes who can sign in to what; reads staff personal data from Notion with a new server-side secret).

## Acceptance criteria
- AC1: A signed-in user whose verified email matches an approved, unrevoked `tracker.staff_links` row is linked on first request (`user_id` set) and `GET /tracker/api/scheduler/me` returns `200` with `{ "scope": "teacher", "staff": { "id", "name", "subjects" } }`.
- AC2: A signed-in user with no approved link gets `403` `{ "scope": "none" }`, and no `staff_links` row is created or linked for them.
- AC3: A revoked link, or a Notion Staff record that is not active teaching staff (Status not `Active`/`Onboarding`, or Function has neither `Teacher` nor `Trial Teacher`), gives `scope: "none"`. Setter/Closer-only never resolves to a teacher.
- AC4: The org owner gets `scope: "admin"` with `staff` set to their own linked record, or `null`.
- AC5: `GET /api/scheduler/staff/{staffId}`: admin any active teaching staff ID; teacher only their own; other ID `403`; malformed ID `400`; signed out `401`.
- AC6: `GET /api/scheduler/staff` returns `200` to admin and `403` to a teacher.
- AC7: Every scheduler body is parsed through a strict Zod output schema. Teacher and admin staff objects contain only `id`, `name`, `subjects` (and `email` for admin). Never `Hourly Rate (CAD)`, `Payment Method`, `Phone`, `Notes`, `Lessons Taught`, `Role`, or another staff member in a teacher-scoped response.
- AC8: In Postgres a teacher JWT reads only their own `staff_links` row, cannot insert/update/delete, cannot set `user_id`; only the owner inserts and revokes. `tracker.my_staff_id(org)` and `tracker.is_org_owner(org)` behave as specified.
- AC9: A claimed scheduler teacher with no membership sees zero rows from `tracker.students` and `tracker.audit_log`.
- AC10: `NOTION_TOKEN` is read only in `apps/tracker/lib/notion/`; no client component imports that folder; unset token gives `503 { "error": "scheduler_not_configured" }` and the rest of the tracker is unchanged.
- AC11: Existing tracker behaviour unchanged; existing suites pass with no edits to existing assertions.
- AC12: Token set but Notion read fails: a user with a claimed link gets `503 { "error": "scheduler_unavailable" }`, never teacher or none; the owner still gets `admin` with `staff: null`.

## Approach
- Migration `supabase/migrations/0009_scheduler_staff_links.sql`: `tracker.staff_links` (partial unique indexes on live rows), `tracker.is_org_owner`, `tracker.claim_staff_link`, `tracker.my_staff_id`, RLS and column grants, `set_updated_at` and `write_audit` triggers. Teachers get no membership.
- Server only Notion read by raw `fetch` + Zod in `apps/tracker/lib/notion/` (`config.ts`, `staff.ts`), cached 5 minutes. Drops every property except id, name, email, functions, status, subjects. One dependency, `server-only`, approved by Charlie on 2026-10-14 so the module cannot be imported from a client component (reviewer finding on PR 17).
- `lib/domain/staff.ts` (`isActiveTeachingStaff`), `lib/scheduler/identity.ts`, `guard.ts`, `schemas.ts`.
- Routes `app/api/scheduler/me`, `staff`, `staff/[staffId]`; `force-dynamic`, `no-store`.
- ADR `0033-scheduler-staff-identity.md`, seed script `supabase/seed/scheduler-staff-link.sql`.

## Test plan
`supabase/tests/scheduler_identity.sql` (AC1-3, 8, 9); `lib/domain/staff.test.ts`; `lib/notion/staff.test.ts`; `lib/scheduler/identity.test.ts`; `lib/scheduler/guard.test.ts`; `app/api/scheduler/scheduler-routes.test.ts` (incl. no client file imports `lib/notion`).

## Open questions (design defaults used)
1. `staff_links` lives in the `tracker` schema (scheduler is a tracker module).
2. Approvals by SQL seed script; no admin UI.
3. `Onboarding` counts as active.
4. Charlie creates the Notion integration and sets `NOTION_TOKEN`.

## Auto-review (Fable, 2026-10-14) edits already applied above
AC1 body includes `subjects`; AC12 fail-closed 503; Staff schema confirmed before the Zod schema (option names `Active`, `Onboarding`, `Teacher`, `Trial Teacher`, `Setter`, `Closer` confirmed against the live Staff data source on 2026-10-14).
