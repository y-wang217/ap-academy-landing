import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  FALLBACK_PARAMS,
  __testing,
  countDistinctRealRoots,
  countRealRootsFromFactoredForm,
  isUsable,
  renderFactoredPolynomial,
} from './u3-count-real-roots-from-factored-form.ts';
import { validateInstance } from '../../validate.ts';
import { fingerprint, verifyGenerator } from '../../verify.ts';
import { toLatex as valueToLatex, valuesEqual } from '../../value.ts';
import { createRng } from '../../rng.ts';

const SEEDS = 500;
const instances = Array.from({ length: SEEDS }, (_, seed) =>
  countRealRootsFromFactoredForm.generate(seed),
);

// --- hand-checked instance ----------------------------------------------------

test('count-roots: the hand-worked polynomial renders as expected', () => {
  // (x - 1)^3 (x + 2)^2 (x - 4)(x^2 + 4)
  assert.equal(renderFactoredPolynomial(FALLBACK_PARAMS), '(x - 1)^3(x + 2)^2(x - 4)(x^2 + 4)');
});

test('count-roots: the hand-worked answer is 3, reasoned independently', () => {
  // Roots come only from the linear factors: x = 1, x = -2, x = 4. The
  // exponents repeat those roots rather than adding new ones, and x^2 + 4 = 0
  // has no real solution. So three distinct real roots.
  assert.equal(countDistinctRealRoots(FALLBACK_PARAMS), 3);
});

test('count-roots: the hand-worked distractors are what those mistakes give', () => {
  const byStrategy = new Map(
    __testing.buildDistractors(FALLBACK_PARAMS).map((d) => [d.strategyId, d.count]),
  );
  // Multiplicities 3 + 2 + 1 = 6.
  assert.equal(byStrategy.get('counted_multiplicity_as_separate_roots'), 6);
  // 3 real roots plus two imagined from the quadratic.
  assert.equal(byStrategy.get('counted_irreducible_quadratic_as_real_roots'), 5);
  // Four bracket blocks on the page.
  assert.equal(byStrategy.get('counted_factors_not_roots'), 4);
});

// --- the sweep ----------------------------------------------------------------

test('count-roots: passes full verification across 500 seeds', () => {
  const report = verifyGenerator(countRealRootsFromFactoredForm, SEEDS);
  assert.deepEqual(report.findings, [], `findings:\n${JSON.stringify(report.findings, null, 2)}`);
  assert.equal(report.validCount, SEEDS);
  assert.ok(report.varietyRatio >= 0.6, `variety was ${report.varietyRatio}`);
});

test('count-roots: is deterministic across 500 seeds', () => {
  for (let seed = 0; seed < SEEDS; seed += 1) {
    assert.equal(
      fingerprint(countRealRootsFromFactoredForm.generate(seed)),
      fingerprint(instances[seed]),
    );
  }
});

test('count-roots: every seed produces a valid instance', () => {
  const failures: string[] = [];
  instances.forEach((instance, seed) => {
    const result = validateInstance(instance, countRealRootsFromFactoredForm);
    if (!result.valid) failures.push(`seed ${seed}: ${result.errors.map((e) => e.code).join(', ')}`);
  });
  assert.deepEqual(failures, []);
});

// --- mathematical soundness ---------------------------------------------------

test('count-roots: the answer always equals the number of distinct linear factors', () => {
  for (let seed = 0; seed < SEEDS; seed += 1) {
    const params = __testing.drawParams(createRng(seed));
    const roots = params.factors.map((factor) => factor.root);
    assert.equal(new Set(roots).size, roots.length, `seed ${seed}: duplicate root in the factors`);
    assert.equal(countDistinctRealRoots(params), roots.length, `seed ${seed}`);
  }
});

test('count-roots: the quadratic factor never has a real root', () => {
  for (let seed = 0; seed < SEEDS; seed += 1) {
    const params = __testing.drawParams(createRng(seed));
    assert.ok(
      params.irreducibleConstant > 0,
      `seed ${seed}: x^2 + ${params.irreducibleConstant} would have real roots`,
    );
  }
});

test('count-roots: the multiplicity distractor always exceeds the true count', () => {
  // If it did not, the "repeated factor" trap would not be a trap at all.
  for (let seed = 0; seed < SEEDS; seed += 1) {
    const params = __testing.drawParams(createRng(seed));
    assert.ok(
      __testing.totalMultiplicity(params) > countDistinctRealRoots(params),
      `seed ${seed}: no repeated factor, so the question has no trap`,
    );
  }
});

test('count-roots: the fallback tuple is usable', () => {
  assert.ok(isUsable(FALLBACK_PARAMS));
});

test('count-roots: isUsable rejects an all-simple-root set, where two counts coincide', () => {
  // Every multiplicity 1 means totalMultiplicity equals the distinct count, so
  // that distractor would be the correct answer.
  assert.ok(
    !isUsable({
      factors: [
        { root: 1, multiplicity: 1 },
        { root: 2, multiplicity: 1 },
        { root: 3, multiplicity: 1 },
      ],
      irreducibleConstant: 4,
    }),
  );
});

test('count-roots: isUsable rejects a real-rooted quadratic or a duplicate root', () => {
  assert.ok(
    !isUsable({
      factors: [
        { root: 1, multiplicity: 3 },
        { root: 2, multiplicity: 2 },
      ],
      irreducibleConstant: -4,
    }),
  );
  assert.ok(
    !isUsable({
      factors: [
        { root: 1, multiplicity: 3 },
        { root: 1, multiplicity: 2 },
      ],
      irreducibleConstant: 4,
    }),
  );
});

test('count-roots: no drawn tuple is degenerate', () => {
  for (let seed = 0; seed < SEEDS; seed += 1) {
    assert.ok(isUsable(__testing.drawParams(createRng(seed))), `seed ${seed}`);
  }
});

// --- choices ------------------------------------------------------------------

test('count-roots: every choice is a positive whole number', () => {
  for (const [seed, instance] of instances.entries()) {
    for (const choice of instance.choices) {
      assert.match(choice.latex, /^[1-9]\d*$/, `seed ${seed}: ${choice.latex}`);
    }
  }
});

test('count-roots: choice values are pairwise distinct and match their renderings', () => {
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

test('count-roots: all three strategies appear on every question', () => {
  for (const instance of instances) {
    const ids = instance.choices.filter((c) => !c.isCorrect).map((c) => c.strategyId);
    assert.deepEqual(
      [...ids].sort(),
      [
        'counted_factors_not_roots',
        'counted_irreducible_quadratic_as_real_roots',
        'counted_multiplicity_as_separate_roots',
      ],
    );
  }
});

// --- rendering and solution ---------------------------------------------------

test('count-roots: stems never show a double sign or an exponent of 1', () => {
  for (const [seed, instance] of instances.entries()) {
    assert.ok(!/[+-]\s*[+-]/.test(instance.stem), `seed ${seed}: ${instance.stem}`);
    assert.ok(!instance.stem.includes(')^1'), `seed ${seed}: ${instance.stem}`);
    assert.ok(!instance.stem.includes('- -'), `seed ${seed}: ${instance.stem}`);
  }
});

test('count-roots: uses every declared stem phrasing', () => {
  // Each phrasing opens with a distinct word, so the first token identifies it.
  const openings = __testing.PHRASINGS.map((phrasing) => phrasing('POLY').split(' ')[0]);
  assert.equal(new Set(openings).size, openings.length, 'phrasings must open distinctly');
  const used = new Set<number>();
  for (const instance of instances) {
    openings.forEach((opening, index) => {
      if (instance.stem.startsWith(`${opening} `)) used.add(index);
    });
  }
  assert.equal(used.size, openings.length);
});

test('count-roots: the solution explains both traps and states the count', () => {
  for (const [seed, instance] of instances.entries()) {
    const correct = instance.choices.find((c) => c.isCorrect);
    assert.ok(correct);
    for (const step of instance.solution) {
      assert.ok(step.split(' ').length >= 6, `seed ${seed}: ${step}`);
    }
    assert.ok(
      instance.solution.some((step) => step.includes('no real number squares to a negative')),
      `seed ${seed}: the solution never explains the irreducible quadratic`,
    );
    assert.ok(
      instance.solution.some((step) => step.includes(`So the count is ${correct.latex}.`)),
      `seed ${seed}: no step states the answer`,
    );
  }
});

test('count-roots: the solution names the multiplicity trap whenever there is one', () => {
  for (const [seed, instance] of instances.entries()) {
    assert.ok(
      instance.solution.some((step) => step.includes('Watch the exponents')),
      `seed ${seed}: every instance has a repeated factor, so every solution must flag it`,
    );
  }
});

test('count-roots: metadata matches the declaration', () => {
  for (const [seed, instance] of instances.entries()) {
    assert.equal(instance.generatorId, countRealRootsFromFactoredForm.id);
    assert.equal(instance.seed, seed);
    assert.equal(instance.difficulty, 2);
  }
});
