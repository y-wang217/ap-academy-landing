# AP Academy workspace

A pnpm workspace. Why it is shaped this way, and what would make us revisit it:
[`docs/adr/0001-monorepo-shared-identity.md`](docs/adr/0001-monorepo-shared-identity.md).
Each app has its own `CLAUDE.md`. Read the one for the app you are working in.

## Layout

| path | what | notes |
|---|---|---|
| `apps/landing` | marketing site, `/sat`, `/learn` engine | [`apps/landing/CLAUDE.md`](apps/landing/CLAUDE.md). Tests run on `node --test`. |
| `apps/tracker` | Student Tracker | Only its prompts exist so far (`apps/tracker/docs/spec/`). Vitest and Zod, as its own deps. |
| `packages/db` | shared Supabase client and generated types | Not created yet. |
| `supabase/` | the single migrations folder for the one shared Supabase project | |
| `docs/adr/` | workspace-level decisions | App-level decisions live inside each app. |
| `docs/spec/` | workspace-level prompts, committed verbatim before work begins | |

## Rules

- One Supabase project, one auth pool, one `supabase/migrations/` folder at the
  root. No app keeps its own migrations.
- Each product gets its own Postgres schema with its own RLS. Product profiles
  are created on first use of that product, not by the `auth.users` trigger.
- Apps never import from each other. Shared code goes in `packages/`.
- Each app owns its dependencies, test runner and Vercel project. Adding a
  dependency to one app never adds it to another.
- No migration is applied to the live database without Charlie's sign-off.

## Commands

```bash
pnpm install                 # from the repo root, always
pnpm --filter landing dev
pnpm --filter landing test   # node --test, lib/questions and lib/lesson
pnpm --filter landing build  # runs the prebuild validators first
```

Each app's Vercel project sets its Root Directory to `apps/<name>`.
