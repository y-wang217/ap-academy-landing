import { test } from 'node:test';
import assert from 'node:assert/strict';
import { playLesson } from './play.ts';
import { lesson } from '../../content/lessons/mhf4u-u3-polynomial-equations.ts';
import { factorTheoremFindK } from '../questions/generators/mhf4u/u3-factor-theorem-find-k.ts';
import { toString as ratToString } from '../questions/rational.ts';
import { TOGETHER_TRIES_BEFORE_REVEAL } from './tuning.ts';
import type { Attempt, Blank, Mode, Step, StudentPolicy } from './types.ts';
import type { QuestionInstance } from '../questions/types.ts';

const TYPE = 'mhf4u-u3-factor-theorem-find-k';
const GEN = `${TYPE}-d2`;

/** The right entry for a blank, as a student would type it. */
function rightAnswer(blank: Blank): string {
  switch (blank.kind) {
    case 'rational':
      // `a/b` form, which is what a student types and what the checker parses.
      return ratToString(blank.answer);
    case 'choice':
      return String(blank.answer);
    case 'exact':
      return blank.answer;
  }
}

/** An entry that is wrong for every kind. */
const WRONG = '999';

interface ScriptedOptions {
  /** Modes to play, in order. `'done'` is appended automatically. */
  modes: Mode[];
  /** Given a step and the attempt number, what to enter. Default: always right. */
  together?: (step: Step, blank: Blank, attemptNo: number) => string;
  /** Solo seeds, consumed in order. */
  seeds?: number[];
  /** Given a Solo instance, what to enter. Default: the correct index. */
  solo?: (instance: QuestionInstance) => string;
}

/** A scripted student. Records what it was shown so tests can assert on it. */
function scripted(options: ScriptedOptions): StudentPolicy & { revealed: string[]; hintsSeen: string[] } {
  const modes = [...options.modes];
  const seeds = [...(options.seeds ?? [])];
  const revealed: string[] = [];
  const hintsSeen: string[] = [];
  return {
    revealed,
    hintsSeen,
    async chooseMode() {
      return modes.shift() ?? 'done';
    },
    async reveal(step) {
      revealed.push(step.id);
    },
    async fillBlank(step, blank, attemptNo) {
      // The hint is shown on the retry; the policy sees it via `blank.hint`.
      if (attemptNo > 1) hintsSeen.push(blank.hint);
      return options.together ? options.together(step, blank, attemptNo) : rightAnswer(blank);
    },
    async answer(instance) {
      if (options.solo) return options.solo(instance);
      return String(instance.choices.findIndex((c) => c.isCorrect));
    },
    nextSeed() {
      const seed = seeds.shift();
      if (seed === undefined) throw new Error('scripted student ran out of seeds');
      return seed;
    },
  };
}

const steps = lesson.workedSet[0].script.steps;
const blankSteps = steps.filter((s) => s.blank);

// --- Watch ----------------------------------------------------------------------

test('Watch emits no attempts and returns', async () => {
  const attempts = await playLesson(lesson, scripted({ modes: ['watch'] }));
  assert.deepEqual(attempts, []);
});

test("'done' straight away plays nothing", async () => {
  assert.deepEqual(await playLesson(lesson, scripted({ modes: [] })), []);
});

// --- Together -------------------------------------------------------------------

test('Together, played perfectly: one correct attempt per blank, every step revealed in order', async () => {
  const student = scripted({ modes: ['together'] });
  const attempts = await playLesson(lesson, student);

  assert.deepEqual(student.revealed, steps.map((s) => s.id));
  assert.equal(attempts.length, blankSteps.length);
  assert.deepEqual(
    attempts.map((a) => a.stepId),
    blankSteps.map((s) => s.id),
  );
  for (const attempt of attempts) {
    assert.equal(attempt.mode, 'together');
    assert.equal(attempt.correct, true);
    assert.equal(attempt.problemTypeId, TYPE);
    assert.equal(attempt.generatorId, GEN);
    assert.equal(attempt.seed, 0, 'Together plays the worked-set seed');
  }
  assert.deepEqual(attempts.map((a) => a.at), attempts.map((_, i) => i));
  assert.deepEqual(student.hintsSeen, [], 'a perfect run never sees a hint');
});

test('Together, wrong once then right: the hint is shown, two attempts on that step', async () => {
  const target = blankSteps[0];
  const student = scripted({
    modes: ['together'],
    together: (step, blank, attemptNo) =>
      step.id === target.id && attemptNo === 1 ? WRONG : rightAnswer(blank),
  });
  const attempts = await playLesson(lesson, student);

  const onTarget = attempts.filter((a) => a.stepId === target.id);
  assert.equal(onTarget.length, 2);
  assert.deepEqual(onTarget.map((a) => a.correct), [false, true]);
  assert.deepEqual(onTarget.map((a) => a.entered), [WRONG, rightAnswer(target.blank!)]);
  assert.deepEqual(student.hintsSeen, [target.blank!.hint]);
  assert.equal(attempts.length, blankSteps.length + 1);
});

test('Together, wrong twice: two wrong attempts, then the script moves on', async () => {
  const target = blankSteps[1];
  const student = scripted({
    modes: ['together'],
    together: (step, blank) => (step.id === target.id ? WRONG : rightAnswer(blank)),
  });
  const attempts = await playLesson(lesson, student);

  const onTarget = attempts.filter((a) => a.stepId === target.id);
  assert.equal(onTarget.length, TOGETHER_TRIES_BEFORE_REVEAL);
  assert.ok(onTarget.every((a) => a.correct === false));
  // Moved on: every later blank was still asked and answered.
  const later = blankSteps.slice(2).map((s) => s.id);
  assert.deepEqual(
    attempts.filter((a) => later.includes(a.stepId!)).map((a) => a.stepId),
    later,
  );
  assert.deepEqual(student.revealed, steps.map((s) => s.id), 'every step still revealed');
});

test('Together checks blanks with the real checker: 0.5-style equivalents pass', async () => {
  // s3 answers -24; "-48/2" is the same number.
  const s3 = steps[2];
  const student = scripted({
    modes: ['together'],
    together: (step, blank) => (step.id === s3.id ? '-48/2' : rightAnswer(blank)),
  });
  const attempts = await playLesson(lesson, student);
  const onS3 = attempts.filter((a) => a.stepId === s3.id);
  assert.equal(onS3.length, 1);
  assert.equal(onS3[0].correct, true);
});

// --- Solo ------------------------------------------------------------------------

test('Solo at three fixed seeds: attempts carry those seeds and the right correct flags', async () => {
  const seeds = [3, 17, 4242];
  // Right on the first and third, wrong on the second.
  let call = 0;
  const student = scripted({
    modes: ['solo', 'solo', 'solo'],
    seeds,
    solo: (instance) => {
      call += 1;
      const correctIndex = instance.choices.findIndex((c) => c.isCorrect);
      return String(call === 2 ? (correctIndex + 1) % 4 : correctIndex);
    },
  });
  const attempts = await playLesson(lesson, student);

  assert.equal(attempts.length, 3);
  assert.deepEqual(attempts.map((a) => a.seed), seeds);
  assert.deepEqual(attempts.map((a) => a.correct), [true, false, true]);
  for (const attempt of attempts) {
    assert.equal(attempt.mode, 'solo');
    assert.equal(attempt.stepId, undefined);
    assert.equal(attempt.generatorId, GEN);
    assert.equal(attempt.problemTypeId, TYPE);
  }
  // The question the student saw is reproducible from the recorded seed.
  const regenerated = factorTheoremFindK.generate(seeds[1]);
  const correctIndex = regenerated.choices.findIndex((c) => c.isCorrect);
  assert.equal(attempts[1].entered, String((correctIndex + 1) % 4));
});

test('Solo does not touch the worked-set seed', async () => {
  const attempts = await playLesson(lesson, scripted({ modes: ['solo'], seeds: [99] }));
  assert.equal(attempts[0].seed, 99);
  assert.notEqual(attempts[0].seed, lesson.workedSet[0].seed);
});

// --- determinism ------------------------------------------------------------------

test('the same policy run twice produces identical attempt lists', async () => {
  const build = () =>
    scripted({
      modes: ['watch', 'together', 'solo', 'solo'],
      seeds: [5, 6],
      together: (step, blank, attemptNo) => (step.id === blankSteps[2].id && attemptNo === 1 ? WRONG : rightAnswer(blank)),
    });
  const first: Attempt[] = await playLesson(lesson, build());
  const second: Attempt[] = await playLesson(lesson, build());
  assert.deepEqual(first, second);
  assert.ok(first.length > 0);
});

// --- guard -------------------------------------------------------------------------

test('Solo throws on an unregistered generator rather than guessing', async () => {
  const broken = {
    ...lesson,
    workedSet: [{ ...lesson.workedSet[0], generatorId: 'nope-d1' }],
  };
  await assert.rejects(
    () => playLesson(broken, scripted({ modes: ['solo'], seeds: [1] })),
    /not registered/,
  );
});
