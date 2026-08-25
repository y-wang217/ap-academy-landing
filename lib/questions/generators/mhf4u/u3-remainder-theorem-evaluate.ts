/**
 * MHF4U Unit 3 — find the remainder using the remainder theorem.
 *
 * `f(x) = x^3 + ax^2 + bx + c` divided by `(x - r)`. The remainder is `f(r)`.
 *
 * The teaching point is that you never have to do the division: the remainder
 * theorem turns a long-division question into a substitution. Every distractor
 * below is a way a student can get that substitution wrong while believing they
 * used the theorem correctly.
 */

import { createRng, type Rng } from '../../rng.ts';
import { type Rational, equals, fromInt, isZero, toLatex } from '../../rational.ts';
import { isTriviallyDistinguishable } from '../../equivalence.ts';
import { qRational } from '../../value.ts';
import { strategiesFor } from '../../strategies.ts';
import {
  polyEval,
  polyFromDescending,
  renderLinearFactor,
  renderPoly,
  type Poly,
} from '../shared/polynomial.ts';
import type { Choice, Generator, QuestionInstance } from '../../types.ts';

const PROBLEM_TYPE_ID = 'mhf4u-u3-remainder-theorem-evaluate';
const GENERATOR_ID = `${PROBLEM_TYPE_ID}-d2`;
const UNIT_ID = 'mhf4u-u3-polynomial-equations';

/** Root of the divisor `(x - r)`. Bounded so `r^3` stays mentally computable. */
const ROOT_BOUND = 4;
/** Bounds on the `x^2` and `x` coefficients. */
const COEFFICIENT_BOUND = 7;
/** Bound on the constant term. */
const CONSTANT_BOUND = 9;
/** Draws to try before falling back. Rejection is rare; this is generous. */
const MAX_DRAWS = 60;

/** The four numbers that define one instance. */
export interface RemainderParams {
  /** Root of the divisor. Never zero — `(x - 0)` makes the question trivial. */
  r: number;
  /** Coefficient of `x^2`. */
  a: number;
  /** Coefficient of `x`. */
  b: number;
  /** Constant term. */
  c: number;
}

/**
 * A tuple satisfying every constraint, so `generate` is total.
 *
 * Asserted usable by a test, and it needed to be: the first tuple written here
 * had `b = -r^2`, which makes `f(r)` and `f(-r)` identical and collapses the
 * `sign_error_on_root` distractor onto the correct answer. The 500-seed sweep
 * passed anyway, because the rejection loop never reached the fallback — a
 * latent bug that only the test surfaces.
 *
 * r = 2, a = 3, b = -5, c = 4: f(2) = 8 + 12 - 10 + 4 = 14.
 */
export const FALLBACK_PARAMS: RemainderParams = { r: 2, a: 3, b: -5, c: 4 };

/**
 * The misconceptions this generator expresses, from the shared registry in
 * `strategies.ts`. Declaring ids inline would let the same mistake acquire a
 * different name in every unit, which fragments per-misconception reporting.
 */
const STRATEGIES = strategiesFor(
  'sign_error_on_root',
  'arithmetic_sign_slip',
  'remainder_read_off_constant_term',
);

/** `f(x) = x^3 + ax^2 + bx + c` as a `Poly`. */
export function buildPolynomial(params: RemainderParams): Poly {
  return polyFromDescending(1, params.a, params.b, params.c);
}

/** The correct answer: the remainder is `f(r)`. */
export function solveRemainder(params: RemainderParams): Rational {
  return polyEval(buildPolynomial(params), fromInt(params.r));
}

interface Distractor {
  strategyId: string;
  value: Rational;
}

/**
 * The wrong answers, each the value a student actually reaches by making one
 * specific, nameable mistake.
 */
function buildDistractors(params: RemainderParams): Distractor[] {
  return [
    {
      // Saw the divisor (x - r) and substituted the number they read in it.
      strategyId: 'sign_error_on_root',
      value: polyEval(buildPolynomial(params), fromInt(-params.r)),
    },
    {
      // Right method, dropped the sign on the bx term partway through.
      strategyId: 'arithmetic_sign_slip',
      value: polyEval(buildPolynomial({ ...params, b: -params.b }), fromInt(params.r)),
    },
    {
      // Confused "remainder" with "constant term" and never substituted at all.
      strategyId: 'remainder_read_off_constant_term',
      value: fromInt(params.c),
    },
  ];
}

/**
 * Whether a tuple yields a question worth printing.
 *
 * Rejects a zero answer, any zero distractor, coincident options, and anything a
 * student could eliminate on sight. Checking here rather than leaving it to the
 * validator means a bad tuple is never emitted at all.
 */
export function isUsable(params: RemainderParams): boolean {
  if (params.r === 0 || params.a === 0 || params.b === 0 || params.c === 0) return false;
  const answer = solveRemainder(params);
  if (isZero(answer)) return false;

  const distractors = buildDistractors(params);
  if (distractors.some((d) => isZero(d.value))) return false;

  const values = [answer, ...distractors.map((d) => d.value)];
  for (let i = 0; i < values.length; i += 1) {
    for (let j = i + 1; j < values.length; j += 1) {
      if (equals(values[i], values[j])) return false;
    }
  }
  return !distractors.some((d) => isTriviallyDistinguishable(answer, d.value));
}

/** Stem phrasings, so 500 seeds do not repeat wording. */
const PHRASINGS: ((polynomial: string, divisor: string) => string)[] = [
  (polynomial, divisor) =>
    `Find the remainder when f(x) = ${polynomial} is divided by ${divisor}.`,
  (polynomial, divisor) =>
    `Use the remainder theorem to determine the remainder of ${polynomial} divided by ${divisor}.`,
  (polynomial, divisor) =>
    `When f(x) = ${polynomial} is divided by ${divisor}, what is the remainder?`,
];

/** The worked solution, in the register a tutor uses out loud. */
function buildSolution(params: RemainderParams, remainder: Rational): string[] {
  const { r, a, b, c } = params;
  const divisor = renderLinearFactor(fromInt(r));
  const cube = fromInt(r * r * r);
  const square = fromInt(a * r * r);
  const linear = fromInt(b * r);

  return [
    `The point of the remainder theorem is that you do not have to do the division at all. Dividing by ${divisor} means the number that matters is x = ${r}, and the remainder is just f(${r}).`,
    `So substitute x = ${r} into f(x) = ${renderPoly(buildPolynomial(params))}: f(${r}) = (${r})^3 + (${a})(${r})^2 + (${b})(${r}) + (${c}).`,
    `Take the terms one at a time. (${r})^3 = ${toLatex(cube)}. Then (${a})(${r})^2 = ${toLatex(square)}. Then (${b})(${r}) = ${toLatex(linear)}. The constant stays ${toLatex(fromInt(c))}.`,
    `Add them up: ${toLatex(cube)} + ${toLatex(square)} + ${toLatex(linear)} + ${toLatex(fromInt(c))} = ${toLatex(remainder)}. So the remainder is ${toLatex(remainder)}.`,
    `Notice what that tells you: the remainder is not zero, so ${divisor} is not a factor of f(x). If it had come out to zero, it would have been.`,
  ];
}

/** Rejection-samples a usable tuple; falls back rather than throwing. */
function drawParams(rng: Rng): RemainderParams {
  for (let attempt = 0; attempt < MAX_DRAWS; attempt += 1) {
    const params: RemainderParams = {
      r: rng.nonZeroInt(-ROOT_BOUND, ROOT_BOUND),
      a: rng.nonZeroInt(-COEFFICIENT_BOUND, COEFFICIENT_BOUND),
      b: rng.nonZeroInt(-COEFFICIENT_BOUND, COEFFICIENT_BOUND),
      c: rng.nonZeroInt(-CONSTANT_BOUND, CONSTANT_BOUND),
    };
    if (isUsable(params)) return params;
  }
  return FALLBACK_PARAMS;
}

export const remainderTheoremEvaluate: Generator = {
  id: GENERATOR_ID,
  unitId: UNIT_ID,
  problemTypeId: PROBLEM_TYPE_ID,
  difficulty: 2,
  strategies: STRATEGIES,

  generate(seed: number): QuestionInstance {
    const rng = createRng(seed);
    const params = drawParams(rng);
    const remainder = solveRemainder(params);

    const choices: Choice[] = [
      { latex: toLatex(remainder), isCorrect: true, value: qRational(remainder) },
      ...buildDistractors(params).map((distractor) => ({
        latex: toLatex(distractor.value),
        isCorrect: false,
        strategyId: distractor.strategyId,
        value: qRational(distractor.value),
      })),
    ];

    const phrasing = rng.pick(PHRASINGS);

    return {
      generatorId: GENERATOR_ID,
      seed,
      unitId: UNIT_ID,
      problemTypeId: PROBLEM_TYPE_ID,
      difficulty: 2,
      stem: phrasing(renderPoly(buildPolynomial(params)), renderLinearFactor(fromInt(params.r))),
      choices: rng.shuffle(choices),
      solution: buildSolution(params, remainder),
      conceptTag: 'Remainder theorem: dividing f(x) by (x - r) leaves remainder f(r)',
    };
  },
};

/** Internals exposed for testing only. Not part of the generator contract. */
export const __testing = { buildDistractors, buildPolynomial, drawParams, isUsable, PHRASINGS };
