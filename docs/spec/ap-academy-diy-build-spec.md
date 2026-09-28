# AP Academy DIY offer: build spec (draft 0)

2026-09-28. Written from the Pocket-Randomizer (GYMRUN) process and the current
state of `ap-academy-landing`. This is the founding document. Once agreed it is
committed verbatim to `docs/spec/` in the repo that builds it, and every stage
prompt points back here.

Status of every "Decision" line: **open** until Charlie closes it. Nothing in
this file is settled by having been written down.

---

## 0. What this is

A free, self-serve web product where a student logs in, picks a course and a
unit, and works through lessons built around **the unit test they are about to
sit**. Three modes per lesson, in order:

1. **Watch.** Video. Charlie works a full example question set for that unit.
2. **Together.** The same example set as a click-through: the solution is
   revealed one step at a time and the student fills in the blank before the
   next step appears.
3. **Solo.** A fresh set of the same question types with new numbers. The
   student works it on paper, enters answers, and the site checks them.

An optional paid upgrade unlocks more Solo variation: unlimited fresh sets,
the hardest tier, and a timed unit-test simulation.

The structure is Khan Academy's (course, unit, lesson, three modes, unit test).
The content is not. **Khan teaches the knowledge. This teaches the test.** Every
lesson is organized around what appears on an Ontario unit test for that course,
how marks are awarded, and where marks are lost, so that a student who is
already being taught the material at school can convert it into a score that
holds up for Canadian university admission.

That last sentence is the positioning and the filter. If a lesson could run on
Khan without changes, it is not a lesson for this product.

## 1. Who it is for, and what it is for the business

- **User:** the Grade 11 and 12 student, self-directed, on their own device. Not
  the parent. Copy under this product speaks to the student.
- **Business role:** a lead getter and a proof surface in the same family as
  `/sat`, plus the first thing AP Academy has that a student can buy without
  Charlie's time. It is the "500 questions" offer mechanic made real: the whole
  unit's testable question types, with variation, so the test holds no surprises.
- **It is not the tutoring offer.** It does not replace the 2-week intensive or
  back-end tutoring. It feeds them. Every paid lesson surface has one quiet
  door to the tutoring offer; the free tier has none until the student has
  finished a unit.

## 2. The unit of value: a lesson targets a test

Khan's unit of value is a skill. Ours is **a question type as it appears on a
unit test.** The content model has to make that literal.

| object | what it is | where it already exists |
|---|---|---|
| Course | e.g. MHF4U | `lib/questions/taxonomy/mhf4u.ts` |
| Unit | one of the course's testable units, in teaching order | same file, 8 units |
| Problem type | one thing a unit test asks, with a permanent id | same file, 118 types |
| Generator | seed in, verified question with answer out | `lib/questions/generators/` (1 built, 117 to go) |
| **Lesson** | a set of problem types that one unit test covers, plus the test map | new |
| **Test map** | for the unit: which problem types appear, typical marks each, the traps, what the marking scheme rewards | new |
| **Worked set** | a fixed seed of each problem type in the lesson, with a step-by-step solution script | new |
| **Step script** | the solution as an ordered list of steps, each with the text shown, the blank the student fills, and what counts as right for that blank | new |

The three modes are three renderings of one worked set:

- **Watch** shows the video of Charlie doing the worked set. The video is the
  authority on pacing and narration; the site does not try to reproduce it.
- **Together** renders the step scripts of the worked set. Same seed as the
  video, so what the student sees matches what Charlie wrote on screen.
- **Solo** draws the same problem types at new seeds and checks final answers
  with the existing equivalence checker. Step scripts are shown only after an
  answer is submitted, as the "check your work" view.

This means a lesson is *data*: a list of problem type ids, one fixed seed per
type for the worked set, one step script per type, one video reference, one test
map. Writing a lesson is a content task, not a code task, once the engine exists.

## 3. Free versus paid

Decided in principle, numbers open.

| | free | paid |
|---|---|---|
| Watch | all | all |
| Together | all | all |
| Solo | one fresh set per problem type per day, difficulty 1 and 2 | unlimited sets, difficulty 3, seed replay |
| Unit test simulation (timed, mixed, marked) | none | yes |
| Progress and mistake history | this session only | persisted, per problem type |

Rationale: the free tier has to be good enough that a student finishes a unit
on it and tells someone. The paid tier sells *variation*, which is the one thing
a static PDF or a YouTube channel cannot give and the one thing the generator
harness is uniquely built for. Knowledge is never gated.

**Decision D3 (open):** price and payment path. Default assumption is a Stripe
Payment Link, like `/enroll`, with a monthly or per-course entitlement written
to Supabase on webhook. Not needed until Stage 3.

## 4. Where it lives

**Decision D1 (open): repo.** Two candidates.

**A. Inside `ap-academy-landing`** (recommended). Reasons:
- Supabase magic-link auth, CASL consent, `profiles` and `attempts` tables, and
  RLS already exist and were verified (`supabase/migrations/0001`).
- The generator harness, taxonomy, equivalence checker, and the
  `verify:questions` and `coverage:questions` tooling already live in
  `lib/questions/`. The lesson engine is the next layer on top of exactly that.
- Deploys to Vercel on merge. Same domain as `/sat`, so the lead-getter story
  is one site.
- Cost: Next.js and React instead of GYMRUN's vanilla Vite. The GYMRUN
  discipline that matters (core never imports UI, headless first, data in
  tables) transplants to `lib/` versus `app/` without change.

**B. New repo, Vite plus TypeScript, GYMRUN-style.** Cleaner, and the UI stack
he already knows how to drive with Claude Code. Cost: re-implement auth and
either duplicate or extract the generator harness into a package. Not worth it
for a stage-0 vertical slice. Revisit if the landing repo becomes the wrong
shape.

If A: routes under `app/learn/`, engine under `lib/lesson/`, lesson content
under `content/lessons/`. `/learn` gets its own visual skin, distinct from both
the parent-facing landing page and the `/sat` chalkboard, for the same reason
`/sat` did: a different user should see a different site.

## 5. Invariants to transplant from GYMRUN

These go into the repo's `CLAUDE.md` when Stage 0 starts. Each holds for every
stage or it is not an invariant.

- `lib/lesson/` never imports from `app/` or React. A lesson runs headless under
  `node --test`. Asserted by a boundary test, not by convention.
- `Math.random` is banned; all randomness is `lib/questions/rng.ts`. Already
  enforced there by `no-math-random.test.ts`; extend the test's scope to
  `lib/lesson/`.
- Problem type ids, lesson ids and step ids are permanent once written. Attempt
  rows reference them. A wrong id is marked `rejected` and replaced, never
  renamed. Already the taxonomy's rule; it now covers lessons too.
- The worked set's seed is fixed in the lesson file and never changes after the
  video is recorded. If the generator changes such that the seed produces a
  different question, that is a content-hash mismatch and the lesson fails
  validation loudly, naming the type.
- Every number a tuning pass would touch (daily free-set cap, difficulty
  weights, timer lengths) lives in `content/` or `lib/lesson/tuning.ts`, not in
  logic.
- **The UI presents the test, never a verdict about the student.** Progress is
  "types attempted, types correct at last attempt", never a score, grade
  prediction, or comparison to other students. The parent-facing rule "never
  show a gap or deficit panel" applies here to the student.
- UI comes last in every stage. If a mode cannot be shown to work headless with
  a scripted student, polish does not fix it.
- Every stage prompt is committed to `docs/spec/` verbatim before work begins.
  Deviations are recorded in a dated note, never by editing the prompt.
- A stage that touches a student-facing surface reads the design bible before
  writing code. The bible is written in Stage 1 and is permanent from then on.

## 6. Stages

Headless first, one vertical slice, then widen. Each stage ends at a commit and
a report. Where a stage says "report before code", that is a hard stop.

### Stage 0: the lesson engine, headless

Goal: a lesson is data, and a scripted student can play all three modes under
Node with no DOM.

Builds:
- `lib/lesson/types.ts`: `Lesson`, `TestMap`, `WorkedSet`, `StepScript`, `Step`,
  `Blank`, `LessonProgress`, `Attempt`.
- `lib/lesson/validate.ts`: a lesson references only registered problem types
  that have a built generator; every worked-set seed reproduces the stored
  question text (this is the content-hash rule); every step script has at least
  one blank; every blank has a checkable answer.
- `lib/lesson/play.ts`: `playLesson(lesson, policy)` where the policy is three
  promises (choose mode, fill blank, submit answer), exactly the `RunPolicy`
  seam from GYMRUN. One loop for tests and for the browser.
- `lib/lesson/check.ts`: blank and final-answer checking, on top of
  `lib/questions/equivalence.ts`. Numeric, rational, and multiple choice in
  Stage 0. Free-form algebra is out of scope until a checker exists.
- `lib/lesson/progress.ts`: pure functions from a list of attempts to a
  `LessonProgress`. No storage here.
- One real lesson file, `content/lessons/mhf4u-u3-polynomial-equations.ts`,
  containing the one problem type that has a generator
  (`mhf4u-u3-factor-theorem-find-k`) with a hand-written step script. A second
  generator is built in this stage if the lesson needs two types to prove the
  set mechanics; report says which.
- Tests: boundary, validation, a scripted student who plays each mode start to
  finish, a scripted student who gets a blank wrong and sees the right retry
  behaviour.

Does not build: any route, any component, any Supabase table, any video.

Report before Stage 1: the step script format with one worked example, and the
list of what the checker accepts and rejects.

**Decision D2 (open): first course and unit.** Default is MHF4U Unit 3
(Polynomial equations and inequalities), because the only built generator is
there. MHF4U Unit 2 (Polynomial functions) is the better first unit for a
September student; it costs 2 to 3 generators before Stage 0 can start.

### Stage 1: one lesson, three modes, in the browser

Goal: the Stage 0 lesson, playable at `/learn/mhf4u/u3/...` with no login.

Builds, in this order:
1. **The design bible for `/learn`**, before any component. Short. It fixes:
   the student-facing vocabulary (never "skill", always "question type"; never
   "score", always "types correct"); the step-reveal grammar for Together; the
   check-your-work layout for Solo; the one place the video sits; the text
   budget per screen on a phone. Written as `docs/design/learn-bible.md`.
2. Routes: `/learn` (course list), `/learn/[course]` (unit list with the test
   map summary), `/learn/[course]/[unit]` (the lesson: mode picker, then the
   mode).
3. Watch: embedded video, no custom player.
4. Together: step reveal with a blank per step, wrong answers get one hint then
   the answer; no RNG drawn.
5. Solo: fresh set at a session-random seed, answer entry, submit, check-your-
   work view with the step scripts.
6. Smoke test in real Chromium through all three modes.

**Decision D4 (open): video host.** Default is unlisted YouTube embeds: free,
no build work, and Charlie already has the recording pipeline. Mux or Bunny
only if hotlink control or analytics per student are needed later.

Report before Stage 2: what a phone-width run of each mode looks like, and
which bible rules the build touched.

### Stage 2: accounts, progress, and the free gate

Goal: a logged-in student's progress persists; the free cap is real.

- Reuse the `/sat` magic-link flow and `profiles`. New tables:
  `lesson_attempts` (student, problem type id, seed, answer, correct, mode,
  timestamp) and a `lesson_progress` view derived from it. RLS mirrored from
  `attempts`, verified the same way.
- Solo draws from the daily cap; the cap number lives in tuning, and the
  gate is server-side because it is the paid boundary. Watch and Together
  never touch it.
- The upgrade wall: shown only when the cap is hit, states what paid adds in
  one line, no countdown, no fake scarcity.
- Progress surface per the bible rule: types attempted, types correct at last
  attempt, per unit. No score.

### Stage 3: the upgrade

- Entitlement table written from a Stripe webhook. Payment link per D3.
- Paid unlocks: unlimited Solo sets, difficulty 3, seed replay ("do that one
  again"), and the unit test simulation: timed, mixed types weighted by the
  test map's marks, marked at the end with check-your-work for every question.
- One door from any paid surface to the tutoring offer (book a call).

### Stage 4: the content pipeline and the second course

- A lesson-authoring path from the existing skills: `ap-academy-question-bank`
  output to taxonomy ids, `unified-curriculum-build` output to test maps, step
  scripts written per problem type. The `coverage:questions` report is the work
  queue for generators; a lesson cannot ship a type without a generator.
- Second course. MCV4U or SCH4U by whichever has the most tutoring students in
  the fall book at that point.

## 7. Hypotheses, and what would disconfirm them

Stated as hypotheses because none have been tested.

- **H1: students will use Together, not just Watch.** Disconfirm: after Stage 2,
  Together completions per Watch start below 1 in 4 across the first 20 logged-
  in students. If so, Together collapses into Solo's check-your-work view and
  is not a separate mode.
- **H2: variation is worth paying for.** Disconfirm: after Stage 3, fewer than 1
  in 30 students who hit the free cap twice in a week upgrade. If so, the paid
  product is the unit test simulation alone, and Solo goes fully free.
- **H3: a test-focused lesson is distinguishable from a Khan lesson to a
  student.** Disconfirm: ask the first 10 students what this does that YouTube
  does not; if the answers are about the video and not about the test map or
  variation, the test map is not visible enough and moves above the video.
- **H4: the generator harness is the bottleneck, not the UI.** Disconfirm:
  Stage 0 takes longer on the engine than on writing the two generators it
  needs. If so, Stage 4's pipeline work moves up.

## 8. Gates

Absolute, from Stage 0: type check, lint, `test:questions` plus the new
`test:lesson`, `verify:questions`, lesson validation (every shipped lesson
reproduces its worked set from its seeds), build. From Stage 1: the Chromium
smoke run through all three modes. `coverage:questions` stays a report, not a
gate, exactly as now.

Content coverage is not a gate. Ship a unit with the types that have
generators, mark the rest "coming" in the test map, and keep going.

## 9. Decisions register

| id | decision | status | needed by |
|---|---|---|---|
| D1 | repo | **closed 2026-09-28:** `ap-academy-landing`, `app/learn` + `lib/lesson` | Stage 0 |
| D2 | first course and unit | **closed 2026-09-28:** MHF4U Unit 3 | Stage 0 |
| D3 | price and payment path | open; default Stripe Payment Link, entitlement on webhook | Stage 3 |
| D4 | video host | **closed 2026-09-28:** unlisted YouTube | Stage 1 |
| D5 | product name and route | open; default `/learn` | Stage 1 |

## 10. What Stage 0 needs from Charlie before it starts

1. ~~Close D1 and D2.~~ Closed 2026-09-28.
2. Write, in plain prose, the test map for MHF4U Unit 3: what a typical
   Ontario unit test on it asks, roughly how many marks per type, and the three
   most common ways students lose marks. Half a page. It becomes the first
   `TestMap` and the model for every later one.
3. Solve the worked-set question for the first problem type on paper, step by
   step, the way it would be written on screen in the video. It becomes the
   first step script.
