# Supabase setup for `/sat` accounts

Phase 2 (magic-link sign-in, consent capture, attempt logging) is built and
switched off. It turns on the moment two environment variables are set. This is
the order to do it in, and how to prove each step before moving on.

Nothing here is needed for the main site. With the variables unset, `/sat`
runs in Phase 1 mode and the sign-in page says so.

## 1. Create the project

Supabase dashboard → New project. Region: `ca-central-1` (Canada) keeps student
data in Canada, which matters for the under-16 consent question still open in
`CLAUDE.md`. Wait for the project to finish provisioning.

## 2. Apply the migrations, in order

SQL Editor → New query. Paste and run each file in full:

1. `supabase/migrations/0001_sat_accounts.sql` (tables, RLS, profile trigger)
2. `supabase/migrations/0002_unsubscribe.sql` (unsubscribe token and function)

Both are idempotent, so re-running is safe. Apply them **before** setting the
env vars: otherwise sign-in succeeds and the callback fails to write.

## 3. Auth configuration

Authentication → Sign In / Providers:
- Email provider: on. Confirm email can stay on.
- Allow new users to sign up: on. Magic-link sign-in creates the user.

Authentication → URL Configuration:
- Site URL: `https://ap-academy-landing.vercel.app`
- Redirect URLs, add both:
  - `http://localhost:3000/auth/callback`
  - `https://ap-academy-landing.vercel.app/auth/callback`

The app passes `emailRedirectTo` on every sign-in. A URL missing from this list
sends the student to the Site URL instead and the session is never set.

Authentication → Emails → Magic Link template: the default `{{ .ConfirmationURL }}`
works with the callback route as written. If you customise the copy, keep that
placeholder. Custom SMTP is not required to test, but the built-in sender is
rate-limited to a handful of emails per hour.

## 4. Keys

Project Settings → API Keys.

| variable | which key | where it lives |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Project URL | `.env.local`, Vercel |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | publishable `sb_publishable_…` (or legacy anon) | `.env.local`, Vercel |
| `SUPABASE_SERVICE_ROLE_KEY` | secret `sb_secret_…` | shell only, one command at a time |

The secret key never goes in `.env.local`, never in Vercel, never in a
`NEXT_PUBLIC_` variable. The check script refuses to run if it finds one there.

Locally:

```
cp .env.example .env.local
# fill in the two NEXT_PUBLIC_ values
```

## 5. Check the connection

```
npm run check:supabase
```

No install needed. It verifies, in order: the two variables look right, the
project is reachable, the key is accepted, both tables exist and RLS hides them
from anonymous requests, the unsubscribe function exists, and sign-ups plus the
email provider are enabled. Each failure names the dashboard page that fixes it.

## 6. Create a test user

Two ways. The first is the real test.

**Through the app.** `npm run dev`, open `http://localhost:3000/sat/login`,
enter your email, submit. Click the link in the email. You land back on `/sat`
with "Sign out" in the header, and Table Editor → `profiles` shows your row.

**Pre-created, to test the trigger on its own:**

```
SUPABASE_SERVICE_ROLE_KEY=sb_secret_... npm run check:supabase -- --create-user y.wang217@gmail.com
```

That creates a confirmed user and checks the profile row appeared. You still
sign in through the form: the magic link is the only way to get a session.

## 7. Verify RLS with a second account

Sign in as a second email in a private window, answer a few quiz questions, then
in SQL Editor run as each user (Table Editor → `attempts` with the RLS-aware
impersonation, or a query with `set role authenticated` and
`request.jwt.claims`). Each account sees only its own rows. `CLAUDE.md` records
this was verified against local Postgres; repeat it once against the real
project before promoting sign-up.

## 8. Vercel

Project → Settings → Environment Variables. Add the two `NEXT_PUBLIC_` values
for Production and Preview, then redeploy. They are inlined at build time, so an
existing deployment will not pick them up.

## Turning it back off

Remove the two variables and redeploy. No code change. Data stays in Supabase.
