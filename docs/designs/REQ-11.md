# REQ-11: Security headers on landing and tracker

Design copied from the Notion card (https://app.notion.com/p/3f9d6ae73dd78182b457fd2e3fc24361).

Every response from www.apacademy.ca, including `/tracker/...` served through the landing rewrite, carries
`X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`,
`Referrer-Policy: strict-origin-when-cross-origin` and
`Permissions-Policy: camera=(), microphone=(), geolocation=()`. The list is defined once in
`packages/db/src/headers.ts` (import-free) and used by both `next.config.ts` files via `headers()`.

## Acceptance criteria
- AC1: `packages/db/src/headers.ts` exports `securityHeaders` (exactly four entries), exposed as `@ap-academy/db/headers`, no imports.
- AC2: both `next.config.ts` files have `async headers()` returning `[{ source: "/:path*", headers: [...securityHeaders] }]`; no header literal in either file.
- AC3: through landing, `/`, `/login`, `/sat`, signed-out `/tracker` (307) and signed-in `/tracker` (200) carry all four headers.
- AC4: tracker's own host (`localhost:3001/tracker`) carries all four headers.
- AC5: no console errors mentioning X-Frame-Options / Permissions-Policy / Refused to on `/` and `/info`; Stripe and Calendly links remain outbound anchors.
- AC6: gate commands, both builds, `test:sso`, `test:tracker` pass; no existing assertion loosened.

## Out of scope
CSP, HSTS, COOP/CORP, changes to rewrites, middleware or proxy.
