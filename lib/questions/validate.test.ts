import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseRationalLatex, validateInstance, type ValidationCode } from './validate.ts';
import { fromFraction, fromInt, toString as ratToString } from './rational.ts';
import type { Choice, Generator, QuestionInstance } from './types.ts';

/**
 * A generator stub. The validator only reads its declared fields — it never
 * calls generate — so a fixture does not need working generation logic.
 */
const FIXTURE_GENERATOR: Generator = {
  id: 'fixture-generator',
  unitId: 'fixture-u1',
  problemTypeId: 'fixture-type',
  difficulty: 2,
  strategies: [
    { id: 'sign_error', label: 'Sign error' },
    { id: 'off_by_one', label: 'Off by one' },
    { id: 'wrong_variable', label: 'Solved for the wrong variable' },
  ],
  generate() {
    throw new Error('fixture generator is never invoked by the validator');
  },
};

/** A fully valid instance. Every failing fixture below is this with one thing broken. */
function validInstance(overrides: Partial<QuestionInstance> = {}): QuestionInstance {
  return {
    generatorId: 'fixture-generator',
    seed: 0,
    unitId: 'fixture-u1',
    problemTypeId: 'fixture-type',
    difficulty: 2,
    stem: 'Given f(x) = x^3 + 2x^2 - 5x + k, and that (x - 2) is a factor, find k.',
    choices: [
      { latex: '2', isCorrect: false, strategyId: 'sign_error' },
      { latex: '-6', isCorrect: true },
      { latex: '6', isCorrect: false, strategyId: 'off_by_one' },
      { latex: '-2', isCorrect: false, strategyId: 'wrong_variable' },
    ],
    solution: [
      'A factor of (x - 2) means f(2) = 0, so substitute x = 2 and set the whole thing to zero.',
      'f(2) = 8 + 8 - 10 + k = 6 + k, so 6 + k = 0 and k = -6.',
    ],
    conceptTag: 'Factor theorem: a factor (x - r) means f(r) = 0',
    ...overrides,
  };
}

/** The codes reported for an instance, deduplicated and sorted. */
function codesFor(
  instance: QuestionInstance,
  options?: Parameters<typeof validateInstance>[2],
): ValidationCode[] {
  const { errors } = validateInstance(instance, FIXTURE_GENERATOR, options);
  return [...new Set(errors.map((e) => e.code))].sort();
}

/** Asserts the instance is rejected specifically for `code`. */
function assertRejects(instance: QuestionInstance, code: ValidationCode, options?: Parameters<typeof validateInstance>[2]): void {
  const result = validateInstance(instance, FIXTURE_GENERATOR, options);
  assert.equal(result.valid, false, `expected ${code}, but the instance validated clean`);
  assert.ok(
    result.errors.some((e) => e.code === code),
    `expected ${code}, got [${result.errors.map((e) => e.code).join(', ')}]`,
  );
  for (const error of result.errors) {
    assert.ok(error.message.length > 0, `${error.code} has an empty message`);
    assert.equal(typeof error.path, 'string');
  }
}

// --- the baseline -------------------------------------------------------------

test('validate: the reference-shaped fixture passes every rule', () => {
  const result = validateInstance(validInstance(), FIXTURE_GENERATOR);
  assert.deepEqual(result.errors, []);
  assert.equal(result.valid, true);
});

test('validate: never throws, even on a structurally absent instance', () => {
  const wrecked = {
    generatorId: 'fixture-generator',
    seed: 0,
    unitId: 'fixture-u1',
    problemTypeId: 'fixture-type',
    difficulty: 2,
  } as unknown as QuestionInstance;
  const result = validateInstance(wrecked, FIXTURE_GENERATOR);
  assert.equal(result.valid, false);
  assert.ok(result.errors.length > 0);
});

test('validate: reports every violation in one pass, not just the first', () => {
  const instance = validInstance({
    stem: '',
    solution: ['only one step'],
    choices: [
      { latex: '2', isCorrect: false, strategyId: 'not_declared' },
      { latex: '-6', isCorrect: true },
      { latex: '6', isCorrect: false, strategyId: 'off_by_one' },
    ],
  });
  const codes = codesFor(instance);
  assert.ok(codes.includes('CHOICE_COUNT'));
  assert.ok(codes.includes('UNKNOWN_STRATEGY_ID'));
  assert.ok(codes.includes('EMPTY_FIELD'));
  assert.ok(codes.includes('SOLUTION_TOO_SHORT'));
});

// --- Rule 1: choice count and correct count -----------------------------------

test('validate rule 1: passes with exactly 4 choices and exactly 1 correct', () => {
  assert.equal(validateInstance(validInstance(), FIXTURE_GENERATOR).valid, true);
});

test('validate rule 1: rejects three choices', () => {
  assertRejects(
    validInstance({ choices: validInstance().choices.slice(0, 3) }),
    'CHOICE_COUNT',
  );
});

test('validate rule 1: rejects five choices', () => {
  const choices: Choice[] = [
    ...validInstance().choices,
    { latex: '9', isCorrect: false, strategyId: 'sign_error' },
  ];
  assertRejects(validInstance({ choices }), 'CHOICE_COUNT');
});

test('validate rule 1: rejects zero correct answers', () => {
  const choices = validInstance().choices.map((c) => ({ ...c, isCorrect: false, strategyId: c.strategyId ?? 'sign_error' }));
  assertRejects(validInstance({ choices }), 'CORRECT_COUNT');
});

test('validate rule 1: rejects two correct answers', () => {
  const choices = validInstance().choices.map((c, index) =>
    index === 0 ? { latex: c.latex, isCorrect: true } : c,
  );
  assertRejects(validInstance({ choices }), 'CORRECT_COUNT');
});

// --- Rule 2: strategy attribution ---------------------------------------------

test('validate rule 2: passes when every distractor names a declared strategy', () => {
  assert.equal(validateInstance(validInstance(), FIXTURE_GENERATOR).valid, true);
});

test('validate rule 2: rejects a distractor with no strategyId', () => {
  const choices = validInstance().choices.map((c, index) =>
    index === 0 ? { latex: c.latex, isCorrect: false } : c,
  );
  assertRejects(validInstance({ choices }), 'MISSING_STRATEGY_ID');
});

test('validate rule 2: rejects a blank strategyId', () => {
  const choices = validInstance().choices.map((c, index) =>
    index === 0 ? { ...c, strategyId: '   ' } : c,
  );
  assertRejects(validInstance({ choices }), 'MISSING_STRATEGY_ID');
});

test('validate rule 2: rejects a strategyId the generator does not declare', () => {
  const choices = validInstance().choices.map((c, index) =>
    index === 0 ? { ...c, strategyId: 'invented_on_the_spot' } : c,
  );
  assertRejects(validInstance({ choices }), 'UNKNOWN_STRATEGY_ID');
});

test('validate rule 2: the correct choice needs no strategyId', () => {
  const correct = validInstance().choices.find((c) => c.isCorrect);
  assert.ok(correct);
  assert.equal(correct.strategyId, undefined);
  assert.equal(validateInstance(validInstance(), FIXTURE_GENERATOR).valid, true);
});

// --- Rule 3: duplicate choices ------------------------------------------------

test('validate rule 3: passes when all four choices are distinct', () => {
  assert.equal(validateInstance(validInstance(), FIXTURE_GENERATOR).valid, true);
});

test('validate rule 3: rejects two choices rendering identically', () => {
  const choices = validInstance().choices.map((c, index) =>
    index === 2 ? { ...c, latex: '2' } : c,
  );
  assertRejects(validInstance({ choices }), 'DUPLICATE_LATEX');
});

test('validate rule 3: rejects choices differing only in whitespace', () => {
  const choices = validInstance().choices.map((c, index) =>
    index === 2 ? { ...c, latex: ' 2 ' } : c,
  );
  assertRejects(validInstance({ choices }), 'DUPLICATE_LATEX');
});

test('validate rule 3: rejects the same value written two ways', () => {
  const choices: Choice[] = [
    { latex: '\\frac{1}{2}', isCorrect: false, strategyId: 'sign_error' },
    { latex: '\\frac{1}{3}', isCorrect: true },
    { latex: '\\frac{2}{4}', isCorrect: false, strategyId: 'off_by_one' },
    { latex: '\\frac{1}{4}', isCorrect: false, strategyId: 'wrong_variable' },
  ];
  assertRejects(validInstance({ choices }), 'DUPLICATE_VALUE');
});

test('validate rule 3: identical text is reported once, not also as a duplicate value', () => {
  const choices = validInstance().choices.map((c, index) =>
    index === 2 ? { ...c, latex: '2' } : c,
  );
  const codes = codesFor(validInstance({ choices }));
  assert.ok(codes.includes('DUPLICATE_LATEX'));
  assert.ok(!codes.includes('DUPLICATE_VALUE'), 'the same defect must not be reported twice');
});

test('validate rule 3: non-numeric choices are still compared textually', () => {
  const choices: Choice[] = [
    { latex: 'x^2 + 1', isCorrect: true },
    { latex: 'x^2 + 1', isCorrect: false, strategyId: 'sign_error' },
    { latex: 'x^2 - 1', isCorrect: false, strategyId: 'off_by_one' },
    { latex: 'x^3 + 1', isCorrect: false, strategyId: 'wrong_variable' },
  ];
  assertRejects(validInstance({ choices }), 'DUPLICATE_LATEX');
});

// --- Rule 4: trivial distractors ----------------------------------------------

test('validate rule 4: passes when distractors are plausible', () => {
  assert.equal(validateInstance(validInstance(), FIXTURE_GENERATOR).valid, true);
});

test('validate rule 4: rejects an implausible zero distractor', () => {
  const choices = validInstance().choices.map((c, index) =>
    index === 0 ? { ...c, latex: '0' } : c,
  );
  assertRejects(validInstance({ choices }), 'TRIVIAL_DISTRACTOR');
});

test('validate rule 4: accepts a zero distractor when zero is a declared outcome', () => {
  const choices = validInstance().choices.map((c, index) =>
    index === 0 ? { ...c, latex: '0' } : c,
  );
  const result = validateInstance(validInstance({ choices }), FIXTURE_GENERATOR, {
    zeroIsPlausible: true,
  });
  assert.deepEqual(result.errors, []);
});

test('validate rule 4: rejects a distractor off by a whole scale', () => {
  const choices = validInstance().choices.map((c, index) =>
    index === 0 ? { ...c, latex: '-60000' } : c,
  );
  assertRejects(validInstance({ choices }), 'TRIVIAL_DISTRACTOR');
});

test('validate rule 4: names which heuristic fired', () => {
  const choices = validInstance().choices.map((c, index) =>
    index === 0 ? { ...c, latex: '0' } : c,
  );
  const { errors } = validateInstance(validInstance({ choices }), FIXTURE_GENERATOR);
  const trivial = errors.find((e) => e.code === 'TRIVIAL_DISTRACTOR');
  assert.ok(trivial);
  assert.match(trivial.message, /implausible_zero/);
  assert.equal(trivial.path, 'choices[0].latex');
});

test('validate rule 4: stays silent on choices it cannot parse as numbers', () => {
  const choices: Choice[] = [
    { latex: 'x = 2 \\text{ or } x = -3', isCorrect: true },
    { latex: 'x = -2 \\text{ or } x = 3', isCorrect: false, strategyId: 'sign_error' },
    { latex: 'x = 2 \\text{ or } x = 3', isCorrect: false, strategyId: 'off_by_one' },
    { latex: 'x = -2 \\text{ or } x = -3', isCorrect: false, strategyId: 'wrong_variable' },
  ];
  const result = validateInstance(validInstance({ choices }), FIXTURE_GENERATOR);
  assert.deepEqual(result.errors, []);
});

// --- Rule 5: empty fields and placeholder leaks -------------------------------

test('validate rule 5: passes on fully interpolated text', () => {
  assert.equal(validateInstance(validInstance(), FIXTURE_GENERATOR).valid, true);
});

test('validate rule 5: rejects an empty stem', () => {
  assertRejects(validInstance({ stem: '   ' }), 'EMPTY_FIELD');
});

test('validate rule 5: rejects an empty conceptTag', () => {
  assertRejects(validInstance({ conceptTag: '' }), 'EMPTY_FIELD');
});

test('validate rule 5: rejects an empty solution step', () => {
  assertRejects(validInstance({ solution: ['A real step.', '  '] }), 'EMPTY_FIELD');
});

test('validate rule 5: rejects each placeholder marker', () => {
  const cases: [string, string][] = [
    ['Find k when a = undefined.', 'undefined'],
    ['Find k when a = NaN.', 'NaN'],
    ['Find k when a = null.', 'null'],
    ['Find k when a = {{coefficient}}.', '{{'],
    ['Find k when a = 3. TODO check sign.', 'TODO'],
  ];
  for (const [stem, marker] of cases) {
    const result = validateInstance(validInstance({ stem }), FIXTURE_GENERATOR);
    assert.ok(
      result.errors.some((e) => e.code === 'PLACEHOLDER_LEAK'),
      `marker ${marker} was not caught in ${JSON.stringify(stem)}`,
    );
  }
});

test('validate rule 5: placeholder markers are matched on word boundaries', () => {
  // "annulled" contains "null"; a naive substring scan would reject this stem.
  const result = validateInstance(
    validInstance({ stem: 'The contract was annulled; find the undefinedness later.' }),
    FIXTURE_GENERATOR,
  );
  assert.deepEqual(result.errors, []);
});

test('validate rule 5: scans solution steps and choices too', () => {
  assertRejects(
    validInstance({ solution: ['Step one is fine.', 'Then k = undefined.'] }),
    'PLACEHOLDER_LEAK',
  );
  const choices = validInstance().choices.map((c, index) =>
    index === 0 ? { ...c, latex: 'NaN' } : c,
  );
  assertRejects(validInstance({ choices }), 'PLACEHOLDER_LEAK');
});

// --- Rule 6: well-formed LaTeX ------------------------------------------------

test('validate rule 6: passes on balanced LaTeX with a well-formed frac', () => {
  const choices: Choice[] = [
    { latex: '\\frac{1}{2}', isCorrect: true },
    { latex: '-\\frac{1}{2}', isCorrect: false, strategyId: 'sign_error' },
    { latex: '\\frac{1}{3}', isCorrect: false, strategyId: 'off_by_one' },
    { latex: '\\frac{2}{3}', isCorrect: false, strategyId: 'wrong_variable' },
  ];
  const result = validateInstance(validInstance({ choices }), FIXTURE_GENERATOR);
  assert.deepEqual(result.errors, []);
});

test('validate rule 6: rejects an unclosed brace', () => {
  assertRejects(validInstance({ stem: 'Find k in \\frac{1}{2' }), 'UNBALANCED_BRACES');
});

test('validate rule 6: rejects an unmatched closing brace', () => {
  assertRejects(validInstance({ stem: 'Find k in x^2}' }), 'UNBALANCED_BRACES');
});

test('validate rule 6: rejects a frac with one argument', () => {
  assertRejects(validInstance({ stem: 'Evaluate \\frac{1} here.' }), 'MALFORMED_FRAC');
});

test('validate rule 6: rejects a frac with no arguments', () => {
  assertRejects(validInstance({ stem: 'Evaluate \\frac here.' }), 'MALFORMED_FRAC');
});

test('validate rule 6: rejects an empty group', () => {
  assertRejects(validInstance({ stem: 'Evaluate x^{} here.' }), 'EMPTY_GROUP');
});

test('validate rule 6: treats escaped braces as literal characters', () => {
  const result = validateInstance(
    validInstance({ stem: 'The solution set is \\{2, -3\\}. Find k.' }),
    FIXTURE_GENERATOR,
  );
  assert.deepEqual(result.errors, []);
});

test('validate rule 6: accepts a nested frac', () => {
  const result = validateInstance(
    validInstance({ stem: 'Simplify \\frac{\\frac{1}{2}}{3} and find k.' }),
    FIXTURE_GENERATOR,
  );
  assert.deepEqual(result.errors, []);
});

// --- Rule 7: instance agrees with its generator -------------------------------

test('validate rule 7: passes when the metadata matches', () => {
  assert.equal(validateInstance(validInstance(), FIXTURE_GENERATOR).valid, true);
});

test('validate rule 7: rejects a mismatched unitId', () => {
  assertRejects(validInstance({ unitId: 'some-other-unit' }), 'UNIT_MISMATCH');
});

test('validate rule 7: rejects a mismatched problemTypeId', () => {
  assertRejects(validInstance({ problemTypeId: 'some-other-type' }), 'PROBLEM_TYPE_MISMATCH');
});

test('validate rule 7: rejects a mismatched difficulty', () => {
  assertRejects(validInstance({ difficulty: 3 }), 'DIFFICULTY_MISMATCH');
});

test('validate rule 7: rejects a mismatched generatorId', () => {
  assertRejects(validInstance({ generatorId: 'someone-elses-generator' }), 'GENERATOR_ID_MISMATCH');
});

// --- Rule 8: a worked solution ------------------------------------------------

test('validate rule 8: passes with two or more steps', () => {
  assert.equal(validateInstance(validInstance(), FIXTURE_GENERATOR).valid, true);
  assert.equal(
    validateInstance(validInstance({ solution: ['One.', 'Two.', 'Three.'] }), FIXTURE_GENERATOR)
      .valid,
    true,
  );
});

test('validate rule 8: rejects a one-line solution', () => {
  assertRejects(validInstance({ solution: ['k = -6.'] }), 'SOLUTION_TOO_SHORT');
});

test('validate rule 8: rejects an empty solution', () => {
  assertRejects(validInstance({ solution: [] }), 'SOLUTION_TOO_SHORT');
});

// --- parseRationalLatex -------------------------------------------------------

test('validate: parseRationalLatex round-trips what toLatex produces', () => {
  const values = [fromInt(0), fromInt(7), fromInt(-7), fromFraction(1, 2), fromFraction(-3, 4)];
  for (const value of values) {
    const parsed = parseRationalLatex(
      value.den === BigInt(1)
        ? value.num.toString()
        : `${value.num < BigInt(0) ? '-' : ''}\\frac{${(value.num < BigInt(0) ? -value.num : value.num).toString()}}{${value.den.toString()}}`,
    );
    assert.ok(parsed, `failed to parse ${ratToString(value)}`);
    assert.equal(ratToString(parsed), ratToString(value));
  }
});

test('validate: parseRationalLatex returns null for anything it does not recognise', () => {
  for (const input of ['x^2 + 1', '\\sqrt{2}', '2x', '', '\\frac{1}{0}', '1.5', '\\frac{x}{2}']) {
    assert.equal(parseRationalLatex(input), null, `unexpectedly parsed ${JSON.stringify(input)}`);
  }
});

test('validate: parseRationalLatex tolerates surrounding whitespace', () => {
  const parsed = parseRationalLatex('  -\\frac{3}{4} ');
  assert.ok(parsed);
  assert.equal(ratToString(parsed), '-3/4');
});
