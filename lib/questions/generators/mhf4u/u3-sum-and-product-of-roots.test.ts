import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  FALLBACK_PARAMS,
  __testing,
  isUsable,
  solveRelation,
  sumAndProductOfRoots,
  type Mode,
} from './u3-sum-and-product-of-roots.ts';
import { validateInstance } from '../../validate.ts';
import { fingerprint, verifyGenerator } from '../../verify.ts';
import { toLatex as valueToLatex, valuesEqual } from '../../value.ts';
import { createRng } from '../../rng.ts';
import { toString as ratToString } from '../../rational.ts';

const SEEDS = 500;
const instances = Array.from({ length: SEEDS }, (_, seed) => sumAndProductOfRoots.generate(seed));

// --- hand-checked instance ----------------------------------------------------

test('root-relations: the hand-worked sum is right, computed independently', () => {
  // 2x^3 - 5x^2 + 4x - 6 = 0. Sum of roots = -b/a = -(-5)/2 = 5/2.
  assert.equal(ratToString(solveRelation(FALLBACK_PARAMS)), '5/2');
});

test('root-relations: the hand-worked product is right', () => {
  // Same equation, product of roots = -d/a = -(-6)/2 = 3.
  assert.equal(ratToString(solveRelation({ ...FALLBACK_PARAMS, mode: 'product' })), '3');
});

test('root-relations: the hand-worked distractors are what those mistakes give', () => {
  const byStrategy = new Map(
    __testing.buildDistractors(FALLBACK_PARAMS).map((d) => [d.strategyId, ratToString(d.value)]),
  );
  // Forgot the minus: b/a = -5/2.
  assert.equal(byStrategy.get('dropped_the_negation_in_the_root_relation'), '-5/2');
  // Ignored a: -b = 5.
  assert.equal(byStrategy.get('ignored_the_leading_coefficient'), '5');
  // Grabbed c instead: -c/a = -4/2 = -2.
  assert.equal(byStrategy.get('used_the_wrong_coefficient'), '-2');
});

test('root-relations: the relation matches an expanded product of chosen roots', () => {
  // Independent check of the relation itself, not of the module's arithmetic:
  // (x - 2)(x - 3)(x + 4) = x^3 - x^2 - 14x + 24.
  // Sum of roots 2 + 3 - 4 = 1, and -b/a = -(-1)/1 = 1.
  // Product 2 * 3 * -4 = -24, and -d/a = -24/1 = -24.
  const params = { a: 1, b: -1, c: -14, d: 24, mode: 'sum' as Mode };
  assert.equal(ratToString(solveRelation(params)), '1');
  assert.equal(ratToString(solveRelation({ ...params, mode: 'product' })), '-24');
});

// --- the sweep ----------------------------------------------------------------

test('root-relations: passes full verification across 500 seeds', () => {
  const report = verifyGenerator(sumAndProductOfRoots, SEEDS);
  assert.deepEqual(report.findings, [], `findings:\n${JSON.stringify(report.findings, null, 2)}`);
  assert.equal(report.validCount, SEEDS);
  assert.ok(report.varietyRatio >= 0.6, `variety was ${report.varietyRatio}`);
});

test('root-relations: is deterministic across 500 seeds', () => {
  for (let seed = 0; seed < SEEDS; seed += 1) {
    assert.equal(fingerprint(sumAndProductOfRoots.generate(seed)), fingerprint(instances[seed]));
  }
});

test('root-relations: every seed produces a valid instance', () => {
  const failures: string[] = [];
  instances.forEach((instance, seed) => {
    const result = validateInstance(instance, sumAndProductOfRoots);
    if (!result.valid) failures.push(`seed ${seed}: ${result.errors.map((e) => e.code).join(', ')}`);
  });
  assert.deepEqual(failures, []);
});

// --- mathematical soundness ---------------------------------------------------

test('root-relations: the answer is always -b/a or -d/a for the asked mode', () => {
  for (let seed = 0; seed < SEEDS; seed += 1) {
    const params = __testing.drawParams(createRng(seed));
    const numerator = params.mode === 'sum' ? params.b : params.d;
    // Recomputed from first principles rather than by calling solveRelation.
    const expected = -numerator / params.a;
    const actual = solveRelation(params);
    assert.ok(
      Math.abs(Number(actual.num) / Number(actual.den) - expected) < 1e-12,
      `seed ${seed}: got ${ratToString(actual)}, expected ${expected}`,
    );
  }
});

test('root-relations: both modes appear across the sweep', () => {
  const modes = new Set<Mode>();
  for (let seed = 0; seed < SEEDS; seed += 1) {
    modes.add(__testing.drawParams(createRng(seed)).mode);
  }
  assert.deepEqual([...modes].sort(), ['product', 'sum']);
});

test('root-relations: the leading coefficient always has magnitude at least 2', () => {
  // At |a| = 1 the "ignored the leading coefficient" distractor collapses onto
  // either the answer or the negation distractor.
  for (let seed = 0; seed < SEEDS; seed += 1) {
    const params = __testing.drawParams(createRng(seed));
    assert.ok(Math.abs(params.a) >= 2, `seed ${seed}: a = ${params.a}`);
  }
});

test('root-relations: the fallback tuple is usable', () => {
  assert.ok(isUsable(FALLBACK_PARAMS));
});

test('root-relations: isUsable rejects a unit leading coefficient', () => {
  assert.ok(!isUsable({ a: 1, b: -5, c: 4, d: -6, mode: 'sum' }));
  assert.ok(!isUsable({ a: -1, b: -5, c: 4, d: -6, mode: 'sum' }));
});

test('root-relations: isUsable rejects a zero coefficient anywhere', () => {
  assert.ok(!isUsable({ a: 0, b: -5, c: 4, d: -6, mode: 'sum' }));
  assert.ok(!isUsable({ a: 2, b: 0, c: 4, d: -6, mode: 'sum' }));
  assert.ok(!isUsable({ a: 2, b: -5, c: 0, d: -6, mode: 'sum' }));
  assert.ok(!isUsable({ a: 2, b: -5, c: 4, d: 0, mode: 'product' }));
});

test('root-relations: no drawn tuple is degenerate', () => {
  for (let seed = 0; seed < SEEDS; seed += 1) {
    assert.ok(isUsable(__testing.drawParams(createRng(seed))), `seed ${seed}`);
  }
});

// --- choices ------------------------------------------------------------------

test('root-relations: choice values are pairwise distinct and match their renderings', () => {
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

test('root-relations: fractions always render with the minus outside', () => {
  for (const [seed, instance] of instances.entries()) {
    for (const choice of instance.choices) {
      assert.ok(!choice.latex.includes('{-'), `seed ${seed}: ${choice.latex}`);
    }
  }
});

test('root-relations: all three strategies appear on every question', () => {
  for (const instance of instances) {
    const ids = instance.choices.filter((c) => !c.isCorrect).map((c) => c.strategyId);
    assert.deepEqual(
      [...ids].sort(),
      [
        'dropped_the_negation_in_the_root_relation',
        'ignored_the_leading_coefficient',
        'used_the_wrong_coefficient',
      ],
    );
  }
});

// --- rendering and solution ---------------------------------------------------

test('root-relations: stems never show a unit coefficient or a double sign', () => {
  for (const [seed, instance] of instances.entries()) {
    assert.ok(!/\b1x/.test(instance.stem), `seed ${seed}: ${instance.stem}`);
    assert.ok(!/[+-]\s*[+-]/.test(instance.stem), `seed ${seed}: ${instance.stem}`);
  }
});

test('root-relations: the stem asks for exactly the mode that was drawn', () => {
  for (let seed = 0; seed < SEEDS; seed += 1) {
    const params = __testing.drawParams(createRng(seed));
    const stem = instances[seed].stem;
    assert.ok(stem.includes(params.mode), `seed ${seed}: stem does not ask for the ${params.mode}`);
    const other = params.mode === 'sum' ? 'product' : 'sum';
    assert.ok(!stem.includes(other), `seed ${seed}: stem mentions both relations`);
  }
});

test('root-relations: uses every declared stem phrasing, for both modes', () => {
  for (const mode of ['sum', 'product'] as Mode[]) {
    const openings = __testing.PHRASINGS[mode].map((phrasing) => phrasing('E').split(' ')[0]);
    assert.equal(new Set(openings).size, openings.length, `${mode} phrasings must open distinctly`);
    const used = new Set<number>();
    for (const instance of instances) {
      if (!instance.stem.includes(mode)) continue;
      openings.forEach((opening, index) => {
        if (instance.stem.startsWith(`${opening} `)) used.add(index);
      });
    }
    assert.equal(used.size, openings.length, `${mode} did not use every phrasing`);
  }
});

test('root-relations: the solution states the answer and both traps', () => {
  for (const [seed, instance] of instances.entries()) {
    const correct = instance.choices.find((c) => c.isCorrect);
    assert.ok(correct);
    for (const step of instance.solution) {
      assert.ok(step.split(' ').length >= 6, `seed ${seed}: ${step}`);
    }
    assert.ok(
      instance.solution.some((step) => step.includes('the minus sign is part of the relation')),
      `seed ${seed}: the solution does not flag the negation trap`,
    );
    assert.ok(
      instance.solution.some((step) => step.endsWith(`= ${correct.latex}.`)),
      `seed ${seed}: no step states the answer ${correct.latex}`,
    );
  }
});

test('root-relations: metadata matches the declaration', () => {
  for (const [seed, instance] of instances.entries()) {
    assert.equal(instance.generatorId, sumAndProductOfRoots.id);
    assert.equal(instance.seed, seed);
    assert.equal(instance.difficulty, 2);
  }
});
