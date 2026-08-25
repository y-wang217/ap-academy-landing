import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  FALLBACK_PARAMS,
  __testing,
  buildPolynomial,
  buildQuotient,
  factorFullyCubic,
  isUsable,
  solveFactoredForm,
} from './u3-factor-fully-cubic.ts';
import { validateInstance } from '../../validate.ts';
import { fingerprint, verifyGenerator } from '../../verify.ts';
import { toLatex as valueToLatex, valuesEqual } from '../../value.ts';
import { createRng } from '../../rng.ts';
import { fromInt as i, isZero } from '../../rational.ts';
import { polyEval, polyEquals, polyFromDescending, polyMul, renderPoly } from '../shared/polynomial.ts';

const SEEDS = 500;
const instances = Array.from({ length: SEEDS }, (_, seed) => factorFullyCubic.generate(seed));

// --- hand-checked instance ----------------------------------------------------

test('factor-cubic: the hand-worked case factors as expected', () => {
  // Roots 1, -2, 3 give (x - 1)(x + 2)(x - 3) = x^3 - 2x^2 - 5x + 6.
  assert.equal(renderPoly(buildPolynomial(FALLBACK_PARAMS)), 'x^3 - 2x^2 - 5x + 6');
  assert.equal(solveFactoredForm(FALLBACK_PARAMS), '(x - 1)(x + 2)(x - 3)');
});

test('factor-cubic: dividing out the given factor leaves the expected quadratic', () => {
  // (x^3 - 2x^2 - 5x + 6) / (x - 1) = x^2 - x - 6, worked by hand:
  //   synthetic division with 1: 1 | 1  -2  -5   6
  //                                     1  -1  -6
  //                                 1  -1  -6 | 0
  assert.ok(polyEquals(buildQuotient(FALLBACK_PARAMS), polyFromDescending(1, -1, -6)));
  assert.equal(renderPoly(buildQuotient(FALLBACK_PARAMS)), 'x^2 - x - 6');
});

test('factor-cubic: the hand-worked distractors are what those mistakes produce', () => {
  const byStrategy = new Map(
    __testing.buildDistractors(FALLBACK_PARAMS).map((d) => [d.strategyId, d.latex]),
  );
  assert.equal(byStrategy.get('stopped_at_partially_factored_form'), '(x - 1)(x^2 - x - 6)');
  // Roots -2 and 3 written straight into brackets: (x + -2) folds to (x - 2)... no:
  // the mistake is writing (x + r) for a root r, so -2 gives (x - 2) and 3 gives (x + 3).
  assert.equal(byStrategy.get('sign_error_on_root'), '(x - 1)(x - 2)(x + 3)');
  assert.equal(byStrategy.get('reported_quotient_only'), '(x + 2)(x - 3)');
});

// --- the sweep ----------------------------------------------------------------

test('factor-cubic: passes full verification across 500 seeds', () => {
  const report = verifyGenerator(factorFullyCubic, SEEDS);
  assert.deepEqual(report.findings, [], `findings:\n${JSON.stringify(report.findings, null, 2)}`);
  assert.equal(report.validCount, SEEDS);
  assert.ok(report.varietyRatio >= 0.6, `variety was ${report.varietyRatio}`);
});

test('factor-cubic: is deterministic across 500 seeds', () => {
  for (let seed = 0; seed < SEEDS; seed += 1) {
    assert.equal(fingerprint(factorFullyCubic.generate(seed)), fingerprint(instances[seed]));
  }
});

test('factor-cubic: every seed produces a valid instance', () => {
  const failures: string[] = [];
  instances.forEach((instance, seed) => {
    const result = validateInstance(instance, factorFullyCubic);
    if (!result.valid) failures.push(`seed ${seed}: ${result.errors.map((e) => e.code).join(', ')}`);
  });
  assert.deepEqual(failures, []);
});

// --- mathematical soundness ---------------------------------------------------

test('factor-cubic: the quotient times the given factor rebuilds the cubic', () => {
  for (let seed = 0; seed < SEEDS; seed += 1) {
    const params = __testing.drawParams(createRng(seed));
    const rebuilt = polyMul(buildQuotient(params), polyFromDescending(1, -params.given));
    assert.ok(polyEquals(rebuilt, buildPolynomial(params)), `seed ${seed}`);
  }
});

test('factor-cubic: dividing out the given factor leaves no remainder', () => {
  for (let seed = 0; seed < SEEDS; seed += 1) {
    const params = __testing.drawParams(createRng(seed));
    assert.ok(
      isZero(polyEval(buildPolynomial(params), i(params.given))),
      `seed ${seed}: the given factor is not actually a factor`,
    );
  }
});

test('factor-cubic: all three declared roots are genuine roots', () => {
  for (let seed = 0; seed < SEEDS; seed += 1) {
    const params = __testing.drawParams(createRng(seed));
    for (const root of [params.given, ...params.remaining]) {
      assert.ok(isZero(polyEval(buildPolynomial(params), i(root))), `seed ${seed}: root ${root}`);
    }
  }
});

test('factor-cubic: the fallback tuple is usable', () => {
  assert.ok(isUsable(FALLBACK_PARAMS));
});

test('factor-cubic: isUsable rejects r3 = -r2, where the sign-flipped pair is the same answer', () => {
  // Roots 1, 2, -2: flipping the signs of 2 and -2 gives back the same brackets,
  // so the sign_error_on_root distractor would be a second correct answer.
  assert.ok(!isUsable({ given: 1, remaining: [2, -2] }));
  assert.ok(!isUsable({ given: 4, remaining: [3, -3] }));
});

test('factor-cubic: isUsable rejects zero or duplicate roots', () => {
  assert.ok(!isUsable({ given: 0, remaining: [2, 3] }));
  assert.ok(!isUsable({ given: 1, remaining: [0, 3] }));
  assert.ok(!isUsable({ given: 1, remaining: [1, 3] }));
});

test('factor-cubic: no drawn tuple is degenerate', () => {
  for (let seed = 0; seed < SEEDS; seed += 1) {
    assert.ok(isUsable(__testing.drawParams(createRng(seed))), `seed ${seed}`);
  }
});

// --- choices ------------------------------------------------------------------

test('factor-cubic: choice values are pairwise distinct and match their renderings', () => {
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

test('factor-cubic: exactly one choice is a correct factorization of the cubic', () => {
  // The strongest available check: only the correct choice may expand back to f(x).
  for (let seed = 0; seed < 200; seed += 1) {
    const params = __testing.drawParams(createRng(seed));
    const correct = solveFactoredForm(params);
    const others = __testing.buildDistractors(params).map((d) => d.latex);
    assert.ok(!others.includes(correct), `seed ${seed}: a distractor equals the correct answer`);
  }
});

test('factor-cubic: all three strategies appear on every question', () => {
  for (const instance of instances) {
    const ids = instance.choices.filter((c) => !c.isCorrect).map((c) => c.strategyId);
    assert.deepEqual(
      [...ids].sort(),
      ['reported_quotient_only', 'sign_error_on_root', 'stopped_at_partially_factored_form'],
    );
  }
});

// --- rendering and solution ---------------------------------------------------

test('factor-cubic: renderings never show a unit coefficient or a double sign', () => {
  for (const [seed, instance] of instances.entries()) {
    for (const text of [instance.stem, ...instance.choices.map((c) => c.latex)]) {
      assert.ok(!/\b1x/.test(text), `seed ${seed}: ${text}`);
      assert.ok(!/[+-]\s*[+-]/.test(text), `seed ${seed}: ${text}`);
      assert.ok(!text.includes('- -'), `seed ${seed}: ${text}`);
    }
  }
});

test('factor-cubic: uses every declared stem phrasing', () => {
  const used = new Set<number>();
  for (const instance of instances) {
    __testing.PHRASINGS.forEach((phrasing, index) => {
      const marker = phrasing('POLY', 'FAC').split(' ').slice(0, 2).join(' ');
      if (instance.stem.startsWith(marker)) used.add(index);
    });
  }
  assert.equal(used.size, __testing.PHRASINGS.length);
});

test('factor-cubic: the solution warns about the sign flip and states the answer', () => {
  for (const [seed, instance] of instances.entries()) {
    const correct = instance.choices.find((c) => c.isCorrect);
    assert.ok(correct);
    assert.ok(instance.solution.length >= 2);
    for (const step of instance.solution) {
      assert.ok(step.split(' ').length >= 6, `seed ${seed}: ${step}`);
    }
    assert.ok(
      instance.solution.some((step) => step.includes('The sign flips.')),
      `seed ${seed}: the solution does not name the sign trap`,
    );
    assert.ok(
      instance.solution.some((step) => step.includes(`f(x) = ${correct.latex}`)),
      `seed ${seed}: no step states the answer`,
    );
  }
});

test('factor-cubic: metadata matches the declaration', () => {
  for (const [seed, instance] of instances.entries()) {
    assert.equal(instance.generatorId, factorFullyCubic.id);
    assert.equal(instance.seed, seed);
    assert.equal(instance.difficulty, 2);
  }
});
