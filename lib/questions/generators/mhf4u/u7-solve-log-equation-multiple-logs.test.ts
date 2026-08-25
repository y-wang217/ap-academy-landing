import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  USABLE_PARAM_COUNT,
  WORKED_EXAMPLE,
  __testing,
  extraneousRoot,
  isInDomain,
  isUsable,
  renderEquation,
  rootsOf,
  solveLogEquationMultipleLogs,
  solveValidRoot,
  sumOfArgsAnswer,
  targetValue,
} from './u7-solve-log-equation-multiple-logs.ts';
import { validateInstance } from '../../validate.ts';
import { fingerprint, verifyGenerator } from '../../verify.ts';
import { toLatex as valueToLatex, valuesEqual } from '../../value.ts';
import { createRng } from '../../rng.ts';
import { equals, fromInt as i, toString as ratToString } from '../../rational.ts';

const SEEDS = 500;
const instances = Array.from({ length: SEEDS }, (_, seed) =>
  solveLogEquationMultipleLogs.generate(seed),
);

// --- hand-checked instance ----------------------------------------------------

test('log-eq: the hand-worked equation renders as expected', () => {
  // log_2(x + 3) + log_2(x - 1) = 5
  assert.equal(
    renderEquation(WORKED_EXAMPLE),
    '\\log_{2}\\left(x + 3\\right) + \\log_{2}\\left(x - 1\\right) = 5',
  );
});

test('log-eq: the hand-worked roots are right, computed independently', () => {
  // (x + 3)(x - 1) = 2^5 = 32, so x^2 + 2x - 3 = 32, so x^2 + 2x - 35 = 0.
  // That factors as (x + 7)(x - 5), giving x = -7 and x = 5.
  assert.equal(targetValue(WORKED_EXAMPLE), 32);
  const roots = rootsOf(WORKED_EXAMPLE);
  assert.ok(roots);
  assert.deepEqual([...roots].sort((a, b) => a - b), [-7, 5]);
});

test('log-eq: only one hand-worked root survives the domain check', () => {
  // At x = -7: x + 3 = -4 and x - 1 = -8, both non-positive, so it is rejected.
  // At x = 5: x + 3 = 8 and x - 1 = 4, both positive, so it stands.
  assert.equal(isInDomain(WORKED_EXAMPLE, -7), false);
  assert.equal(isInDomain(WORKED_EXAMPLE, 5), true);
  assert.equal(solveValidRoot(WORKED_EXAMPLE), 5);
  assert.equal(extraneousRoot(WORKED_EXAMPLE), -7);
});

test('log-eq: the wrong-law answer is what that mistake actually gives', () => {
  // Reading log A + log B as log(A + B) turns the equation into
  // (x + 3) + (x - 1) = 32, so 2x + 2 = 32 and x = 15.
  assert.equal(ratToString(sumOfArgsAnswer(WORKED_EXAMPLE)), '15');
});

test('log-eq: the wrong-law answer is kept exact, not restricted to integers', () => {
  // Requiring a whole number here silently rejected every odd b^r, which meant
  // every base-3, base-5 and base-10 tuple, leaving the generator producing
  // base-2 questions only. The stem-variety check could not see it.
  // log_3(x + 2) + log_3(x - 4) = 1: (x+2) + (x-4) = 3 gives x = 5/2.
  assert.equal(ratToString(sumOfArgsAnswer({ base: 3, exponent: 1, p: 2, q: -4 })), '5/2');
});

test('log-eq: the worked example is usable', () => {
  assert.ok(isUsable(WORKED_EXAMPLE));
});

// --- the sweep ----------------------------------------------------------------

test('log-eq: passes full verification across 500 seeds', () => {
  const report = verifyGenerator(solveLogEquationMultipleLogs, SEEDS);
  assert.deepEqual(report.findings, [], `findings:\n${JSON.stringify(report.findings, null, 2)}`);
  assert.equal(report.validCount, SEEDS);
  assert.ok(report.varietyRatio >= 0.6, `variety was ${report.varietyRatio}`);
});

test('log-eq: is deterministic across 500 seeds', () => {
  for (let seed = 0; seed < SEEDS; seed += 1) {
    assert.equal(
      fingerprint(solveLogEquationMultipleLogs.generate(seed)),
      fingerprint(instances[seed]),
    );
  }
});

test('log-eq: every seed produces a valid instance', () => {
  const failures: string[] = [];
  instances.forEach((instance, seed) => {
    const result = validateInstance(instance, solveLogEquationMultipleLogs);
    if (!result.valid) failures.push(`seed ${seed}: ${result.errors.map((e) => e.code).join(', ')}`);
  });
  assert.deepEqual(failures, []);
});

// --- the property the question is about ---------------------------------------

test('log-eq: the correct answer really satisfies the original equation', () => {
  // Checked from first principles: substitute back and confirm both arguments
  // are positive and their product is base^exponent.
  for (let seed = 0; seed < SEEDS; seed += 1) {
    const params = __testing.drawParams(createRng(seed));
    const valid = solveValidRoot(params);
    assert.ok(valid !== null, `seed ${seed}: no valid root`);
    assert.ok(valid + params.p > 0, `seed ${seed}: first argument is not positive`);
    assert.ok(valid + params.q > 0, `seed ${seed}: second argument is not positive`);
    assert.equal(
      (valid + params.p) * (valid + params.q),
      targetValue(params),
      `seed ${seed}: the product does not equal base^exponent`,
    );
  }
});

test('log-eq: the extraneous root really does break the domain', () => {
  // If it did not, the question would have two solutions and no lesson.
  for (let seed = 0; seed < SEEDS; seed += 1) {
    const params = __testing.drawParams(createRng(seed));
    const extraneous = extraneousRoot(params);
    assert.ok(extraneous !== null, `seed ${seed}: no extraneous root`);
    assert.ok(
      extraneous + params.p <= 0 || extraneous + params.q <= 0,
      `seed ${seed}: the "extraneous" root is actually in the domain`,
    );
  }
});

test('log-eq: the extraneous root still satisfies the quadratic', () => {
  // That is what makes it a trap rather than an arithmetic error — it comes out
  // of correct algebra and is only rejected by the domain.
  for (let seed = 0; seed < SEEDS; seed += 1) {
    const params = __testing.drawParams(createRng(seed));
    const extraneous = extraneousRoot(params) as number;
    assert.equal(
      (extraneous + params.p) * (extraneous + params.q),
      targetValue(params),
      `seed ${seed}: the extraneous root does not solve the quadratic`,
    );
  }
});

test('log-eq: every instance has exactly one valid and one extraneous root', () => {
  for (let seed = 0; seed < SEEDS; seed += 1) {
    const params = __testing.drawParams(createRng(seed));
    const roots = rootsOf(params) as [number, number];
    assert.equal(roots.filter((root) => isInDomain(params, root)).length, 1, `seed ${seed}`);
  }
});

test('log-eq: the wrong-law distractor never coincides with a real root', () => {
  for (let seed = 0; seed < SEEDS; seed += 1) {
    const params = __testing.drawParams(createRng(seed));
    const wrongLaw = sumOfArgsAnswer(params);
    assert.ok(!equals(wrongLaw, i(solveValidRoot(params) as number)), `seed ${seed}`);
    assert.ok(!equals(wrongLaw, i(extraneousRoot(params) as number)), `seed ${seed}`);
  }
});

// --- the enumerated parameter space -------------------------------------------

test('log-eq: the usable space is large enough to sustain 500 seeds', () => {
  assert.ok(USABLE_PARAM_COUNT > 250, `only ${USABLE_PARAM_COUNT} usable tuples`);
});

test('log-eq: every enumerated tuple is usable', () => {
  for (const params of __testing.USABLE_PARAMS) {
    assert.ok(isUsable(params), `${JSON.stringify(params)} is in the list but not usable`);
  }
});

test('log-eq: isUsable rejects a tuple with no extraneous root', () => {
  // p = q would give a perfect square and a repeated root; and a tuple whose
  // roots are both in the domain has no lesson in it.
  assert.ok(!isUsable({ base: 2, exponent: 5, p: 3, q: 3 }));
});

test('log-eq: rootsOf returns null when the roots are not integers', () => {
  // (p - q)^2 + 4M must be a perfect square; 4 + 8 = 12 is not.
  assert.equal(rootsOf({ base: 2, exponent: 1, p: 1, q: 3 }), null);
  assert.equal(rootsOf({ base: 3, exponent: 1, p: 1, q: 2 }), null);
});

test('log-eq: every base is reachable, and every base appears across the sweep', () => {
  // A regression guard for the bug above: the generator once produced base-2
  // questions exclusively, and nothing in the sweep statistics revealed it.
  const enumerated = new Set(__testing.USABLE_PARAMS.map((params) => params.base));
  assert.deepEqual([...enumerated].sort((a, b) => a - b), [2, 3, 5, 10]);

  const drawn = new Set<number>();
  const exponents = new Set<number>();
  for (let seed = 0; seed < SEEDS; seed += 1) {
    const params = __testing.drawParams(createRng(seed));
    drawn.add(params.base);
    exponents.add(params.exponent);
  }
  assert.deepEqual([...drawn].sort((a, b) => a - b), [2, 3, 5, 10]);
  assert.ok(exponents.size >= 4, `only ${exponents.size} distinct exponents`);
});

// --- choices ------------------------------------------------------------------

test('log-eq: the signature distractor is the set of both roots', () => {
  for (const [seed, instance] of instances.entries()) {
    const choice = instance.choices.find((c) => c.strategyId === 'dropped_extraneous_root_check');
    assert.ok(choice, `seed ${seed}: the extraneous-root distractor is missing`);
    assert.equal(choice.value.kind, 'set');
    assert.equal(
      choice.value.kind === 'set' && choice.value.members.length,
      2,
      `seed ${seed}: the "both roots" distractor does not have two roots`,
    );
  }
});

test('log-eq: the both-roots distractor contains the correct answer', () => {
  // Deliberate: it is the answer of a student who did everything right except
  // the last step, which is why it is the most instructive wrong option here.
  for (const [seed, instance] of instances.entries()) {
    const correct = instance.choices.find((c) => c.isCorrect);
    const both = instance.choices.find((c) => c.strategyId === 'dropped_extraneous_root_check');
    assert.ok(correct && both && both.value.kind === 'set');
    assert.ok(
      both.value.members.some((member) => valuesEqual(member, correct.value)),
      `seed ${seed}: the both-roots distractor does not contain the answer`,
    );
  }
});

test('log-eq: all three strategies appear on every question', () => {
  for (const instance of instances) {
    const ids = instance.choices.filter((c) => !c.isCorrect).map((c) => c.strategyId);
    assert.deepEqual(
      [...ids].sort(),
      [
        'applied_log_law_to_sum_of_args',
        'dropped_extraneous_root_check',
        'reported_extraneous_root_only',
      ],
    );
  }
});

test('log-eq: choice values are pairwise distinct and match their renderings', () => {
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

// --- rendering and solution ---------------------------------------------------

test('log-eq: nothing ever renders a double sign', () => {
  // 345 of 500 seeds did before the solution steps were sign-rendered.
  for (const [seed, instance] of instances.entries()) {
    for (const text of [instance.stem, ...instance.solution]) {
      assert.ok(!/[+-]\s*-/.test(text), `seed ${seed}: ${text.slice(0, 120)}`);
    }
  }
});

test('log-eq: the stem always shows two logs of the same base', () => {
  for (const [seed, instance] of instances.entries()) {
    const bases = [...instance.stem.matchAll(/\\log_\{(\d+)\}/g)].map((m) => m[1]);
    assert.equal(bases.length, 2, `seed ${seed}`);
    assert.equal(bases[0], bases[1], `seed ${seed}: mismatched bases`);
  }
});

test('log-eq: uses every declared stem phrasing', () => {
  const openings = __testing.PHRASINGS.map((phrasing) => phrasing('E').split(' ')[0]);
  assert.equal(new Set(openings).size, openings.length);
  const used = new Set<number>();
  for (const instance of instances) {
    openings.forEach((opening, index) => {
      if (instance.stem.startsWith(`${opening} `)) used.add(index);
    });
  }
  assert.equal(used.size, openings.length);
});

test('log-eq: the solution names the domain check as the point of the question', () => {
  for (const [seed, instance] of instances.entries()) {
    const correct = instance.choices.find((c) => c.isCorrect);
    assert.ok(correct);
    for (const step of instance.solution) {
      assert.ok(step.split(' ').length >= 6, `seed ${seed}: ${step}`);
    }
    assert.ok(
      instance.solution.some((step) => step.includes('extraneous and has to be thrown out')),
      `seed ${seed}: the solution never rejects the extraneous root`,
    );
    assert.ok(
      instance.solution.some((step) => step.includes(`the only solution is x = ${correct.latex}`)),
      `seed ${seed}: no step states the answer`,
    );
  }
});

test('log-eq: metadata matches the declaration', () => {
  for (const [seed, instance] of instances.entries()) {
    assert.equal(instance.generatorId, 'mhf4u-u7-solve-log-equation-multiple-logs-d3');
    assert.equal(instance.seed, seed);
    assert.equal(instance.difficulty, 3);
    assert.equal(instance.unitId, 'mhf4u-u7-exponential-logarithmic');
  }
});
