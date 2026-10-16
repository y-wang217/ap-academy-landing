# REQ-29: Landing lint back under CI, and the hosting region corrected in the docs

Card: https://app.notion.com/p/3fbd6ae73dd78160bfa1d5a26fa5b7d1 (approved by the design approver, sha:f1700c5554a1)

**Summary:** Fixes all 17 landing lint errors and both warnings with no visible copy change, hands Charlie the patch that gates landing lint in CI, corrects the Supabase region to us-west-2 (Oregon) in the docs, names Supabase and the United States in the privacy policy, and adds one landing test that keeps the region statements true.
**Risk:** Low (JSX entity escapes, one unused import, doc text and one privacy-policy disclosure line; no auth, RLS, data flow, schema or Supabase change. The CI and pipeline.json edits are patch blocks Charlie applies, not part of the diff.)

## Problem
Readiness review finding F13. Two hygiene gaps, both for Charlie and the pipeline agents; the privacy fix is for parents.
1. `.github/workflows/ci.yml` line 28 says "Landing lint is not gated: main carries 17 pre-existing copy errors." Run on 2026-10-16, `pnpm --filter landing lint` gives 19 problems: 17 errors, all `react/no-unescaped-entities` (4 in `apps/landing/app/how-it-works/page.tsx` at lines 68, 146, 172, 193; 13 in `apps/landing/app/privacy/page.tsx` at lines 47, 78, 192), plus 2 warnings: `@next/next/no-page-custom-font` at `apps/landing/app/layout.tsx:75` and unused `STAGES` import at `apps/landing/app/sitemap.ts:2`.
2. The Supabase project runs in AWS `us-west-2` (Oregon). The docs say otherwise: ADR 0001 lines 31, 53, 67 ("East region"); tracker ADR 0013 line 9 ("East region"); `apps/tracker/CLAUDE.md` line 10 ("East region"), line 39 ("Canada region"), line 158 (0012 title); tracker ADR 0012 line 16 (its superseded note says "East region"). The privacy page never names Supabase, which holds the student and account records. ADR 0001 line 61 requires the policy to disclose the storage location.

## Acceptance criteria
- [ ] AC1: `pnpm --filter landing exec eslint --max-warnings 0` exits 0, and `pnpm --filter landing lint` exits 0.
- [ ] AC2: No reader-visible copy changes on `/how-it-works` or `/privacy` from the lint fixes: the prerendered HTML of both routes, with build ids removed, is byte-identical before and after the lint commit.
- [ ] AC3: The PR description contains two patch blocks under "Editing the pipeline itself": one adds `pnpm --filter landing lint` to the `landing` step of `.github/workflows/ci.yml` and removes the line 28 comment; one adds `"pnpm --filter landing lint"` to `gate_commands` in `.claude/pipeline.json` directly after `pnpm --filter landing exec tsc --noEmit`. The diff itself touches neither file.
- [ ] AC4: In `docs/` and `apps/tracker/docs/` (excluding the verbatim `spec/` folders) and in the root, landing and tracker `CLAUDE.md`, every line matching `East region`, `Canada region` or `Canadian region` (case-insensitive) is either in `apps/tracker/docs/decisions/0012-minimal-pii-region-magic-link.md` or contains the word "superseded".
- [ ] AC5: ADR 0001, ADR 0013 and `apps/tracker/CLAUDE.md` each contain `us-west-2`; ADR 0001 and ADR 0013 each carry exactly one line starting `Correction (2026-10-16):` that names `us-west-2`, says the decision to keep the project in place is unchanged, and does not match the AC4 pattern.
- [ ] AC6: The privacy page's "Service providers" list item names Supabase and says its data is stored in the United States, and the "Last updated" line reads exactly `Last updated: October 16, 2026` as a hardcoded string.
- [ ] AC7: `pnpm --filter landing test` and `pnpm --filter landing build` pass.

## Approach
**Lint (apps/landing):**
- `app/how-it-works/page.tsx` lines 68, 146, 172, 193: each `'` in JSX text becomes `&apos;`.
- `app/privacy/page.tsx` lines 47, 78, 192: each `"` in JSX text becomes `&quot;`, each `'` becomes `&apos;`. Text inside `{...}` expressions and attributes is not touched.
- `app/sitemap.ts` line 2: remove the unused `STAGES` import.
- `app/layout.tsx` line 75: keep the Google Fonts `<link>` and add an `eslint-disable-next-line @next/next/no-page-custom-font` comment with the reason (App Router root layout renders on every page). No config change.

**CI gate (patch blocks in the PR description, guarded files):** `pnpm --filter landing lint` in the `landing` CI step, and in `gate_commands` after `pnpm --filter landing exec tsc --noEmit`. Plain `lint`, matching tracker.

**Region docs:**
- ADR 0001: lines 31, 53, 67 name us-west-2 (Oregon); add under Status `Correction (2026-10-16): earlier text named the wrong region; the project runs in us-west-2 (Oregon). The decision to keep it in place is unchanged.`
- Tracker ADR 0013 line 9: "in its current region, AWS us-west-2 (Oregon), not Canada". Same correction line under Status.
- Tracker ADR 0012: decision text and title untouched. Its line 16 superseded note names "us-west-2 (Oregon)" instead of the old region.
- `apps/tracker/CLAUDE.md`: line 10 "stays in its current region, AWS us-west-2 (Oregon) (ADR 0001). Not Canada."; line 39 "RLS. Region us-west-2 (Oregon), see workspace ADR 0001."; line 158 "0012 Minimal PII, Canada region, magic-link auth (region superseded by 0013)".
- Verbatim specs under `apps/tracker/docs/spec/` untouched.

**Privacy:** add "Supabase (our database and sign-in, hosted in the United States)" to the Service providers list, before Stripe. Line 42 becomes the literal `Last updated: October 16, 2026`.

**New test `apps/landing/app/privacy/data-region.test.ts`** (node --test): providers item names Supabase and United States; exact `Last updated: October 16, 2026`; AC4 scan with `/\b(east|canada|canadian) region\b/i` over the file set, skipping `spec` directories; `us-west-2` in the three files; exactly one correction line per ADR containing `us-west-2` and `unchanged` and not matching the regex.

## Migration
None.

## Test plan
| Test | Type | Covers |
|---|---|---|
| `eslint --max-warnings 0` and `pnpm --filter landing lint`, outputs in the PR | command | AC1 |
| Build on `main` and on the lint commit; diff `privacy.html` and `how-it-works.html` after stripping build ids | manual build check | AC2 |
| PR description has both patch blocks; `git diff --stat main` shows neither `.github/` nor `.claude/` | review check | AC3 |
| `data-region.test.ts`: region scan | unit | AC4 |
| `data-region.test.ts`: `us-west-2` and correction lines | unit | AC5 |
| `data-region.test.ts`: providers item and Last updated; `ai-drafting.test.ts` heading test still passes | unit | AC6 |
| `pnpm --filter landing test`, `build`, `exec tsc --noEmit` | gate | AC7 |

## Out of scope
Any ESLint rule or config change. Any Supabase change. Editing the verbatim spec files. Adding other hosts to the privacy provider list. Applying the CI and pipeline.json patches (Charlie does that).
