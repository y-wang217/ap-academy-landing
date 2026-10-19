# REQ-41: Iris 1/9: Privacy policy for Iris on the landing site

Notion card: https://app.notion.com/p/3fbd6ae73dd781048d09df3980f4f14d

**Summary:** The landing privacy page gains a numbered "Iris" section that tells families, in plain words, that mail to charlie@apacademy.ca is read by the Student Tracker, what goes to Anthropic, what is copied to Notion, how long it is kept, how to ask for deletion, and that automatic replies say so.
**Risk:** Low (static copy on an existing page; no auth, no data, no new destination, no dependency).

## Problem
Before Iris reads one real parent message (Iris 2/9 starts paused and its Unpause button asks Charlie to tick that this page is live), parents and guardians need a public notice of the new processing: the business mailbox is read by software, parts of each message go to Anthropic, drafts and escalations are copied to Notion, and the data has a stated retention period and a deletion route. Audience: parents and guardians of current and prospective students.

## Acceptance criteria
- [ ] AC1: `apps/landing/app/privacy/iris.ts` exports `IRIS_SECTION` (`heading`, `paragraphs`) and `GOOGLE_PROVIDER_LINE`, with no imports.
- [ ] AC2: `apps/landing/app/privacy/page.tsx` renders `IRIS_SECTION.heading` as section **6**, directly after section 5 (AI drafting) and before "A note about students and minors", with every paragraph mapped into a `<p>`.
- [ ] AC3: Sections stay numbered 1 to N with no gap: there are 14 `<section>` elements, "7. A note about students and minors" and "14. Contact us".
- [ ] AC4 (fact 1): the Iris copy says email sent to charlie@apacademy.ca is read by the AP Academy Student Tracker.
- [ ] AC5 (fact 2): the copy says the parent's name, email address and message text are sent to Anthropic to work out the request and draft a reply.
- [ ] AC6 (fact 3): the copy says a draft or an escalation is copied to AP Academy's Notion workspace so Charlie sees it on his phone.
- [ ] AC7 (fact 4): the copy says a reply sent automatically says so in its text.
- [ ] AC8 (fact 5): the copy says messages, drafts and sent replies are deleted after 90 days.
- [ ] AC9 (fact 6): the copy says a family can ask for earlier deletion by emailing charlie@apacademy.ca.
- [ ] AC10: section 4's Google entry renders `GOOGLE_PROVIDER_LINE`, which names Google and Iris; `ANTHROPIC_PROVIDER_LINE` names both the tracker's AI drafting (section 5) and Iris (section 6).
- [ ] AC11: "Last updated" is no longer "October 15, 2026" and shows the build date.
- [ ] AC12: none of the new or changed copy contains an em or en dash.
- [ ] AC13: `pnpm --filter landing test` and `pnpm --filter landing exec tsc --noEmit` pass.

## Approach
**New** `apps/landing/app/privacy/iris.ts` (same shape as `ai-drafting.ts`, plain data, no JSX, so `node --test` can import it with type stripping):
- `IRIS_SECTION.heading`: "Iris, our parent email assistant"
- `IRIS_SECTION.paragraphs`, default wording (builder may tighten, the tests pin the facts, not every word):
  1. "Email you send to charlie@apacademy.ca is read by Iris, a part of the AP Academy Student Tracker. Iris works out which family wrote and what you are asking for, and drafts a reply for Charlie. Only Charlie can see these messages in the tracker."
  2. "What is sent to Anthropic: your name, your email address and the text of your message, so the AI can work out the request and draft a reply. Anthropic makes the Claude AI model and handles this data under its commercial terms. Its servers may be outside Canada, including in the United States."
  3. "Notion: a draft or an escalation is copied to AP Academy's Notion workspace so Charlie sees it on his phone. It is kept there no longer than in the tracker."
  4. "Replies: Charlie reads each draft before it is sent, unless he has switched that kind of reply to automatic sending. A reply sent automatically says so in its text."
  5. "How long we keep it: messages, drafts and sent replies are deleted after 90 days. A short record of what happened, without the message text, is kept for one year."
  6. "Earlier deletion: you can ask us to delete your messages sooner by emailing charlie@apacademy.ca."
- `GOOGLE_PROVIDER_LINE`: "Google (email and related services, including the charlie@apacademy.ca mailbox that Iris reads, see section 6)"

**Changed** `apps/landing/app/privacy/ai-drafting.ts`: `ANTHROPIC_PROVIDER_LINE` becomes "Anthropic (AI drafting in the Student Tracker, see section 5, and Iris, see section 6)". `AI_DRAFTING_SECTION` is unchanged.

**Changed** `apps/landing/app/privacy/page.tsx`:
- Import `IRIS_SECTION, GOOGLE_PROVIDER_LINE` from `./iris`.
- Section 4: replace the literal "Google (email and related services)" with `{GOOGLE_PROVIDER_LINE}`; the Anthropic entry already renders `{ANTHROPIC_PROVIDER_LINE}`.
- Insert, after section 5's `<section>` and its `<hr>`, a new `<section>` with `6. {IRIS_SECTION.heading}` and `IRIS_SECTION.paragraphs.map(...)` exactly as section 5 does, followed by `<hr className="border-border" />`.
- Renumber the following headings: 6 to 7 (students and minors), 7 to 8, ..., 13 to 14 (contact).
- "Last updated" becomes the build date.
- Nothing else on the page changes: the y.wang217@gmail.com contact lines stay as they are (landing `CLAUDE.md`: contact info does not change unless asked).

**Changed** `apps/landing/app/privacy/ai-drafting.test.ts`: the structural test's hard-coded numbers move with the renumbering (13 to 14 sections, "6. A note about students" to "7. A note about students", "13. Contact us" to "14. Contact us").

## Migration
None.

## Test plan
| Test | Type | Covers |
|---|---|---|
| `iris.test.ts`: `IRIS_SECTION` has the heading and a non-empty `paragraphs` array; the module file has no `import` | unit | AC1 |
| `iris.test.ts`: page source contains `6. {IRIS_SECTION.heading}` and `IRIS_SECTION.paragraphs.map`; AI drafting heading < Iris heading < "A note about students and minors" | unit (source scan) | AC2 |
| `ai-drafting.test.ts` (updated): headings run 1 to 14 with no gap, 14 `<section>`, "7. A note about students", "14. Contact us" | unit | AC3 |
| `iris.test.ts`: one assertion per fact on the joined paragraphs | unit | AC4 to AC9 |
| `iris.test.ts`: provider lines name Google/Iris and Anthropic/AI drafting/Iris; section 4 renders both constants and no longer the Google literal | unit | AC10 |
| `iris.test.ts`: page has no "October 15, 2026" and matches `Last updated: \w+ \d{1,2}, 2026` | unit | AC11 |
| `iris.test.ts`: no en or em dash in heading, paragraphs and both provider lines | unit | AC12 |
| gate commands | gate | AC13 |

No e2e row: no file under `e2e_paths` changes, and the page is static.

## Out of scope
Any tracker code; any Gmail, Notion or Anthropic integration; retention mechanics (Iris 2/9) and Notion page clean-up (Iris 4/9); changing contact details elsewhere on the page; the page's `metadata`; the general retention section text; under-16 consent questions.

## Decisions (approved defaults)
1. No new dependencies. 2. No schema. 3. charlie@apacademy.ca in the Iris section only. 4. "It is kept there no longer than in the tracker." (Iris 4/9 must clean up Notion copies.) 5. Disclose the one-year event record. 6. New section 6, renumber the rest. 7. Leave the Notion line in section 4. 8. Include the three extra sentences. 9. Last updated is the build date.

## Build notes
- The page already read "Last updated: October 16, 2026" (REQ-29 pinned it in `data-region.test.ts`), not October 15 as the design assumed. The build date is October 19, 2026; `data-region.test.ts`'s pinned date moves with it, and `iris.test.ts` also rejects October 16.
