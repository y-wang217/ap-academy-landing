Monorepo restructure and Student Tracker: the instruction that started this work
Recorded verbatim (2026-10-02), before any restructure began. The decision and its
rationale live in `docs/adr/0001-monorepo-shared-identity.md`. The tracker's own
prompts are in `apps/tracker/docs/spec/`.

---

Neither. Follow docs/adr/0001-monorepo-shared-identity.md, which records this decision and its rationale. Read it before planning.

Summary: restructure ap-academy-landing into a pnpm workspace monorepo.
- apps/landing: the existing app, moved as-is, keeps node --test
- apps/tracker: the new Student Tracker, with Vitest and Zod as its own deps
- packages/db: shared Supabase client and generated types
- supabase/ at the repo root: the single migrations folder

One shared Supabase project (the existing one, no new project) for single sign-on: a generic accounts table plus per-product schemas (sat, tracker), each with its own RLS. Rewrite the on auth.users trigger so it creates only the generic account row, and create the SAT profile on first SAT use instead.

One Vercel project per app, each on its own subdomain.

My pasted CLAUDE.md goes in apps/tracker/CLAUDE.md, not the root. Keep the existing landing one with apps/landing, and add a short root CLAUDE.md that describes the workspace layout and points to the ADR.

Order of work: (1) workspace restructure with landing still deploying, (2) trigger rewrite, (3) tracker scaffold. Stop and check with me after step 1, and before applying any migration to the live database.

Answers given alongside: the pasted tracker CLAUDE.md and plan stand in as the spec
(no separate `docs/SPEC.md` exists); this session goes through tracker step 3 (grade
engine) before stopping for review.
