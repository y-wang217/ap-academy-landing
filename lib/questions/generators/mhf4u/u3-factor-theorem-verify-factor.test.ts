import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  FALLBACK_PARAMS,
  __testing,
  answerRoot,
  buildPolynomial,
  factorTheoremVerifyFactor,
  isUsable,
} from './u3-factor-theorem-verify-factor.ts';
import { validateInstance } from '../../validate.ts';
import { fingerprint, verifyGenerator } from '../../verify.ts';
import { toLatex as valueToLatex, valuesEqual } from '../../value.ts';
import { createRng } from '../../rng.ts';
import { fromInt as i, isZero, toString as ratToString } from '../../rational.ts';
import { polyEval, renderPoly } from '../shared/polynomial.ts';

const SEEDS = 500;
const instances = Array.from({ length: SEEDS }, (_, seed) =>
  factorTheoremVerifyFactor.generate(seed),
);

// --- hand-checked instance ----------------------------------------------------

test('verify-factor: the hand-worked polynomial expands as expected', () => {
  // (x - 1)(x + 2)(x - 3). By hand:
  //   (x - 1)(x + 2) = x^2 + x - 2
  //   (x^2 + x - 2)(x - 3) = x^3 - 3x^2 + x^2 - 3x - 2x + 6 = x^3 - 2x^2 - 5x + 6
  assert.equal(renderPoly(buildPolynomial(FALLBACK_PARAMS)), 'x^3 - 2x^2 - 5x + 6');
});

test('verify-factor: the declared answer really is a root, checked by substitution', () => {
  // f(1) = 1 - 2 - 5 + 6 = 0.
  const f = buildPolynomial(FALLBACK_PARAMS);
  assert.equal(ratToString(polyEval(f, i(1))), '0');
  assert.equal(answerRoot(FALLBACK_PARAMS), 1);
});

test('verify-factor: the hand-worked distractors are genuinely not roots', () => {
  const f = buildPolynomial(FALLBACK_PARAMS);
  // f(-1) = -1 - 2 + 5 + 6 = 8, not zero.
  assert.equal(ratToString(polyEval(f, i(-1))), '8');
  // f(6) = 216 - 72 - 30 + 6 = 120, not zero.
  assert.equal(ratToString(polyEval(f, i(6))), '120');
  // f(-5) = -125 - 50 + 25 + 6 = -144, not zero.
  assert.equal(ratToString(polyEval(f, i(-5))), '-144');
});

// --- the sweep ----------------------------------------------------------------

test('verify-factor: passes full verification across 500 seeds', () => {
  const report = verifyGenerator(factorTheoremVerifyFactor, SEEDS);
  assert.deepEqual(report.findings, [], `findings:\n${JSON.stringify(report.findings, null, 2)}`);
  assert.equal(report.validCount, SEEDS);
  assert.equal(report.crashCount, 0);
  assert.ok(report.varietyRatio >= 0.6, `variety was ${report.varietyRatio}`);
});

test('verify-factor: is deterministic across 500 seeds', () => {
  for (let seed = 0; seed < SEEDS; seed += 1) {
    assert.equal(
      fingerprint(factorTheoremVerifyFactor.generate(seed)),
      fingerprint(instances[seed]),
      `seed ${seed} is not reproducible`,
    );
  }
});

test('verify-factor: every seed produces a valid instance', () => {
  const failures: string[] = [];
  instances.forEach((instance, seed) => {
    const result = validateInstance(instance, factorTheoremVerifyFactor);
    if (!result.valid) {
      failures.push(`seed ${seed}: ${result.errors.map((e) => `${e.code}@${e.path}`).join(', ')}`);
    }
  });
  assert.deepEqual(failures, []);
});

test('verify-factor: does not throw for any seed', () => {
  for (const seed of [0, 1, 999, 4294967295, 123456789]) {
    assert.doesNotThrow(() => factorTheoremVerifyFactor.generate(seed));
  }
});

// --- the property that makes the question answerable --------------------------

test('verify-factor: exactly one offered binomial is actually a factor', () => {
  // The binding constraint. A cubic has three roots; offering a second real
  // factor would make the question unanswerable.
  for (let seed = 0; seed < SEEDS; seed += 1) {
    const params = __testing.drawParams(createRng(seed));
    const f = buildPolynomial(params);
    const offered = [
      answerRoot(params),
      ...__testing.buildDistractors(params).map((d) => d.root),
    ];
    const actualRoots = offered.filter((root) => isZero(polyEval(f, i(root))));
    assert.deepEqual(
      actualRoots,
      [answerRoot(params)],
      `seed ${seed}: ${actualRoots.length} of the offered binomials are factors (params ${JSON.stringify(params)})`,
    );
  }
});

test('verify-factor: the correct answer is always a genuine root', () => {
  for (let seed = 0; seed < SEEDS; seed += 1) {
    const params = __testing.drawParams(createRng(seed));
    assert.ok(
      isZero(polyEval(buildPolynomial(params), i(answerRoot(params)))),
      `seed ${seed}: the declared answer is not a root`,
    );
  }
});

test('verify-factor: the polynomial always has the three declared roots', () => {
  for (let seed = 0; seed < 200; seed += 1) {
    const params = __testing.drawParams(createRng(seed));
    const f = buildPolynomial(params);
    for (const root of params.roots) {
      assert.ok(isZero(polyEval(f, i(root))), `seed ${seed}: ${root} is not a root`);
    }
  }
});

test('verify-factor: the fallback tuple is genuinely usable', () => {
  assert.ok(isUsable(FALLBACK_PARAMS));
});

test('verify-factor: isUsable rejects a distractor that is itself a root', () => {
  // Roots 1, -2, 3 — offering (x - 3) as the "divisor candidate" distractor
  // would give the question two correct answers.
  assert.ok(
    !isUsable({ roots: [1, -2, 3], answerIndex: 0, divisorDistractor: 3, coefficientDistractor: -5 }),
  );
});

test('verify-factor: isUsable rejects duplicate or zero roots', () => {
  const base = { answerIndex: 0, divisorDistractor: 6, coefficientDistractor: -5 };
  assert.ok(!isUsable({ ...base, roots: [1, 1, 3] }));
  assert.ok(!isUsable({ ...base, roots: [0, -2, 3] }));
});

test('verify-factor: isUsable rejects two distractors offering the same binomial', () => {
  assert.ok(
    !isUsable({ roots: [1, -2, 3], answerIndex: 0, divisorDistractor: 6, coefficientDistractor: 6 }),
  );
});

test('verify-factor: no drawn tuple is degenerate', () => {
  for (let seed = 0; seed < SEEDS; seed += 1) {
    assert.ok(isUsable(__testing.drawParams(createRng(seed))), `seed ${seed}`);
  }
});

// --- choices ------------------------------------------------------------------

test('verify-factor: every choice renders as a binomial or a bare x', () => {
  for (const [seed, instance] of instances.entries()) {
    for (const choice of instance.choices) {
      assert.match(choice.latex, /^\(x [+-] \d+\)$/, `seed ${seed}: ${choice.latex}`);
    }
  }
});

test('verify-factor: choice values are pairwise distinct and match their renderings', () => {
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

test('verify-factor: all three strategies appear on every question', () => {
  for (const instance of instances) {
    const ids = instance.choices.filter((c) => !c.isCorrect).map((c) => c.strategyId);
    assert.deepEqual(
      [...ids].sort(),
      [
        'lifted_coefficient_from_the_question',
        'picked_rational_root_candidate_without_testing',
        'sign_error_on_root',
      ],
    );
  }
});

// --- rendering and solution ---------------------------------------------------

test('verify-factor: stems never show a unit coefficient, double sign, or (x - -n)', () => {
  for (const [seed, instance] of instances.entries()) {
    assert.ok(!/\b1x/.test(instance.stem), `seed ${seed}: ${instance.stem}`);
    assert.ok(!/[+-]\s*[+-]/.test(instance.stem), `seed ${seed}: ${instance.stem}`);
    assert.ok(!instance.stem.includes('- -'), `seed ${seed}: ${instance.stem}`);
  }
});

test('verify-factor: uses every declared stem phrasing', () => {
  const used = new Set<number>();
  for (const instance of instances) {
    __testing.PHRASINGS.forEach((phrasing, index) => {
      const marker = phrasing('POLY').split(' ').slice(0, 2).join(' ');
      if (instance.stem.startsWith(marker)) used.add(index);
    });
  }
  assert.equal(used.size, __testing.PHRASINGS.length);
});

test('verify-factor: the solution is written out and names the correct factor', () => {
  for (const [seed, instance] of instances.entries()) {
    const correct = instance.choices.find((c) => c.isCorrect);
    assert.ok(correct);
    assert.ok(instance.solution.length >= 2, `seed ${seed}`);
    for (const step of instance.solution) {
      assert.ok(step.split(' ').length >= 6, `seed ${seed}: ${step}`);
    }
    assert.ok(
      instance.solution.some((step) => step.includes(`the factor is ${correct.latex}`)),
      `seed ${seed}: no step names the answer ${correct.latex}`,
    );
  }
});

test('verify-factor: metadata matches the declaration', () => {
  for (const [seed, instance] of instances.entries()) {
    assert.equal(instance.generatorId, factorTheoremVerifyFactor.id);
    assert.equal(instance.seed, seed);
    assert.equal(instance.difficulty, 1);
    assert.equal(instance.problemTypeId, 'mhf4u-u3-factor-theorem-verify-factor');
  }
});
