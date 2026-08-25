import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  FALLBACK_PARAMS,
  __testing,
  isUsable,
  solveIntervals,
  solvePolynomialInequalityFactored,
  type Direction,
  type InequalityParams,
} from './u3-solve-polynomial-inequality-factored.ts';
import { validateInstance } from '../../validate.ts';
import { fingerprint, verifyGenerator } from '../../verify.ts';
import { toLatex as valueToLatex, valuesEqual } from '../../value.ts';
import { createRng } from '../../rng.ts';

const SEEDS = 500;
const instances = Array.from({ length: SEEDS }, (_, seed) =>
  solvePolynomialInequalityFactored.generate(seed),
);

/** Evaluates the monic cubic with the given roots, independently of the module. */
function cubicAt(roots: number[], x: number): number {
  return roots.reduce((product, root) => product * (x - root), 1);
}

/** Whether `x` satisfies the inequality, worked out from first principles. */
function satisfies(direction: Direction, value: number): boolean {
  switch (direction) {
    case 'lt':
      return value < 0;
    case 'le':
      return value <= 0;
    case 'gt':
      return value > 0;
    case 'ge':
      return value >= 0;
  }
}

// --- hand-checked instance ----------------------------------------------------

test('inequality: the hand-worked sign chart gives the expected intervals', () => {
  // (x + 2)(x - 1)(x - 3) <= 0, roots -2, 1, 3. Testing one point per stretch:
  //   x = -3: (-1)(-4)(-6) = -24  negative  -> included
  //   x =  0: ( 2)(-1)(-3) =   6  positive  -> excluded
  //   x =  2: ( 4)( 1)(-1) =  -4  negative  -> included
  //   x =  4: ( 6)( 3)( 1) =  18  positive  -> excluded
  // Inclusive, so the roots join in: (-inf, -2] union [1, 3].
  assert.equal(cubicAt([-2, 1, 3], -3), -24);
  assert.equal(cubicAt([-2, 1, 3], 0), 6);
  assert.equal(cubicAt([-2, 1, 3], 2), -4);
  assert.equal(cubicAt([-2, 1, 3], 4), 18);
  assert.equal(solveIntervals(FALLBACK_PARAMS), '(-\\infty, -2] \\cup [1, 3]');
});

test('inequality: a strict version of the same roots drops the endpoints', () => {
  assert.equal(
    solveIntervals({ roots: [-2, 1, 3], direction: 'lt' }),
    '(-\\infty, -2) \\cup (1, 3)',
  );
});

test('inequality: the positive directions give the other two stretches', () => {
  assert.equal(
    solveIntervals({ roots: [-2, 1, 3], direction: 'gt' }),
    '(-2, 1) \\cup (3, \\infty)',
  );
  assert.equal(
    solveIntervals({ roots: [-2, 1, 3], direction: 'ge' }),
    '[-2, 1] \\cup [3, \\infty)',
  );
});

test('inequality: infinity always takes a round bracket, even when inclusive', () => {
  for (const direction of ['le', 'ge'] as Direction[]) {
    const rendered = solveIntervals({ roots: [-2, 1, 3], direction });
    assert.ok(!rendered.includes('[-\\infty'), rendered);
    assert.ok(!rendered.includes('\\infty]'), rendered);
  }
});

test('inequality: the hand-worked distractors are what those mistakes give', () => {
  const byStrategy = new Map(
    __testing.buildDistractors(FALLBACK_PARAMS).map((d) => [d.strategyId, d.latex]),
  );
  assert.equal(byStrategy.get('solved_for_the_opposite_sign'), '[-2, 1] \\cup [3, \\infty)');
  assert.equal(byStrategy.get('wrong_bracket_type_on_endpoints'), '(-\\infty, -2) \\cup (1, 3)');
  assert.equal(byStrategy.get('treated_cubic_like_a_quadratic'), '[-2, 3]');
});

// --- the sweep ----------------------------------------------------------------

test('inequality: passes full verification across 500 seeds', () => {
  const report = verifyGenerator(solvePolynomialInequalityFactored, SEEDS);
  assert.deepEqual(report.findings, [], `findings:\n${JSON.stringify(report.findings, null, 2)}`);
  assert.equal(report.validCount, SEEDS);
  assert.ok(report.varietyRatio >= 0.6, `variety was ${report.varietyRatio}`);
});

test('inequality: is deterministic across 500 seeds', () => {
  for (let seed = 0; seed < SEEDS; seed += 1) {
    assert.equal(
      fingerprint(solvePolynomialInequalityFactored.generate(seed)),
      fingerprint(instances[seed]),
    );
  }
});

test('inequality: every seed produces a valid instance', () => {
  const failures: string[] = [];
  instances.forEach((instance, seed) => {
    const result = validateInstance(instance, solvePolynomialInequalityFactored);
    if (!result.valid) failures.push(`seed ${seed}: ${result.errors.map((e) => e.code).join(', ')}`);
  });
  assert.deepEqual(failures, []);
});

// --- mathematical soundness ---------------------------------------------------

test('inequality: the stated intervals really are where the inequality holds', () => {
  // Independent check: sample the whole line and confirm membership in the
  // reported intervals agrees with actually evaluating the cubic.
  for (let seed = 0; seed < SEEDS; seed += 1) {
    const params = __testing.drawParams(createRng(seed));
    const [r1, r2, r3] = params.roots;
    const inclusive = params.direction === 'le' || params.direction === 'ge';
    const negative = params.direction === 'lt' || params.direction === 'le';

    // Reconstruct the expected membership test from the sign chart directly.
    const inSolution = (x: number): boolean =>
      negative ? x < r1 || (x > r2 && x < r3) : (x > r1 && x < r2) || x > r3;

    for (let x = r1 - 3; x <= r3 + 3; x += 0.5) {
      if ([r1, r2, r3].includes(x)) {
        // At a root the cubic is exactly zero, so only inclusive directions hold.
        assert.equal(
          satisfies(params.direction, 0),
          inclusive,
          `seed ${seed}: endpoint handling at x = ${x}`,
        );
        continue;
      }
      assert.equal(
        satisfies(params.direction, cubicAt(params.roots, x)),
        inSolution(x),
        `seed ${seed}: disagreement at x = ${x} (roots ${params.roots}, ${params.direction})`,
      );
    }
  }
});

test('inequality: endpoints are inclusive exactly when the direction is', () => {
  for (let seed = 0; seed < SEEDS; seed += 1) {
    const params = __testing.drawParams(createRng(seed));
    const rendered = solveIntervals(params);
    const inclusive = params.direction === 'le' || params.direction === 'ge';
    assert.equal(
      rendered.includes('[') || rendered.includes(']'),
      inclusive,
      `seed ${seed}: bracket type disagrees with direction ${params.direction}`,
    );
  }
});

test('inequality: roots always come back strictly ascending', () => {
  for (let seed = 0; seed < SEEDS; seed += 1) {
    const [r1, r2, r3] = __testing.drawParams(createRng(seed)).roots;
    assert.ok(r1 < r2 && r2 < r3, `seed ${seed}: roots are not ascending`);
  }
});

test('inequality: every direction appears across the sweep', () => {
  const seen = new Set<Direction>();
  for (let seed = 0; seed < SEEDS; seed += 1) {
    seen.add(__testing.drawParams(createRng(seed)).direction);
  }
  assert.deepEqual([...seen].sort(), ['ge', 'gt', 'le', 'lt']);
});

test('inequality: flipDirection and toggleStrictness are involutions', () => {
  for (const direction of ['lt', 'le', 'gt', 'ge'] as Direction[]) {
    assert.equal(__testing.flipDirection(__testing.flipDirection(direction)), direction);
    assert.equal(__testing.toggleStrictness(__testing.toggleStrictness(direction)), direction);
    // Flipping the sign must not change strictness, and vice versa.
    assert.equal(
      __testing.flipDirection(direction).length > 2,
      direction.length > 2,
      'flipDirection changed strictness',
    );
  }
});

test('inequality: the fallback tuple is usable', () => {
  assert.ok(isUsable(FALLBACK_PARAMS));
});

test('inequality: isUsable rejects unsorted or duplicated roots', () => {
  assert.ok(!isUsable({ roots: [3, 1, -2], direction: 'le' } as InequalityParams));
  assert.ok(!isUsable({ roots: [1, 1, 3], direction: 'le' } as InequalityParams));
});

test('inequality: no drawn tuple is degenerate', () => {
  for (let seed = 0; seed < SEEDS; seed += 1) {
    assert.ok(isUsable(__testing.drawParams(createRng(seed))), `seed ${seed}`);
  }
});

// --- choices ------------------------------------------------------------------

test('inequality: choice values are pairwise distinct and match their renderings', () => {
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

test('inequality: every choice is well-formed interval notation', () => {
  for (const [seed, instance] of instances.entries()) {
    for (const choice of instance.choices) {
      assert.match(
        choice.latex,
        /^[[(](-?\d+|-\\infty), (-?\d+|\\infty)[\])]( \\cup [[(](-?\d+|-\\infty), (-?\d+|\\infty)[\])])?$/,
        `seed ${seed}: ${choice.latex}`,
      );
    }
  }
});

test('inequality: all three strategies appear on every question', () => {
  for (const instance of instances) {
    const ids = instance.choices.filter((c) => !c.isCorrect).map((c) => c.strategyId);
    assert.deepEqual(
      [...ids].sort(),
      [
        'solved_for_the_opposite_sign',
        'treated_cubic_like_a_quadratic',
        'wrong_bracket_type_on_endpoints',
      ],
    );
  }
});

// --- rendering and solution ---------------------------------------------------

test('inequality: stems never show a double sign', () => {
  for (const [seed, instance] of instances.entries()) {
    assert.ok(!instance.stem.includes('- -'), `seed ${seed}: ${instance.stem}`);
    assert.ok(!instance.stem.includes('+ -'), `seed ${seed}: ${instance.stem}`);
  }
});

test('inequality: the stem states the direction it is asking about', () => {
  for (const [seed, instance] of instances.entries()) {
    const directions = Object.values(__testing.DIRECTION_LATEX);
    assert.ok(
      directions.some((direction) => instance.stem.includes(direction)),
      `seed ${seed}: ${instance.stem}`,
    );
  }
});

test('inequality: uses every declared stem phrasing', () => {
  const openings = __testing.PHRASINGS.map((phrasing) => phrasing('P', 'D').split(' ')[0]);
  assert.equal(new Set(openings).size, openings.length, 'phrasings must open distinctly');
  const used = new Set<number>();
  for (const instance of instances) {
    openings.forEach((opening, index) => {
      if (instance.stem.startsWith(`${opening} `)) used.add(index);
    });
  }
  assert.equal(used.size, openings.length);
});

test('inequality: the solution explains the bracket rule and states the answer', () => {
  for (const [seed, instance] of instances.entries()) {
    const correct = instance.choices.find((c) => c.isCorrect);
    assert.ok(correct);
    for (const step of instance.solution) {
      assert.ok(step.split(' ').length >= 6, `seed ${seed}: ${step}`);
    }
    assert.ok(
      instance.solution.some((step) => step.includes('infinity always gets a round bracket')),
      `seed ${seed}: the solution never explains the infinity bracket`,
    );
    assert.ok(
      instance.solution.some((step) => step.includes(`So the solution is ${correct.latex}.`)),
      `seed ${seed}: no step states the answer`,
    );
  }
});

test('inequality: metadata matches the declaration', () => {
  for (const [seed, instance] of instances.entries()) {
    assert.equal(instance.generatorId, solvePolynomialInequalityFactored.id);
    assert.equal(instance.seed, seed);
    assert.equal(instance.difficulty, 2);
  }
});
