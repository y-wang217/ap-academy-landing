# REQ-42: Iris 2/9: Core schema, policy file, Gmail read-only intake, family matching, inbox list

Copied from the approved Notion card (https://app.notion.com/p/3fbd6ae73dd78162a7e8eb30289c92b9) for review next to the diff.

**Numbers used at build time (Decision 17, workspace ADR 0004 Numbering).** `main` and the open branches already hold migrations 0021 to 0023 and tracker ADRs 0053 to 0055. This build uses migration **0024** (`supabase/migrations/0024_iris_core.sql`), tracker ADRs **0056, 0057 and 0058**, and workspace ADR **0005**. Wherever the design below says 0021 or 0053 to 0055, read 0024 and 0056 to 0058.

---

Give Iris its home in the tracker: the `iris` schema, the versioned policy file, a bearer-protected poll run that reads [charlie@apacademy.ca](mailto:charlie@apacademy.ca) with a read-only scope, sender-to-family matching against Students & Parents, and an admin inbox list. Nothing is classified, drafted or sent yet.
**Full spec:** <mention-page url="https://app.notion.com/p/3fbd6ae73dd78194ba65d2a6caedcc20"/> (sections 2, 3 for the 0018 tables, 4.1, 4.2, 4.9, 5; card 2/9)
**Blocked by:** Iris 1/9 (the privacy page must be live before Iris reads a real message).
## Requirements
- Migration `supabase/migrations/0018_iris_core.sql`: schema `iris`; tables `settings` (paused default true, sending_enabled default false, confidence_threshold 0.85, retention_days 90, quiet hours 21:00 to 07:00, mailbox, poll lease, last run state), `runs`, `threads`, `messages`, `ai_calls`, `events`; functions `iris.claim_poll`, `iris.purge_expired`, `iris.delete_thread`. RLS on every table with `tracker.is_org_owner`; teachers, students, parents and anon read nothing; `service_role` all. `tracker.write_audit` on `settings` only; `iris.events` append-only. Check `supabase/tests/iris_core.sql`. Ships as its own migration PR.
- Policy file `apps/tracker/lib/iris/policy.ts` exporting `POLICY_VERSION` and typed sections per reply type, with the founder values of Oct 16, 2026 (12-hour window, no late fee, make-up or credit, forfeit only on no-call no-show and never confirmed by Iris, pause without notice, credits refunded on the final invoice, one invoice a month). A test proves no other file carries policy text.
- Gmail client `apps/tracker/lib/iris/gmail.ts`: service account with domain-wide delegation acting as `IRIS_GMAIL_MAILBOX`, JWT signed with `node:crypto`, plain `fetch` and Zod, no new dependency. Scope `gmail.readonly` only. Env: `IRIS_GMAIL_CLIENT_EMAIL`, `IRIS_GMAIL_PRIVATE_KEY`, `IRIS_GMAIL_MAILBOX`, optional `IRIS_GMAIL_API_BASE` for the e2e mock.
- Poll run `app/api/iris/run/route.ts`: bearer `IRIS_CRON_SECRET` checked constant-time before any call (pattern `handleDailyTaskRun` in `lib/scheduler/daily-task-handlers.ts`); `paused` true returns `paused` and touches nothing; lease via `iris.claim_poll`; `users.messages.list` with `in:inbox category:primary newer_than:3d`, at most 50 ids, dedupe on Gmail message id; `users.messages.get` full; body capped at 20,000 characters; automated mail stored as metadata plus snippet and marked handled; mail from the mailbox itself recorded as outbound only in known threads; purge step; run row; never throws; only a Gmail list failure is 502. Second importer of `@ap-academy/db/service`; the scan allowlist in `app/api/scheduler/daily-task-routes.test.ts` gains this file.
- Family matching `lib/notion/parents.ts`: one uncached read per run of Student Name, Stage, Parent Email, Parent Name with `filter_properties`, Stage in Active, Onboarding, Paused. Lower-cased trimmed match. One page matched; siblings matched to the family; none is `unknown`: snippet only, no body, escalated with reason `unknown_sender` and a Gmail link.
- `proxy.ts`: exempt `api/iris/run` by exact path; extend the ADR 0042 cross-site write check to the `/api/iris/` prefix.
- Admin pages: `/tracker/iris` listing Needs you and recent messages (owner only, server-checked with `requireScheduler(identity, ["admin"])`); `/tracker/iris/settings` with Pause, an Unpause that asks Charlie to tick that the privacy page is live and family mail is arriving, Run now, last run and its error.
- ADRs 0050 (Iris is a tracker module with its own schema), 0051 (parent emails and bodies, 90-day retention, no audit copy), 0052 (Gmail service account, read-only, no SDK). Workflow `.github/workflows/iris-poll.yml` (every 15 minutes) delivered as YAML in the design for a human to add. Operator steps in the design: Google Cloud project, service account, domain-wide delegation with `gmail.readonly`, expose `iris` in Supabase API settings, env vars in the tracker Vercel project, repository secret.
## Acceptance hints
- RLS test file passes; the same inbox polled twice stores each message once; two runs at once, one `busy`; unknown sender stores no body; a Notion failure leaves messages at `received` with a short error and the run at 200; a teacher gets 403 on every `/api/iris/*` route with nothing read; a cross-site POST to `/api/iris/settings` is 403; every other tracker path still redirects when signed out.
- Source scans: exactly two service-client importers; nothing under `lib/iris/` or `lib/notion/parents.ts` names Parent Phone, Sales Notes, Notes, Hourly Rate, Billing Family, Weekly Schedule, Invoices, Missed Sessions, Lessons or Paid to Teacher.
- `pnpm test:rls`, `pnpm --filter tracker test`, `pnpm test:tracker` with a mock Gmail server in `e2e/tracker/` beside `mock-notion.mjs`.
## Out of scope
Classification (3/9), drafting and the queue (4/9), sending (8/9).
## Global guardrails (all Iris cards)
Reuse the existing stack, auth, adapters, persistence, UI and test patterns. Admin only, checked server-side through `tracker.memberships` (org owner). Iris data lives in Postgres schema `iris` with RLS on every table; migrations in the root `supabase/migrations/`. No queues, Redis, separate backend or new hosting. Policy text lives in one versioned file in the repo, never inside prompts. Escalate when unsure, on 2 or more intents, and on money disputes, legal threats, crisis language or hardship; never process refunds; never promise a specific make-up time unless it comes from real teacher availability; log every draft and send. A message is processed once, a reply is sent at most once, retries never double-send. A failed Gmail, Claude or Notion call leaves the tracker usable and shows one admin error of at most 300 characters. Iris never writes Students & Parents, Invoices, Missed Sessions & Credits, Lessons or the scheduler's tables. Gmail scope is read-only until Iris 8/9. Iris starts paused.
---
# Design: REQ-42 Iris 2/9: Core schema, policy file, Gmail read-only intake, family matching, inbox list
**Changes from last version** (design-approver, revise 1 of 2):
1. AC2 has no Test plan row: it now has its own row, the `iris_core.sql` role-grid block, which checks all six tables one by one.
2. AC3 has no row: it now has its own row, the audit block. It counts `audit_log` rows for each owner-facing column, and zero for lease updates and for the other five tables.
3. AC4 has no row: it now has its own row, the append-only block. It covers both `events` and `ai_calls`, as `service_role` and as the owner.
4. AC5 has no row: it now has its own row, the lease block.
5. AC16 has no row: it now has its own row, an `intake.test.ts` case plus e2e step 6 (m6 stored, m7 absent).
6. AC18 has no row: it now has its own row, an `intake.test.ts` case across four runs plus e2e step 10.
7. Every range ("AC1 to AC6", "AC13 to AC20", "AC10 to AC23") is now an explicit list. AC1, AC6, AC13 and AC20 also get their own rows, and the e2e row maps each criterion to its step.
8. AC1 is reworded. `run-rls.sh` applies the migrations before any check inserts an org, so a check cannot see the backfill. The check now proves the column defaults, and the backfill is verified by a query after the migration is applied (see the AC1 row).
9. The numbers were checked again on `main` (24888f1). Migration 0021, tracker ADRs 0053 to 0055 and workspace ADR 0005 are still free, and no `req/*-migration` branch exists.
**Summary:** Charlie gets an owner-only Iris inbox at `/tracker/iris` and a settings page with Pause, Unpause and Run now. A bearer-protected run every 15 minutes reads new mail in [charlie@apacademy.ca](mailto:charlie@apacademy.ca) with a read-only Gmail scope, stores each message once in a new `iris` schema, matches the sender to a family in Students & Parents, and lists unknown senders under "Needs you". Nothing is classified, drafted or sent. Iris starts paused.
**Risk:** High. Parent email addresses and message text are stored in a new place (schema `iris`), the run uses a new credential (a Gmail service account), `proxy.ts` lets one more path through without a session, and the purge deletes rows.
**Numbers moved since the spec.** The spec reserved migration 0018 and tracker ADRs 0050 to 0052, but `main` now has 0018 to 0020 and ADRs up to 0052. Workspace ADR 0004 (Numbering) says the next free number at build time wins. Today that is migration **0021** and tracker ADRs **0053, 0054 and 0055**. REQ-39 (Needs Approval) also defaults to 0021 and the next ADR. Whichever card builds second takes the next numbers, after checking `main` and every `origin/req/*-migration` branch. Below, "0021" and "0053 to 0055" mean "the next free number".
## Problem
For Charlie (org owner). Parents email Charlie about cancellations, pauses, billing and questions, and he answers every one by hand. Iris (spec, sections 2 to 5) will sort and later draft these replies. This card is rung 1, part one. Iris gets its home in the tracker, reads the inbox safely, works out which family wrote, and shows Charlie what needs him. It runs nothing that talks to Claude, writes nothing to Notion and sends nothing. The privacy notice it depends on (REQ-41) is live on `main` (#87).
What the code has today:
- One bearer-protected scheduled job: `app/api/scheduler/daily-task/run/route.ts` → `handleDailyTaskRun` in `lib/scheduler/daily-task-handlers.ts` (constant-time compare through SHA-256 digests, 503 when the secret is unset, 401 on a wrong bearer). `proxy.ts` exempts that exact path in its matcher, and `proxy.test.ts` pins the exemption.
- The service-role client `packages/db/src/service.ts`, which bypasses RLS. `app/api/scheduler/daily-task-routes.test.ts` allows exactly one importer.
- `tracker.is_org_owner` (0009), `tracker.write_audit` and `tracker.set_updated_at` (0004, 0005), and the lease pattern `tracker.claim_daily_task` (0012).
- `lib/notion/students.ts`: Students & Parents read with plain fetch, `filter_properties` taken from a schema GET, `cache: "no-store"`, and `NotionError` from `lib/notion/staff.ts`. Its `propertyIds` helper is not exported.
- The owner check `requireScheduler(identity, ["admin"])` (`lib/scheduler/guard.ts`) on `realScheduleDeps().identity()` (`lib/scheduler/deps.ts`).
- Workspace ADR 0004 lists `apps/tracker/lib/notion/parents.ts` as `planned`, and `lib/people-adr.test.ts` asserts that.
## Acceptance criteria
**Schema and RLS (migration PR)**
- [ ] AC1: Migration `supabase/migrations/0021_iris_core.sql` creates schema `iris` with `settings`, `runs`, `threads`, `messages`, `ai_calls` and `events`, plus `iris.claim_poll`, `iris.purge_expired` and `iris.delete_thread`, with RLS enabled on every table. It adds one `settings` row per existing org (`on conflict do nothing`), and a `settings` row created with only `org_id` has `paused = true` and `sending_enabled = false`.
- [ ] AC2: For each role, `supabase/tests/iris_core.sql` proves that the database allows or refuses reads and writes on every `iris` table as listed under Migration. The org owner reads their own org's rows. The owner of another org, a grade teacher, a scheduling-only teacher, a student, a parent and `anon` read nothing and write nothing.
- [ ] AC3: Changing `paused`, `sending_enabled` or `confidence_threshold` on `iris.settings` writes one `tracker.audit_log` row. A lease or last-run update writes none. No other Iris table writes audit rows.
- [ ] AC4: `iris.events` and `iris.ai_calls` refuse every UPDATE except one that only sets `message_id` (or `draft_id`) to null. They refuse every DELETE of a row younger than 365 days, for every role including `service_role`.
- [ ] AC5: `iris.claim_poll` returns the settings row to the first caller and nothing to a second caller while the lease is live. After the lease expires, it returns the row again.
- [ ] AC6: `iris.purge_expired` deletes messages past `purge_at` and threads left with no messages, runs older than 90 days, and events and `ai_calls` older than 365 days. It sets `message_id` to null on surviving events and `ai_calls`, and writes one `purge` event with the counts. `iris.delete_thread` deletes one thread and its messages for its org owner only, writes one `thread_deleted` event, and raises 42501 for anyone else.
**Policy file**
- [ ] AC7: `apps/tracker/lib/iris/policy.ts` exports `POLICY_VERSION = 1`, the reply types and escalate-only intents from spec decision 11, one typed section per type, and `HARD_RULES`, with the founder values of Oct 16, 2026. No other non-test source file in `apps/tracker` contains any section's text or any hard rule's text.
**Gmail client**
- [ ] AC8: `apps/tracker/lib/iris/gmail.ts` signs an RS256 JWT with `node:crypto` (`iss` = `IRIS_GMAIL_CLIENT_EMAIL`, `sub` = `IRIS_GMAIL_MAILBOX`, `scope` = `https://www.googleapis.com/auth/gmail.readonly`), exchanges it for a token, and only ever calls `GET users/me/messages` and `GET users/me/messages/{id}?format=full`. No file under `lib/iris/` names another Gmail scope or a Gmail write path, and no new dependency is added.
- [ ] AC9: A Gmail or token failure becomes a `GmailError` holding the HTTP status and a short message of at most 300 characters, never a response body. Each call times out after 10 seconds. `IRIS_GMAIL_API_BASE`, when set, replaces both Google hosts.
**The run**
- [ ] AC10: `POST /tracker/api/iris/run` answers 503 when `IRIS_CRON_SECRET` is unset and 401 on a missing or wrong bearer. In both cases it makes no database, Gmail or Notion call. A missing or invalid `IRIS_ORG_ID`, or missing Gmail env, answers 503 `iris_not_configured`.
- [ ] AC11: With `paused` true, the run answers 200 `{ result: "paused" }`, makes zero Gmail and Notion calls, and writes no row.
- [ ] AC12: Two runs at once: one does the work, and the other answers 200 `{ result: "busy" }` with zero Gmail calls.
- [ ] AC13: The run lists `in:inbox category:primary newer_than:3d`, skips Gmail ids already stored, and fetches at most 50 new messages, oldest first. Polling the same inbox twice stores each message once, and the second run reports `stored: 0`.
- [ ] AC14: A matched inbound message is stored with state `matched`, its body as text (a `text/plain` part first, otherwise HTML reduced to text), and `POLICY_VERSION`. A 25,000-character body is stored as its first 20,000 characters with `body_truncated = true`.
- [ ] AC15: Automated mail (`Auto-Submitted` other than `no`, `Precedence` bulk, list or junk, any `List-Unsubscribe`, or a noreply, mailer-daemon or postmaster sender) is stored with metadata and snippet only. Its `body_text` is null, its state is `escalated` with reason `automated`, and `handled_at` is set, so it never shows under Needs you.
- [ ] AC16: Mail from the mailbox itself is stored as `direction outbound`, `source charlie_manual`, only when its Gmail thread is already stored, and is skipped otherwise.
- [ ] AC17: The run reads the family directory once per run from Notion, uncached, with `filter_properties` for exactly Student Name, Stage, Parent Email and Parent Name, and a filter of Stage in Active, Onboarding or Paused. A sender equal to one Parent Email (lower-cased, trimmed) is `matched` with that page id on the thread. A sender equal to several (siblings) is `matched` with every page id. No match is `unknown`: the message stores `from_email`, subject and a snippet of at most 200 characters, no body, state `escalated` and reason `unknown_sender`.
- [ ] AC18: If the directory read fails, the new messages are stored at `received` with no body and a short `last_error`, and the run answers 200. The next run that reads the directory re-fetches each one from Gmail and then matches it. After 3 failed attempts, a message moves to `failed`.
- [ ] AC19: Only a Gmail list or token failure answers 502. That run is recorded as `failed`, and `settings.last_error` holds the short error. One message's `get` failure is counted and does not stop the run. An unexpected error inside the run records `failed` and still answers 200. The handler never throws.
- [ ] AC20: Every run that took the lease ends by calling `iris.purge_expired`, writing one `iris.runs` row with its counts, updating `last_poll_at`, `last_poll_result` and `last_error`, and releasing the lease.
**Proxy and permissions**
- [ ] AC21: `proxy.ts` exempts exactly `api/iris/run` from the session matcher. `/tracker/iris`, `/tracker/iris/settings`, `/tracker/api/iris/settings` and `/tracker/api/iris/run-now` still redirect to `/login` when signed out.
- [ ] AC22: The proxy's ADR 0042 origin check covers the `/api/iris/` prefix, so a cross-site `PATCH /tracker/api/iris/settings` answers 403 before the session is read.
- [ ] AC23: A grade teacher, a scheduling-only teacher, a student or a parent gets a redirect to `/` from both Iris pages, and 403 from `PATCH /api/iris/settings` and `POST /api/iris/run-now`. No Iris row, Gmail call or Notion parent read happens before that check.
- [ ] AC24: Exactly two non-test files import `@ap-academy/db/service`: the daily-task run route and `app/api/iris/run/route.ts`.
- [ ] AC25: No file under `apps/tracker/lib/iris/`, and not `lib/notion/parents.ts`, contains these exact property names (case-sensitive): `Parent Phone`, `Sales Notes`, `Notes`, `Hourly Rate`, `Billing Family`, `Weekly Schedule`, `Invoices`, `Missed Sessions`, `Lessons`, `Paid to Teacher`. They also do not contain the Invoices, Missed Sessions & Credits or Lessons data source ids. `parents.ts` makes only GET and POST-query requests, and is never wrapped in a cache.
**Admin pages**
- [ ] AC26: `/tracker/iris` shows the owner two lists. "Needs you" holds inbound messages that are `escalated` with `handled_at` null, newest first, at most 50. "Recent mail" holds the last 50 inbound messages. Each row shows the family (student names, or the sender address for unknown), subject, age, a state label and an Open in Gmail link. It has empty, error and paused states with the copy below.
- [ ] AC27: `/tracker/iris/settings` shows Paused or Running, the last run (time, result, counts), its error, and which Iris env vars are missing (names only). Pause sets `paused = true` with no confirmation. Unpause stays disabled until Charlie ticks "The privacy page is live and families are writing to [charlie@apacademy.ca](mailto:charlie@apacademy.ca)", and the server refuses `paused: false` without `confirmed: true` (400). Run now triggers one run and shows its result. A failed save shows as failed, never as saved.
## Approach
### Policy (`apps/tracker/lib/iris/policy.ts`, new)
Plain data with no imports, so tests and later prompts import it as it is.
- `POLICY_VERSION = 1`.
- `NOTICE_HOURS = 12`.
- `REPLY_TYPES`: `cancel_with_notice`, `late_cancel`, `cancellation`, `reschedule_request`, `reschedule_offer`, `pause_or_stop`, `general_question`, `no_reply_needed`.
- `ESCALATE_ONLY`: `billing_question`, `refund_request`, `no_show`, `other`.
- `NEVER_AUTO_SEND`: `pause_or_stop` plus every escalate-only intent.
- `POLICY: Record<ReplyType | EscalateOnly, { title: string; text: string; autoSendAllowed: boolean }>`.
- `HARD_RULES: readonly string[]`.
- `HOLDING_LINE = "Charlie will follow up with you personally."`
Default text (the builder may tighten wording; the tests pin the facts):
- **cancel_with_notice:** "A class cancelled with 12 or more hours of notice is always accommodated, with no fee. We offer a make-up class between the missed class and the next scheduled one if a time works. Otherwise the class is credited on next month's invoice."
- **late_cancel:** "A class cancelled with under 12 hours of notice has no fee, but that day's class is not guaranteed. We offer a make-up class between the missed class and the next scheduled one if a time works. Otherwise the class is credited on next month's invoice."
- **cancellation** (until Iris 6/9 can tell the two apart): "A cancelled class has no fee. We offer a make-up class between the missed class and the next scheduled one if a time works. Otherwise the class is credited on next month's invoice."
- **reschedule_request:** "Make-up and reschedule times come only from the teacher's real availability. Until Iris can read it, say that Charlie will send some options."
- **reschedule_offer:** "Offer only the times supplied with the message, which come from the teacher's real availability. Never book a time."
- **pause_or_stop:** "A family can pause or stop tutoring at any time, with no notice needed. Unused credits are refunded on the final invoice." (`autoSendAllowed: false`)
- **general_question:** "Answer only from facts in this policy and the message. If the answer is not here, say Charlie will follow up personally."
- **no_reply_needed:** "No reply is sent."
- **billing_question:** "There is one invoice a month, sent on the 1st. Questions about invoices or money go to Charlie."
- **refund_request:** "Refunds are never handled by Iris. Charlie replies personally."
- **no_show:** "A class missed with no message before it started is forfeited, and Charlie can override that. Iris never confirms a forfeit."
- **other:** "Anything this policy does not cover goes to Charlie."
- **HARD_RULES:**
	- "Escalate legal threats, crisis language and financial hardship."
	- "Escalate a message with two or more requests."
	- "Escalate when unsure."
	- "Never process or promise a refund."
	- "Never name a dollar amount."
	- "Never promise a specific make-up time unless it comes from real teacher availability."
	- "Never confirm a forfeit."
The words "Notes", "Invoices" and "Lessons" are avoided in this text: the AC25 scan is case-sensitive on those exact names, and the text says "invoice" and "class".
### Gmail (`apps/tracker/lib/iris/gmail.ts`, `mime.ts`, `config.ts`, new)
- `config.ts` reads env at call time, never at module load (the `getServiceClient` rule).
	- `readIrisRunEnv()`: `IRIS_CRON_SECRET` and `IRIS_ORG_ID`.
	- `readGmailConfig()`: `{ clientEmail, privateKey, mailbox }` or null. `privateKey` has its literal `\n` replaced with newlines. `mailbox` is lower-cased.
	- `gmailBases()`: `{ token: "https://oauth2.googleapis.com/token", api: "https://gmail.googleapis.com/gmail/v1" }`. When `IRIS_GMAIL_API_BASE` is set, both are rewritten to `<base>/token` and `<base>/gmail/v1`.
	- `missingIrisEnv()`: the names of unset vars, for the settings page.
- `gmail.ts`, `server-only`, plain `fetch` with `AbortSignal.timeout(10_000)`, `cache: "no-store"`, and Zod on every response:
	- `GMAIL_SCOPE = "https://www.googleapis.com/auth/gmail.readonly"`: the only scope string in `lib/iris/`.
	- `signJwt(config, now)`: base64url header `{alg:"RS256",typ:"JWT"}`, then claims `{ iss, sub: mailbox, scope, aud: tokenUrl, iat, exp: iat + 3600 }`, then `crypto.sign("sha256", data, privateKey)`.
	- `getAccessToken(config, fetcher)`: a POST form `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=<jwt>`. The token is held in memory for one run only.
	- `listMessageIds(token, q, fetcher)`: `GET /users/me/messages?q=<q>&maxResults=100`, following `nextPageToken` for at most 5 pages. It returns ids newest first, as Gmail gives them.
	- `getMessage(token, id, fetcher)`: `GET /users/me/messages/<id>?format=full`, parsed by a Zod `GmailMessage` (`id`, `threadId`, `internalDate`, `snippet`, `payload` with headers and parts, recursive and `.passthrough()`-free).
	- `class GmailError extends Error { status?: number }`. The message is built from the status only, such as "Gmail returned 403" or "Gmail token refused (401)", and is cut to 300 characters. A network error or timeout gives "Gmail request failed".
- `mime.ts` is pure, so Vitest covers it without fetch:
	- `headerMap(payload)`: From, Subject, Date, Message-ID, In-Reply-To, References, Auto-Submitted, Precedence, List-Unsubscribe.
	- `parseFrom("Ann Lee <Ann@X.com>")` gives `{ email: "ann@x.com", name: "Ann Lee" }`.
	- `bodyText(payload)`: walks the parts depth-first. It takes the first `text/plain` part, otherwise the first `text/html` reduced by `htmlToText` (drop `script` and `style`, turn `br`, `p`, `div` and `li` into newlines, strip tags, decode the common entities, collapse blank lines). It decodes base64url and honours the part's `charset` through `TextDecoder` (UTF-8 if unknown). Attachments (a part with `filename`) are never read.
	- `capBody(text)` gives `{ text: first TUNING.irisBodyMaxChars, truncated }`.
	- `snippetOf(gmailSnippet)`: entities decoded, cut to `TUNING.irisSnippetChars`.
	- `isAutomated(headers, fromEmail)`: the rule in AC15.
### Family directory (`apps/tracker/lib/notion/parents.ts`, new)
- `fetchFamilyDirectory(config: NotionConfig, fetcher = fetch): Promise<FamilyEntry[]>`, where `FamilyEntry = { studentId, studentName, stage, parentEmail, parentName }`.
	- One schema GET for the four property ids. A missing property throws `NotionError("Students database is missing a needed property")`.
	- Then `POST /data_sources/<id>/query?filter_properties[]=…` with `filter: { or: Active, Onboarding, Paused }`, `page_size: 100`, `cache: "no-store"`, capped at 50 pages like `fetchScheduledStudents`.
	- The Zod parse keeps the four fields only.
	- The function is not exported through `lib/notion/cached.ts`, is never wrapped in `unstable_cache` or `"use cache"`, and is imported only by `lib/iris/` (decision 28, ADR 0004).
- It duplicates the 10-line `propertyIds`, `call` and `headers` helpers from `students.ts` instead of exporting them, so `students.ts` (named in ADR 0004's required readers) stays unchanged. See Decision 9.
- `readStudentsConfig()` from `lib/notion/config.ts` supplies the token and data source. Nothing new is added there.
- Pure matching in `apps/tracker/lib/iris/match.ts`:
	- `normalizeEmail(s)`: trim, then lower-case.
	- `buildDirectory(entries)`: a `Map<email, FamilyEntry[]>`. Entries with an empty Parent Email are skipped.
	- `matchSender(dir, email)` returns `{ state: "matched", studentIds, firstNames } | { state: "unknown" }`.
	- `firstNames` and `parentName` stay in memory for this run. Iris 3/9 passes them to the classifier. They are never written to Postgres.
### Intake (`apps/tracker/lib/iris/intake.ts`, new)
`runIntake(deps: IntakeDeps): Promise<RunOutcome>`. The ports are injected: `store: IrisStore`, `gmail: { token, list, get }`, `directory: () => Promise<FamilyEntry[]>`, `now`, and `mailbox`. It never throws: the whole body sits inside try/catch, and an escaping error becomes `{ result: "failed", error }`. The steps:
1. **List.** Get a token and run `list("in:inbox category:primary newer_than:3d")`. A `GmailError` here ends the run with `result: "failed"` and `gmailListFailed: true`. The handler maps that to 502.
2. **Pick new ids.** `store.knownGmailIds(ids)` returns the ids already stored. Take the unknown ids, reverse them so the oldest comes first, and keep the first `TUNING.irisMaxMessagesPerRun` (50).
3. **Directory.** Run `directory()` once. A failure is kept as a short `NotionError` message, and the run goes on with `dir = null`.
4. **Each new id**, with concurrency 5:
	- `get`. On failure, count it in `failed` and continue. Nothing is stored, so the next run tries again while the mail is inside the 3-day window.
	- Parse the headers.
	- **From the mailbox:**
		- If `store.findThread(threadId)` exists, insert an outbound `charlie_manual` message with its capped body, then update `threads.last_outbound_at`.
		- Otherwise skip it and count it in `skipped`.
	- **Automated:** upsert the thread with `match_state unknown`, then insert the message with metadata and snippet, `body_text null`, `state escalated`, `escalation_reason automated` and `handled_at now`.
	- **`dir`**** null:** upsert the thread with `match_state unknown`, then insert the message `received` with metadata and snippet, no body, `retry_count 1` and `last_error` = the Notion message.
	- **Matched:**
		- Upsert the thread with `match_state matched`, `notion_student_ids` set to the match, and `parent_email`.
		- Insert the message `matched` with the capped body and `body_truncated`.
	- **Unknown:** upsert the thread with `match_state unknown`, then insert the message `escalated` with `escalation_reason unknown_sender`, `from_email`, snippet and no body.
	- **Every inbound row:**
		- gets `policy_version = POLICY_VERSION`, `purge_at = received_at + settings.retention_days` and `state_changed_at`
		- writes one `iris.events` row (`message_stored`, plus `matched` or `escalated`) whose `detail` holds ids, states and reason codes only, never an address, name or body text
	- The insert is `on conflict (org_id, gmail_message_id) do nothing`, so a concurrent or repeated insert stores one row.
5. **Retry earlier messages.** If `dir` is not null, then for each `received` inbound message with `retry_count < TUNING.irisMaxRetries` (oldest first, at most 50): re-`get` it from Gmail, match it, and update it in place to `matched` (with its body) or to `escalated unknown_sender` (still no body). Then update the thread. If `dir` is null, each one's `retry_count` goes up by one, and at 3 it moves to `failed` with its `last_error`.
6. **Thread fields.** `last_inbound_at`, `first_received_at` and `purge_at` (the latest message's `purge_at`) are set on every upsert. A thread's match fields follow its latest inbound message (see Risks).
7. **Purge.** Call `store.purge()` (`iris.purge_expired`). A purge failure is kept as the run's error and does not fail the run.
`RunOutcome` is `{ result, seen, stored, matched, escalated, skipped, failed, purged, error? }`.
### Store (`apps/tracker/lib/iris/store.ts` port, `apps/tracker/lib/data/iris.ts` Supabase, new)
- `createIrisStore(iris: SchemaClient<"iris">, orgId)`. The run route passes `serviceClient.schema("iris")`.
- Methods: `getSettings`, `claimPoll(seconds)` (rpc `claim_poll`), `releasePoll(patch)`, `knownGmailIds(ids)`, `findThread(gmailThreadId)`, `upsertThread(...)`, `insertMessage(...)` (returns `inserted: boolean`), `listRetryable(limit)`, `updateMessage(id, patch)`, `insertEvent(...)`, `insertRun(...)`, `purge()`.
- Every row read is parsed with Zod (`lib/iris/schemas.ts`, ADR 0017).
- The owner pages use `createIrisReader(getDb())`, which reads through `supabase.schema("iris")` on the owner's session, so RLS decides. It has `listNeedsYou(50)`, `listRecent(50)`, `getSettings()`, `lastRun()` and `updatePaused(paused)`.
- `packages/db/src/iris.types.ts` (new) gives `IrisSchema` loose tables, the way `tracker.types.ts` does. `packages/db/src/types.ts` gains `iris: IrisSchema`. The comment in `packages/db/src/service.ts` changes "exactly one importer" to "exactly two importers (REQ-8, REQ-42)".
### Handlers and routes (`apps/tracker/lib/iris/handlers.ts`, new)
- `handleIrisRun({ authorization, env, build, now })`, modelled line for line on `handleDailyTaskRun`, takes these steps in order:
	1. The secret check gives 503 `iris_not_configured`.
	2. The bearer is compared with a SHA-256 `timingSafeEqual`, and a mismatch gives 401 `unauthenticated`.
	3. If the org id is not a guid, or `build` returns null (no service client, or no Gmail or Notion config), the answer is 503 `iris_not_configured`.
	4. `getSettings`: a database error gives 503 `iris_unavailable`, and a missing row gives 503 `iris_not_configured`.
	5. If `paused`, the answer is 200 `{ result: "paused" }` and nothing else is touched.
	6. `claimPoll(TUNING.irisPollLeaseSeconds)`: no row gives 200 `{ result: "busy" }`.
	7. `runIntake`.
	8. `insertRun`, then `releasePoll({ last_poll_at, last_poll_result, last_error })`.
	9. The answer is 502 when `gmailListFailed`, otherwise 200, with `IrisRunResponse` (Zod): `{ result, runId, seen, stored, matched, escalated, skipped, failed, purged }`. There is no `error` text in the response. The error goes to `settings.last_error` and `runs.error` only.
- `app/api/iris/run/route.ts`: `dynamic = "force-dynamic"` and `maxDuration = 60`. It is the second importer of `getServiceClient`. `build` wires `createIrisStore(client.schema("iris"), orgId)`, the Gmail port from `readGmailConfig()`, and `fetchFamilyDirectory(readStudentsConfig())`.
- `handleIrisSettings(deps, body)`, wired as `PATCH app/api/iris/settings/route.ts`:
	- The guard runs first: `requireScheduler(await deps.identity(), ["admin"])`.
	- The body is `z.strictObject({ paused: z.boolean(), confirmed: z.literal(true).optional() })`.
	- `paused: false` without `confirmed` gives 400 `confirm_required`.
	- The update runs through the owner's reader. RLS and the column grant decide, and zero rows updated gives 403.
	- The answer is 200 `{ paused }`, and any error gives 503 `iris_unavailable`.
- `handleRunNow(deps)`, wired as `POST app/api/iris/run-now/route.ts`:
	- The guard runs first. Then, without the secret, the answer is 503.
	- Otherwise it makes one `fetch(`\$\{TRACKER_URL\}/api/iris/run`, { method: "POST", headers: { Authorization: `Bearer \$\{secret\}` }, signal: AbortSignal.timeout(70_000) })` and relays the status and the parsed `IrisRunResponse`.
	- So Run now goes through the same bearer path and needs no third service-role importer (Decision 6).
- `loadInbox(deps)` and `loadIrisSettings(deps)` are page loaders. The guard runs first, then the reads run in parallel.
	- Family labels come from `getStudentNames()`, the existing cached names-only map (Active and Onboarding). A Paused student's id shows as "Paused student".
	- Unknown senders show their stored `from_email`.
### Proxy (`apps/tracker/proxy.ts`)
- Matcher source: `"/((?!_next/static|_next/image|favicon.ico|api/scheduler/daily-task/run$|api/iris/run$).*)"`. The `$` keeps `api/iris/run-now` inside the matcher.
- The origin check becomes `(p.startsWith("/api/scheduler/") || p.startsWith("/api/iris/")) && isCrossSiteWrite(...)`, through a small exported `ORIGIN_CHECKED_PREFIXES` list in `lib/cross-site.ts`, so the test reads the same constant.
- The comment above `matcher` names both bearer endpoints.
### Pages and UI
- `app/iris/page.tsx` and `app/iris/settings/page.tsx` are server pages, `dynamic = "force-dynamic"`, in the shape of `app/schedule/conflicts/page.tsx`. Each runs `realScheduleDeps().identity()` and `requireScheduler(..., ["admin"])` first. A denial redirects to `/` (spec 4.5), and a 503 identity renders the error notice.
- `components/iris/settings-actions.tsx` is a client component. It holds the Pause, Unpause (with the checkbox) and Run now buttons, calls the routes with `fetch`, then calls `router.refresh()`. On a failure it shows the error line and keeps the old state (non-negotiable 6). The buttons are disabled while a call is in flight.
- `app/page.tsx` shows an "Iris inbox" `Link` in the admin's schedule card, next to the availability link.
- New `apps/tracker/lib/view/iris-text.ts` holds all copy, with no em dashes:
	- "Needs you"
	- "Recent mail"
	- "Nothing needs you."
	- "No mail yet. Iris reads new mail every 15 minutes once it is running."
	- "Iris is paused. It reads no mail until you unpause it in Settings."
	- "Could not load Iris. Try again shortly."
	- State labels:
		- matched: "Family found"
		- received: "Waiting for Notion"
		- escalated unknown_sender: "Unknown sender"
		- escalated automated: "Automated, handled"
		- failed: "Failed"
	- "Open in Gmail"
	- "Paused"
	- "Running"
	- "Pause"
	- "Unpause"
	- "The privacy page is live and families are writing to [charlie@apacademy.ca](mailto:charlie@apacademy.ca)"
	- "Run now"
	- "Last run"
	- "Not set up: \<names\>"
	- "Could not save. Try again."
- The Gmail link is `https://mail.google.com/mail/?authuser=<mailbox>#all/<gmail_thread_id>`.
```plain text
Iris inbox                                   [Settings]
(Iris is paused. It reads no mail until you unpause it in Settings.)
Needs you
  ann@example.com · Question about fall classes · 2 h · Unknown sender   [Open in Gmail]
    "Hi, I saw your site and wanted to ask..."
Recent mail
  Sam S. · Re: Tuesday · 20 min · Family found                           [Open in Gmail]
  Newsletter · Weekly digest · 1 d · Automated, handled                  [Open in Gmail]

Iris settings                                 [Inbox]
  Status: Paused        [Unpause]  [ ] The privacy page is live and families are writing to charlie@apacademy.ca
  Last run: Oct 19, 09:15 · ok · 3 new, 2 matched, 1 unknown           [Run now]
  Last error: none
  Not set up: IRIS_GMAIL_PRIVATE_KEY
```
### Tuning (`apps/tracker/lib/domain/tuning.ts`)
Adds only what this card uses: `irisPollWindowDays: 3` (it builds the query string), `irisMaxMessagesPerRun: 50`, `irisBodyMaxChars: 20000`, `irisSnippetChars: 200`, `irisMaxRetries: 3` and `irisPollLeaseSeconds: 300`. The later cards add theirs.
### Docs
- Tracker ADRs (the next free numbers, 0053 to 0055 today), and a row for each in `apps/tracker/docs/decisions/README.md`:
	- **0053** Iris is a tracker module with its own `iris` schema.
	- **0054** Parent email addresses and bodies are stored for 90 days with no audit copy. Unknown and automated mail is stored without a body. The events and `ai_calls` tables keep ids only.
	- **0055** Gmail is reached through a service account with domain-wide delegation, read-only until Iris 8/9, with no SDK.
- **Workspace ADR ****`docs/adr/0005-iris-message-data.md`**** (new).** ADR 0004's decision says parent addresses "never persist outside Notion and Gmail". This card stores the sender address of each email for 90 days. The new ADR narrows that line without editing 0004's decision text:
	- The Notion fields Parent Email and Parent Name are still never copied. Matching stores only Notion page ids, and the `from_name` comes from the email header.
	- The From address of a stored email is message data under tracker ADR 0054.
	- ADR 0004's status line becomes "Accepted, amended in part by ADR 0005". Its Readers and writers table changes `apps/tracker/lib/notion/parents.ts` from `planned` to `exists`, and gains a row for `apps/tracker/app/api/iris/run/route.ts`.
	- `lib/people-adr.test.ts` changes its `parents.ts` expectation from `/planned/` to `/exists/`. That is the only test edit there.
	- See Decision 3.
- `apps/tracker/docs/iris-operations.md` (new, the 2/9 slice of the spec's operator guide):
	- Google Cloud project and Gmail API
	- service account `iris-mail` and its key
	- domain-wide delegation with `gmail.readonly` only
	- exposing `iris` under Supabase API settings, Exposed schemas
	- the tracker env vars
	- the repository secret and the workflow below
	- how to pause
	- how to delete a family's mail now, with `select iris.delete_thread('<thread id>')` in the SQL editor as the owner, until Iris 4/9 adds a button
- `docs/designs/REQ-42.md` (a copy of this design) and `apps/tracker/docs/PLAN.md` progress.
### Workflow (a human adds it; `.github/` is guarded for the builder)
`.github/workflows/iris-poll.yml`:
```yaml
name: Iris poll

# Every 15 minutes: reads new mail for Iris (tracker ADR 0053). Safe to repeat;
# a paused Iris answers "paused" and touches nothing.
on:
  schedule:
    - cron: "*/15 * * * *"
  workflow_dispatch:

permissions:
  contents: read

concurrency:
  group: iris-poll
  cancel-in-progress: false

jobs:
  run:
    runs-on: ubuntu-24.04
    timeout-minutes: 5
    steps:
      - name: Call the Iris run endpoint
        env:
          IRIS_CRON_SECRET: ${{ secrets.IRIS_CRON_SECRET }}
          RUN_URL: ${{ vars.IRIS_RUN_URL || 'https://www.apacademy.ca/tracker/api/iris/run' }}
        run: |
          if [ -z "$IRIS_CRON_SECRET" ]; then
            echo "::notice::Skipped: set the IRIS_CRON_SECRET repository secret (docs/designs/REQ-42.md)."
            exit 0
          fi
          curl --fail-with-body -sS --max-time 90 -X POST -H "Authorization: Bearer $IRIS_CRON_SECRET" "$RUN_URL"
```
### Operator steps (Charlie, after the migration is applied, before unpausing)
1. In Google Cloud, create or reuse an AP Academy project and enable the Gmail API.
2. Create the service account `iris-mail` and one JSON key. Copy `client_email` and `private_key` into the tracker Vercel project as `IRIS_GMAIL_CLIENT_EMAIL` and `IRIS_GMAIL_PRIVATE_KEY`, then delete the local file.
3. Enable domain-wide delegation on the service account. In the Workspace Admin console (Security, Access and data control, API controls, Domain-wide delegation), add its client id with exactly `https://www.googleapis.com/auth/gmail.readonly`.
4. Set these in the tracker Vercel project: `IRIS_GMAIL_MAILBOX=charlie@apacademy.ca`, `IRIS_ORG_ID` (the same value as `DAILY_TASK_ORG_ID`) and `IRIS_CRON_SECRET` (a long random string).
5. In Supabase, under API settings and Exposed schemas, add `iris`.
6. Add the repository secret `IRIS_CRON_SECRET` with the same value, then add the workflow above.
7. Open `/tracker/iris/settings`, check that "Not set up" is empty, and press Run now: it answers "paused". Unpause when families write to the mailbox.
### e2e (`e2e/tracker/`)
- New `mock-gmail.mjs` on port 54334. It serves:
	- `POST /token`
	- `GET /gmail/v1/users/me/messages` (it honours `q` only as a pass-through and records it)
	- `GET /gmail/v1/users/me/messages/:id`
	- `POST /__gmail/add` (adds a fixture), `POST /__gmail/fail-list` (toggles a 500 on list), `GET /__gmail/calls` (the journal) and `POST /__gmail/reset`
	The fixtures, all synthetic:
	- (m1) Sam's parent, plain text
	- (m2) the sibling family's parent, HTML only
	- (m3) an unknown sender
	- (m4) a newsletter with `List-Unsubscribe`
	- (m5) a 25,000-character body from Sam's parent
	- (m6) the mailbox replying in m1's thread
	- (m7) the mailbox writing in a new thread
- `mock-notion.mjs`:
	- The Students schema gains `Parent Email` and `Parent Name`.
	- The student pages gain those values, with Haider and Ada sharing one address as siblings.
	- It gains `POST /__students/fail`, which toggles a 500 on Students queries.
	- It records `filter_properties` per query.
- `stack.sh`:
	- `db-schemas = "public,tracker,iris"`
	- it starts `mock-gmail.mjs`
	- it mints `SUPABASE_SERVICE_ROLE_KEY` (role `service_role`) the way it mints the anon key
	- it adds `IRIS_CRON_SECRET`, `IRIS_ORG_ID=10000000-0000-0000-0000-00000000aaaa`, `IRIS_GMAIL_CLIENT_EMAIL`, a test `IRIS_GMAIL_PRIVATE_KEY` (generated at stack start with `openssl genpkey`) and `IRIS_GMAIL_MAILBOX=charlie@apacademy.ca`, plus `IRIS_GMAIL_API_BASE=http://127.0.0.1:54334`
- `seed.sql`: inserts `iris.settings` for the seed org (`paused` true). The seed runs after the migrations, so the migration's backfill finds no org.
- `flows.mjs` gains a new "Iris" section with the checks in the Test plan.
## Migration
- File: `supabase/migrations/0021_iris_core.sql` (the next free number at build time). It has no top-level `drop`, `delete`, `truncate` or `alter ... drop`, so `apply_migration` can run it. The `delete` statements sit inside function bodies, as in 0014 and 0016, which the MCP applied.
- Creates:
	- `create schema iris`, then `grant usage on schema iris to authenticated, service_role`.
	- **`iris.settings`****:**
		- `id uuid pk default gen_random_uuid()`
		- `org_id uuid not null unique references tracker.orgs on delete restrict`
		- `paused boolean not null default true`
		- `sending_enabled boolean not null default false`
		- `confidence_threshold numeric(3,2) not null default 0.85 check (between 0 and 1)`
		- `retention_days int not null default 90 check (between 1 and 365)`
		- `quiet_start time not null default '21:00'`
		- `quiet_end time not null default '07:00'`
		- `mailbox text check (mailbox = lower(mailbox))`
		- `poll_lease_until timestamptz`
		- `last_poll_at timestamptz`
		- `last_poll_result text check in ('ok','busy','failed','paused')`
		- `last_error text check (char_length <= 300)`
		- `created_at`, `updated_at`
		Then `insert into iris.settings (org_id) select id from tracker.orgs on conflict do nothing`.
	- **`iris.runs`****:**
		- `id uuid pk`, `org_id`, `started_at`, `finished_at`
		- `result text not null check in ('ok','busy','failed','paused')`
		- the int counts `seen`, `stored`, `matched`, `escalated`, `skipped`, `failed`, `classified`, `drafted`, `sent`, `purged`, each `default 0`
		- `error text check (<= 300)`
		- index `(org_id, started_at desc)`
	- **`iris.threads`****:**
		- `id uuid pk`, `org_id`
		- `gmail_thread_id text not null`
		- `channel text not null default 'email' check in ('email')`
		- `parent_email text check (= lower)`
		- `match_state text not null check in ('matched','unknown','ambiguous')`
		- `notion_student_ids uuid[] not null default '{}'`
		- `subject text check (<= 500)`
		- `first_received_at`, `last_inbound_at`, `last_outbound_at`
		- `purge_at timestamptz not null`
		- `unique (org_id, gmail_thread_id)`, index `(purge_at)`
	- **`iris.messages`****:**
		- `id uuid pk`, `org_id`
		- `thread_id uuid not null references iris.threads on delete cascade`
		- `gmail_message_id text not null`, `rfc_message_id text`
		- `direction text not null check in ('inbound','outbound')`
		- `source text not null check in ('external','charlie_manual','iris')`
		- `from_email text not null check (= lower)`, `from_name text check (<= 200)`
		- `received_at timestamptz not null`
		- `body_text text check (<= 20000)`, `body_truncated boolean not null default false`
		- `snippet text check (<= 200)`
		- `state text check in ('received','matched','classified','escalated','drafted','approved','sent','failed')`, with the check `(direction = 'inbound') = (state is not null)`
		- `state_changed_at`
		- `intent text`, `confidence numeric(3,2)`, `flags text[] not null default '{}'`
		- `escalation_reason text check (<= 64)`
		- `policy_version int`
		- `handled_at timestamptz`, `handled_by uuid references auth.users on delete set null`
		- `retry_count int not null default 0`
		- `last_error text check (<= 300)`
		- `purge_at timestamptz not null`
		- `unique (org_id, gmail_message_id)`, indexes `(org_id, state, received_at desc)`, `(thread_id)` and `(purge_at)`
	- **`iris.ai_calls`****:**
		- `id uuid pk`, `org_id`
		- `message_id uuid references iris.messages on delete set null`
		- `purpose text check in ('classify','draft','eval')`
		- `model text`, `input_tokens int`, `output_tokens int`, `policy_version int`
		- `outcome text check in ('ok','refused','error')`
		- `error text check (<= 500)`
		- `created_at`
		- no prompt or answer column
	- **`iris.events`****:**
		- `id bigint generated always as identity pk`, `org_id`
		- `at timestamptz not null default now()`
		- `kind text not null check (<= 64)`
		- `message_id uuid references iris.messages on delete set null`
		- `draft_id uuid` (no FK; 0019's drafts table in Iris 4/9 adds it)
		- `actor text not null check (actor in ('iris','gate') or actor ~ '^[0-9a-f-]{36}$')`
		- `detail jsonb not null default '{}'`
		- index `(org_id, at desc)`
	- **`iris.guard_append_only()`****:** a trigger function, `set search_path = ''`, `before update or delete` on `events` and `ai_calls`. It raises 42501 unless one of these holds:
		- an UPDATE where `to_jsonb(new) - 'message_id' - 'draft_id' = to_jsonb(old) - 'message_id' - 'draft_id'`, and each changed key went to null
		- a DELETE of a row older than 365 days (`at` or `created_at`)
		So the `set null` cascades and the purge work, and nothing else can change the record (see Decision 4). A `before truncate` statement trigger refuses truncate.
	- **Triggers:**
		- `set_updated_at` on `settings`.
		- `audit_settings`: `after insert or delete or update of paused, sending_enabled, confidence_threshold, retention_days, quiet_start, quiet_end, mailbox on iris.settings for each row execute function tracker.write_audit()`. The run's lease and last-run updates never name those columns, so they write no audit row.
		- No audit trigger on threads, messages, ai_calls, events or runs.
	- **`iris.claim_poll(p_org uuid, p_lease_seconds int) returns setof iris.settings`****:** `plpgsql`, security invoker, `search_path = ''`. It runs `update ... set poll_lease_until = now() + make_interval(secs => p_lease_seconds) where org_id = p_org and (poll_lease_until is null or poll_lease_until < now()) returning *`. Execute is granted to `service_role` only.
	- **`iris.purge_expired(p_org uuid) returns jsonb`****:** security invoker, `service_role` only. In order, it deletes:
		1. messages with `purge_at < now()`
		2. threads with no messages and `purge_at < now()`
		3. runs older than 90 days
		4. events and ai_calls older than 365 days
		It then inserts one `purge` event (`actor 'iris'`, `detail` holding the four counts) and returns the counts.
	- **`iris.delete_thread(p_thread uuid) returns int`****:** security definer, `search_path = ''`. It raises 42501 unless `tracker.is_org_owner(thread.org_id)`. Then it deletes the messages and the thread, inserts a `thread_deleted` event with `actor = auth.uid()::text` and `detail {thread_id, messages}`, and returns the count. Execute is revoked from public and granted to `authenticated`.
	- **RLS and grants:** `alter table ... enable row level security` on all six. `revoke all on all tables in schema iris from anon, authenticated`, then `grant all on all tables in schema iris to service_role`. Authenticated users get:
		- `settings`: select policy `tracker.is_org_owner(org_id)`. Update policy owner, using and with check. `grant select`, `grant update (paused, sending_enabled, confidence_threshold)`.
		- `runs`, `threads`, `ai_calls`: select policy owner, `grant select`.
		- `messages`: select policy owner. Update policy owner with check `handled_by is null or handled_by = auth.uid()`. `grant select`, `grant update (state, state_changed_at, handled_at, handled_by)`.
		- `events`: select policy owner. Insert policy owner with check `actor = auth.uid()::text`. `grant select`, `grant insert (org_id, kind, message_id, draft_id, actor, detail)`.
		- No delete grant anywhere for `authenticated`. Deletion goes only through `iris.delete_thread`.
- Check: `supabase/tests/iris_core.sql` (picked up by `supabase/tests/run-rls.sh`). The cast: owner O1, owner O2, a grade teacher, a scheduling-only teacher (live staff link), a student, a parent (claimed link), `anon` and `service_role`, plus one thread with two messages in each org. It proves:
	- **Reads:** owner O1 reads O1's rows in all six tables and none of O2's. Every other role reads 0 rows in every table.
	- **Owner writes:**
		- An owner update of `settings.paused` succeeds. Of `settings.mailbox` or `poll_lease_until`, it fails with 42501.
		- An update of `messages.handled_at` succeeds. Of `messages.body_text`, it fails with 42501.
		- An owner insert into `threads` or `messages` fails with 42501.
		- An owner insert into `events` with `actor` set to another uuid is refused.
		- An owner delete on any table fails, with 42501 or 0 rows.
	- **Other roles' writes:** a teacher, student, parent or `anon` update or insert on every table is refused.
	- **Audit:** an owner `paused` change writes one `audit_log` row with `table_name 'settings'` and `actor_id` = the owner. A `service_role` update of `poll_lease_until`, `last_poll_at` and `last_error` writes none.
	- **Append-only:** an `events` update of `kind` raises 42501, even as `service_role`. So do a delete of a fresh event and a truncate. Setting `message_id` to null succeeds.
	- **Lease:** `claim_poll` (as `service_role`) returns 1 row, then 0 rows on a second call. After `poll_lease_until` is set to the past, it returns 1 again. An owner calling it is refused (no execute).
	- **Purge:**
		- A message with `purge_at` in the past is deleted, and so is its thread once empty.
		- A fresh message stays.
		- That message's event and ai_call survive with `message_id` null.
		- A 400-day-old event is deleted.
		- One `purge` event exists with the counts.
	- **Delete now:** `delete_thread` as owner O1 deletes O1's thread and writes `thread_deleted`. As owner O2 or a teacher on O1's thread, it raises 42501.
	- **Constraints:** a duplicate `(org_id, gmail_message_id)` raises 23505. An inbound message with null `state`, and an outbound one with a state, fail the check. A 20,001-character `body_text` fails.
	- **Defaults:** a `settings` row inserted with only `org_id` has `paused = true` and `sending_enabled = false`. The backfill itself runs before any check can insert an org, so the migration PR verifies it after apply: `select (select count(*) from tracker.orgs) = (select count(*) from iris.settings where paused and not sending_enabled)` returns true.
- The permission matrix (`supabase/tests/permission_matrix.sql`, `docs/permission-matrix.md`) is unchanged. Its AC3 block classifies `tracker` tables only, and `iris_core.sql` runs the full role grid for `iris` (Decision 10).
- Ships as its own PR first (`req/REQ-42-migration`, human-merged and applied with Charlie's sign-off, then `iris` added to Exposed schemas). The feature PR assumes it is live.
## Test plan
<table header-row="true">
<tr>
<td>Test</td>
<td>Type</td>
<td>Covers</td>
</tr>
<tr>
<td>`supabase/tests/iris_core.sql`, "shape" block:<br>  • schema `iris` has exactly the six tables, and each has `relrowsecurity = true` in `pg_class`<br>  • `iris.claim_poll`, `iris.purge_expired`, `iris.delete_thread` and `iris.guard_append_only` exist in `pg_proc`<br>  • a `settings` row inserted with only `org_id` has `paused = true` and `sending_enabled = false`<br>  • a duplicate `(org_id, gmail_message_id)` raises 23505<br>  • an inbound message with a null `state`, and an outbound one with a state, fail the check<br>  • a 20,001-character `body_text` fails<br>Then the post-apply query under Migration (the backfill)</td>
<td>integration (RLS, `pnpm test:rls`), plus a post-apply query</td>
<td>AC1</td>
</tr>
<tr>
<td>`iris_core.sql`, "role grid" block, one assertion per table for all six tables:<br>  • owner O1 reads O1's rows and none of O2's<br>  • owner O2, a grade teacher, a scheduling-only teacher, a student, a parent and `anon` each read 0 rows<br>  • each of those roles is refused an insert and an update (42501, or 0 rows under RLS)<br>  • the owner-write cases listed under Migration: `paused` and `handled_at` succeed; `mailbox`, `poll_lease_until` and `body_text` give 42501; inserts into `threads` and `messages` give 42501; an `events` insert with another actor is refused; a delete on any table removes 0 rows or gives 42501</td>
<td>integration (RLS)</td>
<td>AC2</td>
</tr>
<tr>
<td>`iris_core.sql`, "audit" block, counting `tracker.audit_log` rows before and after each statement:<br>  • the owner updates `paused`: +1 row, with `table_name 'settings'` and `actor_id` = the owner<br>  • `service_role` updates `sending_enabled`: +1; `confidence_threshold`: +1<br>  • `service_role` updates `poll_lease_until`, `last_poll_at`, `last_poll_result` and `last_error` together: +0<br>  • `claim_poll`: +0<br>  • inserts and updates on `runs`, `threads`, `messages`, `events` and `ai_calls`: +0</td>
<td>integration (RLS)</td>
<td>AC3</td>
</tr>
<tr>
<td>`iris_core.sql`, "append-only" block, for `events` and for `ai_calls`, each as `service_role` and as the owner:<br>  • an update of `kind` (events) or `model` (ai_calls) gives 42501<br>  • setting `message_id` to null succeeds, and on `events` setting `draft_id` to null succeeds<br>  • setting `message_id` to null and changing another column in the same statement gives 42501<br>  • a delete of a fresh row gives 42501<br>  • `truncate` gives 42501<br>  • a delete of a row whose `at` or `created_at` is 400 days old succeeds (as `service_role`)</td>
<td>integration (RLS)</td>
<td>AC4</td>
</tr>
<tr>
<td>`iris_core.sql`, "lease" block, as `service_role`:<br>  • `claim_poll(O1, 300)` returns 1 row<br>  • a second call returns 0 rows<br>  • after `poll_lease_until` is set to `now() - interval '1 second'`, it returns 1 row again<br>  • `claim_poll` for O2 is not blocked by O1's lease<br>  • the owner calling it gets 42501 (no execute)</td>
<td>integration (RLS)</td>
<td>AC5</td>
</tr>
<tr>
<td>`iris_core.sql`, "purge" and "delete now" blocks:<br>  • a message with `purge_at` in the past is deleted, and so is its thread once empty<br>  • a fresh message and its thread stay<br>  • the deleted message's event and ai_call survive with `message_id` null<br>  • a 400-day-old event and ai_call are deleted, and a 100-day-old run is deleted<br>  • exactly one `purge` event exists, and its `detail` counts match<br>  • `delete_thread` as owner O1 deletes O1's thread and its messages, returns the message count and writes one `thread_deleted` event with `actor` = O1<br>  • as owner O2, or as a teacher, on O1's thread it gives 42501 and nothing is deleted</td>
<td>integration (RLS)</td>
<td>AC6</td>
</tr>
<tr>
<td>New `lib/iris/policy.test.ts`:<br>  • `POLICY_VERSION` is 1<br>  • every reply type and escalate-only intent has a section<br>  • `NEVER_AUTO_SEND` covers `pause_or_stop` and all of `ESCALATE_ONLY`<br>  • each founder value appears: "12 or more hours", "under 12 hours", "no fee", "make-up class between the missed class and the next scheduled one", "credited on next month's invoice", "never confirms a forfeit", "no notice needed", "refunded on the final invoice", "one invoice a month"<br>  • no section contains "\$" or a digit followed by "dollar"<br>  • the file has no `import`<br>  • a scan of every non-test `.ts`/`.tsx` in `apps/tracker` other than `policy.ts` finds no section text and no hard rule text</td>
<td>unit</td>
<td>AC7</td>
</tr>
<tr>
<td>New `lib/iris/gmail.test.ts`, with a key pair from `generateKeyPairSync` and a recording fetch:<br>  • the JWT header and claims (scope, sub, iss, aud, exp - iat = 3600), and the signature verifies with the public key<br>  • a private key with literal `\n` works<br>  • the token POST body<br>  • the list URL carries `q` and `maxResults=100`, and paging stops at 5 pages<br>  • get uses `format=full`<br>  • a 403 with a body naming an address gives a `GmailError` whose message has no part of the body and is at most 300 characters<br>  • a network throw gives "Gmail request failed"<br>  • the timeout signal is present<br>  • `IRIS_GMAIL_API_BASE` rewrites both hosts</td>
<td>unit</td>
<td>AC8, AC9</td>
</tr>
<tr>
<td>New `lib/iris/mime.test.ts`:<br>  • `text/plain` is preferred over HTML in a `multipart/alternative`<br>  • HTML-only is reduced (tags, `br`, entities, `script` dropped)<br>  • nested multipart<br>  • a base64url and an ISO-8859-1 part<br>  • an attachment part is ignored<br>  • `capBody` at 25,000 characters gives 20,000 and `truncated`<br>  • `parseFrom` variants (quoted name, bare address, upper case)<br>  • a table for `isAutomated`: Auto-Submitted auto-replied gives true and `no` gives false; Precedence bulk, list and junk give true; List-Unsubscribe gives true; noreply, no-reply, mailer-daemon and postmaster give true; a plain parent gives false<br>  • `snippetOf` caps at 200</td>
<td>unit</td>
<td>AC14, AC15</td>
</tr>
<tr>
<td>New `lib/notion/parents.test.ts`, with a recording fetch:<br>  • one schema GET, then one query whose `filter_properties` are exactly the four ids and whose filter is Stage in Active, Onboarding and Paused<br>  • every request has `cache: "no-store"`<br>  • the parse keeps four fields from a page that also carries Parent Phone and Hourly Rate<br>  • a missing property throws `NotionError`<br>  • paging stops at 50<br>  • the only methods used are GET and POST</td>
<td>unit</td>
<td>AC17, AC25</td>
</tr>
<tr>
<td>New `lib/iris/match.test.ts`:<br>  • "  [Ann@X.com](mailto:Ann@X.com) " matches "[ann@x.com](mailto:ann@x.com)"<br>  • one page gives matched with one id<br>  • two pages with one address give matched with both ids and both first names<br>  • no page gives unknown<br>  • an empty Parent Email never matches</td>
<td>unit</td>
<td>AC17</td>
</tr>
<tr>
<td>New `lib/iris/intake.test.ts`, with an in-memory `IrisStore`, a fake Gmail and a fake directory:<br>  • two runs over the same inbox store each message once, and the second reports `stored: 0`<br>  • 60 new ids give 50 processed, oldest first<br>  • a 25,000-character body is truncated<br>  • automated mail has no body, `escalated automated` and `handled_at`<br>  • an unknown sender has no body, a snippet, and `escalated unknown_sender`<br>  • a sibling family has both ids on the thread<br>  • mailbox mail in a known thread is outbound `charlie_manual`, and in an unknown thread is skipped<br>  • each inbound row has `policy_version` = `POLICY_VERSION` and `purge_at` = received + `retention_days`<br>  • no event `detail` contains "@" or body text<br>  • a directory that throws gives `received`, no body, a short error and `result ok`, then the next run re-gets from Gmail, matches and stores the body<br>  • three failing runs give `failed`<br>  • one `get` failure is counted and the run continues<br>  • a list failure gives `gmailListFailed`<br>  • a store that throws mid-run gives `result failed`, and the function resolves</td>
<td>unit</td>
<td>AC13, AC14, AC15, AC17, AC19</td>
</tr>
<tr>
<td>`lib/iris/intake.test.ts`, query and window:<br>  • the fake Gmail records exactly one `list` call, with `q` = `in:inbox category:primary newer_than:3d`<br>  • `knownGmailIds` is called with the listed ids<br>  • the first `get` is for the oldest new id</td>
<td>unit</td>
<td>AC13</td>
</tr>
<tr>
<td>`lib/iris/intake.test.ts`, mailbox mail:<br>  • a message from `Charlie@APAcademy.ca` (any case) in a thread already stored is inserted with `direction outbound`, `source charlie_manual`, `state` null and its capped body, and the thread's `last_outbound_at` is set<br>  • one in a thread not stored inserts no message, no thread and no event, and the run counts `skipped: 1`<br>Plus e2e step 6: m6 stored outbound, m7 absent</td>
<td>unit, e2e</td>
<td>AC16</td>
</tr>
<tr>
<td>`lib/iris/intake.test.ts`, directory failure across four runs:<br>  • run 1, directory throws: message A is stored `received`, with `body_text` null, `retry_count` 1, and a `last_error` of at most 300 characters with no "@". The outcome is `result ok`, and `handleIrisRun` answers 200<br>  • run 2, directory works: Gmail `get` is called again for A, and A becomes `matched` with its body and the thread's student ids. Unknown sender B, stored the same way in run 1, becomes `escalated unknown_sender` and its `body_text` stays null<br>  • message C, with the directory failing in runs 1 to 3, is `failed` after run 3, with `retry_count` 3 and its `last_error`<br>  • run 4: C is not fetched again<br>Plus e2e step 10</td>
<td>unit, e2e</td>
<td>AC18</td>
</tr>
<tr>
<td>`lib/iris/run-handlers.test.ts` with a spy store, for a successful run, a Gmail list failure and a store that throws mid-run:<br>  • `purge` is called once<br>  • `insertRun` is called once, with the counts and the result<br>  • `releasePoll` is called once, with `last_poll_at`, `last_poll_result` and `last_error`<br>  • a `purge` that throws still ends with `result ok`, and its short error is in `last_error`<br>  • `busy` and `paused` runs call none of the three</td>
<td>unit (route)</td>
<td>AC20</td>
</tr>
<tr>
<td>New `lib/iris/run-handlers.test.ts` (`handleIrisRun`):<br>  • an unset secret gives 503, and a missing or wrong bearer gives 401, both with zero calls to `build` (a spy)<br>  • a bad org id gives 503<br>  • paused gives `paused` with zero Gmail calls and no `insertRun`<br>  • `claimPoll` returning null gives `busy` with zero Gmail calls<br>  • a list failure gives 502 with `last_error` saved<br>  • success gives 200 with counts and the lease released<br>  • the response never carries `error` text</td>
<td>unit (route)</td>
<td>AC10, AC11, AC12, AC19, AC20</td>
</tr>
<tr>
<td>New `app/api/iris/iris-routes.test.ts`, with fake identity deps:<br>  • for each of grade teacher (`none`), scheduling teacher, student and parent (`none`): `PATCH settings` and `POST run-now` give 403, signed out gives 401, and the reader and fetcher spies record zero calls<br>  • the owner pausing gives 200<br>  • unpause without `confirmed` gives 400 `confirm_required`, and with it 200<br>  • run-now POSTs to `TRACKER_URL/api/iris/run` with the bearer and relays a 200 or 502<br>  • run-now with no secret gives 503<br>  • the page loaders: a non-admin identity gives a redirect to `/` before any reader call</td>
<td>unit (route)</td>
<td>AC23, AC27</td>
</tr>
<tr>
<td>New `lib/iris/scan.test.ts`:<br>  • the forbidden property names (case-sensitive) and the Invoices, Credits and Lessons data source ids are absent from `lib/iris/**` and `lib/notion/parents.ts`<br>  • `gmail.readonly` is the only `googleapis.com/auth/` string, and there is no `/send`, `/drafts`, `/modify`, `batchModify` or `trash`<br>  • `parents.ts` is imported only from `lib/iris/` and the run route, and none of them names `unstable_cache` or `"use cache"`<br>  • `parents.ts` has no `PATCH` or `DELETE`</td>
<td>unit (scan)</td>
<td>AC8, AC25</td>
</tr>
<tr>
<td>`app/api/scheduler/daily-task-routes.test.ts`: the importer expectation becomes `["app/api/iris/run/route.ts", "app/api/scheduler/daily-task/run/route.ts"]`</td>
<td>unit (scan)</td>
<td>AC24</td>
</tr>
<tr>
<td>`proxy.test.ts`:<br>  • the matcher contains `api/iris/run$`<br>  • the compiled regex of `matcher[1].source` matches `/iris`, `/iris/settings`, `/api/iris/settings` and `/api/iris/run-now`, and not `/api/iris/run`<br>  • a cross-site `PATCH /api/iris/settings` gives 403 JSON with no-store<br>  • a same-origin one is not 403<br>  `lib/cross-site.test.ts`: `ORIGIN_CHECKED_PREFIXES` is exactly the two prefixes</td>
<td>unit</td>
<td>AC21, AC22</td>
</tr>
<tr>
<td>New `lib/view/iris-text.test.ts`: every state label, the paused, empty and error lines and the Unpause tick text, with no U+2014 or U+2013</td>
<td>unit</td>
<td>AC26, AC27</td>
</tr>
<tr>
<td>`lib/people-adr.test.ts`: `parents.ts` is now `exists`, and the existing "names only real files as exists" check proves the file is there. New `lib/iris-adr.test.ts`:<br>  • the three tracker ADRs exist with Status, Context, Decision, Alternatives and Consequences<br>  • the README lists them<br>  • workspace ADR 0005 exists and says Parent Email and Parent Name are never copied<br>  • ADR 0004's status says "amended in part by ADR 0005"<br>  • `iris-operations.md` names `gmail.readonly`, `IRIS_CRON_SECRET`, Exposed schemas and `iris.delete_thread`</td>
<td>unit (doc scan)</td>
<td>docs (Decision 3)</td>
</tr>
<tr>
<td>`e2e/tracker/flows.mjs`, new "Iris" section:<br>1. Signed out: `GET /tracker/iris`, `/tracker/iris/settings` and `POST /tracker/api/iris/run-now` redirect to `/login`, and `POST /tracker/api/iris/run` with no bearer gives 401.<br>2. Ryan (scheduling teacher) opens `/tracker/iris` and lands on `/`. His `PATCH /tracker/api/iris/settings` and `POST run-now` give 403, and `/__gmail/calls` is empty.<br>3. A bearer run while paused gives `paused`, and the Gmail journal is still empty.<br>4. A cross-site `PATCH /tracker/api/iris/settings` (Origin `https://evil.example`) as the owner gives 403, and `paused` is still true.<br>5. The owner sees Unpause disabled, ticks the box and unpauses, and the page shows Running.<br>6. A bearer run gives 200. Via `PG_URL`: m1 is `matched` with its body; m2 (HTML) is matched with both sibling ids on its thread; m3 has `body_text` null and `escalated unknown_sender`; m4 has `body_text` null with `handled_at` set; m5 has 20,000 characters and `body_truncated`; m6 is stored outbound; m7 is absent; every inbound row has `policy_version` 1.<br>7. The owner's inbox shows m3 under Needs you and not m4.<br>8. A second run gives `stored: 0`, and the row count is unchanged.<br>9. Two runs started together give one `ok` and one `busy`.<br>10. `/__students/fail` is set, m8 is added, and a run gives 200 with m8 `received`, a body of null and a short `last_error`. After clearing the failure, the next run moves m8 to `matched` with its body.<br>11. The Notion journal shows every Students query with exactly the four `filter_properties`, and no Notion `PATCH`, `POST /v1/pages` or `/comments` from the Iris runs.<br>12. With `/__gmail/fail-list` set, Run now on the settings page shows the failed result, the run answers 502, and the settings page shows the short last error.<br>13. A snapshot of every `tracker` table is unchanged across the section.</td>
<td>e2e (`pnpm test:tracker`)</td>
<td>AC10 (step 1), AC11 (3), AC12 (9), AC13 (8), AC14 (6), AC15 (6, 7), AC16 (6), AC17 (6, 11), AC18 (10), AC19 (12), AC20 (6, 12), AC21 (1), AC22 (4), AC23 (2), AC26 (7), AC27 (5, 12)</td>
</tr>
</table>
The builder runs `pnpm test:rls` and `pnpm test:tracker` locally before each PR (`apps/tracker/app/`, `components/`, `proxy.ts` and `e2e/` are in `e2e_paths`), plus every gate command.
## Out of scope
- Classification, `ai_calls` writes, flags and Mark handled (Iris 3/9).
- Drafts, the message page, the approval queue, the Notion phone backup, the Work Log entry and a Delete thread button (Iris 4/9).
- The eval import (5/9), schedule awareness (6/9), make-up offers (7/9), sending and `gmail.send` (8/9), and auto-send and quiet-hours logic (9/9).
- Settings controls for `sending_enabled`, the threshold, quiet hours and retention. The columns and grants exist, and only `paused` has a control.
- Mail older than 3 days on the first unpause (spec open question 12).
- A second parent address per family (open question 2).
- The `ambiguous` thread state. The check allows it, and 3/9 sets it.
## Risks and edge cases
- **Parent data in a new place.** Bodies and addresses live in `iris` for at most `retention_days` (90). They are owner-only by RLS, never in `audit_log` (no trigger), never in events (a test checks `detail`), never in API responses for non-owners, and never in error text. Unknown senders, which include leads, vendors and teachers, have no body stored.
- **Body stored before a match is known.** It never is. On a directory failure the message is stored without its body, and the body is fetched again once a match is known (AC18). So a Notion outage cannot leave an unknown sender's body in Postgres.
- **A service-role path.** The run route bypasses RLS. It is reachable only with the bearer, compared in constant time before anything else, and it is pinned as one of exactly two importers. Run now reuses the bearer path through a server-side fetch, so no third importer appears and the secret never reaches the browser.
- **Concurrent runs.** The lease in `claim_poll` lets one run work, and a crashed run's lease lapses after 300 seconds. The unique `(org_id, gmail_message_id)` plus `on conflict do nothing` makes a duplicate insert harmless even if two runs overlap after a lapse.
- **Function time.** At most 50 gets with concurrency 5 and 10-second timeouts stays within `maxDuration = 60`. The lease (300 s) outlives any run.
- **Thread with another sender.** A forwarded message or a second family in one thread: matching is per message, and the thread's `match_state` and `notion_student_ids` follow the latest inbound message. The inbox labels each row from its own thread. This is rare, and Iris 3/9 escalates it.
- **Gmail ****`category:primary`****.** A family email that Gmail files under Updates or Promotions is not read. That is accepted (spec decision 4), and the operator guide says so.
- **HTML reduction without a library.** Odd HTML may read poorly. The text is shown only to Charlie and is capped, and nothing executes it (React escapes it).
- **Policy text before prompts.** Nothing reads `policy.ts` yet except tests, so a wording change costs nothing until 3/9. Changing `POLICY_VERSION` later resets streaks (Iris 9/9).
- **`iris`**** not exposed in Supabase.** supabase-js gets a schema error, and the run answers 503 `iris_unavailable`. The settings page says "Could not load Iris". The operator steps include exposing it.
- **Migration number collision with REQ-39.** Both default to 0021. Each builder takes the next free number at build time, after checking `main` and every `origin/req/*-migration` branch.
## Decisions for approval
<table header-row="true">
<tr>
<td>#</td>
<td>Decision</td>
<td>Options</td>
<td>Default if you say nothing</td>
</tr>
<tr>
<td>1</td>
<td>New dependencies</td>
<td>None; `googleapis`; `google-auth-library`</td>
<td>None. JWT through `node:crypto`, plain `fetch`, and Zod (spec decision 3).</td>
</tr>
<tr>
<td>2</td>
<td>Schema placement</td>
<td>Schema `iris`: `settings`, `runs`, `threads`, `messages`, `ai_calls`, `events`, plus `claim_poll`, `purge_expired`, `delete_thread` and `guard_append_only`, in `0021_iris_core.sql` (the next free number at build time). RLS: org owner selects; owner updates `settings.paused`, `sending_enabled`, `confidence_threshold` and the message handling columns; owner inserts their own events; `service_role` does everything else; no one else has access.</td>
<td>As described</td>
</tr>
<tr>
<td>3</td>
<td>ADR 0004 says parent addresses "never persist outside Notion and Gmail", but this card stores sender addresses for 90 days</td>
<td>(A) A new workspace ADR 0005 amends that line: Notion's Parent Email and Parent Name are never copied, and an email's From address is message data under tracker ADR 0054. ADR 0004's status becomes "Accepted, amended in part by ADR 0005". (B) Store no address, only a keyed hash, and read From from Gmail on display. (C) Edit ADR 0004's decision in place.</td>
<td>(A). The card and spec require `parent_email` and `from_email`. (B) breaks the unknown-sender list and costs a Gmail read per row. (C) breaks the "never edit an accepted ADR" rule.</td>
</tr>
<tr>
<td>4</td>
<td>Append-only guard on `events` (spec: reuse `tracker.refuse_audit_change`)</td>
<td>(A) A new `iris.guard_append_only()` that allows only setting `message_id` or `draft_id` to null, and deleting rows older than 365 days. (B) Reuse `tracker.refuse_audit_change`.</td>
<td>(A). (B) would also block the spec's own `on delete set null` cascade and the 1-year purge, and its error message names `tracker.audit_log`.</td>
</tr>
<tr>
<td>5</td>
<td>Audit trigger on `settings`</td>
<td>(A) `after insert or delete or update of` the owner-facing columns only. (B) Every update.</td>
<td>(A). (B) would write an audit row for every lease and last-run update, which is 96 a day.</td>
</tr>
<tr>
<td>6</td>
<td>How Run now runs</td>
<td>(A) An owner-guarded `POST /api/iris/run-now` that calls the bearer run route server-side. (B) The run route also accepts an owner session. (C) Run now imports the intake with its own service client.</td>
<td>(A). The run route keeps one auth mode, the service client keeps exactly two importers, and the secret stays on the server.</td>
</tr>
<tr>
<td>7</td>
<td>`messages.source` values (spec: `parent`, `charlie_manual`, `iris`)</td>
<td>`external`, `charlie_manual`, `iris`; or the spec's `parent`</td>
<td>`external`. Unknown and automated senders are not parents, and `threads.match_state` already says whether a family matched.</td>
</tr>
<tr>
<td>8</td>
<td>State of automated mail and of outbound rows (the spec's eight states have no "handled")</td>
<td>Automated: `escalated`, reason `automated`, `handled_at` set; outbound: `state` null (check enforced). Or add a `handled` state.</td>
<td>As described. No new state, and "Needs you" is `escalated` with `handled_at` null.</td>
</tr>
<tr>
<td>9</td>
<td>Helpers in `parents.ts`</td>
<td>Duplicate the small `call`, `headers` and `propertyIds` helpers; or export them from `students.ts`</td>
<td>Duplicate (about 25 lines). `students.ts` stays unchanged, and the parent-field file stays self-contained for the scans.</td>
</tr>
<tr>
<td>10</td>
<td>Permission matrix</td>
<td>(A) Prove `iris` in `iris_core.sql` across the same roles, and leave `permission_matrix.sql` and the doc as they are (they classify `tracker` only). (B) Extend the matrix to the `iris` schema.</td>
<td>(A). Extending the matrix touches its doc-and-SQL agreement test. A follow-up card can do (B).</td>
</tr>
<tr>
<td>11</td>
<td>Extra `runs` columns beyond the spec</td>
<td>Add `matched`, `escalated`, `skipped` and `failed` counts; or only the spec's columns</td>
<td>Add them. They are what the settings page shows for this card.</td>
</tr>
<tr>
<td>12</td>
<td>Non-owner page response (the existing admin pages use `notFound()`)</td>
<td>Redirect to `/` (spec 4.5); `notFound()`</td>
<td>Redirect to `/`, as the spec says.</td>
</tr>
<tr>
<td>13</td>
<td>Names in the inbox list</td>
<td>The existing cached names-only map (Active and Onboarding), with "Paused student" otherwise; or a fresh uncached directory read per page load</td>
<td>The cached names map. No parent field is read on page load.</td>
</tr>
<tr>
<td>14</td>
<td>Delete-now for a family</td>
<td>The SQL function now plus an operator-guide line, with the button in 4/9; or a button on this card</td>
<td>The function now, the button in 4/9. This card has no message page to put it on.</td>
</tr>
<tr>
<td>15</td>
<td>Files outside `apps/tracker` that this card changes</td>
<td>`packages/db/src/iris.types.ts` and `types.ts` (the `iris` schema type) plus the `service.ts` comment; `docs/adr/0004…` (status and readers rows); new `docs/adr/0005-iris-message-data.md`; `e2e/tracker/*`; the workflow YAML (a human adds it)</td>
<td>As listed. `packages/db/` and `supabase/` put `needs-human-merge` on the PRs, and so does High risk.</td>
</tr>
<tr>
<td>16</td>
<td>Split the card</td>
<td>One card; or move the policy file to its own card</td>
<td>One card. `policy.ts` is small, has no runtime reader yet, and the spec places it here so `POLICY_VERSION` is stamped from the first stored message.</td>
</tr>
<tr>
<td>17</td>
<td>Numbers</td>
<td>Migration 0021, tracker ADRs 0053 to 0055, workspace ADR 0005, or the next free numbers at build time</td>
<td>The next free numbers at build time (workspace ADR 0004, Numbering).</td>
</tr>
</table>
