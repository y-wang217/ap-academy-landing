import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  FALLBACK_PARAMS,
  __testing,
  buildPolynomial,
  isUsable,
  solvePolynomialEquationFactorable,
  solveRoots,
} from './u3-solve-polynomial-equation-factorable.ts';
import { validateInstance } from '../../validate.ts';
import { fingerprint, verifyGenerator } from '../../verify.ts';
import { qInt, qSet, toLatex as valueToLatex, valuesEqual } from '../../value.ts';
import { createRng } from '../../rng.ts';
import { fromInt as i, isZero } from '../../rational.ts';
import { polyEval, renderPoly } from '../shared/polynomial.ts';

const SEEDS = 500;
const instances = Array.from({ length: SEEDS }, (_, seed) =>
  solvePolynomialEquationFactorable.generate(seed),
);

// --- hand-checked instance ----------------------------------------------------

test('solve-eq: the hand-worked equation expands as expected', () => {
  // (x - 1)(x + 2)(x - 3) = x^3 - 2x^2 - 5x + 6.
  assert.equal(renderPoly(buildPolynomial(FALLBACK_PARAMS)), 'x^3 - 2x^2 - 5x + 6');
});

test('solve-eq: each hand-worked root really satisfies the equation', () => {
  // f(1) = 1 - 2 - 5 + 6 = 0; f(-2) = -8 - 8 + 10 + 6 = 0; f(3) = 27 - 18 - 15 + 6 = 0.
  const f = buildPolynomial(FALLBACK_PARAMS);
  assert.ok(isZero(polyEval(f, i(1))));
  assert.ok(isZero(polyEval(f, i(-2))));
  assert.ok(isZero(polyEval(f, i(3))));
});

test('solve-eq: the answer set renders in canonical order', () => {
  // Members sort by value: -2, 1, 3.
  assert.equal(valueToLatex(solveRoots(FALLBACK_PARAMS)), '\\{-2, 1, 3\\}');
});

test('solve-eq: the hand-worked distractors are what those mistakes produce', () => {
  const byStrategy = new Map(
    __testing.buildDistractors(FALLBACK_PARAMS).map((d) => [d.strategyId, valueToLatex(d.value)]),
  );
  // Every sign flipped: {-1, 2, -3}.
  assert.equal(byStrategy.get('sign_error_on_root'), '\\{-3, -1, 2\\}');
  // Two roots only: {1, -2}.
  assert.equal(byStrategy.get('dropped_a_root'), '\\{-2, 1\\}');
  // First root kept, other two flipped: {1, 2, -3}.
  assert.equal(byStrategy.get('reported_factor_constants_not_roots'), '\\{-3, 1, 2\\}');
});

// --- the sweep ----------------------------------------------------------------

test('solve-eq: passes full verification across 500 seeds', () => {
  const report = verifyGenerator(solvePolynomialEquationFactorable, SEEDS);
  assert.deepEqual(report.findings, [], `findings:\n${JSON.stringify(report.findings, null, 2)}`);
  assert.equal(report.validCount, SEEDS);
  assert.ok(report.varietyRatio >= 0.6, `variety was ${report.varietyRatio}`);
});

test('solve-eq: is deterministic across 500 seeds', () => {
  for (let seed = 0; seed < SEEDS; seed += 1) {
    assert.equal(
      fingerprint(solvePolynomialEquationFactorable.generate(seed)),
      fingerprint(instances[seed]),
    );
  }
});

test('solve-eq: every seed produces a valid instance', () => {
  const failures: string[] = [];
  instances.forEach((instance, seed) => {
    const result = validateInstance(instance, solvePolynomialEquationFactorable);
    if (!result.valid) failures.push(`seed ${seed}: ${result.errors.map((e) => e.code).join(', ')}`);
  });
  assert.deepEqual(failures, []);
});

// --- mathematical soundness ---------------------------------------------------

test('solve-eq: every root in the correct answer actually satisfies the equation', () => {
  for (let seed = 0; seed < SEEDS; seed += 1) {
    const params = __testing.drawParams(createRng(seed));
    const f = buildPolynomial(params);
    for (const root of params.roots) {
      assert.ok(isZero(polyEval(f, i(root))), `seed ${seed}: ${root} is not a root`);
    }
  }
});

test('solve-eq: no distractor set is secretly the correct set', () => {
  for (let seed = 0; seed < SEEDS; seed += 1) {
    const params = __testing.drawParams(createRng(seed));
    const correct = solveRoots(params);
    for (const distractor of __testing.buildDistractors(params)) {
      assert.ok(
        !valuesEqual(correct, distractor.value),
        `seed ${seed}: ${distractor.strategyId} equals the correct answer`,
      );
    }
  }
});

test('solve-eq: set equality ignores member order', () => {
  // The property that makes QValue.set the right representation here: two
  // orderings of the same roots must not be able to ship as separate options.
  assert.ok(valuesEqual(qSet([qInt(1), qInt(-2), qInt(3)]), qSet([qInt(3), qInt(1), qInt(-2)])));
});

test('solve-eq: the fallback tuple is usable', () => {
  assert.ok(isUsable(FALLBACK_PARAMS));
});

test('solve-eq: isUsable rejects roots that make a distractor equal the answer', () => {
  // All roots negatives of each other is impossible for three distinct values,
  // but a zero root would collapse the sign-flip distractor onto the answer.
  assert.ok(!isUsable({ roots: [0, 2, 3] }));
  assert.ok(!isUsable({ roots: [1, 1, 3] }));
});

test('solve-eq: no drawn tuple is degenerate', () => {
  for (let seed = 0; seed < SEEDS; seed += 1) {
    assert.ok(isUsable(__testing.drawParams(createRng(seed))), `seed ${seed}`);
  }
});

// --- choices ------------------------------------------------------------------

test('solve-eq: every choice is a rendered set with balanced escaped braces', () => {
  for (const [seed, instance] of instances.entries()) {
    for (const choice of instance.choices) {
      assert.match(choice.latex, /^\\\{-?\d+(, -?\d+)*\\\}$/, `seed ${seed}: ${choice.latex}`);
      assert.equal(choice.value.kind, 'set');
    }
  }
});

test('solve-eq: choice values are pairwise distinct and match their renderings', () => {
  for (const [seed, instance] of instances.entries()) {
    const values = instance.choices.map((c) => c.value);
    for (let a = 0; a < values.length; a += 1) {
      assert.equal(valueToLatex(values[a]), instance.choices[a].latex, `seed ${seed}`);
      for (let b = a + 1; b < values.length; b += 1) {
        assert.ok(!valuesEqual(values[a], values[b]), `seed ${seed}: ${a} and ${b} collide`);
      }
    }
  }
});

test('solve-eq: the correct answer always has three roots', () => {
  for (const [seed, instance] of instances.entries()) {
    const correct = instance.choices.find((c) => c.isCorrect);
    assert.ok(correct);
    assert.equal(correct.value.kind, 'set');
    assert.equal(
      correct.value.kind === 'set' && correct.value.members.length,
      3,
      `seed ${seed}: the answer does not have three roots`,
    );
  }
});

test('solve-eq: all three strategies appear on every question', () => {
  for (const instance of instances) {
    const ids = instance.choices.filter((c) => !c.isCorrect).map((c) => c.strategyId);
    assert.deepEqual(
      [...ids].sort(),
      ['dropped_a_root', 'reported_factor_constants_not_roots', 'sign_error_on_root'],
    );
  }
});

// --- rendering and solution ---------------------------------------------------

test('solve-eq: stems never show a unit coefficient or a double sign', () => {
  for (const [seed, instance] of instances.entries()) {
    assert.ok(!/\b1x/.test(instance.stem), `seed ${seed}: ${instance.stem}`);
    assert.ok(!/[+-]\s*[+-]/.test(instance.stem), `seed ${seed}: ${instance.stem}`);
  }
});

test('solve-eq: uses every declared stem phrasing', () => {
  // Split on a sentinel to recover each phrasing's literal prefix. Taking
  // the first two words instead breaks whenever an interpolation lands
  // inside them, as it does for "Solve <polynomial> = 0.".
  const MARKER = '\u0000';
  const used = new Set<number>();
  for (const instance of instances) {
    __testing.PHRASINGS.forEach((phrasing, index) => {
      const marker = phrasing(MARKER).split(MARKER)[0];
      if (instance.stem.startsWith(marker)) used.add(index);
    });
  }
  assert.equal(used.size, __testing.PHRASINGS.length);
});

test('solve-eq: the solution states the answer set and never shows a double sign', () => {
  for (const [seed, instance] of instances.entries()) {
    const correct = instance.choices.find((c) => c.isCorrect);
    assert.ok(correct);
    for (const step of instance.solution) {
      assert.ok(step.split(' ').length >= 6, `seed ${seed}: ${step}`);
      assert.ok(!step.includes('- -'), `seed ${seed}: double sign in ${step}`);
    }
    assert.ok(
      instance.solution.some((step) => step.includes(`solution set is ${correct.latex}`)),
      `seed ${seed}: no step states the answer`,
    );
  }
});

test('solve-eq: metadata matches the declaration', () => {
  for (const [seed, instance] of instances.entries()) {
    assert.equal(instance.generatorId, solvePolynomialEquationFactorable.id);
    assert.equal(instance.seed, seed);
    assert.equal(instance.difficulty, 2);
  }
});
