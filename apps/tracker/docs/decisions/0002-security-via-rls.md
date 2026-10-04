# 0002: Security via Postgres RLS, not app code
Status: accepted
Date: 2026-10-04

## Context
Grades of minors are the most sensitive data AP Academy holds. Permission checks scattered through UI and server code get skipped by bugs, scripts and manual SQL.

## Decision
Every tracker table has row-level security with explicit policies. Students read only their own published rows. Staff (owner, teacher) act only on rows in their org. The app uses the signed-in user's session for every query, so the database decides. Hidden UI is never a permission.

## Alternatives considered
- Checks in server actions only: one missed check leaks data.
- A service-role key in the app with app-side checks: the same risk, plus a secret to leak.

## Consequences
Every table change needs its policies and a test in `supabase/tests/rls.sql`. Multi-row operations that need elevated rights go through narrow SQL functions with their own checks (0015).
