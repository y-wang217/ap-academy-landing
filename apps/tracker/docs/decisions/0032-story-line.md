# 0032: The story line is a fact chosen by rule, never a forecast
Status: accepted
Date: 2026-10-06
## Context
The mock put a motivational sentence under the progress number ("You're close. A few targeted improvements can get you to 93.0%."). That promises an outcome, and this tracker shows progress against the teacher's target and never predicts results (CLAUDE.md). The owner asked for something factual that tells the story of what is happening, from a pool of messages.
## Decision
- `lib/domain/story.ts` returns facts: one headline and at most one aside, each a kind plus the numbers it needs. Rules are checked in a fixed order and the first match wins. Headlines: no goal; no marks; six graded and on target; some graded and on target (naming the courses without marks); below target with every course at its own target (the targets are the story); one course below its target; one course whose gap is `storyDominantRatio` (2) times the next; several courses below, worst first; below target with no course targets to compare. Asides: a big item soon (within `storySoonDays`, at least `storyBigShare` of its course); the course that rose the most over the trend window; results waiting to be entered.
- `lib/view/story-text.ts` is the only file that words them. Every sentence carries its numbers, formatted by the same helpers as the rest of the screen, so the sentence never disagrees with the figures beside it. No em-dashes, at most two short sentences, nothing about admission, chances or what a mark "can get you to".
- An assessment's share of its course is its category weight split evenly over the category's non-excused items. It is a fact about the syllabus, not a forecast of the mark.
## Alternatives considered
- Keeping the mock's sentence: a forecast, and a promise the tutor does not control.
- Model-written sentences: not deterministic, not testable, and AI never writes to a student screen (non-negotiable 7).
- One generic sentence: says nothing a parent could act on.
## Consequences
Adding a message means a new fact kind with a test, then a sentence in the one copy file. The pool reads the same rows the dashboard shows, so there is no state to keep in sync. Wording changes are copy edits in `story-text.ts` and its test.
