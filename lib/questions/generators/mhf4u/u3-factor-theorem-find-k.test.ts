import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FALLBACK_PARAMS, __testing, factorTheoremFindK } from './u3-factor-theorem-find-k.ts';
import { validateInstance } from '../../validate.ts';
import { verifyGenerator } from '../../verify.ts';
import { GENERATORS, generatorIds, getGenerator } from '../index.ts';
import { parseRationalLatex } from '../../validate.ts';
import { add, fromInt, isZero, mul, pow, toString as ratToString } from '../../rational.ts';
import { createRng } from '../../rng.ts';

const SEEDS = 500;
const instances = Array.from({ length: SEEDS }, (_, seed) => factorTheoremFindK.generate(seed));

// --- the sweep ----------------------------------------------------------------

test('generator: passes full verification across 500 seeds', () => {
  const report = verifyGenerator(factorTheoremFindK, SEEDS);
  assert.equal(
    report.passed,
    true,
    `fatal findings:\n${JSON.stringify(report.findings.filter((f) => f.severity === 'fatal'), null, 2)}`,
  );
  assert.equal(report.validCount, SEEDS);
  assert.equal(report.crashCount, 0);
});

test('generator: has no warnings either — variety, position, and coverage all clear', () => {
  const report = verifyGenerator(factorTheoremFindK, SEEDS);
  assert.deepEqual(
    report.findings,
    [],
    `unexpected findings:\n${JSON.stringify(report.findings, null, 2)}`,
  );
  assert.ok(report.varietyRatio >= 0.6, `variety was ${report.varietyRatio}`);
  assert.deepEqual(report.unusedStrategies, []);
});

test('generator: every seed produces a valid instance', () => {
  const failures: string[] = [];
  instances.forEach((instance, seed) => {
    const result = validateInstance(instance, factorTheoremFindK);
    if (!result.valid) {
      failures.push(`seed ${seed}: ${result.errors.map((e) => `${e.code}@${e.path}`).join(', ')}`);
    }
  });
  assert.deepEqual(failures, []);
});

test('generator: is deterministic across 500 seeds', () => {
  for (let seed = 0; seed < SEEDS; seed += 1) {
    assert.equal(
      JSON.stringify(factorTheoremFindK.generate(seed)),
      JSON.stringify(instances[seed]),
      `seed ${seed} is not reproducible`,
    );
  }
});

test('generator: does not throw for any seed in a wide range, including large ones', () => {
  for (const seed of [0, 1, 999, 4294967295, 123456789]) {
    assert.doesNotThrow(() => factorTheoremFindK.generate(seed), `seed ${seed} threw`);
  }
});

// --- mathematical soundness ---------------------------------------------------

test('generator: the correct answer really makes f(r) equal zero', () => {
  for (let seed = 0; seed < SEEDS; seed += 1) {
    const params = __testing.drawParams(createRng(seed));
    const k = __testing.solveForK(params);
    // f(r) = P(r) + k must be exactly zero, which is what "factor" means.
    const fOfR = add(__testing.evaluateWithoutConstant(params.r, params), k);
    assert.ok(
      isZero(fOfR),
      `seed ${seed}: f(${params.r}) = ${ratToString(fOfR)}, expected 0 (params ${JSON.stringify(params)})`,
    );
  }
});

test('generator: the correct answer is always a clean integer', () => {
  for (const instance of instances) {
    const correct = instance.choices.find((c) => c.isCorrect);
    assert.ok(correct);
    const value = parseRationalLatex(correct.latex);
    assert.ok(value, `correct answer ${correct.latex} did not parse as a number`);
    assert.equal(value.den, BigInt(1), `correct answer ${correct.latex} is not an integer`);
  }
});

test('generator: every drawn parameter tuple is non-degenerate', () => {
  for (let seed = 0; seed < SEEDS; seed += 1) {
    const params = __testing.drawParams(createRng(seed));
    assert.notEqual(params.r, 0, `seed ${seed}: r = 0 makes the factor x, which is trivial`);
    assert.notEqual(params.a, 0, `seed ${seed}: a = 0 collapses the x^2 term`);
    assert.notEqual(params.b, 0, `seed ${seed}: b = 0 collapses the x term`);
    assert.ok(!isZero(__testing.solveForK(params)), `seed ${seed}: k = 0`);
  }
});

test('generator: sign patterns vary across seeds', () => {
  const patterns = new Set<string>();
  for (let seed = 0; seed < SEEDS; seed += 1) {
    const { r, a, b } = __testing.drawParams(createRng(seed));
    patterns.add([Math.sign(r), Math.sign(a), Math.sign(b)].join(','));
  }
  // All eight sign combinations of (r, a, b) must appear.
  assert.equal(patterns.size, 8, `only saw sign patterns: ${[...patterns].join(' | ')}`);
});

test('generator: the fallback tuple is genuinely usable', () => {
  // generate() must be total, so the fallback has to satisfy every constraint.
  assert.ok(__testing.isUsable(FALLBACK_PARAMS));
  const k = __testing.solveForK(FALLBACK_PARAMS);
  assert.equal(ratToString(k), '-6');
});

test('generator: isUsable rejects b = -r^2, where the sign-error distractor collides', () => {
  // -P(r) and -P(-r) are equal exactly when b = -r^2. This is not hypothetical:
  // it is the defect the original FALLBACK_PARAMS shipped with.
  assert.ok(!__testing.isUsable({ r: 2, a: 3, b: -4 }));
  assert.ok(!__testing.isUsable({ r: 3, a: 5, b: -9 }));
});

test('generator: isUsable rejects the degenerate cases it is meant to', () => {
  // k = 0: r = 1, a = 1, b = -2 gives P(1) = 1 + 1 - 2 = 0.
  assert.ok(!__testing.isUsable({ r: 1, a: 1, b: -2 }));
});

// --- distractors --------------------------------------------------------------

test('generator: each distractor is the value that misconception actually yields', () => {
  for (let seed = 0; seed < 100; seed += 1) {
    const params = __testing.drawParams(createRng(seed));
    const { r, a, b } = params;
    const byStrategy = new Map(
      __testing.buildDistractors(params).map((d) => [d.strategyId, d.value]),
    );

    // sign_error_on_root: substituted x = -r, so k = -P(-r).
    const atMinusR = add(
      add(pow(fromInt(-r), 3), mul(fromInt(a), pow(fromInt(-r), 2))),
      mul(fromInt(b), fromInt(-r)),
    );
    assert.equal(
      ratToString(byStrategy.get('sign_error_on_root')!),
      ratToString(mul(fromInt(-1), atMinusR)),
      `seed ${seed}: sign_error_on_root`,
    );

    // solved_for_wrong_variable: reported P(r) instead of -P(r).
    assert.equal(
      ratToString(byStrategy.get('solved_for_wrong_variable')!),
      ratToString(__testing.evaluateWithoutConstant(r, params)),
      `seed ${seed}: solved_for_wrong_variable`,
    );

    // arithmetic_sign_slip: the sign on bx was dropped during evaluation.
    assert.equal(
      ratToString(byStrategy.get('arithmetic_sign_slip')!),
      ratToString(mul(fromInt(-1), __testing.evaluateWithoutConstant(r, { r, a, b: -b }))),
      `seed ${seed}: arithmetic_sign_slip`,
    );
  }
});

test('generator: all three strategies appear on every single question', () => {
  for (const instance of instances) {
    const ids = instance.choices.filter((c) => !c.isCorrect).map((c) => c.strategyId);
    assert.deepEqual(
      [...ids].sort(),
      ['arithmetic_sign_slip', 'sign_error_on_root', 'solved_for_wrong_variable'],
    );
  }
});

test('generator: every declared strategy is implemented, and nothing extra is emitted', () => {
  const declared = new Set(factorTheoremFindK.strategies.map((s) => s.id));
  const emitted = new Set<string>();
  for (const instance of instances) {
    for (const choice of instance.choices) {
      if (choice.strategyId) emitted.add(choice.strategyId);
    }
  }
  assert.deepEqual([...emitted].sort(), [...declared].sort());
});

test('generator: the four choices are always distinct values', () => {
  for (const [seed, instance] of instances.entries()) {
    const rendered = instance.choices.map((c) => c.latex);
    assert.equal(new Set(rendered).size, 4, `seed ${seed} has a duplicate choice: ${rendered.join(', ')}`);
  }
});

test('generator: no choice is ever a bare zero', () => {
  for (const [seed, instance] of instances.entries()) {
    for (const choice of instance.choices) {
      assert.notEqual(choice.latex, '0', `seed ${seed} emitted a zero choice`);
    }
  }
});

// --- rendering ----------------------------------------------------------------

test('generator: renders unit coefficients bare, never as 1x', () => {
  for (const [seed, instance] of instances.entries()) {
    assert.ok(!/\b1x/.test(instance.stem), `seed ${seed} rendered a unit coefficient: ${instance.stem}`);
  }
});

test('generator: never renders a double sign', () => {
  for (const [seed, instance] of instances.entries()) {
    assert.ok(!/\+\s*-|-\s*-|\+\s*\+/.test(instance.stem), `seed ${seed}: ${instance.stem}`);
  }
});

test('generator: folds a negative root into (x + n)', () => {
  assert.equal(__testing.renderFactor(-3), '(x + 3)');
  assert.equal(__testing.renderFactor(3), '(x - 3)');
  const negativeRootStems = instances.filter((i) => i.stem.includes('(x + '));
  assert.ok(negativeRootStems.length > 0, 'no seed produced a negative root');
  for (const instance of negativeRootStems) {
    assert.ok(!instance.stem.includes('(x - -'), instance.stem);
  }
});

test('generator: renderTerm formats signs and unit coefficients', () => {
  assert.equal(__testing.renderTerm(3, 'x^2'), ' + 3x^2');
  assert.equal(__testing.renderTerm(-3, 'x^2'), ' - 3x^2');
  assert.equal(__testing.renderTerm(1, 'x^2'), ' + x^2');
  assert.equal(__testing.renderTerm(-1, 'x'), ' - x');
});

test('generator: renderPolynomial always ends in + k and starts monic', () => {
  for (let seed = 0; seed < 50; seed += 1) {
    const rendered = __testing.renderPolynomial(__testing.drawParams(createRng(seed)));
    assert.ok(rendered.startsWith('x^3'), rendered);
    assert.ok(rendered.endsWith(' + k'), rendered);
  }
});

test('generator: uses every declared stem phrasing across the sweep', () => {
  const used = new Set<number>();
  for (const instance of instances) {
    __testing.PHRASINGS.forEach((phrasing, index) => {
      // Each phrasing has a distinctive opening clause.
      const marker = phrasing('POLY', 'FACTOR').split(' ').slice(0, 2).join(' ');
      if (instance.stem.startsWith(marker)) used.add(index);
    });
  }
  assert.equal(used.size, __testing.PHRASINGS.length, 'some stem phrasing is never used');
});

// --- solution and metadata ----------------------------------------------------

test('generator: the solution is a worked solution, in tutor voice', () => {
  for (const [seed, instance] of instances.entries()) {
    assert.ok(instance.solution.length >= 2, `seed ${seed} has a one-line solution`);
    for (const step of instance.solution) {
      assert.ok(step.trim().length > 0, `seed ${seed} has an empty step`);
      // Bare algebra is a line like "k = -6."; a spoken step is a sentence.
      assert.ok(step.split(' ').length >= 6, `seed ${seed} step is not written out: ${step}`);
    }
  }
});

test('generator: the final solution step states the answer that is marked correct', () => {
  for (const [seed, instance] of instances.entries()) {
    const correct = instance.choices.find((c) => c.isCorrect);
    assert.ok(correct);
    const lastStep = instance.solution[instance.solution.length - 1];
    assert.ok(
      lastStep.includes(`k = ${correct.latex}`),
      `seed ${seed}: last step does not state k = ${correct.latex}: ${lastStep}`,
    );
  }
});

test('generator: metadata matches the declaration on every instance', () => {
  for (const [seed, instance] of instances.entries()) {
    assert.equal(instance.generatorId, factorTheoremFindK.id, `seed ${seed}`);
    assert.equal(instance.seed, seed);
    assert.equal(instance.unitId, factorTheoremFindK.unitId);
    assert.equal(instance.problemTypeId, factorTheoremFindK.problemTypeId);
    assert.equal(instance.difficulty, factorTheoremFindK.difficulty);
    assert.ok(instance.conceptTag.length > 0);
  }
});

test('generator: ids follow the namespaced slug convention', () => {
  assert.equal(factorTheoremFindK.id, 'mhf4u-u3-factor-theorem-find-k-d2');
  assert.equal(factorTheoremFindK.unitId, 'mhf4u-u3-polynomial-equations');
  assert.equal(factorTheoremFindK.problemTypeId, 'mhf4u-u3-factor-theorem-find-k');
  for (const id of [factorTheoremFindK.id, factorTheoremFindK.unitId, factorTheoremFindK.problemTypeId]) {
    assert.match(id, /^[a-z0-9]+(-[a-z0-9]+)*$/, `${id} is not slug-cased`);
  }
});

// --- registry -----------------------------------------------------------------

test('registry: the reference generator is registered and resolvable by id', () => {
  assert.ok(GENERATORS.includes(factorTheoremFindK));
  assert.equal(getGenerator('mhf4u-u3-factor-theorem-find-k-d2'), factorTheoremFindK);
  assert.equal(getGenerator('does-not-exist'), undefined);
  assert.ok(generatorIds().includes('mhf4u-u3-factor-theorem-find-k-d2'));
});

test('registry: every registered generator has a unique id and declares strategies', () => {
  const ids = GENERATORS.map((g) => g.id);
  assert.equal(new Set(ids).size, ids.length, 'duplicate generator id in the registry');
  for (const generator of GENERATORS) {
    assert.ok(generator.strategies.length > 0, `${generator.id} declares no strategies`);
    const strategyIds = generator.strategies.map((s) => s.id);
    assert.equal(new Set(strategyIds).size, strategyIds.length, `${generator.id} has duplicate strategy ids`);
    for (const strategy of generator.strategies) {
      assert.match(strategy.id, /^[a-z0-9]+(_[a-z0-9]+)*$/, `${strategy.id} is not snake_case`);
      assert.ok(strategy.label.length > 0);
    }
  }
});

test('registry: every registered generator passes verification', () => {
  for (const generator of GENERATORS) {
    const report = verifyGenerator(generator, 200);
    assert.equal(
      report.passed,
      true,
      `${generator.id} failed:\n${JSON.stringify(report.findings, null, 2)}`,
    );
  }
});
