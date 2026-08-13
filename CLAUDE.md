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

### Still open before SAT launch
- **A–P half of the word list is unverified.** `pretense`–`zephyr` was transcribed
  from the source PDF; `abase`–`prescribe` was reconstructed from memory. When R–Z
  was checked it had a ~42% error rate. Diff A–P against the PDF before launch.
- Phase 2 (Supabase accounts, magic link, CASL consent) and Phase 3 (dashboard,
  study sheet) are specced but not built — do not build them speculatively.

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
