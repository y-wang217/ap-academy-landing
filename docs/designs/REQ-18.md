# REQ-18: Security 9/9: Privacy policy covers AI drafting

Card: https://app.notion.com/p/3f9d6ae73dd78186a7dbed5a4aea4d6f

Risk: Medium. Static copy only; no migration, dependency or auth change.

## Acceptance criteria
- AC1: `/privacy` has a numbered section "AI drafting in the Student Tracker" right after "How we share your information"; headings run 1 to 13.
- AC2: It states what is sent (text, photos, PDFs, transcripts, the student's current record), to whom (Anthropic API), why (tutor-confirmed drafts), storage (database with the tutor's organization, short quote per change, no full text or files), names (removed from text and transcripts, not from photos or PDFs).
- AC3: Link to `https://www.anthropic.com/legal/commercial-terms`, `target="_blank" rel="noopener noreferrer"`.
- AC4: Section 4 "Service providers" names Anthropic.
- AC5: No em-dash or en-dash in new copy.
- AC6: "Last updated" is the build date.
- AC7: Composer shows one sentence near the attach control plus a plain `<a href="/privacy">` link.
- AC8: The old composer line about names is replaced, not repeated.

## Approach
- `apps/landing/app/privacy/ai-drafting.ts`: data module exporting `AI_DRAFTING_SECTION` and `ANTHROPIC_PROVIDER_LINE`; `page.tsx` renders it, renumbers old sections 5 to 12 as 6 to 13.
- `apps/tracker/lib/ai/disclosure.ts`: exports `AI_DISCLOSURE`; `composer.tsx` uses it with a plain `<a>` link.

## Test plan
- `apps/landing/app/privacy/ai-drafting.test.ts` (node --test): AC1 to AC6 by data and source reads.
- `apps/tracker/lib/ai/disclosure.test.ts` (vitest): AC5, AC7, AC8.

## Migration
None.
