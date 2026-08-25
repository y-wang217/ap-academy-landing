import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeForValueComparison,
  validateInstance,
  type ValidationCode,
} from './validate.ts';
import { qFraction, qInt, qLog, qPi, qSet, qSurd, type QValue } from './value.ts';
import { fromInt as i } from './rational.ts';
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
    { id: 'sign_error_on_root', label: 'Sign error' },
    { id: 'arithmetic_sign_slip', label: 'Off by one' },
    { id: 'solved_for_wrong_variable', label: 'Solved for the wrong variable' },
  ],
  generate() {
    throw new Error('fixture generator is never invoked by the validator');
  },
};

/** An integer choice whose rendering and value agree, which is the normal case. */
function intChoice(n: number, extra: Partial<Choice> = {}): Choice {
  return { latex: String(n), isCorrect: false, value: qInt(n), ...extra };
}

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
      intChoice(2, { strategyId: 'sign_error_on_root' }),
      intChoice(-6, { isCorrect: true }),
      intChoice(6, { strategyId: 'arithmetic_sign_slip' }),
      intChoice(-2, { strategyId: 'solved_for_wrong_variable' }),
    ],
    solution: [
      'A factor of (x - 2) means f(2) = 0, so substitute x = 2 and set the whole thing to zero.',
      'f(2) = 8 + 8 - 10 + k = 6 + k, so 6 + k = 0 and k = -6.',
    ],
    conceptTag: 'Factor theorem: a factor (x - r) means f(r) = 0',
    ...overrides,
  };
}

/** Replaces one choice wholesale. */
function withChoice(index: number, replacement: Choice): QuestionInstance {
  const instance = validInstance();
  const choices = instance.choices.slice();
  choices[index] = replacement;
  return validInstance({ choices });
}

/** The error codes reported, deduplicated and sorted. */
function codesFor(
  instance: QuestionInstance,
  options?: Parameters<typeof validateInstance>[2],
): ValidationCode[] {
  const { errors } = validateInstance(instance, FIXTURE_GENERATOR, options);
  return [...new Set(errors.map((e) => e.code))].sort();
}

/** Asserts the instance is rejected specifically for `code`, at error severity. */
function assertRejects(
  instance: QuestionInstance,
  code: ValidationCode,
  options?: Parameters<typeof validateInstance>[2],
): void {
  const result = validateInstance(instance, FIXTURE_GENERATOR, options);
  assert.equal(result.valid, false, `expected ${code}, but the instance validated clean`);
  assert.ok(
    result.errors.some((e) => e.code === code),
    `expected ${code}, got [${result.errors.map((e) => e.code).join(', ')}]`,
  );
  for (const finding of result.findings) {
    assert.ok(finding.message.length > 0, `${finding.code} has an empty message`);
    assert.equal(typeof finding.path, 'string');
    assert.ok(finding.severity === 'error' || finding.severity === 'warning');
  }
}

/** Asserts the instance produces `code` at warning severity, and still validates. */
function assertWarns(instance: QuestionInstance, code: ValidationCode): void {
  const result = validateInstance(instance, FIXTURE_GENERATOR);
  assert.ok(
    result.warnings.some((w) => w.code === code),
    `expected warning ${code}, got [${result.findings.map((f) => `${f.severity}:${f.code}`).join(', ')}]`,
  );
}

// --- the baseline -------------------------------------------------------------

test('validate: the reference-shaped fixture passes every rule', () => {
  const result = validateInstance(validInstance(), FIXTURE_GENERATOR);
  assert.deepEqual(result.findings, []);
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
      intChoice(2, { strategyId: 'not_declared' }),
      intChoice(-6, { isCorrect: true }),
      intChoice(6, { strategyId: 'arithmetic_sign_slip' }),
    ],
  });
  const codes = codesFor(instance);
  assert.ok(codes.includes('CHOICE_COUNT'));
  assert.ok(codes.includes('UNKNOWN_STRATEGY_ID'));
  assert.ok(codes.includes('EMPTY_FIELD'));
  assert.ok(codes.includes('SOLUTION_TOO_SHORT'));
});

test('validate: partitions findings into errors and warnings', () => {
  const result = validateInstance(validInstance(), FIXTURE_GENERATOR);
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.warnings, []);
  assert.equal(result.findings.length, 0);
  // errors + warnings always reconstruct findings.
  const broken = validateInstance(validInstance({ stem: '' }), FIXTURE_GENERATOR);
  assert.equal(broken.errors.length + broken.warnings.length, broken.findings.length);
});

// --- Rule 1: choice count and correct count -----------------------------------

test('validate rule 1: rejects three choices', () => {
  assertRejects(validInstance({ choices: validInstance().choices.slice(0, 3) }), 'CHOICE_COUNT');
});

test('validate rule 1: rejects five choices', () => {
  const choices: Choice[] = [...validInstance().choices, intChoice(9, { strategyId: 'sign_error_on_root' })];
  assertRejects(validInstance({ choices }), 'CHOICE_COUNT');
});

test('validate rule 1: rejects zero correct answers', () => {
  const choices = validInstance().choices.map((c) => ({
    ...c,
    isCorrect: false,
    strategyId: c.strategyId ?? 'sign_error_on_root',
  }));
  assertRejects(validInstance({ choices }), 'CORRECT_COUNT');
});

test('validate rule 1: rejects two correct answers', () => {
  const choices = validInstance().choices.map((c, index) =>
    index === 0 ? { ...c, isCorrect: true, strategyId: undefined } : c,
  );
  assertRejects(validInstance({ choices }), 'CORRECT_COUNT');
});

// --- Rule 2: strategy attribution ---------------------------------------------

test('validate rule 2: rejects a distractor with no strategyId', () => {
  assertRejects(withChoice(0, intChoice(2)), 'MISSING_STRATEGY_ID');
});

test('validate rule 2: rejects a blank strategyId', () => {
  assertRejects(withChoice(0, intChoice(2, { strategyId: '   ' })), 'MISSING_STRATEGY_ID');
});

test('validate rule 2: rejects a strategyId the generator does not declare', () => {
  assertRejects(withChoice(0, intChoice(2, { strategyId: 'invented' })), 'UNKNOWN_STRATEGY_ID');
});

test('validate rule 2: the correct choice needs no strategyId', () => {
  const correct = validInstance().choices.find((c) => c.isCorrect);
  assert.ok(correct);
  assert.equal(correct.strategyId, undefined);
  assert.equal(validateInstance(validInstance(), FIXTURE_GENERATOR).valid, true);
});

// --- Rule 3: duplicate choices, now checked on value --------------------------

test('validate rule 3: rejects two choices rendering identically', () => {
  assertRejects(withChoice(2, intChoice(2, { strategyId: 'arithmetic_sign_slip' })), 'DUPLICATE_LATEX');
});

test('validate rule 3: rejects choices differing only in whitespace', () => {
  const spaced: Choice = { latex: ' 2 ', isCorrect: false, strategyId: 'arithmetic_sign_slip', value: qInt(2) };
  assertRejects(withChoice(2, spaced), 'DUPLICATE_LATEX');
});

test('validate rule 3: rejects the same value written two ways', () => {
  const choices: Choice[] = [
    { latex: '\\frac{1}{2}', isCorrect: false, strategyId: 'sign_error_on_root', value: qFraction(1, 2) },
    { latex: '\\frac{1}{3}', isCorrect: true, value: qFraction(1, 3) },
    { latex: '\\frac{2}{4}', isCorrect: false, strategyId: 'arithmetic_sign_slip', value: qFraction(2, 4) },
    { latex: '\\frac{1}{4}', isCorrect: false, strategyId: 'solved_for_wrong_variable', value: qFraction(1, 4) },
  ];
  assertRejects(validInstance({ choices }), 'DUPLICATE_VALUE');
});

test('validate rule 3: catches a symbolic duplicate the old LaTeX parser could not', () => {
  // 2*sqrt(3) and sqrt(12) are the same number rendered two ways. The previous
  // implementation parsed LaTeX into a Rational, could parse neither, and
  // shipped both as separate options.
  const choices: Choice[] = [
    { latex: '2\\sqrt{3}', isCorrect: false, strategyId: 'sign_error_on_root', value: qSurd(i(2), 3) },
    { latex: '\\sqrt{5}', isCorrect: true, value: qSurd(i(1), 5) },
    { latex: '\\sqrt{12}', isCorrect: false, strategyId: 'arithmetic_sign_slip', value: qSurd(i(1), 12) },
    { latex: '\\sqrt{7}', isCorrect: false, strategyId: 'solved_for_wrong_variable', value: qSurd(i(1), 7) },
  ];
  assertRejects(validInstance({ choices }), 'DUPLICATE_VALUE');
});

test('validate rule 3: catches log and integer forms of the same number', () => {
  const choices: Choice[] = [
    { latex: '\\log_{2}\\left(8\\right)', isCorrect: false, strategyId: 'sign_error_on_root', value: qLog(i(2), i(8)) },
    { latex: '5', isCorrect: true, value: qInt(5) },
    { latex: '3', isCorrect: false, strategyId: 'arithmetic_sign_slip', value: qInt(3) },
    { latex: '4', isCorrect: false, strategyId: 'solved_for_wrong_variable', value: qInt(4) },
  ];
  assertRejects(validInstance({ choices }), 'DUPLICATE_VALUE');
});

test('validate rule 3: catches two solution sets that differ only in member order', () => {
  const setA = qSet([qPi(i(1)), qPi(qFractionCoeff(1, 3))]);
  const setB = qSet([qPi(qFractionCoeff(1, 3)), qPi(i(1))]);
  const choices: Choice[] = [
    { latex: '\\{\\frac{\\pi}{3}, \\pi\\}', isCorrect: true, value: setA },
    { latex: '\\{\\pi, \\frac{\\pi}{3}\\}', isCorrect: false, strategyId: 'sign_error_on_root', value: setB },
    { latex: '\\{\\frac{\\pi}{6}\\}', isCorrect: false, strategyId: 'arithmetic_sign_slip', value: qSet([qPi(qFractionCoeff(1, 6))]) },
    { latex: '\\{\\frac{\\pi}{4}\\}', isCorrect: false, strategyId: 'solved_for_wrong_variable', value: qSet([qPi(qFractionCoeff(1, 4))]) },
  ];
  assertRejects(validInstance({ choices }), 'DUPLICATE_VALUE');
});

/** Rational coefficient helper, kept local so the set fixtures read clearly. */
function qFractionCoeff(num: number, den: number) {
  const value = qFraction(num, den);
  if (value.kind !== 'rational') throw new Error('unreachable');
  return value.value;
}

test('validate rule 3: distinct symbolic values are left alone', () => {
  const choices: Choice[] = [
    { latex: '\\frac{\\pi}{3}', isCorrect: true, value: qPi(qFractionCoeff(1, 3)) },
    { latex: '\\frac{\\pi}{6}', isCorrect: false, strategyId: 'sign_error_on_root', value: qPi(qFractionCoeff(1, 6)) },
    { latex: '\\frac{2\\pi}{3}', isCorrect: false, strategyId: 'arithmetic_sign_slip', value: qPi(qFractionCoeff(2, 3)) },
    { latex: '\\frac{5\\pi}{6}', isCorrect: false, strategyId: 'solved_for_wrong_variable', value: qPi(qFractionCoeff(5, 6)) },
  ];
  assert.deepEqual(validateInstance(validInstance({ choices }), FIXTURE_GENERATOR).findings, []);
});

test('validate rule 3: identical text is reported once, not also as a duplicate value', () => {
  const codes = codesFor(withChoice(2, intChoice(2, { strategyId: 'arithmetic_sign_slip' })));
  assert.ok(codes.includes('DUPLICATE_LATEX'));
  assert.ok(!codes.includes('DUPLICATE_VALUE'), 'the same defect must not be reported twice');
});

// --- Rule 4: trivial distractors ----------------------------------------------

test('validate rule 4: rejects an implausible zero distractor', () => {
  assertRejects(withChoice(0, intChoice(0, { strategyId: 'sign_error_on_root' })), 'TRIVIAL_DISTRACTOR');
});

test('validate rule 4: accepts a zero distractor when zero is a declared outcome', () => {
  const instance = withChoice(0, intChoice(0, { strategyId: 'sign_error_on_root' }));
  const result = validateInstance(instance, FIXTURE_GENERATOR, { zeroIsPlausible: true });
  assert.deepEqual(result.findings, []);
});

test('validate rule 4: a zero of any kind is caught, because zero canonicalizes to rational', () => {
  const zeroPi: Choice = { latex: '0', isCorrect: false, strategyId: 'sign_error_on_root', value: qPi(i(0)) };
  assertRejects(withChoice(0, zeroPi), 'TRIVIAL_DISTRACTOR');
});

test('validate rule 4: rejects a distractor off by a whole scale', () => {
  assertRejects(withChoice(0, intChoice(-60000, { strategyId: 'sign_error_on_root' })), 'TRIVIAL_DISTRACTOR');
});

test('validate rule 4: names which heuristic fired', () => {
  const { errors } = validateInstance(
    withChoice(0, intChoice(0, { strategyId: 'sign_error_on_root' })),
    FIXTURE_GENERATOR,
  );
  const trivial = errors.find((e) => e.code === 'TRIVIAL_DISTRACTOR');
  assert.ok(trivial);
  assert.match(trivial.message, /implausible_zero/);
  assert.equal(trivial.path, 'choices[0].latex');
});

test('validate rule 4: stays silent on symbolic values, where the heuristics have no competence', () => {
  const choices: Choice[] = [
    { latex: '\\frac{\\pi}{3}', isCorrect: true, value: qPi(qFractionCoeff(1, 3)) },
    { latex: '\\{1, 2\\}', isCorrect: false, strategyId: 'sign_error_on_root', value: qSet([qInt(1), qInt(2)]) },
    { latex: '\\sqrt{2}', isCorrect: false, strategyId: 'arithmetic_sign_slip', value: qSurd(i(1), 2) },
    { latex: '\\text{no solution}', isCorrect: false, strategyId: 'solved_for_wrong_variable', value: { kind: 'special', token: 'no-solution' } },
  ];
  const result = validateInstance(validInstance({ choices }), FIXTURE_GENERATOR);
  assert.ok(!result.errors.some((e) => e.code === 'TRIVIAL_DISTRACTOR'));
});

// --- Rule 5: empty fields and placeholder leaks -------------------------------

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
  const result = validateInstance(
    validInstance({ stem: 'The contract was annulled; find the undefinedness later.' }),
    FIXTURE_GENERATOR,
  );
  assert.deepEqual(result.findings, []);
});

test('validate rule 5: scans solution steps too', () => {
  assertRejects(
    validInstance({ solution: ['Step one is fine.', 'Then k = undefined.'] }),
    'PLACEHOLDER_LEAK',
  );
});

// --- Rule 6: well-formed LaTeX ------------------------------------------------

test('validate rule 6: passes on balanced LaTeX with a well-formed frac', () => {
  const choices: Choice[] = [
    { latex: '\\frac{1}{2}', isCorrect: true, value: qFraction(1, 2) },
    { latex: '-\\frac{1}{2}', isCorrect: false, strategyId: 'sign_error_on_root', value: qFraction(-1, 2) },
    { latex: '\\frac{1}{3}', isCorrect: false, strategyId: 'arithmetic_sign_slip', value: qFraction(1, 3) },
    { latex: '\\frac{2}{3}', isCorrect: false, strategyId: 'solved_for_wrong_variable', value: qFraction(2, 3) },
  ];
  assert.deepEqual(validateInstance(validInstance({ choices }), FIXTURE_GENERATOR).findings, []);
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
  assert.deepEqual(result.findings, []);
});

test('validate rule 6: accepts a nested frac', () => {
  const result = validateInstance(
    validInstance({ stem: 'Simplify \\frac{\\frac{1}{2}}{3} and find k.' }),
    FIXTURE_GENERATOR,
  );
  assert.deepEqual(result.findings, []);
});

test('validate rule 6: a rendered solution set has balanced braces', () => {
  const set = qSet([qInt(1), qInt(2)]);
  const choices: Choice[] = [
    { latex: '\\{1, 2\\}', isCorrect: true, value: set },
    { latex: '\\{1, 3\\}', isCorrect: false, strategyId: 'sign_error_on_root', value: qSet([qInt(1), qInt(3)]) },
    { latex: '\\{2, 3\\}', isCorrect: false, strategyId: 'arithmetic_sign_slip', value: qSet([qInt(2), qInt(3)]) },
    { latex: '\\{4, 5\\}', isCorrect: false, strategyId: 'solved_for_wrong_variable', value: qSet([qInt(4), qInt(5)]) },
  ];
  assert.deepEqual(validateInstance(validInstance({ choices }), FIXTURE_GENERATOR).findings, []);
});

// --- Rule 7: instance agrees with its generator -------------------------------

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
  assert.equal(
    validateInstance(validInstance({ solution: ['One.', 'Two.', 'Three.'] }), FIXTURE_GENERATOR).valid,
    true,
  );
});

test('validate rule 8: rejects a one-line solution', () => {
  assertRejects(validInstance({ solution: ['k = -6.'] }), 'SOLUTION_TOO_SHORT');
});

test('validate rule 8: rejects an empty solution', () => {
  assertRejects(validInstance({ solution: [] }), 'SOLUTION_TOO_SHORT');
});

// --- Rule 9: every choice carries a canonicalizable value ---------------------

test('validate rule 9: passes when every choice has a well-formed value', () => {
  assert.deepEqual(validateInstance(validInstance(), FIXTURE_GENERATOR).findings, []);
});

test('validate rule 9: rejects a choice with no value at all', () => {
  const missing = { latex: '2', isCorrect: false, strategyId: 'sign_error_on_root' } as unknown as Choice;
  assertRejects(withChoice(0, missing), 'INVALID_VALUE');
});

test('validate rule 9: rejects a value that fails to canonicalize', () => {
  const cases: QValue[] = [
    { kind: 'surd', coeff: i(1), radicand: BigInt(-4) },
    { kind: 'log', base: i(1), argument: i(5) },
    { kind: 'log', base: i(2), argument: i(0) },
    { kind: 'power', base: i(0), exponent: i(0) },
    { kind: 'power', base: i(0), exponent: i(-1) },
  ];
  for (const value of cases) {
    const bad: Choice = { latex: '2', isCorrect: false, strategyId: 'sign_error_on_root', value };
    assertRejects(withChoice(0, bad), 'INVALID_VALUE');
  }
});

test('validate rule 9: a malformed value does not stop the other rules running', () => {
  const bad: Choice = {
    latex: '2',
    isCorrect: false,
    strategyId: 'not_declared',
    value: { kind: 'surd', coeff: i(1), radicand: BigInt(-4) },
  };
  const codes = codesFor(validInstance({ choices: [bad, ...validInstance().choices.slice(1)] }));
  assert.ok(codes.includes('INVALID_VALUE'));
  assert.ok(codes.includes('UNKNOWN_STRATEGY_ID'), 'later rules must still run');
});

test('validate rule 9: reports the path of the offending choice', () => {
  const bad: Choice = {
    latex: '2',
    isCorrect: false,
    strategyId: 'sign_error_on_root',
    value: { kind: 'log', base: i(2), argument: i(-1) },
  };
  const { errors } = validateInstance(withChoice(2, bad), FIXTURE_GENERATOR);
  const finding = errors.find((e) => e.code === 'INVALID_VALUE');
  assert.ok(finding);
  assert.equal(finding.path, 'choices[2].value');
});

// --- Rule 10: rendering agrees with value (warning) ---------------------------

test('validate rule 10: silent when latex matches the canonical rendering', () => {
  assert.deepEqual(validateInstance(validInstance(), FIXTURE_GENERATOR).warnings, []);
});

test('validate rule 10: warns when the generator displays something else', () => {
  const lying: Choice = { latex: '99', isCorrect: false, strategyId: 'sign_error_on_root', value: qInt(2) };
  assertWarns(withChoice(0, lying), 'VALUE_LATEX_MISMATCH');
});

test('validate rule 10: a mismatch is a warning, not an error', () => {
  const lying: Choice = { latex: '99', isCorrect: false, strategyId: 'sign_error_on_root', value: qInt(2) };
  const result = validateInstance(withChoice(0, lying), FIXTURE_GENERATOR);
  assert.equal(result.valid, true, 'a display mismatch must not fail the sweep');
  assert.equal(result.errors.length, 0);
  assert.equal(result.warnings.length, 1);
});

test('validate rule 10: tolerates an assignment prefix', () => {
  const prefixed: Choice = {
    latex: 'x = \\frac{\\pi}{3}',
    isCorrect: false,
    strategyId: 'sign_error_on_root',
    value: qPi(qFractionCoeff(1, 3)),
  };
  const result = validateInstance(withChoice(0, prefixed), FIXTURE_GENERATOR);
  assert.deepEqual(result.warnings, []);
});

test('validate rule 10: tolerates a Greek-letter assignment prefix', () => {
  const prefixed: Choice = {
    latex: '\\theta = \\frac{\\pi}{6}',
    isCorrect: false,
    strategyId: 'sign_error_on_root',
    value: qPi(qFractionCoeff(1, 6)),
  };
  assert.deepEqual(validateInstance(withChoice(0, prefixed), FIXTURE_GENERATOR).warnings, []);
});

test('validate rule 10: tolerates whitespace differences', () => {
  const spaced: Choice = {
    latex: '\\frac{1} {2}',
    isCorrect: false,
    strategyId: 'sign_error_on_root',
    value: qFraction(1, 2),
  };
  assert.deepEqual(validateInstance(withChoice(0, spaced), FIXTURE_GENERATOR).warnings, []);
});

test('validate rule 10: catches the compute-one-thing-display-another bug', () => {
  // The generator computed pi/3 but rendered pi/6 — a real transposition bug.
  const wrong: Choice = {
    latex: '\\frac{\\pi}{6}',
    isCorrect: false,
    strategyId: 'sign_error_on_root',
    value: qPi(qFractionCoeff(1, 3)),
  };
  assertWarns(withChoice(0, wrong), 'VALUE_LATEX_MISMATCH');
});

test('validate: normalizeForValueComparison strips prefixes and whitespace', () => {
  assert.equal(normalizeForValueComparison('x = \\frac{\\pi}{3}'), '\\frac{\\pi}{3}');
  assert.equal(normalizeForValueComparison('\\theta =\\pi'), '\\pi');
  assert.equal(normalizeForValueComparison('  k  =  -6 '), '-6');
  assert.equal(normalizeForValueComparison('\\frac{1} {2}'), '\\frac{1}{2}');
  // Not an assignment: must be left alone.
  assert.equal(normalizeForValueComparison('2x'), '2x');
});
