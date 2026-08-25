import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  FALLBACK_PARAMS,
  __testing,
  isUsable,
  remainderTheoremEvaluate,
  solveRemainder,
} from './u3-remainder-theorem-evaluate.ts';
import { validateInstance } from '../../validate.ts';
import { fingerprint, verifyGenerator } from '../../verify.ts';
import { toLatex as valueToLatex, valuesEqual } from '../../value.ts';
import { createRng } from '../../rng.ts';
import { fromInt as i, toString as ratToString } from '../../rational.ts';
import { polyEval } from '../shared/polynomial.ts';

const SEEDS = 500;
const instances = Array.from({ length: SEEDS }, (_, seed) =>
  remainderTheoremEvaluate.generate(seed),
);

// --- hand-checked instance ----------------------------------------------------

test('remainder: the answer for a hand-worked case is right, computed independently', () => {
  // f(x) = x^3 + 3x^2 - 5x + 4 divided by (x - 2).
  // By hand: f(2) = 8 + 3(4) - 5(2) + 4 = 8 + 12 - 10 + 4 = 14.
  const params = { r: 2, a: 3, b: -5, c: 4 };
  assert.equal(ratToString(solveRemainder(params)), '14');
});

test('remainder: the hand-worked distractors are the values those mistakes yield', () => {
  const params = { r: 2, a: 3, b: -5, c: 4 };
  const byStrategy = new Map(
    __testing.buildDistractors(params).map((d) => [d.strategyId, ratToString(d.value)]),
  );
  // Substituting x = -2: -8 + 3(4) - 5(-2) + 4 = -8 + 12 + 10 + 4 = 18.
  assert.equal(byStrategy.get('sign_error_on_root'), '18');
  // Sign dropped on the -5x term, so +5x: 8 + 12 + 10 + 4 = 34.
  assert.equal(byStrategy.get('arithmetic_sign_slip'), '34');
  // Reading the constant term straight off: 4.
  assert.equal(byStrategy.get('remainder_read_off_constant_term'), '4');
});

test('remainder: a second hand-worked case, with a negative divisor root', () => {
  // f(x) = x^3 - 2x^2 + x - 6 divided by (x + 1), so r = -1.
  // f(-1) = -1 - 2(1) + (-1) - 6 = -1 - 2 - 1 - 6 = -10.
  assert.equal(ratToString(solveRemainder({ r: -1, a: -2, b: 1, c: -6 })), '-10');
});

// --- the sweep ----------------------------------------------------------------

test('remainder: passes full verification across 500 seeds', () => {
  const report = verifyGenerator(remainderTheoremEvaluate, SEEDS);
  assert.deepEqual(
    report.findings,
    [],
    `findings:\n${JSON.stringify(report.findings, null, 2)}`,
  );
  assert.equal(report.validCount, SEEDS);
  assert.equal(report.crashCount, 0);
  assert.ok(report.varietyRatio >= 0.6, `variety was ${report.varietyRatio}`);
});

test('remainder: is deterministic across 500 seeds', () => {
  for (let seed = 0; seed < SEEDS; seed += 1) {
    assert.equal(
      fingerprint(remainderTheoremEvaluate.generate(seed)),
      fingerprint(instances[seed]),
      `seed ${seed} is not reproducible`,
    );
  }
});

test('remainder: every seed produces a valid instance', () => {
  const failures: string[] = [];
  instances.forEach((instance, seed) => {
    const result = validateInstance(instance, remainderTheoremEvaluate);
    if (!result.valid) {
      failures.push(`seed ${seed}: ${result.errors.map((e) => `${e.code}@${e.path}`).join(', ')}`);
    }
  });
  assert.deepEqual(failures, []);
});

test('remainder: does not throw for any seed, including large ones', () => {
  for (const seed of [0, 1, 999, 4294967295, 123456789]) {
    assert.doesNotThrow(() => remainderTheoremEvaluate.generate(seed), `seed ${seed} threw`);
  }
});

// --- mathematical soundness ---------------------------------------------------

test('remainder: the correct answer always equals f(r)', () => {
  for (let seed = 0; seed < SEEDS; seed += 1) {
    const params = __testing.drawParams(createRng(seed));
    const expected = polyEval(__testing.buildPolynomial(params), i(params.r));
    assert.equal(
      ratToString(solveRemainder(params)),
      ratToString(expected),
      `seed ${seed}: params ${JSON.stringify(params)}`,
    );
  }
});

test('remainder: the fallback tuple is genuinely usable', () => {
  // The first fallback written here had b = -r^2, which collapses the
  // sign_error_on_root distractor onto the correct answer. Only this catches it.
  assert.ok(isUsable(FALLBACK_PARAMS));
  assert.equal(ratToString(solveRemainder(FALLBACK_PARAMS)), '14');
});

test('remainder: isUsable rejects b = -r^2, where f(r) and f(-r) coincide', () => {
  assert.ok(!isUsable({ r: 2, a: 3, b: -4, c: 5 }));
  assert.ok(!isUsable({ r: 3, a: 1, b: -9, c: 2 }));
});

test('remainder: isUsable rejects a zero coefficient anywhere', () => {
  assert.ok(!isUsable({ r: 0, a: 3, b: -5, c: 4 }));
  assert.ok(!isUsable({ r: 2, a: 0, b: -5, c: 4 }));
  assert.ok(!isUsable({ r: 2, a: 3, b: 0, c: 4 }));
  assert.ok(!isUsable({ r: 2, a: 3, b: -5, c: 0 }));
});

test('remainder: no drawn tuple is degenerate', () => {
  for (let seed = 0; seed < SEEDS; seed += 1) {
    const params = __testing.drawParams(createRng(seed));
    assert.ok(isUsable(params), `seed ${seed} drew an unusable tuple`);
  }
});

test('remainder: sign patterns vary across seeds', () => {
  const patterns = new Set<string>();
  for (let seed = 0; seed < SEEDS; seed += 1) {
    const { r, a, b, c } = __testing.drawParams(createRng(seed));
    patterns.add([Math.sign(r), Math.sign(a), Math.sign(b), Math.sign(c)].join(','));
  }
  assert.equal(patterns.size, 16, `only saw ${patterns.size} of 16 sign patterns`);
});

// --- choices ------------------------------------------------------------------

test('remainder: all three strategies appear on every question', () => {
  for (const instance of instances) {
    const ids = instance.choices.filter((c) => !c.isCorrect).map((c) => c.strategyId);
    assert.deepEqual(
      [...ids].sort(),
      ['arithmetic_sign_slip', 'remainder_read_off_constant_term', 'sign_error_on_root'],
    );
  }
});

test('remainder: choice values are pairwise distinct and match their renderings', () => {
  for (const [seed, instance] of instances.entries()) {
    const values = instance.choices.map((c) => c.value);
    for (let a = 0; a < values.length; a += 1) {
      assert.equal(valueToLatex(values[a]), instance.choices[a].latex, `seed ${seed}`);
      for (let b = a + 1; b < values.length; b += 1) {
        assert.ok(!valuesEqual(values[a], values[b]), `seed ${seed}: choices ${a} and ${b} collide`);
      }
    }
  }
});

test('remainder: no choice is ever a bare zero', () => {
  for (const [seed, instance] of instances.entries()) {
    for (const choice of instance.choices) {
      assert.notEqual(choice.latex, '0', `seed ${seed} emitted a zero choice`);
    }
  }
});

// --- rendering and solution ---------------------------------------------------

test('remainder: stems never show a unit coefficient or a double sign', () => {
  for (const [seed, instance] of instances.entries()) {
    assert.ok(!/\b1x/.test(instance.stem), `seed ${seed}: ${instance.stem}`);
    assert.ok(!/[+-]\s*[+-]/.test(instance.stem), `seed ${seed}: ${instance.stem}`);
    assert.ok(!instance.stem.includes('(x - -'), `seed ${seed}: ${instance.stem}`);
  }
});

test('remainder: uses every declared stem phrasing', () => {
  const used = new Set<number>();
  for (const instance of instances) {
    __testing.PHRASINGS.forEach((phrasing, index) => {
      const marker = phrasing('POLY', 'DIV').split(' ').slice(0, 2).join(' ');
      if (instance.stem.startsWith(marker)) used.add(index);
    });
  }
  assert.equal(used.size, __testing.PHRASINGS.length);
});

test('remainder: the solution is written out, not bare algebra', () => {
  for (const [seed, instance] of instances.entries()) {
    assert.ok(instance.solution.length >= 2, `seed ${seed}`);
    for (const step of instance.solution) {
      assert.ok(step.split(' ').length >= 6, `seed ${seed} step is too terse: ${step}`);
    }
  }
});

test('remainder: the solution states the answer that is marked correct', () => {
  for (const [seed, instance] of instances.entries()) {
    const correct = instance.choices.find((c) => c.isCorrect);
    assert.ok(correct);
    assert.ok(
      instance.solution.some((step) => step.includes(`remainder is ${correct.latex}`)),
      `seed ${seed}: no step states the answer ${correct.latex}`,
    );
  }
});

test('remainder: metadata matches the declaration', () => {
  for (const [seed, instance] of instances.entries()) {
    assert.equal(instance.generatorId, remainderTheoremEvaluate.id);
    assert.equal(instance.seed, seed);
    assert.equal(instance.unitId, remainderTheoremEvaluate.unitId);
    assert.equal(instance.problemTypeId, remainderTheoremEvaluate.problemTypeId);
    assert.equal(instance.difficulty, remainderTheoremEvaluate.difficulty);
  }
});

test('remainder: reuses the shared sign_error_on_root strategy id', () => {
  // The same misconception as u3-factor-theorem-find-k, so the same id — that
  // shared vocabulary is what makes per-misconception diagnostics work later.
  assert.ok(remainderTheoremEvaluate.strategies.some((s) => s.id === 'sign_error_on_root'));
  assert.ok(remainderTheoremEvaluate.strategies.some((s) => s.id === 'arithmetic_sign_slip'));
});
