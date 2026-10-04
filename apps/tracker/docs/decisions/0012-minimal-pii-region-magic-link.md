# 0012: Minimal PII, Canada region, magic-link auth
Status: accepted in part; region and auth location superseded by 0013
Date: 2026-10-04

## Context
The data belongs to minors in Ontario, and forgotten passwords are a support cost.

## Decision
Collect only first name, last initial, grade level and email. No date of birth, OEN or address. Host in Supabase's Canada region. Students sign in with email magic links; no passwords.

## Alternatives considered
- Passwords: support load.
- More profile fields: more data to protect, nothing gained.

## Consequences
Superseded in part by 0013: the shared Supabase project stays in its current East region (workspace ADR 0001), and magic-link sign-in lives in the landing app (workspace ADR 0002). The minimal-PII rule stands unchanged.
