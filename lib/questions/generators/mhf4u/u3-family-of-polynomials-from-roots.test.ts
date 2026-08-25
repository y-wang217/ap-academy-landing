import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  FALLBACK_PARAMS,
  __testing,
  familyOfPolynomialsFromRoots,
  isUsable,
  passesThroughPoint,
  pointY,
  productAtPoint,
  solveEquation,
} from './u3-family-of-polynomials-from-roots.ts';
import { validateInstance } from '../../validate.ts';
import { fingerprint, verifyGenerator } from '../../verify.ts';
import { toLatex as valueToLatex, valuesEqual } from '../../value.ts';
import { createRng } from '../../rng.ts';
import { toString as ratToString } from '../../rational.ts';

const SEEDS = 500;
const instances = Array.from({ length: SEEDS }, (_, seed) =>
  familyOfPolynomialsFromRoots.generate(seed),
);

// --- hand-checked instance ----------------------------------------------------

test('family: the hand-worked scale factor is right, computed independently', () => {
  // Zeros -2, 1, 3 through (0, 12).
  // a(0 + 2)(0 - 1)(0 - 3) = a(2)(-1)(-3) = 6a, and 6a = 12 gives a = 2.
  assert.equal(ratToString(productAtPoint(FALLBACK_PARAMS)), '6');
  assert.equal(ratToString(pointY(FALLBACK_PARAMS)), '12');
  assert.equal(FALLBACK_PARAMS.a, 2);
});

test('family: the hand-worked equation renders as expected', () => {
  assert.equal(solveEquation(FALLBACK_PARAMS), '2(x + 2)(x - 1)(x - 3)');
});

test('family: the hand-worked distractors are what those mistakes give', () => {
  const byStrategy = new Map(
    __testing.buildDistractors(FALLBACK_PARAMS).map((d) => [d.strategyId, d.latex]),
  );
  assert.equal(byStrategy.get('omitted_leading_coefficient'), '(x + 2)(x - 1)(x - 3)');
  assert.equal(byStrategy.get('sign_error_on_root'), '2(x - 2)(x + 1)(x + 3)');
  assert.equal(byStrategy.get('inverted_the_leading_coefficient'), '\\frac{1}{2}(x + 2)(x - 1)(x - 3)');
});

// --- the sweep ----------------------------------------------------------------

test('family: passes full verification across 500 seeds', () => {
  const report = verifyGenerator(familyOfPolynomialsFromRoots, SEEDS);
  assert.deepEqual(report.findings, [], `findings:\n${JSON.stringify(report.findings, null, 2)}`);
  assert.equal(report.validCount, SEEDS);
  assert.ok(report.varietyRatio >= 0.6, `variety was ${report.varietyRatio}`);
});

test('family: is deterministic across 500 seeds', () => {
  for (let seed = 0; seed < SEEDS; seed += 1) {
    assert.equal(
      fingerprint(familyOfPolynomialsFromRoots.generate(seed)),
      fingerprint(instances[seed]),
    );
  }
});

test('family: every seed produces a valid instance', () => {
  const failures: string[] = [];
  instances.forEach((instance, seed) => {
    const result = validateInstance(instance, familyOfPolynomialsFromRoots);
    if (!result.valid) failures.push(`seed ${seed}: ${result.errors.map((e) => e.code).join(', ')}`);
  });
  assert.deepEqual(failures, []);
});

// --- mathematical soundness ---------------------------------------------------

test('family: the answer really passes through the stated point', () => {
  for (let seed = 0; seed < SEEDS; seed += 1) {
    const params = __testing.drawParams(createRng(seed));
    assert.ok(passesThroughPoint(params), `seed ${seed}: the point does not lie on the curve`);
  }
});

test('family: the point is never one of the zeros', () => {
  // A point on a zero gives 0 = 0 and determines nothing about the scale.
  for (let seed = 0; seed < SEEDS; seed += 1) {
    const params = __testing.drawParams(createRng(seed));
    assert.ok(
      !params.roots.includes(params.pointX),
      `seed ${seed}: the given point sits on a zero`,
    );
  }
});

test('family: the scale factor always has magnitude at least 2', () => {
  // At |a| = 1 the "forgot to scale" distractor becomes the correct answer.
  for (let seed = 0; seed < SEEDS; seed += 1) {
    const params = __testing.drawParams(createRng(seed));
    assert.ok(Math.abs(params.a) >= 2, `seed ${seed}: a = ${params.a}`);
  }
});

test('family: both signs of the scale factor appear across the sweep', () => {
  const signs = new Set<number>();
  for (let seed = 0; seed < SEEDS; seed += 1) {
    signs.add(Math.sign(__testing.drawParams(createRng(seed)).a));
  }
  assert.deepEqual([...signs].sort(), [-1, 1]);
});

test('family: the fallback tuple is usable', () => {
  assert.ok(isUsable(FALLBACK_PARAMS));
});

test('family: isUsable rejects a unit scale factor', () => {
  assert.ok(!isUsable({ roots: [-2, 1, 3], a: 1, pointX: 0 }));
  assert.ok(!isUsable({ roots: [-2, 1, 3], a: -1, pointX: 0 }));
});

test('family: isUsable rejects a point sitting on a zero, or a zero root', () => {
  assert.ok(!isUsable({ roots: [-2, 1, 3], a: 2, pointX: 1 }));
  assert.ok(!isUsable({ roots: [0, 1, 3], a: 2, pointX: 2 }));
});

test('family: no drawn tuple is degenerate', () => {
  for (let seed = 0; seed < SEEDS; seed += 1) {
    assert.ok(isUsable(__testing.drawParams(createRng(seed))), `seed ${seed}`);
  }
});

// --- choices ------------------------------------------------------------------

test('family: choice values are pairwise distinct and match their renderings', () => {
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

test('family: exactly one choice carries the correct scale factor and brackets', () => {
  for (let seed = 0; seed < SEEDS; seed += 1) {
    const params = __testing.drawParams(createRng(seed));
    const correct = solveEquation(params);
    const others = __testing.buildDistractors(params).map((d) => d.latex);
    assert.ok(!others.includes(correct), `seed ${seed}: a distractor equals the correct answer`);
  }
});

test('family: all three strategies appear on every question', () => {
  for (const instance of instances) {
    const ids = instance.choices.filter((c) => !c.isCorrect).map((c) => c.strategyId);
    assert.deepEqual(
      [...ids].sort(),
      ['inverted_the_leading_coefficient', 'omitted_leading_coefficient', 'sign_error_on_root'],
    );
  }
});

// --- rendering and solution ---------------------------------------------------

test('family: renderings never show a double sign or a unit coefficient', () => {
  for (const [seed, instance] of instances.entries()) {
    for (const text of [instance.stem, ...instance.choices.map((c) => c.latex)]) {
      assert.ok(!text.includes('- -'), `seed ${seed}: ${text}`);
      assert.ok(!text.includes('+ -'), `seed ${seed}: ${text}`);
      assert.ok(!/(^|[^\d])1\(x/.test(text), `seed ${seed}: unit coefficient in ${text}`);
    }
  }
});

test('family: uses every declared stem phrasing', () => {
  const openings = __testing.PHRASINGS.map((phrasing) => phrasing('Z', 'P').split(' ')[0]);
  assert.equal(new Set(openings).size, openings.length, 'phrasings must open distinctly');
  const used = new Set<number>();
  for (const instance of instances) {
    openings.forEach((opening, index) => {
      if (instance.stem.startsWith(`${opening} `)) used.add(index);
    });
  }
  assert.equal(used.size, openings.length);
});

test('family: the solution names the sign flip and the division order', () => {
  for (const [seed, instance] of instances.entries()) {
    const correct = instance.choices.find((c) => c.isCorrect);
    assert.ok(correct);
    for (const step of instance.solution) {
      assert.ok(step.split(' ').length >= 6, `seed ${seed}: ${step}`);
    }
    assert.ok(
      instance.solution.some((step) => step.includes('The sign flips.')),
      `seed ${seed}: the solution does not flag the sign trap`,
    );
    assert.ok(
      instance.solution.some((step) => step.includes('that way round, not the other')),
      `seed ${seed}: the solution does not flag the division order`,
    );
    assert.ok(
      instance.solution.some((step) => step.includes(`f(x) = ${correct.latex}`)),
      `seed ${seed}: no step states the answer`,
    );
  }
});

test('family: metadata matches the declaration', () => {
  for (const [seed, instance] of instances.entries()) {
    assert.equal(instance.generatorId, familyOfPolynomialsFromRoots.id);
    assert.equal(instance.seed, seed);
    assert.equal(instance.difficulty, 2);
  }
});
