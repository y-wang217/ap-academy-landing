# AP Academy Landing Page - Project Notes

## Contact Information (DO NOT CHANGE unless explicitly requested)
- **Phone:** 519-589-8217
- **Email:** y.wang217@gmail.com
- **Calendly:** https://calendly.com/y-wang217/30min
- **Founder:** Charlie (Waterloo Software Engineering grad)
- **URL:** https://ap-academy-landing.vercel.app

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
- `/sat/quiz` — SAT multiple-choice quiz with a soft 10/day gate for anonymous users

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
- The daily gate is soft by design (localStorage only). Clearing it is an accepted
  bypass — do not add server-side enforcement.

### Phase 2 — accounts (built, not switched on)
Supabase magic-link auth, CASL consent capture, and attempt logging.

- Env vars in `.env.example`. **Unset by default and that is a supported state:**
  `/sat` falls back to Phase 1 behaviour everywhere — do not let any `/sat` code
  path throw or block when Supabase is absent.
- Schema and RLS live in `supabase/migrations/0001_sat_accounts.sql`. Apply it
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
- **Before switching accounts on:** create the Supabase project, apply the
  migration, set the env vars, and configure the auth email template. CASL
  requires every commercial message to carry an unsubscribe link and a physical
  mailing address — the sign-in email itself is transactional, but the marketing
  list built from `marketing_consent` must honour both.
- **Under-16 parental consent is unresolved.** These are minors in Canada; confirm
  whether a parental-consent path is required before promoting sign-up.
- **Where do captured emails go?** Manual export to the Google Sheets CRM, or
  automated. Not decided.
- Phase 3 (dashboard, study sheet) is specced but not built — do not build it
  speculatively. Build it only once Phase 2 shows real signups.

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
