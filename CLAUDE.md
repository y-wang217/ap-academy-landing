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
