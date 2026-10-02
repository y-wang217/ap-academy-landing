# AP Academy Landing Page - Project Notes

This app lives at `apps/landing` in the AP Academy pnpm workspace. Paths below
are relative to this folder, except `supabase/`, which is the shared migrations
folder at the repo root. Workspace layout: the root `CLAUDE.md`.

## Contact Information (DO NOT CHANGE unless explicitly requested)
- **Phone:** 519-589-8217
- **Email:** y.wang217@gmail.com
- **Calendly:** https://calendly.com/y-wang217/30min
- **Founder:** Charlie (Waterloo Software Engineering grad)
- **URL:** https://www.apacademy.ca (apex `apacademy.ca` redirects here; the
  Vercel project is still reachable at https://ap-academy-landing.vercel.app)

## Design System
- Background: #faf9f7 (warm off-white)
- Surface: #ffffff (white)
- Text primary: #1a1a2e (dark navy)
- Text secondary: #4a4a5a
- Text muted: #7a7a8a
- Navy: #1a1a2e
- Accent: #2563eb (blue)
- Accent hover: #1d4ed8
- Border: #e5e5e5
- Font: Inter

## Routes
- `/` — Landing page: hero, subjects, schedule, guarantee, pricing, CTA
- `/info` — VSL page with video embed placeholder
- `/enroll` — Purchase page with Stripe Payment Link buttons
- `/privacy` — Privacy policy
- `/thank-you` — Post-booking confirmation
- `/sat` — SAT vocabulary flashcards (free, ungated)
- `/sat/quiz` — SAT multiple-choice quiz (free, ungated)

## SAT section (`/sat`)
A second, parallel self-serve product aimed at **students**, not parents. Phase 1
is entirely client-side — no backend, no accounts, no new dependencies.

- **Never put Waterloo/admissions/pricing/tutoring copy under `/sat`.** Different
  audience, different positioning.
- Word data: `app/sat/sat-words.json`, 991 entries. Never hardcode "1000" in the UI.
  `scripts/validate-sat-words.mjs` runs on `prebuild` and enforces the data
  guarantees (valid POS, six same-POS distractors per word, no definition-twin
  ever offered as a wrong answer). A regeneration that breaks these fails the build.
- Visual skin is deliberately distinct from the main site: chalkboard green +
  index card, Fraunces/Public Sans, tokens prefixed `--color-sat-*` / `--font-sat-*`
  in the `@theme inline` block. Fonts load via `next/font` scoped to `/sat`.
- No usage limit anywhere under `/sat`. The old soft 10/day localStorage gate on
  the quiz was removed until there is real traffic to gate — don't reintroduce a
  limit (and never a server-enforced one) without being asked.

### Phase 2 — accounts (live since 2026-10-02, not yet promoted)
Supabase magic-link auth, CASL consent capture, and attempt logging.

- **Live setup.** Supabase project "AP Academy Backend" (ref
  `lfvyrwzqibunljndsnxk`, org AP Academy, free plan). Both migrations are
  applied (by hand in the SQL editor, so the migration history is empty).
  Vercel has `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  (the publishable key) set for Production and Preview.
- **Auth config (Supabase dashboard).** Site URL `https://www.apacademy.ca`.
  Redirect allow-list: `https://www.apacademy.ca/**`,
  `https://ap-academy-landing.vercel.app/**`,
  `https://ap-academy-landing-*-charlies-projects-9b525b67.vercel.app/**`,
  `http://localhost:3000/**`. The magic link returns to whichever origin the
  student signed in from, so every served domain must be on that list.
- **Email.** Custom SMTP through Resend, sending as
  `AP Academy <no-reply@auth.apacademy.ca>` (a subdomain kept separate from any
  future marketing mail). DNS is on Vercel; SPF and DKIM pass. Resend free plan
  is 100 emails/day; the Supabase auth email rate limit is 30/hour.
- **Verified end to end on 2026-10-02:** sign-up email delivered to inbox, link
  returned to `/auth/callback`, profile row created by the trigger with
  `marketing_consent` and `consent_timestamp` recorded.
- The link uses PKCE, so it only works in the browser that requested it. A
  student who opens it on another device lands on `/sat/login?error=link`.
- Free-plan projects pause after about a week without traffic. If sign-in
  suddenly fails, check the project is not paused before debugging code.
- Env vars in `.env.example`. **Unset is still a supported state:**
  `/sat` falls back to Phase 1 behaviour everywhere — do not let any `/sat` code
  path throw or block when Supabase is absent.
- Schema and RLS live in `supabase/migrations/0001_sat_accounts.sql` (repo root). Apply it
  before setting the env vars, or sign-in will succeed and then fail to write.
- RLS was verified against a local Postgres with two accounts: neither can read,
  update, or insert the other's `profiles` or `attempts` rows. Re-run that check
  if the policies change.
- `profiles` rows are created by an `on auth.users` trigger; `/auth/callback`
  re-syncs consent on every sign-in so a returning student's latest choice wins,
  including withdrawal. `consent_timestamp` records when consent was first given
  and is preserved while it stays granted.
- Everything else is derived from `attempts`. Do not add tables for stats.
- `/sat` and `/sat/quiz` are statically prerendered; auth is read client-side to
  keep it that way. Don't move the auth check into those layouts/pages.

### Still open before SAT launch
- **14 entries are still unverified:** `pretense` through `propriety`. The source
  PDF supplied for verification had that page removed. Everything else in the
  991 has been diffed against the PDF and matches.
- **Deferred until sign-up is promoted to a mass audience** (accounts are live
  but not advertised; do not chase these before then):
  - **DMARC record missing.** Add TXT `_dmarc` = `v=DMARC1; p=none;` on
    apacademy.ca in Vercel DNS before any real sending volume.
  - **Under-16 parental consent is unresolved.** These are minors in Canada;
    confirm whether a parental-consent path is required.
  - **CASL on marketing mail.** Every commercial message needs an unsubscribe
    link and a physical mailing address. Sign-in emails are transactional and
    exempt; the marketing list built from `marketing_consent` is not.
  - **Where do captured emails go?** Manual export to the Google Sheets CRM, or
    automated. Not decided.
  - **Auth email copy** is still Supabase's default wording. Works; optional.
  - **Non-team delivery** has not been tested with a real outside address yet.
- Phase 3 (dashboard, study sheet) is specced but not built — do not build it
  speculatively. Build it only once Phase 2 shows real signups.

## /learn and lib/lesson
Founding spec: `docs/spec/ap-academy-diy-build-spec.md`. Stage prompts live beside
it in `docs/spec/`, committed verbatim before work begins.

- `lib/lesson/` imports from `lib/questions/` only. Never from `app/`, never React, never `next/*`, never `@supabase/*`. Asserted by `lib/lesson/boundaries.test.ts`, which reads every file under `lib/lesson/` and fails on a forbidden import.
- `Math.random` is banned in `lib/lesson/`. Extend `lib/questions/no-math-random.test.ts` to scan `lib/lesson/` too, or add a sibling test; either way one test covers both directories.
- Lesson ids, worked-set entries and step ids are permanent once written.
- A worked set stores the seed and the stem it produced. Validation regenerates from the seed and fails, naming the problem type, if the stem differs.
- Every tunable number lives in `lib/lesson/tuning.ts`.

## Configuration
All configurable values are in `app/config.ts`:
- `STRIPE_DEPOSIT_LINK` — $70 Stripe Payment Link URL
- `STRIPE_FULL_LINK` — $600 Stripe Payment Link URL
- `VSL_EMBED_URL` — YouTube/Vimeo embed URL for /info page
- `CONTACT` — Phone, email, Calendly
- `PRICING` — Deposit, full price, session count, guarantee score
- `SUBJECTS` — List of subjects offered

## Notes
- Summer enrollment focus: 10 × 1-hour lessons for $600
- 95+ guarantee on AP-issued final exam
- Grade 11 & 12: Math, Physics, Chemistry, Biology, English (IB included)
- No backend — Stripe Payment Links handle checkout
- Mobile-first design (Meta ads → parents on phones)
- Brand voice: honest, transparent, no fake scarcity
