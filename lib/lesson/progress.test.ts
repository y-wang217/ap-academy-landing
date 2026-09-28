import { test } from 'node:test';
import assert from 'node:assert/strict';
import { progressFrom } from './progress.ts';
import type { Attempt } from './types.ts';

const TYPE = 'mhf4u-u3-factor-theorem-find-k';
const GEN = `${TYPE}-d2`;

function attempt(overrides: Partial<Attempt>): Attempt {
  return {
    problemTypeId: TYPE,
    generatorId: GEN,
    seed: 0,
    mode: 'solo',
    entered: '0',
    correct: true,
    at: 0,
    ...overrides,
  };
}

test('no attempts: empty progress, not zeros', () => {
  assert.deepEqual(progressFrom([]), {});
});

test('Together attempts do not change progress', () => {
  const attempts = [
    attempt({ mode: 'together', stepId: `${TYPE}-s1`, correct: false, at: 0 }),
    attempt({ mode: 'together', stepId: `${TYPE}-s1`, correct: true, at: 1 }),
    attempt({ mode: 'together', stepId: `${TYPE}-s3`, correct: true, at: 2 }),
  ];
  assert.deepEqual(progressFrom(attempts), {});
});

test('Solo attempts count, and the last one sets correctAtLast', () => {
  const attempts = [
    attempt({ seed: 7, correct: true, at: 0 }),
    attempt({ seed: 8, correct: false, at: 1 }),
  ];
  assert.deepEqual(progressFrom(attempts), { [TYPE]: { attempted: 2, correctAtLast: false } });

  attempts.push(attempt({ seed: 9, correct: true, at: 2 }));
  assert.deepEqual(progressFrom(attempts), { [TYPE]: { attempted: 3, correctAtLast: true } });
});

test('Together attempts mixed in are ignored, not counted', () => {
  const attempts = [
    attempt({ mode: 'together', stepId: `${TYPE}-s1`, correct: false, at: 0 }),
    attempt({ seed: 5, correct: false, at: 1 }),
    attempt({ mode: 'together', stepId: `${TYPE}-s4`, correct: true, at: 2 }),
  ];
  assert.deepEqual(progressFrom(attempts), { [TYPE]: { attempted: 1, correctAtLast: false } });
});

test('progress is per problem type', () => {
  const other = 'mhf4u-u3-remainder-theorem-evaluate';
  const attempts = [
    attempt({ correct: false, at: 0 }),
    attempt({ problemTypeId: other, generatorId: `${other}-d1`, correct: true, at: 1 }),
  ];
  assert.deepEqual(progressFrom(attempts), {
    [TYPE]: { attempted: 1, correctAtLast: false },
    [other]: { attempted: 1, correctAtLast: true },
  });
});

test('the progress shape carries exactly two fields and no score', () => {
  const progress = progressFrom([attempt({})]);
  assert.deepEqual(Object.keys(progress[TYPE]).sort(), ['attempted', 'correctAtLast']);
});
