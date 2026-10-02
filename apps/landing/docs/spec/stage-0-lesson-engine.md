DIY offer, Stage 0: the lesson engine, headless
Claude Code prompt. Commit this file verbatim to `docs/spec/` in `ap-academy-landing` before doing anything below. Then read, in this order:

1. `docs/spec/ap-academy-diy-build-spec.md` (the founding spec; this stage is its section 6, Stage 0)
2. `CLAUDE.md`
3. `HANDOFF.md`, Sessions A and B
4. `lib/questions/types.ts`, `lib/questions/generators/mhf4u/u3-factor-theorem-find-k.ts`, `lib/questions/taxonomy/mhf4u.ts` (Unit 3 block only)

Do not start from memory of any of these. Read them.
Goal
A lesson is data. A scripted student can play all three modes (Watch, Together, Solo) of one MHF4U Unit 3 lesson under `node --test` with no DOM, no React, no Supabase, no video.
Hard stops

* Stop 1, before code: report the proposed `lib/lesson/types.ts` in full, plus one complete step script for `mhf4u-u3-factor-theorem-find-k` at a fixed seed, as a comment in the PR or as a message. Wait for approval.
* Stop 2, at the end: the report in the last section. Do not start Stage 1.

Invariants for this stage
Add these to `CLAUDE.md` under a new `## /learn and lib/lesson` heading, in this wording, before the first source file is written:

* `lib/lesson/` imports from `lib/questions/` only. Never from `app/`, never React, never `next/*`, never `@supabase/*`. Asserted by `lib/lesson/boundaries.test.ts`, which reads every file under `lib/lesson/` and fails on a forbidden import.
* `Math.random` is banned in `lib/lesson/`. Extend `lib/questions/no-math-random.test.ts` to scan `lib/lesson/` too, or add a sibling test; either way one test covers both directories.
* Lesson ids, worked-set entries and step ids are permanent once written.
* A worked set stores the seed and the stem it produced. Validation regenerates from the seed and fails, naming the problem type, if the stem differs.
* Every tunable number lives in `lib/lesson/tuning.ts`.

Build
Same test runner and conventions as `lib/questions/`: Node native type stripping, `.ts` extensions on relative imports, erasable syntax only, tests as `*.test.ts` beside the source. Add `test:lesson` to `package.json` mirroring `test:questions`.
`lib/lesson/types.ts`
Propose these; they are a starting shape, not a contract. TSDoc on every export, as in `lib/questions/types.ts`.

* `LessonId`, `StepId` (slug-case, namespaced: `mhf4u-u3-polynomial-equations`, `mhf4u-u3-factor-theorem-find-k-s1`).
* `TestMap`: `unitId`, `summary` (prose, student-facing), `entries: TestMapEntry[]`. `TestMapEntry`: `problemTypeId`, `typicalMarks: number`, `traps: string[]` (one to three), `status: 'built' | 'coming'`.
* `WorkedSetEntry`: `problemTypeId`, `generatorId`, `seed`, `stem` (the stored copy for validation), `script: StepScript`.
* `StepScript`: `steps: Step[]`. `Step`: `id`, `say` (LaTeX string, what is shown when the step is revealed), `blank?: Blank`. A step with no blank is narration. `Blank`: `prompt` (short), `answer: Rational | Choice-index | string`, `kind: 'rational' | 'choice' | 'exact'`, `hint` (one line, shown after the first wrong entry).
* `Lesson`: `id`, `courseCode`, `unitId`, `title`, `videoRef: { kind: 'youtube'; id: string } | null`, `testMap`, `workedSet: WorkedSetEntry[]`.
* `Mode = 'watch' | 'together' | 'solo'`.
* `Attempt`: `problemTypeId`, `generatorId`, `seed`, `mode`, `stepId?`, `entered`, `correct: boolean`, `at: number`.
* `LessonProgress`: per problem type, `attempted: number`, `correctAtLast: boolean | null`. Nothing else. No score field. The spec's rule "the UI presents the test, never a verdict about the student" starts here: a field that could render as a grade does not go in this type.

`lib/lesson/validate.ts`
`validateLesson(lesson): Finding[]` in the style of `lib/questions/validate.ts`. Fatal on: unknown `problemTypeId`; a `'built'` test-map entry with no registered generator; a worked-set entry whose regenerated stem differs from the stored one; a script with zero blanks; a blank whose `answer` is empty; duplicate step ids. Warning on: a test-map entry not in the worked set, or vice versa.
`lib/lesson/check.ts`
`checkBlank(blank, entered): boolean` and `checkAnswer(instance, entered): boolean`. `rational` blanks parse the entry (integer, `a/b`, decimal with at most 3 places) and use `areEquivalent`. `choice` compares an index. `exact` compares after `normalizeLatex`. Nothing else. Free-form algebra is out of scope; if a step's answer would need it, the step is narration and the check moves to the next step that can be checked.
`lib/lesson/play.ts`
`playLesson(lesson, policy): Promise<Attempt[]>`. The policy is the seam, exactly as GYMRUN's `RunPolicy`:

```ts
interface StudentPolicy {
  chooseMode(lesson): Promise<Mode | 'done'>;
  fillBlank(step, blank, attemptNo): Promise<string>;       // Together
  answer(instance): Promise<string>;                          // Solo
  nextSeed(): number;                                         // Solo; the policy owns randomness so tests are deterministic
}

```

Watch: emits no attempts, returns immediately (the video is the UI's job). Together: reveals steps in order; at a blank, calls `fillBlank`; wrong once gives the hint and one more try; wrong twice reveals the answer and moves on; every entry is an `Attempt` with `stepId`. Solo: for each worked-set entry, generates at `nextSeed()`, calls `answer`, records one `Attempt`.
`lib/lesson/progress.ts`
`progressFrom(attempts): LessonProgress`. Pure. Solo attempts count toward `attempted`; the last Solo attempt sets `correctAtLast`. Together attempts do not count (they are guided).
`lib/lesson/tuning.ts`
`TOGETHER_TRIES_BEFORE_REVEAL = 2`, `FREE_SOLO_SETS_PER_DAY` (a number, unused in this stage, present so Stage 2 does not invent it in logic).
`content/lessons/mhf4u-u3-polynomial-equations.ts`
One lesson. Worked set: `mhf4u-u3-factor-theorem-find-k` at a fixed seed you choose and record, with a hand-written step script of 4 to 6 steps, at least 3 of them with blanks, in the tutor voice the generator's `solution` array uses. `videoRef: null`. Test map: all 15 Unit 3 problem type ids, `status: 'built'` for the one with a generator and `'coming'` for the rest, `typicalMarks` and `traps` left as clearly marked placeholders (`typicalMarks: 0`, `traps: []`) for Charlie to fill from his prose test map.
Build a second generator only if the set mechanics cannot be proved with one. If you build one, it is `mhf4u-u3-remainder-theorem-evaluate`, copied from the reference generator, verified with `verify:questions`, and the report says why one was not enough.
Tests

* `boundaries.test.ts` as above.
* `validate.test.ts`: every fatal rule has a failing fixture; the shipped lesson passes with zero fatals.
* `check.test.ts`: `1/2` equals `0.5` equals `2/4`; `0.333` does not equal `1/3`; choice index; exact after normalization.
* `play.test.ts`: a scripted student who plays Together perfectly; one who is wrong once then right (sees the hint, one attempt wrong, one right); one who is wrong twice (reveal, moves on); one who plays Solo at three fixed seeds and the attempts carry those seeds and the right `correct` values; the same policy run twice produces identical attempt lists.
* `progress.test.ts`: Together attempts do not change progress; Solo does.

Gates
`npm run build`, `npm run test:questions`, `npm run test:lesson`, `npm run verify:questions`. All green before Stop 2. Add `validate:lessons` as a script that loads every file under `content/lessons/` and exits non-zero on a fatal; run it in `prebuild` beside `validate-sat-words.mjs`.
Report (Stop 2)
In `HANDOFF.md` as "Session C: Lesson engine", same shape as A and B:

1. Commands added, verbatim output of each.
2. Files shipped, one line each.
3. The step script format, with the shipped script rendered as a student would read it in Together mode (step, blank, hint, answer).
4. What `check.ts` accepts and rejects, as a table.
5. Deviations from this prompt, dated, with the reason.
6. What Stage 1 needs: the list of `content/` fields Charlie must fill by hand (typical marks, traps, video id) and anything the engine could not decide.
