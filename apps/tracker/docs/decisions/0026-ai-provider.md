# 0026: AI drafts use Claude through the Anthropic SDK, behind one module, off unless a key is set
Status: accepted
Date: 2026-10-05

## Context
ADR 0011 deferred AI to v1: a server route outputs a Zod-validated draft change set; nothing is saved without teacher confirmation; one provider interface; rate-limited per org; student names stripped. Adding a service needs an ADR (CLAUDE.md "Stack").

## Decision
- **Feature:** on the teacher course view, paste text from a school portal or a report. Claude returns a draft change set for that course: new assessments and scores on existing ones. The teacher sees each change against the current value, unticks any, and saves. Nothing is written until then.
- **Provider:** Anthropic's Claude, model `claude-opus-5-5`, effort `medium`, called with the official `@anthropic-ai/sdk` from server code only (`lib/ai/`). Structured output is validated against the change-set Zod schema, then every id is checked against the course's own rows. Server-side refusal fallback is on (`fallbacks: "default"`).
- **Off by default:** without `ANTHROPIC_API_KEY` in the tracker's environment the paste panel does not render and the action refuses. No other part of the app depends on it.
- **Privacy:** the prompt carries course code and name, category names and weights, assessment titles, dates and scores, and the pasted text with the student's first name replaced. Never email, last initial, school or program.
- **Limits:** `TUNING.aiDailyDraftsPerOrg` drafts per org per day (counted in `tracker.ai_drafts`), and `TUNING.aiMaxPasteChars` characters per paste.
- **Record:** each request is a row in `tracker.ai_drafts` (who, when, which course, size, outcome, the validated draft). The pasted text is not stored. Confirm loads the draft from that row, never from the browser.

## Alternatives considered
- Raw `fetch` to the API: the SDK carries the typed structured-output parsing and retry behaviour; the dependency is one package in this app only.
- A cheaper model: extraction accuracy matters more than cents per paste at this volume; change `lib/ai/config.ts` if cost says otherwise.
- AI that writes rows: rejected in ADR 0011.

## Consequences
- Cost is per paste and small, but real: set a monthly spend limit on the Anthropic key.
- Student data leaves for Anthropic's API when a teacher pastes. The privacy policy needs a line for it alongside US storage.
- To change provider, replace `lib/ai/draft.ts`; the change-set schema and the confirm path stay.
